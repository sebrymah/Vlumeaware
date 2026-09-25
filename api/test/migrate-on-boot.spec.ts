import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPendingMigrations } from '../src/common/prisma/migrate-on-boot';
import type { MigrationRunner } from '../src/common/prisma/migrate-on-boot';

/**
 * Boot-time migrations.
 *
 * They run by default because Prisma's schema engine serialises them with a
 * Postgres advisory lock, so they are safe behind more than one instance — and
 * because a hosting tier with no pre-deploy hook has nowhere else to put them.
 * A failure is fatal on purpose: serving traffic against the wrong schema is
 * worse than failing the deploy.
 *
 * The CLI itself is not run here (that would need a database and would test
 * Prisma rather than this logic); the real spawn is exercised end to end by
 * booting the container against a fresh database.
 */
const realCwd = process.cwd();
const tempDirs: string[] = [];

/** A working directory that looks like a build shipping migrations. */
function dirWithMigrations(): string {
  const dir = mkdtempSync(join(tmpdir(), 'migrate-boot-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'prisma', 'migrations', '20260101000000_init'), { recursive: true });
  return dir;
}

describe('boot migrations', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.chdir(realCwd);
    process.env = { ...original };
  });

  afterAll(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  });

  it('runs the migration command by default', async () => {
    process.chdir(dirWithMigrations());
    delete process.env.MIGRATE_ON_BOOT;
    let ran = 0;
    const runner: MigrationRunner = () => {
      ran += 1;
      return Promise.resolve(0);
    };

    await expect(applyPendingMigrations(runner)).resolves.toBeUndefined();
    expect(ran).toBe(1);
  });

  it('does not run it when switched off', async () => {
    process.chdir(dirWithMigrations());
    process.env.MIGRATE_ON_BOOT = '0';
    let ran = 0;
    const runner: MigrationRunner = () => {
      ran += 1;
      return Promise.resolve(0);
    };

    await expect(applyPendingMigrations(runner)).resolves.toBeUndefined();
    expect(ran).toBe(0);
  });

  it('does nothing when the build ships no migrations', async () => {
    process.chdir(mkdtempSync(join(tmpdir(), 'migrate-boot-empty-')));
    delete process.env.MIGRATE_ON_BOOT;
    let ran = 0;
    await applyPendingMigrations(() => {
      ran += 1;
      return Promise.resolve(0);
    });
    expect(ran).toBe(0);
  });

  it('refuses to start when the migration fails', async () => {
    process.chdir(dirWithMigrations());
    delete process.env.MIGRATE_ON_BOOT;
    // A non-zero exit must be fatal: carrying on would serve traffic against a
    // schema that does not match the code.
    await expect(applyPendingMigrations(() => Promise.resolve(1))).rejects.toThrow(
      /exited with code 1/,
    );
  });

  it('surfaces a runner that cannot start at all', async () => {
    process.chdir(dirWithMigrations());
    delete process.env.MIGRATE_ON_BOOT;
    await expect(
      applyPendingMigrations(() => Promise.reject(new Error('npx not found'))),
    ).rejects.toThrow(/npx not found/);
  });
});
