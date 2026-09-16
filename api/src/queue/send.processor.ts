import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { runInTenant } from '../common/prisma/tenant-context';
import { MAILER } from '../providers/mailer/mailer.interface';
import type { Mailer } from '../providers/mailer/mailer.interface';
import { renderScenario, trackingBaseUrl } from '../modules/tracking/render';
import { SEND_QUEUE } from './queue.constants';
import type { SendJob } from './queue.constants';

@Processor(SEND_QUEUE, { concurrency: Number(process.env.SEND_CONCURRENCY ?? 5) })
export class SendProcessor extends WorkerHost {
  private readonly logger = new Logger(SendProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {
    super();
  }

  async process(job: Job<SendJob>) {
    const { sendId, tenantId } = job.data;

    return runInTenant(tenantId, async () => {
      const send = await this.prisma.db.send.findUnique({
        where: { id: sendId },
        include: { employee: true, campaign: true },
      });

      if (!send) {
        this.logger.warn(`Send ${sendId} no longer exists; dropping job`);
        return { skipped: 'missing' };
      }
      if (send.sentAt) {
        return { skipped: 'already-sent' };
      }

      // Kill switch and pause are honoured per job, immediately before the
      // send. Jobs already queued must not go out after an admin halts the
      // campaign (context doc §12).
      if (send.campaign.status !== 'active') {
        this.logger.log(`Campaign ${send.campaignId} is ${send.campaign.status}; not sending ${sendId}`);
        return { skipped: `campaign-${send.campaign.status}` };
      }

      const scenario = await this.prisma.db.scenario.findUnique({ where: { id: send.scenarioId } });
      if (!scenario) return { skipped: 'missing-scenario' };

      const html = renderScenario(scenario.bodyHtml, {
        trackingUrl: `${trackingBaseUrl()}/track/click/${send.uniqueTrackingToken}`,
        pixelUrl: `${trackingBaseUrl()}/track/open/${send.uniqueTrackingToken}`,
        employeeName: send.employee.name,
      });

      await this.mailer.send({
        to: send.employee.email,
        fromName: scenario.senderSpoofName,
        fromAddress: process.env.SIMULATION_FROM_ADDRESS ?? 'no-reply@vlumeaware-trk.io',
        subject: scenario.subjectLine,
        html,
        sendId: send.id,
      });

      await this.prisma.db.send.update({ where: { id: send.id }, data: { sentAt: new Date() } });
      return { sent: true };
    });
  }
}
