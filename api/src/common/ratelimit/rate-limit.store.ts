import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { redisConnection, redisIsConfigured } from '../redis/redis-connection';

export interface RateLimitHit {
  /** Requests seen in the current window, including this one. */
  count: number;
  /** When the window resets, as an absolute epoch millisecond value. */
  resetAt: number;
}

/**
 * Where rate-limit counters live.
 *
 * This used to be a `Map` inside the guard, which was correct only while a
 * single API process existed: each additional instance would keep its own
 * count, so the effective limit multiplied by the number of instances. The
 * counter now belongs to Redis, which the queue already depends on.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
}

export const RATE_LIMIT_STORE = 'vlumeaware:rate-limit-store';

/**
 * Fixed-window counter in Redis.
 *
 * INCR and the first PEXPIRE are one Lua script because doing them as two round
 * trips has a failure mode that matters: if the process dies between the two,
 * the key exists with no expiry and that caller is blocked until somebody
 * clears it by hand.
 */
const FIXED_WINDOW_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }
`;

@Injectable()
export class RedisRateLimitStore implements RateLimitStore {
  private readonly logger = new Logger(RedisRateLimitStore.name);
  private readonly client: Redis;
  private warned = false;

  constructor() {
    const client = new Redis({
      ...redisConnection(),
      // Commands issued during the initial handshake are queued and flushed on
      // ready, which is what makes a cold start correct: without it the very
      // first request after a deploy would be unlimited, because the socket is
      // not yet writable. `maxRetriesPerRequest: 1` is what keeps that queue
      // honest — a command waiting on a dead Redis fails after one retry rather
      // than sitting there, so the guard degrades to fail-open instead of
      // hanging the request.
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      // Give up after a few attempts rather than reconnecting forever: this
      // client only serves the limiter, which degrades to fail-open, and an
      // endless retry loop would keep a dying process alive. The queue has its
      // own connection, which does retry properly.
      retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 200, 2_000)),
    });
    client.defineCommand('fixedWindow', { numberOfKeys: 1, lua: FIXED_WINDOW_LUA });
    // An unreachable Redis must not take the process down; `hit` degrades instead.
    client.on('error', (err: Error) => {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          `Redis rate-limit store unavailable (${err.message}); failing open until it recovers.`,
        );
      }
    });
    this.client = client;
  }

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const fn = (this.client as unknown as {
      fixedWindow(k: string, ms: number): Promise<[number, number]>;
    }).fixedWindow;
    const [count, ttl] = await fn.call(this.client, key, windowMs);
    // PTTL returns -1 when the key has no expiry, which the script prevents;
    // treat it as a full window rather than "already expired".
    const remaining = ttl > 0 ? ttl : windowMs;
    return { count, resetAt: Date.now() + remaining };
  }

  /** Shutdown hook: a graceful QUIT, then a hard disconnect if that fails. */
  async quit(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}

/**
 * In-process counter, for development and for the test suite.
 *
 * Deliberately not used in production: its whole weakness is that the count
 * does not outlive the process, and behind more than one instance the effective
 * limit becomes limit × instances. `rateLimitStore()` below keeps it out of the
 * deployed path by choosing Redis whenever Redis has been configured.
 */
@Injectable()
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = Date.now();
    this.sweep(now);

    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.hits.set(key, fresh);
      return fresh;
    }
    entry.count += 1;
    return { count: entry.count, resetAt: entry.resetAt };
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

/**
 * Picks the store. `RATE_LIMIT_STORE` overrides; otherwise Redis is used as soon
 * as it has been explicitly configured, which is the same signal the queue
 * uses, so a deployment cannot end up with a shared queue and per-process
 * limits by omission.
 */
export function rateLimitStore(): RateLimitStore {
  const choice = (process.env.RATE_LIMIT_STORE ?? '').toLowerCase();
  if (choice === 'memory') return new InMemoryRateLimitStore();
  if (choice === 'redis') return new RedisRateLimitStore();
  return redisIsConfigured() ? new RedisRateLimitStore() : new InMemoryRateLimitStore();
}
