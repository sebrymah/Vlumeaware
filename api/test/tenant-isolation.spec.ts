import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import {
  runAsSystem,
  runInTenant,
  TenantScopeError,
} from '../src/common/prisma/tenant-context';

/**
 * Cross-tenant leakage suite. Required before any feature ships
 * (VLUMEAWARE_CONTEXT.md §11, §12). Every assertion here is the question
 * "can Tenant A ever see or touch Tenant B's row?" asked a different way.
 *
 * Needs the test database: `docker compose up -d postgres-test` then
 * `npm run test:isolation`.
 */
const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);

type Fixture = {
  tenantId: string;
  employeeId: string;
  scenarioId: string;
  campaignId: string;
  sendId: string;
  reportId: string;
  ruleId: string;
  assignmentId: string;
};

async function seedTenant(name: string): Promise<Fixture> {
  const tenant = await runAsSystem('test setup', () =>
    db.tenant.create({ data: { name, ndpaAgreementSignedAt: new Date() } }),
  );

  return runInTenant(tenant.id, async () => {
    const employee = await db.employee.create({
      data: {
        tenantId: tenant.id,
        email: `${name}@example.test`,
        name: `${name} Person`,
        department: 'Finance',
      },
    });
    const scenario = await db.scenario.create({
      data: {
        tenantId: tenant.id,
        title: `${name} invoice lure`,
        difficultyTier: 'medium',
        subjectLine: 'Outstanding invoice',
        bodyHtml: '<p>Hello <a href="{{TRACKING_URL}}">view invoice</a></p>',
        senderSpoofName: 'Accounts Payable',
        redFlags: ['look-alike domain'],
        approvedAt: new Date(),
      },
    });
    const campaign = await db.campaign.create({
      data: { tenantId: tenant.id, name: `${name} Q3 exercise` },
    });
    await db.campaignScenario.create({
      data: { campaignId: campaign.id, scenarioId: scenario.id, tenantId: tenant.id },
    });
    const send = await db.send.create({
      data: {
        tenantId: tenant.id,
        campaignId: campaign.id,
        employeeId: employee.id,
        scenarioId: scenario.id,
        uniqueTrackingToken: `${name}-token-${Date.now()}`,
        sentAt: new Date(),
      },
    });
    const module = await db.trainingModule.create({
      data: {
        tenantId: tenant.id,
        title: `${name} awareness module`,
        videoUrl: 'https://videos.example/intro.mp4',
        videoSource: 'link',
      },
    });
    const rule = await db.trainingRoutingRule.create({
      data: {
        tenantId: tenant.id,
        scenarioId: scenario.id,
        trainingModuleId: module.id,
      },
    });
    const assignment = await db.trainingAssignment.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.id,
        trainingModuleId: module.id,
        curriculumModuleId: `${name} awareness module`,
        sourceSendId: send.id,
      },
    });
    const report = await db.report.create({
      data: {
        tenantId: tenant.id,
        campaignId: campaign.id,
        generatedNarrative: `${name} narrative`,
        clickRate: 0.1,
        reportRate: 0.2,
        openRate: 0.5,
      },
    });

    return {
      tenantId: tenant.id,
      employeeId: employee.id,
      scenarioId: scenario.id,
      campaignId: campaign.id,
      sendId: send.id,
      reportId: report.id,
      ruleId: rule.id,
      assignmentId: assignment.id,
    };
  });
}

let A: Fixture;
let B: Fixture;

beforeAll(async () => {
  await base.$connect();
  A = await seedTenant(`alpha-${Date.now()}`);
  B = await seedTenant(`beta-${Date.now()}`);
});

afterAll(async () => {
  await runAsSystem('test teardown', async () => {
    await base.tenant.deleteMany({ where: { id: { in: [A.tenantId, B.tenantId] } } });
  });
  await base.$disconnect();
});

describe('unscoped access is refused outright', () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    ['employee.findMany', () => db.employee.findMany()],
    ['employee.findFirst', () => db.employee.findFirst()],
    ['scenario.findMany', () => db.scenario.findMany()],
    ['campaign.findMany', () => db.campaign.findMany()],
    ['campaignScenario.findMany', () => db.campaignScenario.findMany()],
    ['send.findMany', () => db.send.findMany()],
    ['send.count', () => db.send.count()],
    ['trainingModule.findMany', () => db.trainingModule.findMany()],
    ['trainingRoutingRule.findMany', () => db.trainingRoutingRule.findMany()],
    ['trainingAssignment.findMany', () => db.trainingAssignment.findMany()],
    ['report.findMany', () => db.report.findMany()],
    ['tenantUser.findMany', () => db.tenantUser.findMany()],
    ['employee.updateMany', () => db.employee.updateMany({ data: { name: 'x' } })],
    ['employee.deleteMany', () => db.employee.deleteMany()],
    ['employee.aggregate', () => db.employee.aggregate({ _count: true })],
    ['employee.groupBy', () => db.employee.groupBy({ by: ['department'] })],
  ];

  it.each(cases)('%s throws with no tenant in context', async (_label, run) => {
    await expect(run()).rejects.toBeInstanceOf(TenantScopeError);
  });
});

describe('querying as Tenant A never returns Tenant B records', () => {
  it('findMany is confined to A', async () => {
    const employees = await runInTenant(A.tenantId, () => db.employee.findMany());
    expect(employees).toHaveLength(1);
    expect(employees[0].id).toBe(A.employeeId);
    expect(employees.map((e) => e.tenantId)).toEqual([A.tenantId]);
  });

  it('findUnique on B\'s primary key returns null for A', async () => {
    const leaked = await runInTenant(A.tenantId, () =>
      db.employee.findUnique({ where: { id: B.employeeId } }),
    );
    expect(leaked).toBeNull();
  });

  it('findFirst with an explicit B filter returns null for A', async () => {
    const leaked = await runInTenant(A.tenantId, () =>
      db.send.findFirst({ where: { id: B.sendId } }),
    );
    expect(leaked).toBeNull();
  });

  it('a forged tenantId in the where clause cannot widen the query', async () => {
    const leaked = await runInTenant(A.tenantId, () =>
      db.employee.findMany({ where: { tenantId: B.tenantId } }),
    );
    expect(leaked).toEqual([]);
  });

  it('an OR clause cannot reach across tenants', async () => {
    const leaked = await runInTenant(A.tenantId, () =>
      db.employee.findMany({
        where: { OR: [{ tenantId: B.tenantId }, { tenantId: A.tenantId }] },
      }),
    );
    expect(leaked.map((e) => e.tenantId)).toEqual([A.tenantId]);
  });

  it('count and aggregate are confined to A', async () => {
    await runInTenant(A.tenantId, async () => {
      expect(await db.send.count()).toBe(1);
      const agg = await db.report.aggregate({ _avg: { clickRate: true }, _count: true });
      expect(agg._count).toBe(1);
    });
  });

  it('groupBy is confined to A', async () => {
    const groups = await runInTenant(A.tenantId, () =>
      db.employee.groupBy({ by: ['tenantId'], _count: true }),
    );
    expect(groups.map((g) => g.tenantId)).toEqual([A.tenantId]);
  });

  it('every tenant-scoped model is confined', async () => {
    await runInTenant(A.tenantId, async () => {
      expect((await db.scenario.findMany()).map((r) => r.tenantId)).toEqual([A.tenantId]);
      expect((await db.campaign.findMany()).map((r) => r.tenantId)).toEqual([A.tenantId]);
      expect((await db.campaignScenario.findMany()).map((r) => r.tenantId)).toEqual([A.tenantId]);
      expect((await db.send.findMany()).map((r) => r.tenantId)).toEqual([A.tenantId]);
      expect((await db.trainingModule.findMany()).map((r) => r.tenantId)).toEqual([A.tenantId]);
      expect((await db.trainingRoutingRule.findMany()).map((r) => r.tenantId)).toEqual([A.tenantId]);
      expect((await db.trainingAssignment.findMany()).map((r) => r.tenantId)).toEqual([A.tenantId]);
      expect((await db.report.findMany()).map((r) => r.tenantId)).toEqual([A.tenantId]);
    });
  });

  it('nested relation reads do not leak', async () => {
    const campaigns = await runInTenant(A.tenantId, () =>
      db.campaign.findMany({ include: { sends: true, campaignScenarios: true, reports: true } }),
    );
    expect(campaigns).toHaveLength(1);
    for (const send of campaigns[0].sends) expect(send.tenantId).toBe(A.tenantId);
    for (const report of campaigns[0].reports) expect(report.tenantId).toBe(A.tenantId);
  });

  it('a tracking token belonging to B is invisible to A', async () => {
    const leaked = await runInTenant(A.tenantId, () =>
      db.send.findUnique({ where: { uniqueTrackingToken: `beta` } }),
    );
    expect(leaked).toBeNull();
  });
});

describe('writes cannot cross the tenant boundary', () => {
  it('update against B\'s id affects nothing and leaves B intact', async () => {
    await expect(
      runInTenant(A.tenantId, () =>
        db.employee.update({ where: { id: B.employeeId }, data: { name: 'hijacked' } }),
      ),
    ).rejects.toThrow();

    const survivor = await runInTenant(B.tenantId, () =>
      db.employee.findUnique({ where: { id: B.employeeId } }),
    );
    expect(survivor?.name).not.toBe('hijacked');
  });

  it('updateMany cannot touch B rows', async () => {
    const res = await runInTenant(A.tenantId, () =>
      db.employee.updateMany({ where: { id: B.employeeId }, data: { name: 'hijacked' } }),
    );
    expect(res.count).toBe(0);
  });

  it('deleteMany cannot remove B rows', async () => {
    const res = await runInTenant(A.tenantId, () =>
      db.send.deleteMany({ where: { id: B.sendId } }),
    );
    expect(res.count).toBe(0);

    const survivor = await runInTenant(B.tenantId, () =>
      db.send.findUnique({ where: { id: B.sendId } }),
    );
    expect(survivor).not.toBeNull();
  });

  it('create ignores an attacker-supplied tenantId', async () => {
    const created = await runInTenant(A.tenantId, () =>
      db.employee.create({
        data: {
          email: `forged-${Date.now()}@example.test`,
          name: 'Forged',
          // Deliberately wrong: the guard must overwrite this with A.
          tenantId: B.tenantId,
        },
      }),
    );
    expect(created.tenantId).toBe(A.tenantId);
    await runInTenant(A.tenantId, () => db.employee.delete({ where: { id: created.id } }));
  });

  it('createMany stamps the acting tenant on every row', async () => {
    const stamp = Date.now();
    await runInTenant(A.tenantId, () =>
      db.employee.createMany({
        data: [
          // First row forges B's id, second omits it entirely. Both must land on A.
          { email: `bulk1-${stamp}@example.test`, name: 'Bulk One', tenantId: B.tenantId },
          { email: `bulk2-${stamp}@example.test`, name: 'Bulk Two' } as never,
        ],
      }),
    );
    const rows = await runInTenant(A.tenantId, () =>
      db.employee.findMany({ where: { email: { contains: String(stamp) } } }),
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.tenantId === A.tenantId)).toBe(true);
    await runInTenant(A.tenantId, () =>
      db.employee.deleteMany({ where: { email: { contains: String(stamp) } } }),
    );
  });

  it('update cannot reassign a row to another tenant', async () => {
    await expect(
      runInTenant(A.tenantId, () =>
        db.employee.update({
          where: { id: A.employeeId },
          data: { tenantId: B.tenantId } as never,
        }),
      ),
    ).rejects.toBeInstanceOf(TenantScopeError);

    const unmoved = await runInTenant(A.tenantId, () =>
      db.employee.findUnique({ where: { id: A.employeeId } }),
    );
    expect(unmoved?.tenantId).toBe(A.tenantId);
  });
});

describe('system scope is an explicit, narrow escape hatch', () => {
  it('sees both tenants when deliberately invoked', async () => {
    const ids = await runAsSystem('test: cross-tenant overview', () =>
      db.employee.findMany({ where: { tenantId: { in: [A.tenantId, B.tenantId] } } }),
    );
    expect(new Set(ids.map((e) => e.tenantId))).toEqual(new Set([A.tenantId, B.tenantId]));
  });

  it('does not leak out of its callback', async () => {
    await runAsSystem('test: scoped bypass', async () => {
      expect(await db.employee.count({ where: { tenantId: A.tenantId } })).toBe(1);
    });
    await expect(db.employee.findMany()).rejects.toBeInstanceOf(TenantScopeError);
  });

  it('a nested tenant scope re-narrows inside system scope', async () => {
    await runAsSystem('test: nested', async () => {
      const scoped = await runInTenant(A.tenantId, () => db.employee.findMany());
      expect(scoped.map((e) => e.tenantId)).toEqual([A.tenantId]);
    });
  });
});
