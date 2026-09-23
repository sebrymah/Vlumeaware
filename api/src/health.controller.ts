import { Controller, Get } from '@nestjs/common';
import { notificationFromAddress, notificationFromIsConfigured } from './providers/mailer/from-addresses';
import { ROLES } from './common/auth/roles';
import { Public, Roles } from './common/auth/roles.decorator';
import { cleanEnv } from './providers/storage/storage.service';
import { checkDeliverability } from './providers/mailer/deliverability';
import { sharedSendingDomains } from './modules/sending-domains/shared-sending-domains';

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
  async mailer() {
    const selected = (process.env.MAILER ?? '').toLowerCase();
    const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    // Live email-authentication state of the shared sending domains, read from
    // DNS. Missing SPF/DKIM/DMARC is the first cause of simulations landing in
    // spam, so it belongs beside the mailer config it depends on.
    const shared = sharedSendingDomains();
    const deliverability = await checkDeliverability(shared).catch(() => []);
    return {
      mailer: selected === 'resend' || selected === 'ses' ? selected : 'log (default — no real email)',
      resendKeyPresent: Boolean(process.env.RESEND_API_KEY),
      fromAddress: process.env.SIMULATION_FROM_ADDRESS ?? 'no-reply@vlumesec.com',
      // Genuine mail to employees (certificates) goes from here, not the
      // simulation address. If this is the unconfigured default, Resend will
      // reject the send as an unverified sender.
      notificationFromAddress: notificationFromAddress(),
      notificationFromConfigured: notificationFromIsConfigured(),
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
      // Scenario generation is the one feature that silently does nothing when
      // its key is absent, so whether it is configured belongs here too.
      aiProvider: aiBackend().provider,
      aiModel: aiBackend().model,
      aiAssistantConfigured: aiBackend().configured,
      // Deliverability: the shared sending domains and their live SPF/DKIM/DMARC
      // state, plus whether the egress IPs clients need for their mail-gateway
      // allow-list are published. `authenticated: false` on a domain is the
      // most likely reason its simulations are being junked.
      sharedSendingDomains: shared,
      deliverability,
      allowlistIpsConfigured: Boolean(process.env.ALLOWLIST_IPS),
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

/**
 * Which AI backend this process would use, without constructing it. Mirrors
 * AiModule's selection so the diagnostic cannot drift from the real choice.
 */
function aiBackend(): { provider: string; model: string; configured: boolean } {
  const chosen = (process.env.AI_PROVIDER ?? '').toLowerCase();
  const deepseek = {
    provider: 'deepseek',
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    configured: Boolean(process.env.DEEPSEEK_API_KEY),
  };
  const anthropic = {
    provider: 'anthropic',
    model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-5',
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
  };
  if (chosen === 'deepseek') return deepseek;
  if (chosen === 'anthropic') return anthropic;
  if (process.env.DEEPSEEK_API_KEY) return deepseek;
  if (process.env.ANTHROPIC_API_KEY) return anthropic;
  return { provider: 'none', model: 'none', configured: false };
}
