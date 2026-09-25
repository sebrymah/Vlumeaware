import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import type { PrismaService } from './prisma.service';

const logger = new Logger('SchemaGuard');

/** Release-phase escape hatch, for a deliberately staged rollout. */
const SKIP = 'SKIP_SCHEMA_CHECK';

export interface SchemaGuardOptions {
  /** How many times to re-check before giving up. */
  retries?: number;
  /** Delay between re-checks, in milliseconds. */
  delayMs?: number;
}

/**
 * A "behind" verdict is usually transient: a deploy is applying the migration
 * right now, in another container. Waiting briefly turns a spurious failed
 * deploy — the worker refusing to start because the API had not finished
 * migrating yet — into a short delay. Ten attempts at three seconds comfortably
 * covers a normal migration.
 */
const DEFAULT_RETRIES = 10;
const DEFAULT_DELAY_MS = 3_000;

/**
 * Refuses to start when the database schema is behind the code in the image.
 *
 * Migrations are applied by the deploy pipeline rather than at container start,
 * because start-time migration races between instances and turns a failed
 * migration into a crash-loop. Moving them out is only safe if the application
 * notices when nobody ran them — otherwise a deploy that ships code reading a
 * column that does not exist boots clean and 500s on first use, which is the
 * failure the old arrangement was written to prevent.
 *
 * So: count the migrations in the image, count the ones the database has
 * finished applying, and refuse to serve if the first is larger. A *failed*
 * migration (started, never finished) is refused immediately and without
 * retrying, because that state needs a human and will not resolve itself.
 *
 * This runs before the HTTP listener opens, so a failing check means the
 * platform keeps the previous instance serving rather than replacing it with a
 * broken one.
 */
export async function assertSchemaIsCurrent(
  prisma: PrismaService,
  options: SchemaGuardOptions = {},
): Promise<void> {
  if (process.env[SKIP] === '1') {
    logger.warn(`${SKIP}=1 — skipping the schema check. Do not use this in production.`);
    return;
  }

  const shipped = countShippedMigrations();
  if (shipped === null) {
    // Running from a build without the migrations directory (a bare `dist`
    // deploy, say). Nothing to compare against, so say so and carry on.
    logger.warn('prisma/migrations not present in this image; schema check skipped.');
    return;
  }

  const retries = options.retries ?? DEFAULT_RETRIES;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  for (let attempt = 0; ; attempt += 1) {
    const state = await readMigrationState(prisma);

    if (state.failed > 0) {
      throw new Error(
        `Refusing to start: ${state.failed} migration(s) are recorded as started but never ` +
          'finished. Resolve the failed migration (prisma migrate resolve) before deploying.',
      );
    }

    if (state.applied >= shipped) {
      logger.log(`Schema up to date (${state.applied}/${shipped} migrations applied).`);
      return;
    }

    const pending = shipped - state.applied;
    if (attempt >= retries) {
      throw new Error(
        `Refusing to start: the database has ${state.applied} applied migration(s) but this ` +
          `image ships ${shipped} — ${pending} pending. Run \`npx prisma migrate deploy\` as the ` +
          `deploy step (see the Dockerfile), or set ${SKIP}=1 to override deliberately.`,
      );
    }

    logger.log(
      `Schema is ${pending} migration(s) behind (attempt ${attempt + 1}/${retries + 1}); ` +
        `waiting ${delayMs}ms in case a deploy is applying it now.`,
    );
    await sleep(delayMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Migration directories are named `<timestamp>_<name>`; count those only. */
function countShippedMigrations(): number | null {
  try {
    const dir = join(process.cwd(), 'prisma', 'migrations');
    return readdirSync(dir).filter((name) => /^\d{14}_/.test(name)).length;
  } catch {
    return null;
  }
}

async function readMigrationState(
  prisma: PrismaService,
): Promise<{ applied: number; failed: number }> {
  try {
    const rows = await prisma.db.$queryRaw<Array<{ applied: number; failed: number }>>`
      SELECT
        count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS applied,
        count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS failed
      FROM _prisma_migrations
    `;
    return { applied: rows[0]?.applied ?? 0, failed: rows[0]?.failed ?? 0 };
  } catch {
    throw new Error(
      'Refusing to start: the database has no migration history (_prisma_migrations is ' +
        'missing or unreadable). Apply migrations with `npx prisma migrate deploy` before ' +
        'starting the API.',
    );
  }
}
