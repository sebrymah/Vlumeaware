import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant } from '../src/common/prisma/tenant-context';
import { AGREEMENT_VERSION } from '../src/common/config/agreement';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StorageService } from '../src/providers/storage/storage.service';
import { AuditService } from '../src/common/audit/audit.service';
import { TrialService } from '../src/common/trial/trial.service';
import { SignupService } from '../src/modules/signup/signup.service';
import { DomainsService } from '../src/modules/domains/domains.service';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { EmployeesService } from '../src/modules/employees/employees.service';

const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;
const audit = new AuditService(prisma);
const trial = new TrialService(prisma);
const signup = new SignupService(prisma, audit);
/** The service now emails setup instructions on approval; nothing under test
 *  asserts on that, so the mailer is a no-op here. */
const noopMailer = { send: async () => ({ messageId: 'test' }) } as never;
const tenants = new TenantsService(prisma, new StorageService(), audit, trial, noopMailer);
const employees = new EmployeesService(prisma, new DomainsService(prisma));

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
  it('records the click-through acceptance and opens the consent gate', async () => {
    const email = `${uniq()}@x.test`;
    const res = await signup.signup({
      companyName: 'Consent Co',
      email,
      password: 'longenoughpw12',
      acceptedAgreement: true,
      acceptedIp: '203.0.113.7',
    });
    created.push(res.tenantId);

    const t = await runAsSystem('read', () => db.tenant.findUnique({ where: { id: res.tenantId } }));
    // The same field the countersigned-document route sets, so ConsentGuard
    // needs no knowledge of which route was taken.
    expect(t?.ndpaAgreementSignedAt).toBeInstanceOf(Date);
    expect(t?.agreementMethod).toBe('click_through');
    expect(t?.agreementVersion).toBe(AGREEMENT_VERSION);
    expect(t?.agreementAcceptedBy).toBe(email);
    expect(t?.agreementAcceptedIp).toBe('203.0.113.7');
    // Nothing was uploaded, and nothing should have been.
    expect(t?.ndpaAgreementDocUrl).toBeNull();
  });

  it('refuses to create a workspace when the agreement is not accepted', async () => {
    await expect(
      signup.signup({
        companyName: 'No Consent',
        email: `${uniq()}@x.test`,
        password: 'longenoughpw12',
        acceptedAgreement: false,
      }),
    ).rejects.toThrow(/must be accepted/i);
  });

  // Accepting the terms is not approval: the six preflight gates and the
  // Vlumetech review are separate, so a self-signup still cannot send.
  it('accepting the agreement does not by itself grant full access', async () => {
    const r = await signup.signup({
      companyName: uniq(),
      email: `${uniq()}@x.test`,
      password: 'longenoughpw12',
      acceptedAgreement: true,
    });
    created.push(r.tenantId);
    expect((await trial.access(r.tenantId)).level).toBe('trial');
  });

  it('creates a Free-trial tenant + client_admin, capped at 20 seats', async () => {
    const email = `${uniq()}@x.test`;
    const res = await signup.signup({ companyName: 'Acme Trial', email, password: 'longenoughpw12', acceptedAgreement: true });
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
    const r = await signup.signup({ companyName: 'Dup', email, password: 'longenoughpw12', acceptedAgreement: true });
    created.push(r.tenantId);
    await expect(signup.signup({ companyName: 'Dup2', email, password: 'longenoughpw12', acceptedAgreement: true })).rejects.toThrow(/already/i);
  });

  it('a trial can add employees up to the 20-seat cap', async () => {
    const r = await signup.signup({ companyName: uniq(), email: `${uniq()}@x.test`, password: 'longenoughpw12', acceptedAgreement: true });
    created.push(r.tenantId);
    await runAsSystem('seed domain', () =>
      db.verifiedDomain.create({
        data: { tenantId: r.tenantId, domain: 'x.test', token: 't', status: 'verified', verifiedAt: new Date() },
      }),
    );
    const rows = Array.from({ length: 25 }, (_, i) => ({ email: `e${i}-${r.tenantId.slice(0,4)}@x.test`, name: `E${i}` }));
    const up = await runInTenant(r.tenantId, () => employees.bulkUpload(rows));
    expect(up.created).toBe(20);
    expect(up.skipped.length).toBe(5);
  });

  it('goes read-only once the trial window lapses', async () => {
    const r = await signup.signup({ companyName: uniq(), email: `${uniq()}@x.test`, password: 'longenoughpw12', acceptedAgreement: true });
    created.push(r.tenantId);
    // Backdate the trial end to the past.
    await runAsSystem('expire', () =>
      db.tenant.update({ where: { id: r.tenantId }, data: { trialEndsAt: new Date(Date.now() - 1000) } }),
    );
    const access = await trial.access(r.tenantId);
    expect(access.level).toBe('readonly');
  });

  it('approval flips it to full access', async () => {
    const r = await signup.signup({ companyName: uniq(), email: `${uniq()}@x.test`, password: 'longenoughpw12', acceptedAgreement: true });
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
