import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StorageService } from '../src/providers/storage/storage.service';
import { SharedModulesService } from '../src/modules/shared-modules/shared-modules.service';
import { TrainingModulesService } from '../src/modules/training-modules/training-modules.service';

const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;
const shared = new SharedModulesService(prisma, new StorageService());
const modules = new TrainingModulesService(prisma, new StorageService());

let sharedId: string;
let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  await base.$connect();
  const s = await shared.createFromLink({ title: `Shared-${Date.now()}`, videoUrl: 'https://v/x.mp4', category: 'Phishing' });
  sharedId = s.id;
  const a = await runAsSystem('s', () => db.tenant.create({ data: { name: `sa-${Date.now()}` } }));
  const b = await runAsSystem('s', () => db.tenant.create({ data: { name: `sb-${Date.now()}` } }));
  tenantA = a.id; tenantB = b.id;
});

afterAll(async () => {
  await runAsSystem('t', () => base.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } }));
  await runAsSystem('t', () => base.sharedTrainingModule.delete({ where: { id: sharedId } }));
  await base.$disconnect();
});

describe('shared awareness library (global)', () => {
  it('is visible to any tenant context', async () => {
    const fromA = await runInTenant(tenantA, () => shared.list());
    const fromB = await runInTenant(tenantB, () => shared.list());
    expect(fromA.some((m) => m.id === sharedId)).toBe(true);
    expect(fromB.some((m) => m.id === sharedId)).toBe(true);
  });

  it('clones into a tenant, referencing the same video, recording origin', async () => {
    const cloned = await runInTenant(tenantA, () => modules.cloneFromShared(sharedId));
    expect(cloned.tenantId).toBe(tenantA);
    expect(cloned.sharedModuleId).toBe(sharedId);
    const original = await runAsSystem('read', () => db.sharedTrainingModule.findUnique({ where: { id: sharedId } }));
    expect(cloned.videoUrl).toBe(original!.videoUrl); // no binary duplication
  });

  it('a clone lands only in the cloning tenant', async () => {
    await runInTenant(tenantB, () => modules.cloneFromShared(sharedId));
    const aModules = await runInTenant(tenantA, () => modules.list());
    const bModules = await runInTenant(tenantB, () => modules.list());
    expect(aModules.every((m) => m.tenantId === tenantA)).toBe(true);
    expect(bModules.every((m) => m.tenantId === tenantB)).toBe(true);
    // A cannot see B's cloned module.
    const aIds = new Set(aModules.map((m) => m.id));
    expect(bModules.every((m) => !aIds.has(m.id))).toBe(true);
  });
});
