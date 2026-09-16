import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant, TenantScopeError } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StorageService } from '../src/providers/storage/storage.service';
import { TrainingModulesService } from '../src/modules/training-modules/training-modules.service';
import { TemplatesService } from '../src/modules/templates/templates.service';

/**
 * The three parity features: your own awareness content, a pickable template
 * catalogue, and cloning a template into an editable tenant scenario.
 */
const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;
const modules = new TrainingModulesService(prisma, new StorageService());
const templates = new TemplatesService(prisma);

let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  await base.$connect();
  const a = await runAsSystem('setup', () => db.tenant.create({ data: { name: `A-${Date.now()}` } }));
  const b = await runAsSystem('setup', () => db.tenant.create({ data: { name: `B-${Date.now()}` } }));
  tenantA = a.id;
  tenantB = b.id;

  // The test database is migrated but not seeded, so create a small catalogue.
  await runAsSystem('seed templates', () =>
    db.phishingTemplate.createMany({
      data: [
        {
          title: `T-harvest-${Date.now()}`,
          category: 'Credential harvesting',
          difficultyTier: 'medium',
          subjectLine: 'Verify your account',
          bodyHtml: '<a href="{{TRACKING_URL}}">verify</a>',
          senderSpoofName: 'Support',
          redFlags: ['generic sender'],
          source: 'test',
        },
        {
          title: `T-invoice-${Date.now()}`,
          category: 'Invoice & mandate fraud',
          difficultyTier: 'high',
          subjectLine: 'Updated bank details',
          bodyHtml: '<a href="{{TRACKING_URL}}">confirm</a>',
          senderSpoofName: 'Accounts',
          redFlags: ['bank change by email'],
          source: 'test',
        },
      ],
    }),
  );
});

afterAll(async () => {
  await runAsSystem('teardown', async () => {
    await base.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await base.phishingTemplate.deleteMany({ where: { source: 'test' } });
  });
  await base.$disconnect();
});

describe('awareness content (training modules)', () => {
  it('registers a linked video module in the acting tenant', async () => {
    const m = await runInTenant(tenantA, () =>
      modules.createFromLink({
        title: 'Phishing 101',
        videoUrl: 'https://videos.example/phishing-101.mp4',
        durationSeconds: 180,
      }),
    );
    expect(m.tenantId).toBe(tenantA);
    expect(m.videoSource).toBe('link');
  });

  it('rejects a non-http video link', async () => {
    await expect(
      runInTenant(tenantA, () =>
        modules.createFromLink({ title: 'Bad', videoUrl: 'javascript:alert(1)' }),
      ),
    ).rejects.toThrow(/http/);
  });

  it("one tenant's modules are invisible to another", async () => {
    const seenByB = await runInTenant(tenantB, () => modules.list());
    expect(seenByB).toEqual([]);
    const seenByA = await runInTenant(tenantA, () => modules.list());
    expect(seenByA.length).toBeGreaterThan(0);
    expect(seenByA.every((m) => m.tenantId === tenantA)).toBe(true);
  });

  it('modules are unreachable with no tenant in context', async () => {
    await expect(db.trainingModule.findMany()).rejects.toBeInstanceOf(TenantScopeError);
  });
});

describe('phishing template catalogue', () => {
  it('is global and readable by any tenant context', async () => {
    const list = await runInTenant(tenantA, () => templates.list({}));
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by category and tier', async () => {
    const harvest = await runInTenant(tenantA, () =>
      templates.list({ category: 'Credential harvesting' }),
    );
    expect(harvest.length).toBeGreaterThan(0);
    expect(harvest.every((t) => t.category === 'Credential harvesting')).toBe(true);
  });
});

describe('cloning a template into a tenant library', () => {
  it('creates an unapproved, editable scenario owned by the acting tenant', async () => {
    const [template] = await runInTenant(tenantA, () => templates.list({}));
    const scenario = await runInTenant(tenantA, () => templates.cloneToTenant(template.id));
    expect(scenario.tenantId).toBe(tenantA);
    expect(scenario.approvedAt).toBeNull();
    expect(scenario.title).toBe(template.title);
    expect(scenario.bodyHtml).toContain('{{TRACKING_URL}}');
  });

  it('a clone lands only in the tenant that cloned it', async () => {
    const [template] = await runInTenant(tenantB, () => templates.list({}));
    await runInTenant(tenantB, () => templates.cloneToTenant(template.id));
    const aScenarios = await runInTenant(tenantA, () => db.scenario.findMany());
    expect(aScenarios.every((sc) => sc.tenantId === tenantA)).toBe(true);
  });
});
