import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

/** Header the inbound-mail pipeline must present. */
export const INTAKE_SECRET_HEADER = 'x-vlumeaware-intake-secret';

/**
 * Authenticates the report-a-phish intake webhook.
 *
 * The endpoint is public by necessity — the inbound-mail pipeline that feeds it
 * has no user session — so possession of a shared secret is the whole
 * authentication story. It was documented as "authenticated by a shared secret
 * header at the gateway" while nothing checked it, which let anyone create
 * phish-report rows against any enrolled employee address, in any tenant, with
 * an attacker-chosen subject and body.
 *
 * The endpoint is not yet fed by anything in production (the monitored mailbox
 * and its parser are still outstanding), so requiring the secret cannot break a
 * live integration.
 */
@Injectable()
export class IntakeSecretGuard implements CanActivate {
  private readonly logger = new Logger(IntakeSecretGuard.name);
  private warnedUnset = false;

  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.INTAKE_SHARED_SECRET;

    if (!expected) {
      // Fail closed where it matters. A deployment that has not configured the
      // secret has not configured the intake pipeline either, so the endpoint
      // stays shut rather than becoming an open write.
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException(
          'The phish-report intake endpoint is not configured on this deployment.',
        );
      }
      if (!this.warnedUnset) {
        this.warnedUnset = true;
        this.logger.warn(
          'INTAKE_SHARED_SECRET is unset — POST /intake/phish-report is UNAUTHENTICATED ' +
            'in this environment. Set it in .env to exercise the real path.',
        );
      }
      return true;
    }

    const header = ctx.switchToHttp().getRequest().headers?.[INTAKE_SECRET_HEADER];
    // Exactly one header, and a string. Node hands back an array when a header
    // is repeated, and picking one of several values would be a guess about
    // which the client meant — a request carrying two secrets is refused rather
    // than resolved.
    if (typeof header !== 'string' || !constantTimeEquals(header, expected)) {
      throw new UnauthorizedException('Invalid intake secret');
    }
    return true;
  }
}

/**
 * Compares through fixed-length digests: timingSafeEqual throws on unequal
 * lengths, and letting that happen would leak the secret's length through the
 * error path.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}
