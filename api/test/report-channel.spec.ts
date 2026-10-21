import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ReportChannelService } from '../src/modules/report-channel/report-channel.service';
import { IntakeService } from '../src/modules/intake/intake.service';

/**
 * Phishing-reporting channel: the per-tenant forwarding token resolves the
 * tenant for the inbound webhook, and ingest scoped to that tenant records the
 * report. Proves the token is the trust anchor and that resolution is
 * tenant-correct.
 */
const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prismaService = { db } as unknown as PrismaService;
const channels = new ReportChannelService(prismaService);
const intake = new IntakeService(prismaService);

let tenantId: string;
let reporterEmail: string;
let token: string;

beforeAll(async () => {
  await base.$connect();
  const tenant = await runAsSystem('test setup', () =>
    db.tenant.create({ data: { name: `rc-${Date.now()}`, ndpaAgreementSignedAt: new Date() } }),
  );
  tenantId = tenant.id;
  reporterEmail = `reporter-${Date.now()}@x.test`;
  await runInTenant(tenantId, () =>
    db.employee.create({ data: { tenantId, email: reporterEmail, name: 'Reporter' } }),
  );
  const channel = await runInTenant(tenantId, () => channels.getForTenant());
  // report+<token>@domain
  token = channel.forwardingAddress.split('+')[1].split('@')[0];
});

afterAll(async () => {
  await runAsSystem('teardown', () => base.tenant.delete({ where: { id: tenantId } }));
  await base.$disconnect();
});

describe('phishing-reporting channel', () => {
  it('builds a per-tenant forwarding address and resolves its token to the tenant', async () => {
    expect(token).toHaveLength(18);
    const resolved = await channels.resolveTenantByToken(token);
    expect(resolved?.tenantId).toBe(tenantId);
  });

  it('returns null for an unknown token (no tenant leak)', async () => {
    expect(await channels.resolveTenantByToken('deadbeefdeadbeef00')).toBeNull();
  });

  it('records a report when ingest is scoped to the resolved tenant', async () => {
    const res = await intake.ingest(
      { reporterEmail, subject: 'Suspicious invoice', rawBody: 'please verify' },
      { tenantId },
    );
    expect(res.recorded).toBe(true);
    expect(res.matchedSimulation).toBe(false);
    const reports = await runInTenant(tenantId, () => intake.list(tenantId));
    expect(reports.some((r) => r.reporterEmail === reporterEmail)).toBe(true);
  });

  it('does not record when the reporter is not in the scoped tenant', async () => {
    const other = await runAsSystem('other tenant', () =>
      db.tenant.create({ data: { name: `rc-other-${Date.now()}` } }),
    );
    const res = await intake.ingest({ reporterEmail, rawBody: 'x' }, { tenantId: other.id });
    expect(res.recorded).toBe(false);
    await runAsSystem('cleanup', () => base.tenant.delete({ where: { id: other.id } }));
  });
});

describe('simulation credit is gated against a spoofed reporter', () => {
  // A send to the reporter, with a known tracking token in its forwarded body.
  async function seedSend(recipientEmail: string): Promise<{ sendId: string; body: string }> {
    return runInTenant(tenantId, async () => {
      const recipient = await db.employee.upsert({
        where: { tenantId_email: { tenantId, email: recipientEmail } },
        update: {},
        create: { tenantId, email: recipientEmail, name: 'Recipient' },
      });
      const scenario = await db.scenario.create({
        data: {
          tenantId,
          title: 'Lure',
          difficultyTier: 'medium',
          subjectLine: 's',
          bodyHtml: 'b',
          senderSpoofName: 'IT',
          redFlags: ['x'],
          approvedAt: new Date(),
        },
      });
      const campaign = await db.campaign.create({ data: { tenantId, name: `c-${Date.now()}` } });
      const tok = `tok${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
      const send = await db.send.create({
        data: {
          tenantId,
          campaignId: campaign.id,
          employeeId: recipient.id,
          scenarioId: scenario.id,
          uniqueTrackingToken: tok,
          sentAt: new Date(),
        },
      });
      return { sendId: send.id, body: `forwarded /track/click/${tok} end` };
    });
  }

  async function reportedAt(sendId: string) {
    const s = await runInTenant(tenantId, () => db.send.findUnique({ where: { id: sendId } }));
    return s!.reportedAt;
  }

  it('credits when the reporter IS the recipient and the sender is authenticated', async () => {
    const { sendId, body } = await seedSend(reporterEmail);
    const res = await intake.ingest(
      { reporterEmail, rawBody: body },
      { tenantId, senderAuthenticated: true },
    );
    expect(res.matchedSimulation).toBe(true);
    expect(await reportedAt(sendId)).not.toBeNull();
  });

  it('does NOT credit when the reporter is not the send recipient (spoof of a colleague)', async () => {
    const victim = `victim-${Date.now()}@x.test`;
    const { sendId, body } = await seedSend(victim);
    // reporterEmail (a different employee) forwards the victim's simulation.
    const res = await intake.ingest(
      { reporterEmail, rawBody: body },
      { tenantId, senderAuthenticated: true },
    );
    expect(res.matchedSimulation).toBe(true);
    expect(await reportedAt(sendId)).toBeNull();
  });

  it('does NOT credit when the sender failed authentication', async () => {
    const email = `unauth-${Date.now()}@x.test`;
    const { sendId, body } = await seedSend(email);
    const res = await intake.ingest(
      { reporterEmail: email, rawBody: body },
      { tenantId, senderAuthenticated: false },
    );
    expect(res.matchedSimulation).toBe(true);
    expect(await reportedAt(sendId)).toBeNull();
  });
});
