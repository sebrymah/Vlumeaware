import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StorageService } from '../src/providers/storage/storage.service';
import { AuditService } from '../src/common/audit/audit.service';
import { TrialService } from '../src/common/trial/trial.service';
import { EmployeesService } from '../src/modules/employees/employees.service';
import { DomainsService } from '../src/modules/domains/domains.service';
import { TenantsService } from '../src/modules/tenants/tenants.service';

const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;
const employees = new EmployeesService(prisma, new DomainsService(prisma));
const tenants = new TenantsService(prisma, new StorageService(), new AuditService(prisma), new TrialService(prisma));

let tenantId: string;

beforeAll(async () => {
  await base.$connect();
  const t = await runAsSystem('s', () => db.tenant.create({ data: { name: `lic-${Date.now()}` } }));
  tenantId = t.id;
  // Domain guard: employees can only be added on a verified domain.
  await runAsSystem('seed domain', () =>
    db.verifiedDomain.create({
      data: { tenantId, domain: 'x.test', token: 't', status: 'verified', verifiedAt: new Date() },
    }),
  );
});

afterAll(async () => {
  await runAsSystem('t', () => base.tenant.delete({ where: { id: tenantId } }));
  await base.$disconnect();
});

const rows = (n: number, tag: string) =>
  Array.from({ length: n }, (_, i) => ({ email: `${tag}${i}@x.test`, name: `E ${i}` }));

describe('license seat limit', () => {
  it('sets a tier and seat limit', async () => {
    const t = await tenants.setLicense(tenantId, { licenseTier: 'Starter', seatLimit: 3 });
    expect(t.licenseTier).toBe('Starter');
    expect(t.seatLimit).toBe(3);
  });

  it('allows adds up to the limit and skips the overage', async () => {
    const res = await runInTenant(tenantId, () => employees.bulkUpload(rows(5, 'a')));
    expect(res.created).toBe(3);
    expect(res.skipped).toHaveLength(2);
    expect(res.skipped[0].reason).toMatch(/seat limit/i);
  });

  it('reports usage correctly', async () => {
    const usage = await tenants.seatUsage(tenantId);
    expect(usage.used).toBe(3);
    expect(usage.seatLimit).toBe(3);
    expect(usage.remaining).toBe(0);
  });

  it('updates to existing employees do not consume seats', async () => {
    const res = await runInTenant(tenantId, () =>
      employees.bulkUpload([{ email: 'a0@x.test', name: 'Renamed' }]),
    );
    expect(res.updated).toBe(1);
    expect(res.created).toBe(0);
  });

  it('refuses a seat limit below current headcount', async () => {
    await expect(tenants.setLicense(tenantId, { seatLimit: 1 })).rejects.toThrow(/below/i);
  });

  it('raising the limit lets more employees in', async () => {
    await tenants.setLicense(tenantId, { seatLimit: 5 });
    const res = await runInTenant(tenantId, () => employees.bulkUpload(rows(3, 'b')));
    expect(res.created).toBe(2); // only 2 seats left
    expect(res.skipped).toHaveLength(1);
  });

  it('null seat limit means unlimited', async () => {
    await tenants.setLicense(tenantId, { seatLimit: null });
    const usage = await tenants.seatUsage(tenantId);
    expect(usage.seatLimit).toBeNull();
    expect(usage.remaining).toBeNull();
    const res = await runInTenant(tenantId, () => employees.bulkUpload(rows(10, 'c')));
    expect(res.created).toBe(10);
  });
});
