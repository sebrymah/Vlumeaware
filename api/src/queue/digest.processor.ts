import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { runAsSystem, runInTenant } from '../common/prisma/tenant-context';
import { MAILER } from '../providers/mailer/mailer.interface';
import type { Mailer } from '../providers/mailer/mailer.interface';
import { ReportsService } from '../modules/reports/reports.service';
import { DIGEST_QUEUE } from './queue.constants';

/**
 * Emails a periodic summary to each tenant that has enabled digests. Runs on a
 * repeatable tick; sends at most one digest per tenant per run. In dev the
 * mailer only logs, so this is safe to exercise without real delivery.
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
    const tenants = await runAsSystem('digest: tenants opted in', () =>
      this.prisma.db.tenant.findMany({
        where: { digestEnabled: true, digestEmail: { not: null }, status: 'active' },
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
          fromAddress: process.env.DIGEST_FROM_ADDRESS ?? 'reports@vlumeaware-trk.io',
          subject: `Security awareness summary — ${tenant.name}`,
          html,
          sendId: `digest-${tenant.id}`,
        });
        sent += 1;
      } catch (err) {
        this.logger.error(`Digest failed for ${tenant.id}: ${(err as Error).message}`);
      }
    }
    return { tenants: tenants.length, sent };
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
