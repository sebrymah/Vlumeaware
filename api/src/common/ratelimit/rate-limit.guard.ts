import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_STORE, InMemoryRateLimitStore } from './rate-limit.store';
import type { RateLimitStore } from './rate-limit.store';

export interface RateLimit {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export const RATE_LIMIT_KEY = 'vlumeaware:rate-limit';

/**
 * Per-route rate limit, keyed by client IP.
 *
 * Replaces @nestjs/throttler, which does not support Nest 12 and so pinned the
 * whole stack to a major with unpatched advisories. The needs here are narrow —
 * slow credential stuffing on /auth/login and abuse of the public tracking
 * endpoints — and a fixed-window counter covers both.
 *
 * The counter lives in Redis whenever Redis is configured, so the limit holds
 * across instances. It was previously a Map inside this class, which meant the
 * effective limit multiplied by the number of API processes.
 *
 * The key is `req.ip`, which is only the real client address when Express is
 * told how many proxies sit in front of it — see `app.set('trust proxy', …)` in
 * main.ts. Get that wrong and every caller shares one bucket.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private warnedDegraded = false;

  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(RATE_LIMIT_STORE) private readonly store?: RateLimitStore,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<RateLimit>(RATE_LIMIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!rule) return true;

    const req = ctx.switchToHttp().getRequest();
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const key = `rl:${ctx.getClass().name}.${ctx.getHandler().name}:${ip}`;

    // A store that cannot answer must not take the whole endpoint down: a login
    // that cannot be rate-limited is still better than a login nobody can use.
    // The warning is logged once so the degradation is visible.
    let hit;
    try {
      hit = await this.storeFor().hit(key, rule.windowMs);
    } catch (err) {
      if (!this.warnedDegraded) {
        this.warnedDegraded = true;
        this.logger.warn(
          `Rate-limit store unavailable (${(err as Error).message}); failing open for this process.`,
        );
      }
      return true;
    }

    if (hit.count > rule.limit) {
      const retryAfter = Math.max(1, Math.ceil((hit.resetAt - Date.now()) / 1000));
      ctx.switchToHttp().getResponse().setHeader('Retry-After', String(retryAfter));
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  /** Falls back to a local counter if the module did not supply a store. */
  private storeFor(): RateLimitStore {
    if (!this.store) {
      this.fallback ??= new InMemoryRateLimitStore();
      return this.fallback;
    }
    return this.store;
  }

  private fallback?: InMemoryRateLimitStore;
}
