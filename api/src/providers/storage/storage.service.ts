import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** S3 in deployed environments, local disk in dev. */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket = process.env.S3_BUCKET;
  private readonly client = this.bucket
    ? new S3Client({ region: process.env.AWS_REGION ?? 'eu-west-1' })
    : null;

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    const scopedKey = `${key}/${randomUUID()}`;
    if (!this.client || !this.bucket) {
      const dir = join(process.cwd(), '.local-storage', key);
      await mkdir(dir, { recursive: true });
      const path = join(dir, scopedKey.split('/').pop() as string);
      await writeFile(path, body);
      this.logger.warn(`S3_BUCKET unset; wrote ${path} to local disk`);
      return `file://${path}`;
    }
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

  /** Signed read URL for agreement documents and exported reports. */
  async signedUrl(s3Uri: string, ttlSeconds = 900): Promise<string> {
    if (!this.client || !this.bucket || !s3Uri.startsWith('s3://')) return s3Uri;
    const key = s3Uri.replace(`s3://${this.bucket}/`, '');
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: ttlSeconds,
    });
  }
}
