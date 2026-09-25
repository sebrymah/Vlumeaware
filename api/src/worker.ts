import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { applyPendingMigrations } from './common/prisma/migrate-on-boot';
import { PrismaService } from './common/prisma/prisma.service';
import { assertSchemaIsCurrent } from './common/prisma/schema-guard';

/**
 * Worker container entrypoint. Same modules, no HTTP listener — the BullMQ
 * processors registered by QueueModule are what run here.
 */
async function bootstrap() {
  // bufferLogs is deliberately off here, unlike the API. Buffering exists to
  // keep startup output from interleaving, and it is flushed by `listen()` —
  // which this entrypoint never calls, because it has no HTTP listener. With it
  // on, the worker printed nothing at all: not "worker started", not a failed
  // send, not one of the runAsSystem audit lines. A worker that fails quietly
  // is worse than one that is noisy.
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });
  app.enableShutdownHooks();
  // A worker reading a table that does not exist yet fails job by job, which is
  // harder to notice than refusing to start — so it migrates and checks exactly
  // as the API does. Two processes doing this concurrently is fine: Prisma's
  // engine serialises them with a Postgres advisory lock.
  await applyPendingMigrations();
  await assertSchemaIsCurrent(app.get(PrismaService));
  new Logger('worker').log('Vlumeaware send worker started');
}

void bootstrap();
