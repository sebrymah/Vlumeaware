import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { Scenario } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { runInTenant } from '../common/prisma/tenant-context';
import { MAILER } from '../providers/mailer/mailer.interface';
import type { Mailer } from '../providers/mailer/mailer.interface';
import { renderScenario, trackingBaseUrl } from '../modules/tracking/render';
import { SEND_QUEUE } from './queue.constants';
import type { SendJob } from './queue.constants';

/** A claim older than this is treated as abandoned (crashed worker) and may be
 *  re-claimed. Comfortably longer than the BullMQ retry window, so a normal
 *  retry after a mid-send crash skips rather than re-sends. */
const CLAIM_TTL_MS = Number(process.env.SEND_CLAIM_TTL_MS ?? 180_000);
/** How long the worker reuses a scenario across a campaign's recipients (B7). */
const SCENARIO_TTL_MS = Number(process.env.SEND_CACHE_TTL_MS ?? 60_000);

@Processor(SEND_QUEUE, { concurrency: Number(process.env.SEND_CONCURRENCY ?? 5) })
export class SendProcessor extends WorkerHost {
  private readonly logger = new Logger(SendProcessor.name);
  /** Per-worker scenario cache. Scenarios are immutable during a send run and
   *  shared by every recipient of a campaign, so re-reading one per email is
   *  waste. Keyed by the globally-unique scenario id, so it cannot cross
   *  tenants. The campaign is deliberately NOT cached: its status must stay live
   *  so the kill switch halts sending at once. */
  private readonly scenarioCache = new Map<string, { value: Scenario; expires: number }>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {
    super();
  }

  private async getScenario(id: string): Promise<Scenario | null> {
    const hit = this.scenarioCache.get(id);
    if (hit && hit.expires > Date.now()) return hit.value;
    const scenario = await this.prisma.db.scenario.findUnique({ where: { id } });
    if (scenario) this.scenarioCache.set(id, { value: scenario, expires: Date.now() + SCENARIO_TTL_MS });
    return scenario;
  }

  async process(job: Job<SendJob>) {
    const { sendId, tenantId } = job.data;

    return runInTenant(tenantId, async () => {
      const send = await this.prisma.db.send.findUnique({
        where: { id: sendId },
        include: { employee: true, campaign: { include: { sendingDomain: true } } },
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

      // B5: claim the row before mailing. Succeeds only when it is unsent and not
      // already claimed recently; a stale claim (crashed worker) is re-claimable
      // after CLAIM_TTL_MS. If a crash lands between mailing and the sentAt write,
      // the retry finds a fresh claim and skips — so no recipient is mailed
      // twice. Preventing a duplicate is prioritised over the rare missed send if
      // a crash lands between the claim and the mail.
      const claim = await this.prisma.db.send.updateMany({
        where: {
          id: send.id,
          sentAt: null,
          OR: [{ sendingAt: null }, { sendingAt: { lt: new Date(Date.now() - CLAIM_TTL_MS) } }],
        },
        data: { sendingAt: new Date() },
      });
      if (claim.count === 0) {
        this.logger.log(`Send ${sendId} already claimed or sent; skipping`);
        return { skipped: 'not-claimed' };
      }

      const scenario = await this.getScenario(send.scenarioId);
      if (!scenario) return { skipped: 'missing-scenario' };

      const html = renderScenario(scenario.bodyHtml, {
        trackingUrl: `${trackingBaseUrl()}/track/click/${send.uniqueTrackingToken}`,
        pixelUrl: `${trackingBaseUrl()}/track/open/${send.uniqueTrackingToken}`,
        employeeName: send.employee.name,
      });

      // The campaign's chosen verified sending domain decides the From. New
      // campaigns cannot launch without one (preflight), so this branch is
      // taken for anything created after the feature shipped; the env fallback
      // covers campaigns that launched before it existed.
      const fromAddress =
        send.campaign.sendingDomain?.status === 'verified'
          ? `${send.campaign.fromLocalPart?.trim() || 'no-reply'}@${send.campaign.sendingDomain.domain}`
          : (process.env.SIMULATION_FROM_ADDRESS ?? 'no-reply@vlumesec.com');

      // Display name ("title") the From shows, most specific first: the
      // campaign's own override, then the sending domain's default, then the
      // scenario's sender name. None of these change the address it is sent
      // from — they decide what staff see instead of the raw address.
      const fromName =
        send.campaign.senderName?.trim() ||
        send.campaign.sendingDomain?.senderName?.trim() ||
        scenario.senderSpoofName;

      await this.mailer.send({
        to: send.employee.email,
        fromName,
        fromAddress,
        subject: scenario.subjectLine,
        html,
        sendId: send.id,
      });

      await this.prisma.db.send.update({ where: { id: send.id }, data: { sentAt: new Date() } });
      return { sent: true };
    });
  }
}
