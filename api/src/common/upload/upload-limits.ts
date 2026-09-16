import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

/**
 * Multer options applied to every upload route.
 *
 * The multer version bundled with the current @nestjs/platform-express carries
 * unpatched DoS advisories reachable through crafted multipart field names,
 * oversized array indices in field names, and unbounded field counts. There is
 * no forward fix published upstream, so the exposure is closed off here by
 * refusing anything beyond the single file these endpoints need — reviewed
 * against the advisories on 2026-09-09.
 */
export function uploadLimits(maxBytes: number): MulterOptions {
  return {
    limits: {
      fileSize: maxBytes,
      files: 1,
      fields: 6,
      parts: 8,
      fieldNameSize: 64,
      fieldSize: 16 * 1024,
      headerPairs: 32,
    },
  };
}

/** Signed agreement documents: PDF or scanned image. */
export const AGREEMENT_UPLOAD = uploadLimits(10 * 1024 * 1024);

/** Employee rosters. 10k rows of email/name/department fits comfortably. */
export const ROSTER_UPLOAD = uploadLimits(5 * 1024 * 1024);

/**
 * Awareness videos. Buffered in memory for the dev/local path, so the cap is
 * deliberate. In production, prefer presigned direct-to-S3 upload for anything
 * larger — see StorageService.
 */
export const VIDEO_UPLOAD = uploadLimits(200 * 1024 * 1024);
