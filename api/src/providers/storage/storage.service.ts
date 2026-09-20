import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Trims whitespace and strips a matched pair of surrounding quotes from an env
 * value, returning undefined for anything empty. Deployment dashboards happily
 * store `"eyJ…"` or a value with a trailing newline; neither is a usable key.
 */
export function cleanEnv(value: string | undefined): string | undefined {
  const cleaned = value?.trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
  return cleaned ? cleaned : undefined;
}

/** Turns a Supabase Storage error body into one actionable sentence. */
function storageReason(status: number, detail: string): string {
  let message = detail;
  try {
    const body = JSON.parse(detail) as { message?: string; error?: string };
    message = body.message ?? body.error ?? detail;
  } catch {
    /* non-JSON error body — fall through to the raw text */
  }
  if (/Invalid Compact JWS|invalid signature|JWT/i.test(message)) {
    return `the API's SUPABASE_SERVICE_ROLE_KEY is not a valid key (${message}). Re-copy the service_role key from Supabase → Project Settings → API.`;
  }
  if (/Bucket not found/i.test(message)) {
    return `the storage bucket does not exist (${message}). Create it in Supabase → Storage as a private bucket.`;
  }
  if (/mime|content type/i.test(message)) {
    return (
      `the storage bucket does not allow this file type (${message}). The bucket holds ` +
      `awareness videos, signed agreements and client logos, so its allowed MIME types must ` +
      `cover video/mp4, video/webm, video/ogg, video/quicktime, video/x-msvideo, ` +
      `application/pdf, image/png and image/jpeg.`
    );
  }
  if (status === 413 || /too large|exceeded/i.test(message)) {
    return `the file exceeds the bucket's size limit (${message}).`;
  }
  return `${message || 'no detail returned'} (HTTP ${status}).`;
}

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

  // Supabase Storage. Values are cleaned before use: a key pasted into a
  // deployment dashboard carrying surrounding quotes or a trailing newline is
  // not a parseable JWT, and Supabase rejects it with "Invalid Compact JWS" —
  // a failure that is invisible from the outside, so it is closed off here.
  private readonly supabaseUrl = cleanEnv(process.env.SUPABASE_URL)?.replace(/\/+$/, '');
  private readonly supabaseKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  private readonly supabaseBucket = cleanEnv(process.env.SUPABASE_STORAGE_BUCKET) ?? 'training-videos';

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

    // Local disk is a development convenience. In a deployed container it is
    // discarded on the next deploy, restart or scale-down, so accepting an
    // upload here would return success and a durable-looking reference for a
    // file that is already as good as gone — and leave a library row pointing
    // at nothing. Fail loudly instead.
    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException(
        'No object storage is configured on this deployment, so the upload was refused ' +
          'rather than written to disposable container storage. Set SUPABASE_URL and ' +
          'SUPABASE_SERVICE_ROLE_KEY, or S3_BUCKET.',
      );
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
      this.logger.error(`Supabase Storage upload failed (${res.status}): ${detail}`);
      // A plain Error here would reach the operator as "Internal server error"
      // and hide the one line that identifies the misconfiguration.
      throw new BadGatewayException(`Storage rejected the upload: ${storageReason(res.status, detail)}`);
    }
    return `supabase://${this.supabaseBucket}/${objectPath}`;
  }

  /**
   * Reads an object back as bytes. Needed where the file has to be processed
   * server-side rather than handed to a browser — embedding a client's logo
   * into a certificate PDF, for one. Returns null rather than throwing: a
   * missing or unreadable logo must degrade the certificate, not fail it.
   */
  async get(uri: string): Promise<Buffer | null> {
    try {
      if (!uri) return null;

      if (uri.startsWith('supabase://')) {
        if (!this.supabaseUrl || !this.supabaseKey) return null;
        const path = uri.slice('supabase://'.length);
        const res = await fetch(`${this.supabaseUrl}/storage/v1/object/${path}`, {
          headers: { Authorization: `Bearer ${this.supabaseKey}` },
        });
        if (!res.ok) {
          this.logger.warn(`Supabase read failed (${res.status}) for ${path}`);
          return null;
        }
        return Buffer.from(await res.arrayBuffer());
      }

      if (uri.startsWith('s3://') && this.client && this.bucket) {
        const key = uri.replace(`s3://${this.bucket}/`, '');
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');
        const res = await this.client.send(
          new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        );
        const bytes = await res.Body?.transformToByteArray();
        return bytes ? Buffer.from(bytes) : null;
      }

      if (uri.startsWith('file://')) {
        return await readFile(uri.slice('file://'.length));
      }

      if (/^https?:\/\//i.test(uri)) {
        const res = await fetch(uri);
        return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
      }

      return null;
    } catch (err) {
      this.logger.warn(`Could not read ${uri}: ${(err as Error).message}`);
      return null;
    }
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
