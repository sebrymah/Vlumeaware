import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StorageService } from '../src/providers/storage/storage.service';
import { AuditService } from '../src/common/audit/audit.service';
import { TrialService } from '../src/common/trial/trial.service';
import { TenantsService } from '../src/modules/tenants/tenants.service';

/**
 * The setup checklist.
 *
 * It is the first thing a new client admin sees, and the ordering claim it
 * makes — enable, then train — is enforced by which phase it shows. These tests
 * pin the grouping, the conditions behind each check, and the fact that the
 * flat list still carries every check for callers that render it without
 * phases.
 */
const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;
const noopMailer = { send: async () => ({ messageId: 'test' }) } as never;
const tenants = new TenantsService(
  prisma,
  new StorageService(),
  new AuditService(prisma),
  new TrialService(prisma),
  noopMailer,
);

const tenantIds: string[] = [];

afterAll(async () => {
  await runAsSystem('teardown', () => db.tenant.deleteMany({ where: { id: { in: tenantIds } } }));
  await base.$disconnect();
});

async function freshTenant() {
  const t = await runAsSystem('setup', () =>
    db.tenant.create({ data: { name: `ready-${Date.now()}-${Math.random()}` } }),
  );
  tenantIds.push(t.id);
  return t;
}

const checksOf = (phase: { checks: Array<{ key: string; ok: boolean }> }, key: string) =>
  phase.checks.find((c) => c.key === key)!;

describe('setup checklist readiness', () => {
  it('groups the checks into enable, then train', async () => {
    const tenant = await freshTenant();
    const state = await tenants.readiness(tenant.id);

    expect(state.phases.map((p) => p.key)).toEqual(['enabled', 'training']);
    // The first phase is what has to be true before a simulation can be sent.
    expect(state.phases[0].checks.map((c) => c.key)).toEqual([
      'agreementSigned',
      'domainVerified',
      'sendingDomainVerified',
      'employeesUploaded',
      'gatewayAllowlist',
    ]);
    // The second is the programme built on top of it.
    expect(state.phases[1].checks.map((c) => c.key)).toEqual([
      'contentAdded',
      'scenarioAdded',
      'routingConfigured',
      'firstCampaignLaunched',
    ]);
    // Every phase check is also in the flat list, so a caller that ignores
    // phases still sees the whole picture.
    expect(state.checks).toHaveLength(9);
    expect(state.checks.map((c) => c.key)).toEqual([
      ...state.phases[0].checks.map((c) => c.key),
      ...state.phases[1].checks.map((c) => c.key),
    ]);
  });

  it('reports a brand new account as not started, not as done', async () => {
    const tenant = await freshTenant();
    const state = await tenants.readiness(tenant.id);

    expect(state.ready).toBe(false);
    expect(state.outstanding).toBe(state.checks.length);
    // Every check must carry somewhere to go, or the card is a dead end.
    for (const check of state.checks) {
      expect(check.label.length).toBeGreaterThan(0);
      if (check.key !== 'agreementSigned') expect(check.href).toBeTruthy();
    }
  });

  it('flips each training check as the work is actually done', async () => {
    const tenant = await freshTenant();
    const before = await tenants.readiness(tenant.id);
    const training = (s: Awaited<ReturnType<typeof tenants.readiness>>) => s.phases[1];
    expect(checksOf(training(before), 'contentAdded').ok).toBe(false);
    expect(checksOf(training(before), 'scenarioAdded').ok).toBe(false);
    expect(checksOf(training(before), 'routingConfigured').ok).toBe(false);
    expect(checksOf(training(before), 'firstCampaignLaunched').ok).toBe(false);

    await runInTenant(tenant.id, async () => {
      const module = await db.trainingModule.create({
        data: { tenantId: tenant.id, title: 'Phishing basics', videoUrl: 'x', videoSource: 'link' },
      });
      const scenario = await db.scenario.create({
        data: {
          tenantId: tenant.id,
          title: 'Invoice',
          difficultyTier: 'low',
          subjectLine: 'Invoice attached',
          bodyHtml: '<p>hi</p>',
          senderSpoofName: 'Finance',
          redFlags: [],
          createdByClaude: false,
        },
      });
      await db.trainingRoutingRule.create({
        data: { tenantId: tenant.id, scenarioId: scenario.id, trainingModuleId: module.id },
      });
      // A draft has never been launched, so it must not count.
      await db.campaign.create({
        data: { tenantId: tenant.id, name: 'Draft', status: 'draft' },
      });
    });

    const midway = await tenants.readiness(tenant.id);
    expect(checksOf(training(midway), 'contentAdded').ok).toBe(true);
    expect(checksOf(training(midway), 'scenarioAdded').ok).toBe(true);
    expect(checksOf(training(midway), 'routingConfigured').ok).toBe(true);
    expect(checksOf(training(midway), 'firstCampaignLaunched').ok).toBe(false);

    await runInTenant(tenant.id, () =>
      db.campaign.create({ data: { tenantId: tenant.id, name: 'Live', status: 'completed' } }),
    );

    const after = await tenants.readiness(tenant.id);
    expect(checksOf(training(after), 'firstCampaignLaunched').ok).toBe(true);
  });

  it('only claims it is ready when every check in both phases passes', async () => {
    const tenant = await freshTenant();

    // Satisfy the enablement phase exactly.
    await runAsSystem('enable', () =>
      db.tenant.update({
        where: { id: tenant.id },
        data: { ndpaAgreementSignedAt: new Date(), allowlistConfirmedAt: new Date() },
      }),
    );
    await runInTenant(tenant.id, async () => {
      await db.verifiedDomain.create({
        data: { tenantId: tenant.id, domain: 'acme.test', token: 't', status: 'verified', verifiedAt: new Date() },
      });
      await db.sendingDomain.create({
        data: { tenantId: tenant.id, domain: 'acme-trk.test', status: 'verified' },
      });
      await db.employee.create({
        data: { tenantId: tenant.id, email: 'a@acme.test', name: 'A' },
      });
    });

    const enabled = await tenants.readiness(tenant.id);
    expect(enabled.phases[0].checks.every((c) => c.ok)).toBe(true);
    // Enabled is not the same as ready: the training phase still stands.
    expect(enabled.ready).toBe(false);
    expect(enabled.outstanding).toBe(4);

    await runInTenant(tenant.id, async () => {
      const module = await db.trainingModule.create({
        data: { tenantId: tenant.id, title: 'Basics', videoUrl: 'x', videoSource: 'link' },
      });
      const scenario = await db.scenario.create({
        data: {
          tenantId: tenant.id,
          title: 'Invoice',
          difficultyTier: 'low',
          subjectLine: 's',
          bodyHtml: '<p>x</p>',
          senderSpoofName: 'Finance',
          redFlags: [],
          createdByClaude: false,
        },
      });
      await db.trainingRoutingRule.create({
        data: { tenantId: tenant.id, scenarioId: scenario.id, trainingModuleId: module.id },
      });
      await db.campaign.create({ data: { tenantId: tenant.id, name: 'First', status: 'active' } });
    });

    const done = await tenants.readiness(tenant.id);
    expect(done.ready).toBe(true);
    expect(done.outstanding).toBe(0);
    // The dashboard card hides itself on this signal.
    expect(done.checks.every((c) => c.ok)).toBe(true);
  });
});
