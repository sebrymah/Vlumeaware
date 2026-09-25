import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { assertSchemaIsCurrent } from '../src/common/prisma/schema-guard';

/**
 * The boot-time schema check.
 *
 * Migrations are a deploy step rather than a container-start step (concurrent
 * starts race, and a failed migration becomes a crash loop). This guard is what
 * makes that safe: it refuses to serve traffic against a schema that is behind
 * the code, so a forgotten migration fails loudly at boot instead of 500ing on
 * first use. These tests cover each way that can go wrong.
 */
const realCwd = process.cwd();
const tempDirs: string[] = [];

/** A working directory containing `count` fake migration directories. */
function dirWithMigrations(count: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'schema-guard-'));
  tempDirs.push(dir);
  for (let i = 0; i < count; i += 1) {
    // The real naming convention: exactly 14 digits, then the name. A shorter
    // prefix must NOT be counted — that is what the guard's pattern enforces.
    const stamp = `20260101${String(i).padStart(6, '0')}`;
    mkdirSync(join(dir, 'prisma', 'migrations', `${stamp}_fake_${i}`), { recursive: true });
  }
  return dir;
}

/** A PrismaService-shaped object backed by whichever database URL is given. */
function prismaAt(url: string): PrismaService {
  const client = new PrismaClient({ datasourceUrl: url });
  return { db: client } as unknown as PrismaService;
}

describe('boot-time schema check', () => {
  afterEach(() => {
    process.chdir(realCwd);
    delete process.env.SKIP_SCHEMA_CHECK;
  });

  afterAll(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  });

  it('passes when the database has every migration the image ships', async () => {
    // The real API directory against the migrated test database.
    const prisma = new PrismaService();
    await expect(assertSchemaIsCurrent(prisma)).resolves.toBeUndefined();
    await prisma.onModuleDestroy();
  });

  it('refuses to start when the database is behind the image', async () => {
    // Far more migrations on disk than applied: the forgotten-migration case.
    process.chdir(dirWithMigrations(500));
    const prisma = new PrismaService();
    // retries: 0 — the failure path must be asserted without waiting out the
    // retry window that exists for a concurrent deploy.
    await expect(assertSchemaIsCurrent(prisma, { retries: 0 })).rejects.toThrow(/pending/i);
    await prisma.onModuleDestroy();
  });

  it('waits for a deploy that is applying the migration right now', async () => {
    // A "behind" verdict is usually transient: another container is mid-deploy.
    // The guard should re-check rather than fail the deploy outright.
    let calls = 0;
    const fake = {
      db: {
        $queryRaw: () => {
          calls += 1;
          return Promise.resolve([{ applied: calls > 1 ? 999 : 0, failed: 0 }]);
        },
      },
    } as unknown as PrismaService;

    process.chdir(dirWithMigrations(500));
    await expect(
      assertSchemaIsCurrent(fake, { retries: 5, delayMs: 1 }),
    ).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });

  it('does not retry a failed migration — that state needs a human', async () => {
    let calls = 0;
    const fake = {
      db: {
        $queryRaw: () => {
          calls += 1;
          return Promise.resolve([{ applied: 999, failed: 1 }]);
        },
      },
    } as unknown as PrismaService;

    await expect(
      assertSchemaIsCurrent(fake, { retries: 5, delayMs: 1 }),
    ).rejects.toThrow(/never\s+finished|started/i);
    // Exactly one look: retrying a half-applied migration would only delay the
    // operator finding out.
    expect(calls).toBe(1);
  });

  it('refuses to start when a migration was started but never finished', async () => {
    const prisma = new PrismaService();
    // Simulate an interrupted migration: the marker is what the guard reads.
    await prisma.db.$executeRawUnsafe(
      `INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at)
       VALUES (gen_random_uuid()::text, 'x', 'test_interrupted', now())`,
    );
    try {
      await expect(assertSchemaIsCurrent(prisma)).rejects.toThrow(/never\s+finished|started/i);
    } finally {
      await prisma.db.$executeRawUnsafe(
        `DELETE FROM _prisma_migrations WHERE migration_name = 'test_interrupted'`,
      );
      await prisma.onModuleDestroy();
    }
  });

  it('refuses to start against a database with no migration history at all', async () => {
    const url = process.env.DATABASE_URL as string;
    // The maintenance database has no _prisma_migrations table.
    const maintenanceUrl = url.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
    const prisma = prismaAt(maintenanceUrl);
    await expect(assertSchemaIsCurrent(prisma)).rejects.toThrow(/migration history/i);
    await (prisma.db as unknown as PrismaClient).$disconnect();
  });

  it('skips the check when migration history is absent from the image', async () => {
    // A bare `dist` deploy ships no migrations directory; there is nothing to
    // compare against, so the guard says so rather than blocking the boot.
    process.chdir(mkdtempSync(join(tmpdir(), 'schema-guard-empty-')));
    const prisma = new PrismaService();
    await expect(assertSchemaIsCurrent(prisma)).resolves.toBeUndefined();
    await prisma.onModuleDestroy();
  });

  it('honours the deliberate override', async () => {
    process.chdir(dirWithMigrations(500));
    process.env.SKIP_SCHEMA_CHECK = '1';
    const prisma = new PrismaService();
    await expect(assertSchemaIsCurrent(prisma)).resolves.toBeUndefined();
    await prisma.onModuleDestroy();
  });
});
