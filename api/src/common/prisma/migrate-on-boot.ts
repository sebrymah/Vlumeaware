import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';

const logger = new Logger('MigrateOnBoot');

/** Set to 0 to leave migrations to a pre-deploy command or a one-off job. */
const ENABLED = 'MIGRATE_ON_BOOT';
/** How long to wait before giving up on a stuck migration. */
const TIMEOUT_MS = 'MIGRATE_TIMEOUT_MS';
const DEFAULT_TIMEOUT_MS = 5 * 60_000;

export interface MigrationRunner {
  (): Promise<number>;
}

/**
 * Applies pending migrations when the app starts.
 *
 * This is where migrations lived originally. They were moved out during the
 * deployment review over a concern that concurrent container starts would race
 * on the same migration — a concern that turns out to be unfounded. Prisma's
 * schema engine takes a Postgres advisory lock before applying anything:
 *
 *     SELECT pg_advisory_lock(72707369)
 *
 * (verified in the shipped engine binary; see also
 * https://pris.ly/d/migrate-advisory-locking). Concurrent `migrate deploy`
 * processes therefore queue behind each other rather than colliding, which
 * makes boot-time migration safe at any number of instances — and it is the only
 * option on a hosting tier that has no pre-deploy hook.
 *
 * So this is on by default. Set MIGRATE_ON_BOOT=0 where a pre-deploy step
 * already does it, or where the application's database role has no DDL rights.
 *
 * A failure here is fatal on purpose: the app refuses to start rather than
 * serving traffic against a schema that does not match the code. The schema
 * check in schema-guard.ts runs immediately afterwards as a second opinion, and
 * distinguishes "migrations are pending" from "a migration half-applied".
 */
export async function applyPendingMigrations(runner: MigrationRunner = spawnPrismaMigrate): Promise<void> {
  if (process.env[ENABLED] === '0') {
    logger.log(`${ENABLED}=0 — leaving migrations to the deploy step.`);
    return;
  }

  // A build without the migrations directory cannot run them; there is nothing
  // to apply and nothing to warn about beyond saying so.
  if (!existsSync(join(process.cwd(), 'prisma', 'migrations'))) {
    logger.warn('prisma/migrations not present in this image; skipping boot migration.');
    return;
  }

  logger.log('Applying pending migrations…');
  const exitCode = await runner();

  if (exitCode !== 0) {
    throw new Error(
      `Refusing to start: \`prisma migrate deploy\` exited with code ${exitCode}. ` +
        'The schema was not brought up to date, so this image would serve traffic ' +
        'against the wrong schema. Fix the migration and redeploy; if a migration ' +
        'half-applied, resolve it with `prisma migrate resolve`.',
    );
  }
}

/**
 * Runs the CLI rather than importing it: `prisma` is a binary, and this way its
 * own output (including the advisory-lock and per-migration lines) reaches the
 * deploy log intact, which is what an operator reads when a deploy fails.
 */
function spawnPrismaMigrate(): Promise<number> {
  const timeoutMs = Number(process.env[TIMEOUT_MS] ?? DEFAULT_TIMEOUT_MS);

  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', 'migrate', 'deploy'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        // Keeps the deploy log about this deployment rather than about whether
        // a newer Prisma exists.
        PRISMA_HIDE_UPDATE_MESSAGE: '1',
      },
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new Error(
          `Refusing to start: \`prisma migrate deploy\` did not finish within ${timeoutMs}ms. ` +
            'A migration may be waiting on another instance, or blocked on a lock. ' +
            `Raise ${TIMEOUT_MS} if the migration is legitimately slow.`,
        ),
      );
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Could not run \`prisma migrate deploy\`: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}
