import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Authenticates Postmark's inbound webhook. Postmark signs nothing, so we put a
 * secret in the webhook URL as HTTP Basic Auth and check its password here. Any
 * username is accepted; the password must equal `POSTMARK_INBOUND_SECRET`.
 *
 * Fails closed in production when the secret is unset (an unconfigured
 * deployment has no inbound integration, so the endpoint stays shut rather than
 * becoming an open write against any enrolled employee).
 */
@Injectable()
export class PostmarkGuard implements CanActivate {
  private readonly logger = new Logger(PostmarkGuard.name);
  private warnedUnset = false;

  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.POSTMARK_INBOUND_SECRET;

    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException('The Postmark inbound webhook is not configured.');
      }
      if (!this.warnedUnset) {
        this.warnedUnset = true;
        this.logger.warn(
          'POSTMARK_INBOUND_SECRET is unset — POST /intake/postmark is UNAUTHENTICATED in this environment.',
        );
      }
      return true;
    }

    const header = ctx.switchToHttp().getRequest().headers?.authorization;
    const password = parseBasicPassword(header);
    if (password === null || !constantTimeEquals(password, expected)) {
      throw new UnauthorizedException('Invalid Postmark credentials');
    }
    return true;
  }
}

/** Returns the password from an `Authorization: Basic base64(user:pass)` header. */
function parseBasicPassword(header: unknown): string | null {
  if (typeof header !== 'string' || !header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    return sep === -1 ? '' : decoded.slice(sep + 1);
  } catch {
    return null;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}
