import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Object storage for uploaded videos and documents. Three backends, chosen by
 * which env vars are present, in priority order:
 *   1. Supabase Storage  — SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (the free
 *      deployment default; a PRIVATE bucket, read only through short-lived
 *      signed URLs so uploaded content is never publicly addressable)
 *   2. AWS S3            — S3_BUCKET (private; presigned GET URLs)
 *   3. Local disk        — neither set (dev only; ephemeral)
 *
 * `put` returns a durable, non-public reference (supabase://…, s3://…, file://…).
 * Call `signedUrl` to turn a reference into a time-limited playable URL; hosted
 * https links pass through unchanged.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  // Supabase Storage
  private readonly supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  private readonly supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  private readonly supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'training-videos';

  // AWS S3
  private readonly bucket = process.env.S3_BUCKET;
  private readonly client = this.bucket
    ? new S3Client({ region: process.env.AWS_REGION ?? 'eu-west-1' })
    : null;

  private get useSupabase(): boolean {
    return Boolean(this.supabaseUrl && this.supabaseKey);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    const scopedKey = `${key}/${randomUUID()}`;

    if (this.useSupabase) {
      return this.putSupabase(scopedKey, body, contentType);
    }

    if (this.client && this.bucket) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: scopedKey,
          Body: body,
          ContentType: contentType,
          ServerSideEncryption: 'AES256',
        }),
      );
      return `s3://${this.bucket}/${scopedKey}`;
    }

    const dir = join(process.cwd(), '.local-storage', key);
    await mkdir(dir, { recursive: true });
    const path = join(dir, scopedKey.split('/').pop() as string);
    await writeFile(path, body);
    this.logger.warn(`No object storage configured; wrote ${path} to local disk`);
    return `file://${path}`;
  }

  /**
   * Uploads to a PRIVATE Supabase Storage bucket and returns a durable
   * reference (supabase://bucket/path). Nothing public is exposed; callers must
   * mint a signed URL through `signedUrl` to read the object.
   */
  private async putSupabase(objectPath: string, body: Buffer, contentType: string): Promise<string> {
    const endpoint = `${this.supabaseUrl}/storage/v1/object/${this.supabaseBucket}/${objectPath}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.supabaseKey}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: new Uint8Array(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Supabase Storage upload failed (${res.status}): ${detail}`);
    }
    return `supabase://${this.supabaseBucket}/${objectPath}`;
  }

  /**
   * Turns a durable reference into a time-limited, playable URL. Hosted https
   * links (videoSource "link") and unresolved dev file:// paths pass through
   * unchanged; supabase:// and s3:// references are signed with a short TTL.
   */
  async signedUrl(uri: string, ttlSeconds = 3600): Promise<string> {
    if (!uri) return uri;

    if (uri.startsWith('supabase://')) {
      if (!this.supabaseUrl || !this.supabaseKey) return uri;
      const path = uri.slice('supabase://'.length); // bucket/object...
      const slash = path.indexOf('/');
      const bucket = path.slice(0, slash);
      const objectPath = path.slice(slash + 1);
      try {
        const res = await fetch(
          `${this.supabaseUrl}/storage/v1/object/sign/${bucket}/${objectPath}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ expiresIn: ttlSeconds }),
          },
        );
        if (!res.ok) {
          this.logger.warn(`Supabase sign failed (${res.status}) for ${objectPath}`);
          return uri;
        }
        const data = (await res.json()) as { signedURL?: string };
        if (!data.signedURL) return uri;
        // signedURL is relative, e.g. "/object/sign/bucket/path?token=…"
        return `${this.supabaseUrl}/storage/v1${data.signedURL.replace(/^\/storage\/v1/, '')}`;
      } catch (err) {
        this.logger.warn(`Supabase sign error: ${(err as Error).message}`);
        return uri;
      }
    }

    if (uri.startsWith('s3://') && this.client && this.bucket) {
      const key = uri.replace(`s3://${this.bucket}/`, '');
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
        expiresIn: ttlSeconds,
      });
    }

    return uri;
  }
}
