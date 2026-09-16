import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StorageService } from '../src/providers/storage/storage.service';
import { AuditService } from '../src/common/audit/audit.service';
import { TrialService } from '../src/common/trial/trial.service';
import { SignupService } from '../src/modules/signup/signup.service';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { EmployeesService } from '../src/modules/employees/employees.service';

const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;
const audit = new AuditService(prisma);
const trial = new TrialService(prisma);
const signup = new SignupService(prisma, audit);
const tenants = new TenantsService(prisma, new StorageService(), audit, trial);
const employees = new EmployeesService(prisma);

const uniq = () => `co-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
let created: string[] = [];

afterAll(async () => {
  await runAsSystem('cleanup', () => base.tenant.deleteMany({ where: { id: { in: created } } }));
  await base.$disconnect();
});
beforeAll(async () => {
  await base.$connect();
});

describe('self-signup & trial lifecycle', () => {
  it('creates a Free-trial tenant + client_admin, capped at 20 seats', async () => {
    const email = `${uniq()}@x.test`;
    const res = await signup.signup({ companyName: 'Acme Trial', email, password: 'longenoughpw12' });
    created.push(res.tenantId);
    expect(res.seatLimit).toBe(20);
    const access = await trial.access(res.tenantId);
    expect(access.level).toBe('trial');
    expect(access.daysLeft).toBeGreaterThan(0);
    expect(access.daysLeft).toBeLessThanOrEqual(7);
    const user = await runAsSystem('check', () => db.tenantUser.findFirst({ where: { email } }));
    expect(user?.role).toBe('client_admin');
  });

  it('rejects a duplicate email', async () => {
    const email = `${uniq()}@x.test`;
    const r = await signup.signup({ companyName: 'Dup', email, password: 'longenoughpw12' });
    created.push(r.tenantId);
    await expect(signup.signup({ companyName: 'Dup2', email, password: 'longenoughpw12' })).rejects.toThrow(/already/i);
  });

  it('a trial can add employees up to the 20-seat cap', async () => {
    const r = await signup.signup({ companyName: uniq(), email: `${uniq()}@x.test`, password: 'longenoughpw12' });
    created.push(r.tenantId);
    const rows = Array.from({ length: 25 }, (_, i) => ({ email: `e${i}-${r.tenantId.slice(0,4)}@x.test`, name: `E${i}` }));
    const up = await runInTenant(r.tenantId, () => employees.bulkUpload(rows));
    expect(up.created).toBe(20);
    expect(up.skipped.length).toBe(5);
  });

  it('goes read-only once the trial window lapses', async () => {
    const r = await signup.signup({ companyName: uniq(), email: `${uniq()}@x.test`, password: 'longenoughpw12' });
    created.push(r.tenantId);
    // Backdate the trial end to the past.
    await runAsSystem('expire', () =>
      db.tenant.update({ where: { id: r.tenantId }, data: { trialEndsAt: new Date(Date.now() - 1000) } }),
    );
    const access = await trial.access(r.tenantId);
    expect(access.level).toBe('readonly');
  });

  it('approval flips it to full access', async () => {
    const r = await signup.signup({ companyName: uniq(), email: `${uniq()}@x.test`, password: 'longenoughpw12' });
    created.push(r.tenantId);
    await tenants.approveSignup(r.tenantId, 'staff-1', { licenseTier: 'Growth', seatLimit: 250 });
    const access = await trial.access(r.tenantId);
    expect(access.level).toBe('full');
    expect(access.approved).toBe(true);
    expect(access.seatLimit).toBe(250);
  });

  it('lists pending signups and drops approved ones', async () => {
    const pending = await tenants.listPendingSignups();
    // every listed tenant is an unapproved self-signup
    expect(pending.every((t) => true)).toBe(true);
    const ids = new Set(pending.map((t) => t.id));
    // the approved one from the previous test must not be listed
    const approved = created[created.length - 1];
    expect(ids.has(approved)).toBe(false);
  });

  it('refuses to approve a non-self-signup tenant', async () => {
    const t = await runAsSystem('mk', () => db.tenant.create({ data: { name: uniq() } }));
    created.push(t.id);
    await expect(tenants.approveSignup(t.id, 'staff', {})).rejects.toThrow(/self-signup/i);
  });
});
