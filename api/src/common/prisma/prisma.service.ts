import { INestApplication, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from './tenant-guard.extension';

const logger = new Logger('PrismaService');

function build() {
  const base = new PrismaClient({
    log: process.env.PRISMA_LOG === 'query' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
  return base.$extends(tenantGuardExtension);
}

export type GuardedClient = ReturnType<typeof build>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  /** Tenant-guarded client. Use this everywhere. */
  readonly db: GuardedClient = build();

  async onModuleInit() {
    await (this.db as unknown as PrismaClient).$connect();
    logger.log('Prisma connected with tenant guard active');
  }

  async onModuleDestroy() {
    await (this.db as unknown as PrismaClient).$disconnect();
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', () => void app.close());
  }
}
