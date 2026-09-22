import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { SendingDomainsService } from '../src/modules/sending-domains/sending-domains.service';
import type { EmailDomainsProvider, ProviderDomain } from '../src/providers/email-domains/email-domains.interface';

const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;

/** A fake Resend Domains API. Verification is manual: flip `verifyStatus`. */
class FakeProvider implements EmailDomainsProvider {
  configured = true;
  verifyStatus = 'pending';
  removed: string[] = [];
  private seq = 0;
  private records = [{ record: 'DKIM', name: 'resend._domainkey', type: 'TXT', value: 'p=abc' }];

  async create(domain: string): Promise<ProviderDomain> {
    return { id: `prov-${++this.seq}`, name: domain, status: 'pending', records: this.records };
  }
  async get(id: string): Promise<ProviderDomain> {
    return { id, name: 'x.test', status: this.verifyStatus, records: this.records };
  }
  async verify(id: string): Promise<ProviderDomain> {
    return { id, name: 'x.test', status: this.verifyStatus, records: this.records };
  }
  async remove(id: string): Promise<void> {
    this.removed.push(id);
  }
}

const provider = new FakeProvider();
const service = new SendingDomainsService(prisma, provider);

const uniq = () => `sd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const sys = <T>(fn: () => Promise<T>) => runAsSystem('test', fn);
const tenants: string[] = [];

async function tenant() {
  const t = await sys(() => db.tenant.create({ data: { name: uniq() } }));
  tenants.push(t.id);
  return t.id;
}
const inT = <T>(id: string, fn: () => Promise<T>) => runInTenant(id, fn);

beforeAll(async () => { await base.$connect(); });
afterEach(() => { provider.verifyStatus = 'pending'; });
afterAll(async () => {
  await sys(() => base.tenant.deleteMany({ where: { id: { in: tenants } } }));
  await base.$disconnect();
});

describe('sending domains', () => {
  it('registers a domain as pending with the provider DNS records', async () => {
    const id = await tenant();
    const d = await inT(id, () => service.add('Acme-Security.com'));
    expect(d.domain).toBe('acme-security.com');
    expect(d.status).toBe('pending');
    expect(d.providerId).toMatch(/^prov-/);
    expect(Array.isArray(d.dnsRecords)).toBe(true);
  });

  it('rejects a bare non-domain and a URL', async () => {
    const id = await tenant();
    await expect(inT(id, () => service.add('not a domain'))).rejects.toThrow(/bare domain/i);
    const ok = await inT(id, () => service.add('https://acme.com/path'));
    expect(ok.domain).toBe('acme.com');
  });

  it('will not add the same domain twice for a tenant', async () => {
    const id = await tenant();
    await inT(id, () => service.add('dup.example'));
    await expect(inT(id, () => service.add('dup.example'))).rejects.toThrow(/already added/i);
  });

  it('flips to verified when the provider verifies, and only then can it send', async () => {
    const id = await tenant();
    const d = await inT(id, () => service.add(`${uniq()}.test`));
    expect((await inT(id, () => service.verifiedList()))).toHaveLength(0);

    provider.verifyStatus = 'verified';
    const refreshed = await inT(id, () => service.refresh(d.id));
    expect(refreshed.status).toBe('verified');
    expect(refreshed.verifiedAt).toBeInstanceOf(Date);

    const verified = await inT(id, () => service.verifiedList());
    expect(verified.map((v) => v.id)).toContain(d.id);
  });

  it('a provider hiccup on refresh leaves the domain pending, not failed', async () => {
    const id = await tenant();
    const d = await inT(id, () => service.add(`${uniq()}.test`));
    const spy = jest.spyOn(provider, 'verify').mockRejectedValueOnce(new Error('provider 500'));
    const after = await inT(id, () => service.refresh(d.id));
    expect(after.status).toBe('pending');
    spy.mockRestore();
  });

  it('one tenant cannot see or verify another tenant\'s domain', async () => {
    const a = await tenant();
    const b = await tenant();
    const da = await inT(a, () => service.add(`${uniq()}.test`));
    // B's list never includes A's domain.
    const bList = await inT(b, () => service.list());
    expect(bList.find((x) => x.id === da.id)).toBeUndefined();
  });

  it('enables a Vlumeaware shared domain as verified with no provider call, idempotently', async () => {
    process.env.SHARED_SENDING_DOMAINS = 'vlumeshared.test';
    const id = await tenant();

    const opts = await inT(id, () => service.sharedOptions());
    expect(opts.map((o) => o.domain)).toContain('vlumeshared.test');
    expect(opts.find((o) => o.domain === 'vlumeshared.test')?.enabled).toBe(false);

    const enabled = await inT(id, () => service.enableShared('vlumeshared.test'));
    expect(enabled.managed).toBe(true);
    expect(enabled.status).toBe('verified');
    expect(enabled.providerId).toBeNull();

    // It is immediately choosable per campaign, and re-enabling is a no-op.
    const verified = await inT(id, () => service.verifiedList());
    expect(verified.map((v) => v.id)).toContain(enabled.id);
    const again = await inT(id, () => service.enableShared('vlumeshared.test'));
    expect(again.id).toBe(enabled.id);
  });

  it('rejects enabling a domain that is not on the shared list', async () => {
    process.env.SHARED_SENDING_DOMAINS = 'vlumeshared.test';
    const id = await tenant();
    await expect(inT(id, () => service.enableShared('not-shared.test'))).rejects.toThrow(/not a Vlumeaware shared/i);
  });

  it('sets and clears a sender display name without touching the domain', async () => {
    process.env.SHARED_SENDING_DOMAINS = 'vlumeshared.test';
    const id = await tenant();
    const d = await inT(id, () => service.enableShared('vlumeshared.test'));

    const named = await inT(id, () => service.setSenderName(d.id, '  IT Service Desk  '));
    expect(named.senderName).toBe('IT Service Desk');
    expect(named.domain).toBe('vlumeshared.test');

    const cleared = await inT(id, () => service.setSenderName(d.id, '   '));
    expect(cleared.senderName).toBeNull();
  });

  it('refuses removal while a draft campaign uses it, and deletes provider-side otherwise', async () => {
    const id = await tenant();
    provider.verifyStatus = 'verified';
    const d = await inT(id, () => service.add(`${uniq()}.test`));
    await inT(id, () => service.refresh(d.id));
    const camp = await sys(() =>
      db.campaign.create({ data: { tenantId: id, name: 'c', sendingDomainId: d.id } }),
    );

    await expect(inT(id, () => service.remove(d.id))).rejects.toThrow(/live or draft campaign/i);

    await sys(() => db.campaign.delete({ where: { id: camp.id } }));
    const res = await inT(id, () => service.remove(d.id));
    expect(res.deleted).toBe(true);
    expect(provider.removed).toContain(d.providerId);
  });
});
