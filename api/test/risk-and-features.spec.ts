import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant, TenantScopeError } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RiskService } from '../src/modules/employees/risk.service';
import { CertificatesService } from '../src/modules/certificates/certificates.service';
import { LogMailer } from '../src/providers/mailer/log.mailer';
import { IntakeService } from '../src/modules/intake/intake.service';

const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;
const risk = new RiskService(prisma);
const certs = new CertificatesService(prisma, new LogMailer());
const intake = new IntakeService(prisma);

let tenantId: string;
let clickerId: string;
let reporterEmail: string;

async function send(tenantId: string, campaignId: string, employeeId: string, scenarioId: string, over: Record<string, unknown>) {
  return db.send.create({
    data: {
      tenantId, campaignId, employeeId, scenarioId,
      uniqueTrackingToken: `t-${Math.round(Math.random() * 1e9)}-${Date.now()}`,
      sentAt: new Date(), ...over,
    },
  });
}

beforeAll(async () => {
  await base.$connect();
  const tenant = await runAsSystem('setup', () => db.tenant.create({ data: { name: `rf-${Date.now()}` } }));
  tenantId = tenant.id;
  await runInTenant(tenantId, async () => {
    const clicker = await db.employee.create({ data: { tenantId, email: `clicker-${Date.now()}@x.test`, name: 'Repeat Clicker', department: 'Ops' } });
    const safe = await db.employee.create({ data: { tenantId, email: `safe-${Date.now()}@x.test`, name: 'Safe Reporter' } });
    clickerId = clicker.id;
    reporterEmail = clicker.email;
    const scenario = await db.scenario.create({ data: { tenantId, title: 's', difficultyTier: 'medium', subjectLine: 's', bodyHtml: '<a href="{{TRACKING_URL}}">x</a>', senderSpoofName: 'IT', redFlags: [], approvedAt: new Date() } });
    const campaign = await db.campaign.create({ data: { tenantId, name: 'c' } });
    // clicker clicked in two sends; safe reported one
    await send(tenantId, campaign.id, clicker.id, scenario.id, { clickedAt: new Date() });
    await send(tenantId, campaign.id, safe.id, scenario.id, { reportedAt: new Date() });
    // second campaign so clicker becomes a repeat clicker
    const c2 = await db.campaign.create({ data: { tenantId, name: 'c2' } });
    await send(tenantId, c2.id, clicker.id, scenario.id, { clickedAt: new Date() });
  });
});

afterAll(async () => {
  await runAsSystem('teardown', () => base.tenant.delete({ where: { id: tenantId } }));
  await base.$disconnect();
});

describe('per-employee risk scoring (F2)', () => {
  it('ranks a repeat clicker above a reporter', async () => {
    const scores = await runInTenant(tenantId, () => risk.scoreAll());
    const clicker = scores.find((s) => s.employeeId === clickerId)!;
    expect(clicker.riskScore).toBeGreaterThan(0);
    expect(clicker.repeatClicker).toBe(true);
    expect(scores[0].employeeId).toBe(clickerId); // highest risk first
  });

  it('flags repeat clickers', async () => {
    const clickers = await runInTenant(tenantId, () => risk.repeatClickers());
    expect(clickers.map((c) => c.employeeId)).toContain(clickerId);
  });

  it('is tenant-scoped', async () => {
    await expect(db.send.count()).rejects.toBeInstanceOf(TenantScopeError);
  });
});

describe('certificates (F5)', () => {
  it('issues, is idempotent, and verifies by serial', async () => {
    const a = await runInTenant(tenantId, () => certs.issueForPass({ employeeId: clickerId, moduleTitle: 'Mod', quizTitle: 'Q', scorePct: 90, sourceSendId: undefined }));
    const b = await runInTenant(tenantId, () => certs.issueForPass({ employeeId: clickerId, moduleTitle: 'Mod', quizTitle: 'Q', scorePct: 90, sourceSendId: undefined }));
    expect(a.id).toBe(b.id); // idempotent
    const v = await certs.verify(a.serial);
    expect(v).not.toBeNull();
    expect(v!.moduleTitle).toBe('Mod');
  });

  it('renders a valid PDF', async () => {
    const cert = (await runInTenant(tenantId, () => certs.list()))[0];
    const pdf = await runInTenant(tenantId, () => certs.renderPdf(cert.id));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(500);
  });
});

describe('report-a-phish intake (F8)', () => {
  it('ignores an unknown reporter', async () => {
    const res = await intake.ingest({ reporterEmail: 'nobody@nowhere.test', subject: 'x' });
    expect(res.recorded).toBe(false);
  });

  it('records a real phish from a known employee', async () => {
    const res = await intake.ingest({ reporterEmail, subject: 'Real phish', sender: 'evil@bad.test' });
    expect(res.recorded).toBe(true);
    expect(res.matchedSimulation).toBe(false);
    const list = await runInTenant(tenantId, () => intake.list(tenantId));
    expect(list.some((r) => r.subject === 'Real phish')).toBe(true);
  });

  it('phish reports are tenant-scoped', async () => {
    const other = await runAsSystem('o', () => db.tenant.create({ data: { name: `o-${Date.now()}` } }));
    const leaked = await runInTenant(other.id, () => db.phishReport.findMany());
    expect(leaked).toEqual([]);
    await runAsSystem('c', () => base.tenant.delete({ where: { id: other.id } }));
  });
});
