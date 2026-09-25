import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { INTAKE_SECRET_HEADER, IntakeSecretGuard } from '../src/modules/intake/intake-secret.guard';

/**
 * The report-a-phish intake endpoint is public (the inbound-mail pipeline has no
 * session), so a shared secret is its only authentication. It was documented as
 * "authenticated by a shared secret header at the gateway" while nothing
 * checked it, which let anyone write phish-report rows against any enrolled
 * employee in any tenant.
 */
function contextWith(headers: Record<string, string | string[] | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

const SECRET = 'intake-secret-for-tests';

describe('report-a-phish intake authentication', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('accepts the configured secret', () => {
    process.env.INTAKE_SHARED_SECRET = SECRET;
    const guard = new IntakeSecretGuard();
    expect(guard.canActivate(contextWith({ [INTAKE_SECRET_HEADER]: SECRET }))).toBe(true);
  });

  it('refuses a wrong, missing or malformed secret', () => {
    process.env.INTAKE_SHARED_SECRET = SECRET;
    const guard = new IntakeSecretGuard();
    for (const headers of [
      {},
      { [INTAKE_SECRET_HEADER]: 'nope' },
      { [INTAKE_SECRET_HEADER]: '' },
      { [INTAKE_SECRET_HEADER]: `${SECRET} ` },
      { [INTAKE_SECRET_HEADER]: [SECRET, 'other'] },
    ]) {
      expect(() => guard.canActivate(contextWith(headers))).toThrow(UnauthorizedException);
    }
  });

  it('stays shut in production when no secret is configured', () => {
    delete process.env.INTAKE_SHARED_SECRET;
    process.env.NODE_ENV = 'production';
    const guard = new IntakeSecretGuard();
    // Fail closed: an unconfigured deployment must not expose an open write.
    expect(() => guard.canActivate(contextWith({}))).toThrow(ServiceUnavailableException);
  });

  it('allows an unconfigured secret outside production, so the flow stays demonstrable', () => {
    delete process.env.INTAKE_SHARED_SECRET;
    process.env.NODE_ENV = 'development';
    const guard = new IntakeSecretGuard();
    expect(guard.canActivate(contextWith({}))).toBe(true);
  });

  it('does not leak the secret length through the comparison', () => {
    process.env.INTAKE_SHARED_SECRET = SECRET;
    const guard = new IntakeSecretGuard();
    // A length-mismatched guess must fail as an UnauthorizedException, not as a
    // RangeError from timingSafeEqual.
    expect(() => guard.canActivate(contextWith({ [INTAKE_SECRET_HEADER]: 'x' }))).toThrow(
      UnauthorizedException,
    );
  });
});
