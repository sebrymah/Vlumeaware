/**
 * One place that decides how to reach Redis.
 *
 * The rate limiter and the BullMQ queue must talk to the same instance — a
 * limiter counting in one Redis while jobs queue in another would be a
 * confusing half-fix — so the resolution lives here rather than in either
 * caller.
 *
 * Supports a single REDIS_URL (managed hosts like Upstash / Railway / Render
 * give one, often rediss:// with a password), or discrete
 * REDIS_HOST/PORT/PASSWORD for local Docker. TLS is enabled for rediss:// or
 * when REDIS_TLS=true.
 */

export interface RedisConnection {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
}

export function redisConnection(): RedisConnection {
  const url = process.env.REDIS_URL;
  if (url) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      username: u.username || undefined,
      password: u.password || undefined,
      tls: u.protocol === 'rediss:' ? {} : undefined,
    };
  }
  return {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  };
}

/**
 * Whether Redis has been *explicitly* configured, as opposed to falling back to
 * the localhost default. Only an explicitly configured instance is treated as
 * shared infrastructure; otherwise local development and the test suite would
 * both need Redis running to answer a login.
 */
export function redisIsConfigured(): boolean {
  return Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
}

/** The queue needs these; the rate limiter does not. */
export const BULLMQ_CONNECTION_OPTIONS = { maxRetriesPerRequest: null } as const;
