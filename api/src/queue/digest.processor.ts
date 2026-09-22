import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { runAsSystem, runInTenant } from '../common/prisma/tenant-context';
import { MAILER } from '../providers/mailer/mailer.interface';
import type { Mailer } from '../providers/mailer/mailer.interface';
import { ReportsService } from '../modules/reports/reports.service';
import { digestFromAddress } from '../providers/mailer/from-addresses';
import { DIGEST_QUEUE } from './queue.constants';

/** Seven days, overridable so dev and tests do not wait a week. */
function digestIntervalMs(): number {
  const raw = Number(process.env.DIGEST_INTERVAL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 7 * 24 * 60 * 60 * 1000;
}

/**
 * Emails a periodic summary to each tenant that has enabled digests.
 *
 * The tick is deliberately more frequent than the digest interval: it fires
 * hourly and each run asks which tenants are actually due, rather than the
 * tick itself being the schedule. That way the cadence is a property of the
 * data (last_digest_sent_at) and not of how often the worker happens to wake,
 * so a restart, a redeploy or a changed tick cannot double-send.
 *
 * In dev the mailer only logs, so this is safe to exercise without real
 * delivery, and DIGEST_INTERVAL_MS can be shortened to demo it.
 */
@Processor(DIGEST_QUEUE)
export class DigestProcessor extends WorkerHost {
  private readonly logger = new Logger(DigestProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {
    super();
  }

  async process(_job: Job) {
    const now = new Date();
    const dueBefore = new Date(now.getTime() - digestIntervalMs());

    const tenants = await runAsSystem('digest: tenants due a digest', () =>
      this.prisma.db.tenant.findMany({
        where: {
          digestEnabled: true,
          digestEmail: { not: null },
          status: 'active',
          // Never sent means due now, so opting in produces a digest on the
          // next tick and the client can see immediately that it works.
          OR: [{ lastDigestSentAt: null }, { lastDigestSentAt: { lte: dueBefore } }],
        },
        select: { id: true, name: true, digestEmail: true },
      }),
    );

    let sent = 0;
    for (const tenant of tenants) {
      try {
        const html = await runInTenant(tenant.id, () => this.buildDigest(tenant.name));
        await this.mailer.send({
          to: tenant.digestEmail as string,
          fromName: 'Vlumeaware',
          fromAddress: digestFromAddress(),
          subject: `Security awareness summary — ${tenant.name}`,
          html,
          // Distinct per send, not per tenant. Resend treats this as
          // X-Entity-Ref-ID, an idempotency key, so the previous fixed
          // `digest-<tenantId>` risked suppressing every digest after the first.
          sendId: `digest-${tenant.id}-${now.toISOString().slice(0, 10)}`,
        });
        // Stamped only after the send is accepted. A failure therefore leaves
        // the tenant due and it is retried on the next tick, rather than
        // silently losing a whole interval's digest.
        await runAsSystem('digest: record send', () =>
          this.prisma.db.tenant.update({
            where: { id: tenant.id },
            data: { lastDigestSentAt: now },
          }),
        );
        sent += 1;
      } catch (err) {
        this.logger.error(`Digest failed for ${tenant.id}: ${(err as Error).message}`);
      }
    }
    return { due: tenants.length, sent };
  }

  private async buildDigest(tenantName: string): Promise<string> {
    const trend = await this.reports.trend();
    const recent = trend.slice(-5).reverse();
    const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
    const rows = recent
      .map(
        (c) =>
          `<tr><td style="padding:4px 8px">${c.name}</td><td style="padding:4px 8px">${c.status}</td>` +
          `<td style="padding:4px 8px">${c.totalSent}</td><td style="padding:4px 8px">${pct(c.clickRate)}</td>` +
          `<td style="padding:4px 8px">${pct(c.reportRate)}</td></tr>`,
      )
      .join('');
    return [
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">`,
      `<h2>Security awareness summary</h2>`,
      `<p>${tenantName} — most recent campaigns.</p>`,
      `<table style="border-collapse:collapse;font-size:13px">`,
      `<tr><th style="text-align:left;padding:4px 8px">Campaign</th><th style="text-align:left;padding:4px 8px">Status</th>` +
        `<th style="text-align:left;padding:4px 8px">Sent</th><th style="text-align:left;padding:4px 8px">Click</th>` +
        `<th style="text-align:left;padding:4px 8px">Report</th></tr>`,
      rows || '<tr><td colspan="5" style="padding:4px 8px">No campaigns yet.</td></tr>',
      `</table>`,
      `<p style="color:#666;font-size:12px">Delivered by Vlumeaware.</p></div>`,
    ].join('');
  }
}
