import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { runAsSystem, runInTenant } from '../common/prisma/tenant-context';
import { CampaignsService } from '../modules/campaigns/campaigns.service';
import { SCHEDULER_QUEUE } from './queue.constants';

/**
 * Fires on a repeatable tick. Finds campaigns whose scheduled send time has
 * arrived and launches them — this is what makes scheduled and recurring
 * campaigns go out without anyone clicking "launch". Robust to restarts: state
 * lives in the database, not in a long-lived delayed job.
 */
@Processor(SCHEDULER_QUEUE)
export class SchedulerProcessor extends WorkerHost {
  private readonly logger = new Logger(SchedulerProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignsService,
  ) {
    super();
  }

  async process(_job: Job) {
    const due = await runAsSystem('scheduler: find due campaigns', () =>
      this.prisma.db.campaign.findMany({
        where: {
          status: 'draft',
          scheduledSendAt: { not: null, lte: new Date() },
        },
        select: { id: true, tenantId: true, name: true },
      }),
    );

    let launched = 0;
    for (const campaign of due) {
      try {
        await runInTenant(campaign.tenantId, () => this.campaigns.launch(campaign.id));
        launched += 1;
        this.logger.log(`Auto-launched scheduled campaign "${campaign.name}" (${campaign.id})`);
      } catch (err) {
        this.logger.error(`Failed to auto-launch ${campaign.id}: ${(err as Error).message}`);
      }
    }
    return { checked: due.length, launched };
  }
}
