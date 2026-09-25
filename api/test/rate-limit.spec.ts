import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis';
import { RateLimitGuard } from '../src/common/ratelimit/rate-limit.guard';
import {
  InMemoryRateLimitStore,
  RATE_LIMIT_STORE,
  RedisRateLimitStore,
  rateLimitStore,
} from '../src/common/ratelimit/rate-limit.store';
import type { RateLimitStore } from '../src/common/ratelimit/rate-limit.store';

/**
 * Rate limiting.
 *
 * The counter used to be a Map inside the guard, which held only while a single
 * API process existed — with two instances the effective limit doubled. It now
 * lives in Redis when Redis is configured, so the limit is a property of the
 * deployment rather than of one process.
 *
 * The Redis-backed cases below use the real class against a real server and are
 * skipped, loudly, when none is reachable. `docker compose up -d redis` starts
 * one locally; CI provides a service container and sets REQUIRE_REDIS_TESTS=1,
 * which turns the skip into a failure so it cannot rot unnoticed.
 */

const RULE = { limit: 3, windowMs: 60_000 };
const REDIS_TEST_KEY = 'vlumeaware:rate-limit-store';

function guardWith(store: RateLimitStore, rule: unknown = RULE) {
  const reflector = { getAllAndOverride: () => rule } as unknown as Reflector;
  return new RateLimitGuard(reflector, store);
}

function contextFor(ip = '203.0.113.7') {
  const headers: Record<string, string> = {};
  const ctx = {
    getHandler: () => ({ name: 'login' }),
    getClass: () => ({ name: 'AuthController' }),
    switchToHttp: () => ({
      getRequest: () => ({ ip, socket: { remoteAddress: ip } }),
      getResponse: () => ({ setHeader: (k: string, v: string) => (headers[k] = v) }),
    }),
  };
  return { ctx: ctx as unknown as ExecutionContext, headers };
}

describe('rate limiting', () => {
  it('keeps the store token stable — the guard resolves it by this name', () => {
    expect(RATE_LIMIT_STORE).toBe('vlumeaware:rate-limit-store');
  });

  describe('in-process store', () => {
    it('counts within a window and reports when it resets', async () => {
      const store = new InMemoryRateLimitStore();
      const first = await store.hit('k', 60_000);
      expect(first.count).toBe(1);
      expect(first.resetAt).toBeGreaterThan(Date.now());

      await store.hit('k', 60_000);
      const third = await store.hit('k', 60_000);
      expect(third.count).toBe(3);
    });

    it('starts a fresh window once the old one expires', async () => {
      const store = new InMemoryRateLimitStore();
      await store.hit('k', 1);
      await new Promise((r) => setTimeout(r, 5));
      expect((await store.hit('k', 60_000)).count).toBe(1);
    });
  });

  describe('guard behaviour', () => {
    it('passes through a route with no rule', async () => {
      await expect(guardWith(new InMemoryRateLimitStore(), undefined).canActivate(contextFor().ctx)).resolves.toBe(true);
    });

    it('refuses the request past the limit and sets Retry-After', async () => {
      const guard = guardWith(new InMemoryRateLimitStore());
      for (let i = 0; i < RULE.limit; i += 1) {
        await expect(guard.canActivate(contextFor().ctx)).resolves.toBe(true);
      }
      const { ctx, headers } = contextFor();
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
      expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
    });

    it('counts each caller separately', async () => {
      const guard = guardWith(new InMemoryRateLimitStore());
      for (let i = 0; i < RULE.limit; i += 1) {
        await guard.canActivate(contextFor('198.51.100.1').ctx);
      }
      await expect(guard.canActivate(contextFor('198.51.100.2').ctx)).resolves.toBe(true);
    });

    it('fails open when the store errors, rather than taking the endpoint down', async () => {
      const broken: RateLimitStore = { hit: () => Promise.reject(new Error('redis down')) };
      const guard = guardWith(broken);
      for (let i = 0; i < RULE.limit + 5; i += 1) {
        await expect(guard.canActivate(contextFor().ctx)).resolves.toBe(true);
      }
    });
  });

  describe('store selection', () => {
    const original = { ...process.env };
    afterEach(() => {
      process.env = { ...original };
    });

    it('uses the in-process counter when Redis is not configured', () => {
      delete process.env.REDIS_URL;
      delete process.env.REDIS_HOST;
      delete process.env.RATE_LIMIT_STORE;
      expect(rateLimitStore()).toBeInstanceOf(InMemoryRateLimitStore);
    });

    it('uses Redis as soon as Redis is configured', async () => {
      delete process.env.RATE_LIMIT_STORE;
      process.env.REDIS_HOST = '127.0.0.1';
      const store = rateLimitStore();
      expect(store).toBeInstanceOf(RedisRateLimitStore);
      await (store as RedisRateLimitStore).quit();
    });

    it('honours an explicit override in both directions', async () => {
      process.env.REDIS_HOST = '127.0.0.1';
      process.env.RATE_LIMIT_STORE = 'memory';
      expect(rateLimitStore()).toBeInstanceOf(InMemoryRateLimitStore);

      delete process.env.REDIS_HOST;
      delete process.env.REDIS_URL;
      process.env.RATE_LIMIT_STORE = 'redis';
      const store = rateLimitStore();
      expect(store).toBeInstanceOf(RedisRateLimitStore);
      await (store as RedisRateLimitStore).quit();
    });
  });

  describe('Redis-backed store (real server)', () => {
    let reachable = false;
    const probe = new Redis({
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: Number(process.env.REDIS_PORT ?? 6379),
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      retryStrategy: (times: number) => (times > 2 ? null : 100),
    });
    probe.on('error', () => undefined);

    beforeAll(async () => {
      try {
        await probe.ping();
        reachable = true;
      } catch {
        const message =
          'Redis is not reachable — the Redis-backed rate-limit tests did not run. ' +
          'Start it with `docker compose up -d redis`.';
        if (process.env.REQUIRE_REDIS_TESTS === '1') throw new Error(message);
        console.warn(`\n  ⚠ ${message}\n`);
      }
    });

    afterAll(async () => {
      probe.disconnect();
    });

    it('counts across processes, not just within one', async () => {
      if (!reachable) return;
      // Two store instances stand in for two API processes sharing one Redis.
      // This is the property the old in-process Map could not provide.
      const a = new RedisRateLimitStore();
      const b = new RedisRateLimitStore();
      const key = `rl:test:${Date.now()}`;
      try {
        expect((await a.hit(key, 60_000)).count).toBe(1);
        const second = await b.hit(key, 60_000);
        expect(second.count).toBe(2);
        expect(second.resetAt).toBeGreaterThan(Date.now());
      } finally {
        await a.quit();
        await b.quit();
      }
    });

    it('sets an expiry, so a blocked caller is released without intervention', async () => {
      if (!reachable) return;
      const store = new RedisRateLimitStore();
      const key = `rl:test:ttl:${Date.now()}`;
      try {
        await store.hit(key, 5_000);
        const ttl = await probe.pttl(key);
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(5_000);
      } finally {
        await store.quit();
      }
    });

    it('enforces the limit through the guard when backed by Redis', async () => {
      if (!reachable) return;
      const store = new RedisRateLimitStore();
      const guard = guardWith(store);
      const ip = `192.0.2.${Math.floor(Math.random() * 250) + 1}`;
      try {
        for (let i = 0; i < RULE.limit; i += 1) {
          await expect(guard.canActivate(contextFor(ip).ctx)).resolves.toBe(true);
        }
        await expect(guard.canActivate(contextFor(ip).ctx)).rejects.toBeInstanceOf(HttpException);
      } finally {
        await store.quit();
      }
    });
  });
});
