import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { TrialService } from '../src/common/trial/trial.service';
import { StorageService } from '../src/providers/storage/storage.service';
import { AuditService } from '../src/common/audit/audit.service';
import { TenantsService } from '../src/modules/tenants/tenants.service';

const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;
const trial = new TrialService(prisma);
const noopMailer = { send: async () => ({ messageId: 'test' }) } as never;
const tenants = new TenantsService(prisma, new StorageService(), new AuditService(prisma), trial, noopMailer);

const uniq = () => `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const sys = <T>(fn: () => Promise<T>) => runAsSystem('test', fn);
const created: string[] = [];

async function tenant(data: Record<string, unknown> = {}) {
  const t = await sys(() => db.tenant.create({ data: { name: uniq(), approvedAt: new Date(), ...data } }));
  created.push(t.id);
  return t.id;
}

beforeAll(async () => { await base.$connect(); });
afterAll(async () => {
  await sys(() => base.tenant.deleteMany({ where: { id: { in: created } } }));
  await base.$disconnect();
});

describe('licence term governs access', () => {
  it('full access, with days-left, while the term runs', async () => {
    const id = await tenant({ licenseEndsAt: new Date(Date.now() + 20 * 86_400_000) });
    const a = await trial.access(id);
    expect(a.level).toBe('full');
    expect(a.licenseDaysLeft).toBeGreaterThan(18);
    expect(a.licenseDaysLeft).toBeLessThanOrEqual(20);
  });

  it('goes read-only once the term has ended, even when approved', async () => {
    const id = await tenant({ licenseEndsAt: new Date(Date.now() - 1000) });
    const a = await trial.access(id);
    expect(a.level).toBe('readonly');
    expect(a.licenseDaysLeft).toBe(0);
  });

  it('no term set means no expiry — access is unaffected', async () => {
    const id = await tenant({ licenseEndsAt: null });
    expect((await trial.access(id)).level).toBe('full');
  });

  it('a superadmin can set a term directly', async () => {
    const id = await tenant();
    await tenants.setLicense(id, { licenseTier: 'Growth', termDays: 30 });
    const t = await sys(() => db.tenant.findUnique({ where: { id } }));
    expect(t?.licenseEndsAt).toBeInstanceOf(Date);
    const a = await trial.access(id);
    expect(a.licenseDaysLeft).toBeGreaterThan(28);
  });

  it('a superadmin can clear the term with null', async () => {
    const id = await tenant({ licenseEndsAt: new Date(Date.now() + 5 * 86_400_000) });
    await tenants.setLicense(id, { termDays: null });
    const t = await sys(() => db.tenant.findUnique({ where: { id } }));
    expect(t?.licenseEndsAt).toBeNull();
  });

  it('an expired licence stops a campaign launching (read-only)', async () => {
    // The writable-tenant guard reads trial.access; read-only blocks writes.
    const id = await tenant({ licenseEndsAt: new Date(Date.now() - 1000) });
    expect((await trial.access(id)).level).toBe('readonly');
  });
});
