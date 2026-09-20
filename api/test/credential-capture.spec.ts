import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { TrackingService } from '../src/modules/tracking/tracking.service';
import { TrainingService } from '../src/modules/training/training.service';
import { TrainingModulesService } from '../src/modules/training-modules/training-modules.service';
import { CertificatesService } from '../src/modules/certificates/certificates.service';
import { LogMailer } from '../src/providers/mailer/log.mailer';
import { StorageService } from '../src/providers/storage/storage.service';

/**
 * Metadata-only credential capture (§13, legal-cleared). Proves the stored row
 * carries non-reversible signal only, and that the service never has a path to
 * persist a typed value even if one were somehow passed.
 */
const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);

// Minimal PrismaService shim exposing the guarded client.
const prismaService = { db } as unknown as PrismaService;
const modulesService = new TrainingModulesService(prismaService, new StorageService());
const tracking = new TrackingService(
  prismaService,
  new TrainingService(prismaService),
  modulesService,
  new CertificatesService(prismaService, new LogMailer()),
);

let tenantId: string;
let token: string;
let sendId: string;

beforeAll(async () => {
  await base.$connect();
  const tenant = await runAsSystem('test setup', () =>
    db.tenant.create({ data: { name: `cap-${Date.now()}`, ndpaAgreementSignedAt: new Date() } }),
  );
  tenantId = tenant.id;
  await runInTenant(tenantId, async () => {
    const employee = await db.employee.create({
      data: { tenantId, email: `cap-${Date.now()}@x.test`, name: 'Cap Tester' },
    });
    const scenario = await db.scenario.create({
      data: {
        tenantId,
        title: 'Login lure',
        difficultyTier: 'medium',
        subjectLine: 'Verify your account',
        bodyHtml: '<a href="{{TRACKING_URL}}">verify</a>',
        senderSpoofName: 'IT Helpdesk',
        redFlags: ['look-alike domain'],
        approvedAt: new Date(),
      },
    });
    const campaign = await db.campaign.create({ data: { tenantId, name: 'Cap campaign' } });
    token = `cap-token-${Date.now()}`;
    const send = await db.send.create({
      data: {
        tenantId,
        campaignId: campaign.id,
        employeeId: employee.id,
        scenarioId: scenario.id,
        uniqueTrackingToken: token,
        sentAt: new Date(),
        clickedAt: new Date(Date.now() - 4000),
      },
    });
    sendId = send.id;
  });
});

afterAll(async () => {
  await runAsSystem('teardown', () => base.tenant.delete({ where: { id: tenantId } }));
  await base.$disconnect();
});

describe('metadata-only credential capture', () => {
  it('stores non-reversible metadata and flags the send', async () => {
    await tracking.recordCredentialSubmission(token, {
      usernameLength: 22,
      passwordLength: 11,
      usernameLooksLikeEmail: true,
    });

    const row = await runInTenant(tenantId, () =>
      db.credentialSubmission.findFirst({ where: { sendId } }),
    );
    expect(row).not.toBeNull();
    expect(row!.usernameLength).toBe(22);
    expect(row!.passwordLength).toBe(11);
    expect(row!.usernameLooksLikeEmail).toBe(true);
    // Server-computed from the click ~4s earlier.
    expect(row!.timeToSubmitMs).toBeGreaterThanOrEqual(3000);
    expect(row!.timeToSubmitMs).toBeLessThan(30000);

    const send = await runInTenant(tenantId, () =>
      db.send.findUnique({ where: { id: sendId } }),
    );
    expect(send!.credentialsSubmitted).toBe(true);
  });

  it('has no column capable of holding a typed secret', async () => {
    const row = await runInTenant(tenantId, () =>
      db.credentialSubmission.findFirst({ where: { sendId } }),
    );
    const keys = Object.keys(row!);
    expect(keys).not.toContain('password');
    expect(keys).not.toContain('username');
    expect(keys).not.toContain('value');
    // The full set is known and non-reversible.
    expect(keys.sort()).toEqual(
      [
        'id',
        'passwordLength',
        'sendId',
        'submittedAt',
        'tenantId',
        'timeToSubmitMs',
        'usernameLength',
        'usernameLooksLikeEmail',
      ].sort(),
    );
  });

  it('is tenant-scoped like every other simulation record', async () => {
    const other = await runAsSystem('other tenant', () =>
      db.tenant.create({ data: { name: `other-${Date.now()}` } }),
    );
    const leaked = await runInTenant(other.id, () => db.credentialSubmission.findMany());
    expect(leaked).toEqual([]);
    await runAsSystem('cleanup', () => base.tenant.delete({ where: { id: other.id } }));
  });
});
