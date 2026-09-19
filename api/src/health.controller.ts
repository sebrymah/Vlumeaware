import { Controller, Get } from '@nestjs/common';
import { ROLES } from './common/auth/roles';
import { Public, Roles } from './common/auth/roles.decorator';
import { cleanEnv } from './providers/storage/storage.service';

/**
 * Deployment health and configuration diagnostics.
 *
 * Only the liveness probe is public — the host needs to reach it unauthenticated.
 * The config diagnostics are superadmin-only: they never return a secret, but
 * the shape of the deployment (mailer, sending address, tracking host, storage
 * backend, running commit) is not something to hand to anonymous callers.
 */
@Controller('health')
export class HealthController {
  /** Liveness probe for the deployment host — no auth, no DB. */
  @Get()
  @Public()
  check() {
    return { status: 'ok', service: 'vlumeaware-api', ts: new Date().toISOString() };
  }

  /**
   * Non-secret mail, storage and config diagnostics for the running process.
   * Reports which mailer and storage backend this process will use and whether
   * their credentials are present and well-formed — never the credentials
   * themselves. Lets us confirm the deployed environment without guessing.
   */
  @Get('mailer')
  @Roles(ROLES.superadmin)
  mailer() {
    const selected = (process.env.MAILER ?? '').toLowerCase();
    const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    return {
      mailer: selected === 'resend' || selected === 'ses' ? selected : 'log (default — no real email)',
      resendKeyPresent: Boolean(process.env.RESEND_API_KEY),
      fromAddress: process.env.SIMULATION_FROM_ADDRESS ?? 'no-reply@vlumesec.com',
      trackingBaseUrl: process.env.TRACKING_BASE_URL ?? null,
      publicWebUrl: process.env.PUBLIC_WEB_URL ?? null,
      // Storage backend for uploaded videos.
      storage: supabaseConfigured ? 'supabase' : process.env.S3_BUCKET ? 's3' : 'local-disk (ephemeral)',
      supabaseUrlPresent: Boolean(process.env.SUPABASE_URL),
      supabaseKeyPresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      // Shape only, never the key. A service_role key is a JWT; anything else
      // (a truncated paste, or a value stored with quotes or a newline) is
      // refused upstream as "Invalid Compact JWS".
      supabaseKeyLooksLikeJwt: looksLikeJwt(process.env.SUPABASE_SERVICE_ROLE_KEY),
      supabaseKeyNeededCleaning: neededCleaning(process.env.SUPABASE_SERVICE_ROLE_KEY),
      storageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'training-videos',
      deployedCommit: process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? null,
      ts: new Date().toISOString(),
    };
  }
}

/** True when the value parses as a three-segment JWT, as a service_role key must. */
function looksLikeJwt(raw: string | undefined): boolean {
  const key = cleanEnv(raw);
  return key ? /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(key) : false;
}

/** True when the stored value carried whitespace or quotes that had to be stripped. */
function neededCleaning(raw: string | undefined): boolean {
  return Boolean(raw) && cleanEnv(raw) !== raw;
}
