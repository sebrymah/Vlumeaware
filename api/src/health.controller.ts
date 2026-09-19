import { Controller, Get } from '@nestjs/common';
import { Public } from './common/auth/roles.decorator';

/** Liveness probe for the deployment host — no auth, no DB. */
@Controller('health')
@Public()
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'vlumeaware-api', ts: new Date().toISOString() };
  }

  /**
   * Non-secret mail/config diagnostics for the running process. Exposes which
   * mailer this process will use and whether the Resend key is present — never
   * the key itself. Lets us confirm the deployed environment without guessing.
   */
  @Get('mailer')
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
      storageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'training-videos',
      deployedCommit: process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? null,
      ts: new Date().toISOString(),
    };
  }
}
