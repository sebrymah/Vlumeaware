import { PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DigestProcessor } from '../src/queue/digest.processor';
import type { ReportsService } from '../src/modules/reports/reports.service';
import type { Mailer, OutboundEmail } from '../src/providers/mailer/mailer.interface';

const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;

/** Records what was sent; can be told to fail to exercise the retry path. */
class RecordingMailer implements Mailer {
  sent: OutboundEmail[] = [];
  failNext = false;
  async send(email: OutboundEmail) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('provider rejected the sender domain');
    }
    this.sent.push(email);
    return { messageId: `test-${this.sent.length}` };
  }
}

const reports = { trend: async () => [] } as unknown as ReportsService;
const tick = (p: DigestProcessor) => p.process({} as Job);

let tenantId: string;
let mailer: RecordingMailer;
let processor: DigestProcessor;

beforeAll(async () => {
  await base.$connect();
});

beforeEach(async () => {
  mailer = new RecordingMailer();
  processor = new DigestProcessor(prisma, reports, mailer);
  const t = await runAsSystem('seed', () =>
    db.tenant.create({
      data: {
        name: `digest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        digestEnabled: true,
        digestEmail: 'security@client.test',
      },
    }),
  );
  tenantId = t.id;
});

afterEach(async () => {
  await runAsSystem('cleanup', () => base.tenant.delete({ where: { id: tenantId } }));
});

afterAll(async () => {
  await base.$disconnect();
});

const read = () => runAsSystem('read', () => db.tenant.findUnique({ where: { id: tenantId } }));
const backdate = (ms: number) =>
  runAsSystem('backdate', () =>
    db.tenant.update({
      where: { id: tenantId },
      data: { lastDigestSentAt: new Date(Date.now() - ms) },
    }),
  );

describe('digest cadence', () => {
  it('sends to a tenant that has never received one', async () => {
    const res = await tick(processor);
    expect(res.sent).toBe(1);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe('security@client.test');
    expect((await read())?.lastDigestSentAt).toBeInstanceOf(Date);
  });

  // The regression: the tick runs hourly, so without a due-check an opted-in
  // client was emailed every hour by a feature labelled "weekly".
  it('does not send again on the next tick', async () => {
    await tick(processor);
    const first = (await read())?.lastDigestSentAt;

    await tick(processor);

    expect(mailer.sent).toHaveLength(1);
    expect((await read())?.lastDigestSentAt).toEqual(first);
  });

  it('sends again once the interval has elapsed', async () => {
    await tick(processor);
    await backdate(8 * 24 * 60 * 60 * 1000);

    await tick(processor);

    expect(mailer.sent).toHaveLength(2);
  });

  it('still withholds at six days, one day short of the interval', async () => {
    await backdate(6 * 24 * 60 * 60 * 1000);
    await tick(processor);
    expect(mailer.sent).toHaveLength(0);
  });

  it('leaves the tenant due when the send fails, rather than losing the week', async () => {
    mailer.failNext = true;

    const failed = await tick(processor);
    expect(failed.sent).toBe(0);
    expect((await read())?.lastDigestSentAt).toBeNull();

    const retried = await tick(processor);
    expect(retried.sent).toBe(1);
  });

  it('skips tenants that have opted out or are not active', async () => {
    await runAsSystem('opt out', () =>
      db.tenant.update({ where: { id: tenantId }, data: { digestEnabled: false } }),
    );
    expect((await tick(processor)).sent).toBe(0);

    await runAsSystem('offboard', () =>
      db.tenant.update({
        where: { id: tenantId },
        data: { digestEnabled: true, status: 'offboarded' },
      }),
    );
    expect((await tick(processor)).sent).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });

  // The simulation domain's reputation is deliberately poor, so genuine mail
  // sent from it is the most likely thing to be filtered.
  it('does not send the digest from the simulation address', async () => {
    await tick(processor);
    const simulation = process.env.SIMULATION_FROM_ADDRESS ?? 'no-reply@vlumesec.com';
    expect(mailer.sent[0].fromAddress).not.toBe(simulation);
    expect(mailer.sent[0].fromAddress).toMatch(/@vlumesec\.com$/);
  });
});
