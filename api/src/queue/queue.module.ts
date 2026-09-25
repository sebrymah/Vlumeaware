import { BullModule } from '@nestjs/bullmq';
import { Module, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { BULLMQ_CONNECTION_OPTIONS, redisConnection } from '../common/redis/redis-connection';
import { MailerModule } from '../providers/mailer/mailer.module';
import { DIGEST_QUEUE, SCHEDULER_QUEUE, SEND_QUEUE } from './queue.constants';
import { SendProcessor } from './send.processor';

/**
 * BullMQ needs a connection whose retry cap is lifted: workers issue blocking
 * commands, and ioredis' default cap aborts them, killing the worker on the
 * first blip from a managed host.
 *
 * NOTE — the Redis instance itself must run with `maxmemory-policy noeviction`.
 * Managed hosts commonly default to `allkeys-lru`, which lets Redis evict queue
 * keys under memory pressure: queued simulation sends would disappear silently,
 * with no failed job and nothing in the logs. BullMQ warns about this at boot.
 * On Render, set it on the Key Value instance under Settings → Maxmemory Policy.
 */
const connection = { ...redisConnection(), ...BULLMQ_CONNECTION_OPTIONS };

@Module({
  imports: [
    BullModule.forRoot({ connection }),
    BullModule.registerQueue(
      {
        name: SEND_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 1000,
          // Keep a deep failure history for diagnosis, but bounded: Redis runs
          // with noeviction, so an unbounded backlog eventually fills the
          // instance and campaign launches start erroring instead of queueing.
          removeOnFail: 5000,
        },
      },
      { name: SCHEDULER_QUEUE, defaultJobOptions: { removeOnComplete: 50, removeOnFail: 50 } },
      { name: DIGEST_QUEUE, defaultJobOptions: { removeOnComplete: 50, removeOnFail: 50 } },
    ),
    MailerModule,
  ],
  providers: [SendProcessor],
  exports: [BullModule],
})
export class QueueModule implements OnModuleInit {
  constructor(
    @InjectQueue(SCHEDULER_QUEUE) private readonly scheduler: Queue,
    @InjectQueue(DIGEST_QUEUE) private readonly digest: Queue,
  ) {}

  /**
   * Registers the repeatable ticks. The scheduler tick auto-launches due
   * campaigns; the digest tick sends weekly summaries. Intervals are short in
   * dev (SCHEDULER_TICK_MS) so scheduled sends can be demoed quickly.
   */
  async onModuleInit() {
    const tickMs = Number(process.env.SCHEDULER_TICK_MS ?? 60_000);
    await this.scheduler.upsertJobScheduler(
      'scheduler-tick',
      { every: tickMs },
      { name: 'tick', opts: { removeOnComplete: true } },
    );
    // Polls hourly; DigestProcessor decides per tenant whether one is due
    // from last_digest_sent_at, so this interval is only the poll rate and
    // changing it does not change how often a client is emailed.
    await this.digest.upsertJobScheduler(
      'digest-tick',
      { every: Number(process.env.DIGEST_TICK_MS ?? 3_600_000) },
      { name: 'tick', opts: { removeOnComplete: true } },
    );
  }
}
