import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuditService } from '../src/common/audit/audit.service';
import { DomainsService } from '../src/modules/domains/domains.service';
import { CampaignsService } from '../src/modules/campaigns/campaigns.service';

const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;

/** Enough of a BullMQ queue for launch(); nothing here asserts on the jobs. */
const queue = { addBulk: async () => [], getJobs: async () => [], remove: async () => {} } as never;
const campaigns = new CampaignsService(prisma, new AuditService(prisma), new DomainsService(prisma), queue);

const uniq = () => `pf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const sys = <T>(fn: () => Promise<T>) => runAsSystem('test', fn);
const created: string[] = [];

/**
 * A tenant that clears every gate. Individual tests then knock one out, which
 * is the only way to be sure the gate is what refused the launch.
 */
async function readyTenant() {
  const t = await sys(() =>
    db.tenant.create({
      data: {
        name: uniq(),
        ndpaAgreementSignedAt: new Date(),
        allowlistConfirmedAt: new Date(),
        sendingDomain: 'sim.test',
      },
    }),
  );
  created.push(t.id);
  const domain = `${uniq()}.test`;
  await sys(() =>
    db.verifiedDomain.create({
      data: { tenantId: t.id, domain, token: 'x', status: 'verified', verifiedAt: new Date() },
    }),
  );
  await sys(() =>
    db.employee.create({ data: { tenantId: t.id, email: `someone@${domain}`, name: 'E' } }),
  );
  const scenario = await sys(() =>
    db.scenario.create({
      data: {
        tenantId: t.id,
        title: 'S',
        difficultyTier: 'medium',
        subjectLine: 's',
        bodyHtml: '<a href="{{TRACKING_URL}}">x</a>',
        senderSpoofName: 'IT',
        redFlags: [],
        approvedAt: new Date(),
      },
    }),
  );
  const sendingDomain = await sys(() =>
    db.sendingDomain.create({
      data: { tenantId: t.id, domain: `send-${uniq()}.test`, providerId: 'p', status: 'verified', verifiedAt: new Date() },
    }),
  );
  const campaign = await sys(() =>
    db.campaign.create({ data: { tenantId: t.id, name: 'C', sendingDomainId: sendingDomain.id } }),
  );
  await sys(() =>
    db.campaignScenario.create({
      data: { tenantId: t.id, campaignId: campaign.id, scenarioId: scenario.id },
    }),
  );
  return { tenantId: t.id, campaignId: campaign.id, scenarioId: scenario.id, sendingDomainId: sendingDomain.id };
}

const launch = (tenantId: string, campaignId: string) =>
  runInTenant(tenantId, () => campaigns.launch(campaignId));

beforeAll(async () => {
  await base.$connect();
});
afterAll(async () => {
  await sys(() => base.tenant.deleteMany({ where: { id: { in: created } } }));
  await base.$disconnect();
});

describe('preflight is enforced at launch, not merely reported', () => {
  it('launches when every gate is green', async () => {
    const { tenantId, campaignId } = await readyTenant();
    await expect(launch(tenantId, campaignId)).resolves.toBeDefined();
  });

  // The gate that prompted this: it was read only by an endpoint nothing
  // called, so a campaign went out into a gateway that would quarantine it.
  it('refuses when the client IT allow-list is not confirmed', async () => {
    const { tenantId, campaignId } = await readyTenant();
    await sys(() =>
      db.tenant.update({ where: { id: tenantId }, data: { allowlistConfirmedAt: null } }),
    );
    await expect(launch(tenantId, campaignId)).rejects.toThrow(/allow-listed/i);
  });

  it('refuses when the authorization agreement is missing', async () => {
    const { tenantId, campaignId } = await readyTenant();
    await sys(() =>
      db.tenant.update({ where: { id: tenantId }, data: { ndpaAgreementSignedAt: null } }),
    );
    await expect(launch(tenantId, campaignId)).rejects.toThrow(/Not ready to launch/i);
  });

  it('refuses when no verified sending domain is chosen', async () => {
    const { tenantId, campaignId } = await readyTenant();
    await sys(() => db.campaign.update({ where: { id: campaignId }, data: { sendingDomainId: null } }));
    await expect(launch(tenantId, campaignId)).rejects.toThrow(/sending domain/i);
  });

  it('refuses when the chosen sending domain is not yet verified', async () => {
    const { tenantId, campaignId, sendingDomainId } = await readyTenant();
    await sys(() => db.sendingDomain.update({ where: { id: sendingDomainId }, data: { status: 'pending' } }));
    await expect(launch(tenantId, campaignId)).rejects.toThrow(/sending domain/i);
  });

  it('refuses when no scenario is attached', async () => {
    const { tenantId } = await readyTenant();
    const bare = await sys(() => db.campaign.create({ data: { tenantId, name: 'bare' } }));
    await expect(launch(tenantId, bare.id)).rejects.toThrow(/scenario/i);
  });

  it('names what is outstanding rather than failing opaquely', async () => {
    const { tenantId, campaignId } = await readyTenant();
    await sys(() =>
      db.tenant.update({
        where: { id: tenantId },
        data: { allowlistConfirmedAt: null, ndpaAgreementSignedAt: null },
      }),
    );
    await expect(launch(tenantId, campaignId)).rejects.toThrow(/agreement[\s\S]*allow-listed|allow-listed[\s\S]*agreement/i);
  });

  it('leaves the campaign a draft when a gate refuses it', async () => {
    const { tenantId, campaignId } = await readyTenant();
    await sys(() =>
      db.tenant.update({ where: { id: tenantId }, data: { allowlistConfirmedAt: null } }),
    );
    await expect(launch(tenantId, campaignId)).rejects.toThrow();
    const c = await sys(() => db.campaign.findUnique({ where: { id: campaignId } }));
    expect(c?.status).toBe('draft');
    expect(await sys(() => db.send.count({ where: { campaignId } }))).toBe(0);
  });
});
