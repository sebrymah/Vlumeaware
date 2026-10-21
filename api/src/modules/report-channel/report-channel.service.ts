import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId, runAsSystem } from '../../common/prisma/tenant-context';

/** Domain the forwarding address lives on; overridable per environment. */
const inboundDomain = () => process.env.REPORT_INBOUND_DOMAIN?.trim() || 'report.vlumesec.com';

/**
 * Per-tenant phishing-reporting channel (Phase 1: forwarding to a
 * Vlumeaware-hosted address). The address embeds a per-tenant token that
 * Postmark returns as the MailboxHash, so the inbound webhook resolves the
 * tenant without guessing from the sender's domain.
 */
@Injectable()
export class ReportChannelService {
  constructor(private readonly prisma: PrismaService) {}

  /** The acting tenant's channel, lazily created with a token on first read. */
  async getForTenant() {
    const tenantId = currentTenantId();
    let channel = await this.prisma.db.tenantReportChannel.findUnique({ where: { tenantId } });
    if (!channel) {
      channel = await this.prisma.db.tenantReportChannel.create({
        data: { tenantId, forwardingToken: ReportChannelService.newToken() },
      });
    }
    return {
      method: channel.method,
      provider: channel.provider,
      status: channel.status,
      lastReceivedAt: channel.lastReceivedAt,
      forwardingAddress: `report+${channel.forwardingToken}@${inboundDomain()}`,
    };
  }

  /**
   * Inbound path: resolve a forwarding token to its tenant. Runs system-scoped
   * because the webhook has no tenant context yet — the token IS the lookup key.
   */
  resolveTenantByToken(token: string) {
    const clean = token.trim();
    if (!clean) return Promise.resolve(null);
    return runAsSystem('report-channel: resolve forwarding token', () =>
      this.prisma.db.tenantReportChannel.findUnique({
        where: { forwardingToken: clean },
        select: { tenantId: true },
      }),
    );
  }

  /** Stamp liveness when a report lands, so the settings page can show it works. */
  markReceived(tenantId: string) {
    return runAsSystem('report-channel: mark received', () =>
      this.prisma.db.tenantReportChannel.updateMany({
        where: { tenantId },
        data: { lastReceivedAt: new Date() },
      }),
    );
  }

  /** 18 hex chars — unguessable and safe inside an email local-part. */
  private static newToken() {
    return randomBytes(9).toString('hex');
  }
}
