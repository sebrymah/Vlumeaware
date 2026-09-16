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
 *      deployment default; returns real public https URLs that survive redeploys)
 *   2. AWS S3            — S3_BUCKET
 *   3. Local disk        — neither set (dev only; ephemeral)
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
   * Uploads to a public Supabase Storage bucket and returns the public https
   * URL. The object path uses a random UUID, so the URL is unguessable even
   * though the bucket is public — fine for generic awareness videos.
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
    return `${this.supabaseUrl}/storage/v1/object/public/${this.supabaseBucket}/${objectPath}`;
  }

  /**
   * A readable URL for a stored object. Supabase public URLs and hosted links
   * are already https and are returned as-is; only S3 objects are signed.
   */
  async signedUrl(uri: string, ttlSeconds = 900): Promise<string> {
    if (!uri.startsWith('s3://') || !this.client || !this.bucket) return uri;
    const key = uri.replace(`s3://${this.bucket}/`, '');
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: ttlSeconds,
    });
  }
}
