import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

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
 * Single-process only. Behind more than one API task, move the counter to the
 * Redis instance the queue already uses.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<RateLimit>(RATE_LIMIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!rule) return true;

    const req = ctx.switchToHttp().getRequest();
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const key = `${ctx.getClass().name}.${ctx.getHandler().name}:${ip}`;
    const now = Date.now();

    this.sweep(now);

    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + rule.windowMs });
      return true;
    }

    entry.count += 1;
    if (entry.count > rule.limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      ctx.switchToHttp().getResponse().setHeader('Retry-After', String(retryAfter));
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  /** Drops expired counters so the map cannot grow without bound. */
  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
  }
}
