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
    return {
      mailer: selected === 'resend' || selected === 'ses' ? selected : 'log (default — no real email)',
      resendKeyPresent: Boolean(process.env.RESEND_API_KEY),
      fromAddress: process.env.SIMULATION_FROM_ADDRESS ?? 'no-reply@vlumesec.com',
      trackingBaseUrl: process.env.TRACKING_BASE_URL ?? null,
      publicWebUrl: process.env.PUBLIC_WEB_URL ?? null,
      deployedCommit: process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? null,
      ts: new Date().toISOString(),
    };
  }
}
