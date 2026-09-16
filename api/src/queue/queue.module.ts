import { BullModule } from '@nestjs/bullmq';
import { Module, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { MailerModule } from '../providers/mailer/mailer.module';
import { DIGEST_QUEUE, SCHEDULER_QUEUE, SEND_QUEUE } from './queue.constants';
import { SendProcessor } from './send.processor';

const connection = {
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

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
          removeOnFail: false,
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
    // Digest tick runs hourly and decides per-tenant whether a digest is due.
    await this.digest.upsertJobScheduler(
      'digest-tick',
      { every: Number(process.env.DIGEST_TICK_MS ?? 3_600_000) },
      { name: 'tick', opts: { removeOnComplete: true } },
    );
  }
}
