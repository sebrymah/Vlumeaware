import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId } from '../../common/prisma/tenant-context';
import { EMAIL_DOMAINS } from '../../providers/email-domains/email-domains.interface';
import type { EmailDomainsProvider, ProviderDomain } from '../../providers/email-domains/email-domains.interface';
import { isSharedSendingDomain, sharedSendingDomains } from './shared-sending-domains';

const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/**
 * Domains a client may send simulated phishing AS. Registered with the email
 * provider, verified by DNS the client publishes, chosen per campaign.
 *
 * All writes go through the tenant-scoped client, so the guard stamps and
 * filters by tenant — a client can only ever see and touch its own sending
 * domains. Provider status maps to ours: only "verified" can send.
 */
@Injectable()
export class SendingDomainsService {
  private readonly logger = new Logger(SendingDomainsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_DOMAINS) private readonly provider: EmailDomainsProvider,
  ) {}

  list() {
    return this.prisma.db.sendingDomain.findMany({ orderBy: { createdAt: 'desc' } });
  }

  /**
   * Registers a domain with the provider and stores the DNS records it returns.
   * The client then publishes those records; verification is a later, separate
   * step (refresh), because DNS propagation takes time this call cannot wait
   * for.
   */
  async add(rawDomain: string) {
    const domain = rawDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!DOMAIN_RE.test(domain)) {
      throw new BadRequestException('Enter a bare domain, e.g. acme-security.com — no scheme or path.');
    }
    if (!this.provider.configured) {
      throw new BadRequestException(
        'Custom sending domains are not available on this deployment yet. Contact Vlumetech.',
      );
    }

    const existing = await this.prisma.db.sendingDomain.findFirst({ where: { domain } });
    if (existing) throw new ConflictException('That domain is already added.');

    const created = await this.provider.create(domain);
    return this.prisma.db.sendingDomain.create({
      data: {
        tenantId: currentTenantId(),
        domain,
        providerId: created.id,
        status: this.mapStatus(created.status),
        dnsRecords: created.records as unknown as object,
        verifiedAt: this.mapStatus(created.status) === 'verified' ? new Date() : null,
      },
    });
  }

  /**
   * Re-checks a pending domain against the provider and updates its status.
   * This is the "did my DNS take effect yet" action, on demand from the client
   * and also called when the list is loaded.
   */
  /**
   * The Vlumeaware shared sending domains, and whether each is already enabled
   * for this tenant. Drives the "second method" card: a client can turn one on
   * with no DNS setup and send from it immediately.
   */
  async sharedOptions() {
    const enabled = await this.prisma.db.sendingDomain.findMany({
      where: { managed: true },
      select: { id: true, domain: true, senderName: true },
    });
    const enabledByDomain = new Map(enabled.map((row) => [row.domain, row]));
    return sharedSendingDomains().map((domain) => {
      const row = enabledByDomain.get(domain);
      return {
        domain,
        enabled: Boolean(row),
        id: row?.id ?? null,
        senderName: row?.senderName ?? null,
      };
    });
  }

  /**
   * Enables a shared domain for this tenant: a verified, managed row the client
   * did not have to prove ownership of. Idempotent — enabling one already on is
   * a no-op that returns the existing row.
   */
  async enableShared(rawDomain: string) {
    const domain = rawDomain.trim().toLowerCase();
    if (!isSharedSendingDomain(domain)) {
      throw new BadRequestException('That is not a Vlumeaware shared sending domain.');
    }

    const existing = await this.prisma.db.sendingDomain.findFirst({ where: { domain } });
    if (existing) {
      // If a client had earlier added this as their own (unverified) domain,
      // enabling the shared method promotes it to the managed, verified row.
      if (existing.managed) return existing;
      return this.prisma.db.sendingDomain.update({
        where: { id: existing.id },
        data: { managed: true, status: 'verified', providerId: null, dnsRecords: undefined, verifiedAt: new Date() },
      });
    }

    return this.prisma.db.sendingDomain.create({
      data: {
        tenantId: currentTenantId(),
        domain,
        providerId: null,
        managed: true,
        status: 'verified',
        verifiedAt: new Date(),
      },
    });
  }

  /**
   * Sets the display name ("title") the From shows for a domain — own or
   * shared. It changes only the name beside the address, never the address or
   * domain the mail is sent from. Blank clears it, falling back to the
   * scenario's own sender name at send time.
   */
  async setSenderName(id: string, senderName: string | null) {
    const row = await this.prisma.db.sendingDomain.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Sending domain not found');
    const trimmed = senderName?.trim();
    return this.prisma.db.sendingDomain.update({
      where: { id },
      data: { senderName: trimmed ? trimmed : null },
    });
  }

  async refresh(id: string) {
    const row = await this.prisma.db.sendingDomain.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Sending domain not found');
    // Managed shared domains are verified by the platform, not by DNS the
    // client publishes, so there is nothing to re-check.
    if (row.managed) return row;
    if (!row.providerId) return row;
    if (row.status === 'verified') return row;

    let fresh: ProviderDomain;
    try {
      fresh = await this.provider.verify(row.providerId);
    } catch (err) {
      // A provider hiccup must not flip a domain to failed; leave it pending.
      this.logger.warn(`Refresh failed for sending domain ${id}: ${(err as Error).message}`);
      return row;
    }

    const status = this.mapStatus(fresh.status);
    return this.prisma.db.sendingDomain.update({
      where: { id },
      data: {
        status,
        dnsRecords: fresh.records as unknown as object,
        verifiedAt: status === 'verified' ? (row.verifiedAt ?? new Date()) : null,
      },
    });
  }

  /** Refreshes every not-yet-verified domain, for the list view. Best effort. */
  async listRefreshingPending() {
    const rows = await this.list();
    const pending = rows.filter((r) => r.status !== 'verified' && r.providerId);
    // Sequential rather than parallel: a handful of domains, and it keeps well
    // under any provider rate limit.
    for (const row of pending) {
      await this.refresh(row.id).catch(() => undefined);
    }
    return this.list();
  }

  async remove(id: string) {
    const row = await this.prisma.db.sendingDomain.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Sending domain not found');

    const inUse = await this.prisma.db.campaign.count({
      where: { sendingDomainId: id, status: { in: ['draft', 'active', 'paused'] } },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        'This domain is set on a live or draft campaign. Change or remove those campaigns first.',
      );
    }

    if (row.providerId) {
      await this.provider.remove(row.providerId).catch((err) => {
        // Provider-side delete is best effort; the local row is what governs
        // whether it can be used here.
        this.logger.warn(`Provider delete failed for ${id}: ${(err as Error).message}`);
      });
    }
    await this.prisma.db.sendingDomain.delete({ where: { id } });
    return { deleted: true };
  }

  /** The verified domains a campaign may choose from. */
  verifiedList() {
    return this.prisma.db.sendingDomain.findMany({
      where: { status: 'verified' },
      orderBy: { domain: 'asc' },
    });
  }

  private mapStatus(providerStatus: string): 'pending' | 'verified' | 'failed' {
    const s = providerStatus.toLowerCase();
    if (s === 'verified') return 'verified';
    if (s === 'failed' || s === 'failure' || s === 'not_started') return s === 'failed' || s === 'failure' ? 'failed' : 'pending';
    return 'pending';
  }
}
