import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { GroupsService } from '../src/modules/groups/groups.service';

/**
 * "Create a group from campaign results."
 *
 * The membership arrives as a final, admin-reviewed set; creation must be atomic,
 * narrowed to the tenant, and carry its provenance so the group can say where it
 * came from.
 */
const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;
const groups = new GroupsService(prisma);

const tenantIds: string[] = [];

afterAll(async () => {
  await runAsSystem('teardown', () => db.tenant.deleteMany({ where: { id: { in: tenantIds } } }));
  await base.$disconnect();
});

async function freshTenant() {
  const t = await runAsSystem('setup', () =>
    db.tenant.create({ data: { name: `grp-${Date.now()}-${Math.random()}` } }),
  );
  tenantIds.push(t.id);
  return t;
}

describe('creating a group with members', () => {
  it('creates the group and its members atomically, dropping foreign ids', async () => {
    const t = await freshTenant();
    await runInTenant(t.id, () =>
      db.employee.createMany({
        data: [
          { tenantId: t.id, name: 'Ayo', email: 'ayo@example.test' },
          { tenantId: t.id, name: 'Bisi', email: 'bisi@example.test' },
        ],
      }),
    );
    const ids = await runInTenant(t.id, () =>
      db.employee.findMany({ where: { tenantId: t.id }, select: { id: true } }),
    );

    // A foreign id that is not in this tenant must be dropped, never linked.
    const otherTenant = await runAsSystem('other tenant', () =>
      db.tenant.create({ data: { name: `grp-other-${Date.now()}` } }),
    );
    tenantIds.push(otherTenant.id);
    const foreign = await runAsSystem('foreign employee', () =>
      db.employee.create({ data: { tenantId: otherTenant.id, name: 'Foreign', email: 'foreign@example.test' } }),
    );

    const result = await runInTenant(t.id, () =>
      groups.createWithMembers('Clicked people', [ids[0].id, ids[1].id, foreign.id], {
        campaignId: '00000000-0000-4000-8000-0000000000ff',
        criteria: 'clicked',
      }),
    );
    expect(result.memberCount).toBe(2);

    const row = await runInTenant(t.id, () =>
      db.employeeGroup.findUnique({ where: { id: result.id }, include: { members: true } }),
    );
    expect(row?.members.map((m) => m.employeeId).sort()).toEqual([ids[0].id, ids[1].id].sort());
    expect(row?.sourceCriteria).toBe('clicked');
    expect(row?.sourceCampaignId).toBe('00000000-0000-4000-8000-0000000000ff');
  });

  it('refuses a duplicate name', async () => {
    const t = await freshTenant();
    await runInTenant(t.id, () => groups.create('Unique'));
    await expect(runInTenant(t.id, () => groups.create('Unique'))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('exposes provenance and keeps the _count shape the campaign builder reads', async () => {
    const t = await freshTenant();
    await runInTenant(t.id, () =>
      groups.createWithMembers('From results', [], { criteria: 'submitted' }),
    );
    const list = await runInTenant(t.id, () => groups.list());
    const entry = list.find((g) => g.name === 'From results');
    expect(entry?.sourceCriteria).toBe('submitted');
    expect(entry?.sourceCampaignName).toBeNull(); // no campaign row exists in this test
    expect(entry?._count.members).toBe(0);
    expect(entry?.memberCount).toBe(0);
  });
});
