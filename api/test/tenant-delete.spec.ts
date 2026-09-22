import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StorageService } from '../src/providers/storage/storage.service';
import { AuditService } from '../src/common/audit/audit.service';
import { TrialService } from '../src/common/trial/trial.service';
import { TenantsService } from '../src/modules/tenants/tenants.service';

const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;
const storage = new StorageService();
const tenants = new TenantsService(prisma, storage, new AuditService(prisma), new TrialService(prisma));

const uniq = () => `del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const sys = <T>(fn: () => Promise<T>) => runAsSystem('test', fn);

/**
 * Builds a tenant carrying a row in every table that a delete has to clear,
 * including the two RESTRICT edges (campaign_scenarios -> scenarios and
 * training_routing_rules -> training_modules) that a plain cascade trips over.
 */
async function seedFullTenant(name: string) {
  const tenant = await sys(() => db.tenant.create({ data: { name, status: 'offboarded' } }));
  const t = tenant.id;
  const employee = await sys(() =>
    db.employee.create({ data: { tenantId: t, email: `${uniq()}@x.test`, name: 'E' } }),
  );
  const scenario = await sys(() =>
    db.scenario.create({
      data: {
        tenantId: t,
        title: 'S',
        difficultyTier: 'medium',
        subjectLine: 's',
        bodyHtml: '<a href="{{TRACKING_URL}}">x</a>',
        senderSpoofName: 'IT',
        redFlags: [],
      },
    }),
  );
  const module = await sys(() =>
    db.trainingModule.create({
      data: { tenantId: t, title: 'M', videoUrl: 'https://example.test/v.mp4', videoSource: 'link' },
    }),
  );
  const campaign = await sys(() => db.campaign.create({ data: { tenantId: t, name: 'C' } }));
  await sys(() =>
    db.campaignScenario.create({ data: { tenantId: t, campaignId: campaign.id, scenarioId: scenario.id } }),
  );
  await sys(() =>
    db.trainingRoutingRule.create({
      data: { tenantId: t, scenarioId: scenario.id, trainingModuleId: module.id },
    }),
  );
  const send = await sys(() =>
    db.send.create({
      data: {
        tenantId: t,
        campaignId: campaign.id,
        employeeId: employee.id,
        scenarioId: scenario.id,
        uniqueTrackingToken: uniq(),
      },
    }),
  );
  await sys(() => db.credentialSubmission.create({ data: { tenantId: t, sendId: send.id } }));
  await sys(() =>
    db.trainingAssignment.create({
      data: { tenantId: t, employeeId: employee.id, trainingModuleId: module.id, curriculumModuleId: 'M' },
    }),
  );
  await sys(() => db.verifiedDomain.create({ data: { tenantId: t, domain: `${uniq()}.test`, token: 'x' } }));
  await sys(() =>
    db.tenantUser.create({
      data: { tenantId: t, email: `${uniq()}@x.test`, passwordHash: 'x', role: 'client_admin' },
    }),
  );
  return { tenantId: t, scenarioId: scenario.id, moduleId: module.id };
}

beforeAll(async () => {
  await base.$connect();
});
afterAll(async () => {
  await base.$disconnect();
});

describe('deleting a tenant', () => {
  it('removes the client and every row belonging to them', async () => {
    const name = uniq();
    const { tenantId } = await seedFullTenant(name);

    const res = await tenants.remove(tenantId, name);

    expect(res.deleted).toBe(true);
    expect(res.rows).toBeGreaterThan(0);
    expect(await sys(() => db.tenant.findUnique({ where: { id: tenantId } }))).toBeNull();
    for (const count of await Promise.all([
      sys(() => db.employee.count({ where: { tenantId } })),
      sys(() => db.scenario.count({ where: { tenantId } })),
      sys(() => db.campaign.count({ where: { tenantId } })),
      sys(() => db.send.count({ where: { tenantId } })),
      sys(() => db.trainingModule.count({ where: { tenantId } })),
      sys(() => db.trainingRoutingRule.count({ where: { tenantId } })),
      sys(() => db.campaignScenario.count({ where: { tenantId } })),
      sys(() => db.credentialSubmission.count({ where: { tenantId } })),
      sys(() => db.trainingAssignment.count({ where: { tenantId } })),
      sys(() => db.verifiedDomain.count({ where: { tenantId } })),
      sys(() => db.tenantUser.count({ where: { tenantId } })),
    ])) {
      expect(count).toBe(0);
    }
  });

  it('keeps the audit trail, which has no foreign key to the tenant', async () => {
    const name = uniq();
    const { tenantId } = await seedFullTenant(name);
    await tenants.remove(tenantId, name);

    const trail = await sys(() => db.auditLog.findMany({ where: { tenantId, action: 'tenant.delete' } }));
    expect(trail).toHaveLength(1);
    expect(trail[0].detail).toContain(name);
  });

  it('refuses to delete an active client', async () => {
    const name = uniq();
    const t = await sys(() => db.tenant.create({ data: { name, status: 'active' } }));
    await expect(tenants.remove(t.id, name)).rejects.toThrow(/active client cannot be deleted/i);
    // Still there.
    expect(await sys(() => db.tenant.findUnique({ where: { id: t.id } }))).not.toBeNull();
    await sys(() => base.tenant.delete({ where: { id: t.id } }));
  });

  it('refuses when the typed confirmation does not match the name', async () => {
    const name = uniq();
    const t = await sys(() => db.tenant.create({ data: { name, status: 'suspended' } }));
    await expect(tenants.remove(t.id, 'not the name')).rejects.toThrow(/does not match/i);
    expect(await sys(() => db.tenant.findUnique({ where: { id: t.id } }))).not.toBeNull();
    await sys(() => base.tenant.delete({ where: { id: t.id } }));
  });

  it('allows deleting a suspended client, and frees the name for re-onboarding', async () => {
    const name = uniq();
    const t = await sys(() => db.tenant.create({ data: { name, status: 'suspended' } }));
    await tenants.remove(t.id, name);

    // The point of the feature: onboard the same company again afterwards.
    const again = await sys(() => db.tenant.create({ data: { name } }));
    expect(again.id).not.toBe(t.id);
    await sys(() => base.tenant.delete({ where: { id: again.id } }));
  });
});
