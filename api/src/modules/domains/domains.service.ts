import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { resolveTxt } from 'node:dns/promises';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId } from '../../common/prisma/tenant-context';

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** The DNS record host prefix and value prefix a client adds to prove ownership. */
export const TXT_HOST_PREFIX = '_vlumeaware';
export const TXT_VALUE_PREFIX = 'vlumeaware-verify=';

@Injectable()
export class DomainsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Normalises free-form input ("https://Mail.ACME.com/") to a bare domain ("mail.acme.com"). */
  static normalize(input: string): string {
    let d = (input ?? '').trim().toLowerCase();
    d = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^@/, '').replace(/\.$/, '');
    if (d.startsWith('www.')) d = d.slice(4);
    return d;
  }

  private txtRecordFor(domain: string, token: string) {
    return {
      host: `${TXT_HOST_PREFIX}.${domain}`,
      type: 'TXT',
      value: `${TXT_VALUE_PREFIX}${token}`,
    };
  }

  private decorate(row: { domain: string; token: string } & Record<string, unknown>) {
    return { ...row, dnsRecord: this.txtRecordFor(row.domain, row.token) };
  }

  async list() {
    const rows = await this.prisma.db.verifiedDomain.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((r) => this.decorate(r));
  }

  async add(input: string) {
    const domain = DomainsService.normalize(input);
    if (!DOMAIN_RE.test(domain)) {
      throw new BadRequestException('Enter a valid domain, e.g. acme.com');
    }
    const existing = await this.prisma.db.verifiedDomain.findFirst({ where: { domain } });
    if (existing) throw new BadRequestException('That domain is already on the list');
    const token = randomBytes(18).toString('hex');
    const row = await this.prisma.db.verifiedDomain.create({
      data: { tenantId: currentTenantId(), domain, token },
    });
    return this.decorate(row);
  }

  async findOne(id: string) {
    const row = await this.prisma.db.verifiedDomain.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Domain not found');
    return row;
  }

  /** Live DNS check: does _vlumeaware.<domain> carry our verify token? */
  async verify(id: string) {
    const row = await this.findOne(id);
    if (row.status === 'verified') return this.decorate(row);

    const host = `${TXT_HOST_PREFIX}.${row.domain}`;
    const expected = `${TXT_VALUE_PREFIX}${row.token}`;
    let records: string[][] = [];
    try {
      records = await resolveTxt(host);
    } catch {
      throw new BadRequestException(
        `No TXT record found at ${host}. Add it at your DNS provider, then verify again — DNS changes can take a few minutes.`,
      );
    }
    // Each TXT answer can be split into multiple strings; join before comparing.
    const found = records.some((chunks) => chunks.join('').trim() === expected);
    if (!found) {
      throw new BadRequestException(
        `Found TXT records at ${host} but none matched the expected value. Check the value was copied exactly.`,
      );
    }
    const updated = await this.prisma.db.verifiedDomain.update({
      where: { id },
      data: { status: 'verified', verifiedAt: new Date() },
    });
    return this.decorate(updated);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.db.verifiedDomain.delete({ where: { id } });
    return { deleted: true };
  }

  /** Lower-cased set of this tenant's verified domains — the onboarding/send allowlist. */
  async verifiedSet(): Promise<Set<string>> {
    const rows = await this.prisma.db.verifiedDomain.findMany({
      where: { status: 'verified' },
      select: { domain: true },
    });
    return new Set(rows.map((r) => r.domain.toLowerCase()));
  }

  /** True when an email address sits on one of this tenant's verified domains. */
  static domainOf(email: string): string {
    return (email.split('@')[1] ?? '').trim().toLowerCase();
  }
}
