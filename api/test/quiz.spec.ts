import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant, TenantScopeError } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StorageService } from '../src/providers/storage/storage.service';
import { TrainingModulesService } from '../src/modules/training-modules/training-modules.service';
import { CertificatesService } from '../src/modules/certificates/certificates.service';
import { LogMailer } from '../src/providers/mailer/log.mailer';
import { TrainingService } from '../src/modules/training/training.service';
import { TrackingService } from '../src/modules/tracking/tracking.service';
import { QuizzesService } from '../src/modules/quizzes/quizzes.service';

const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;
// Kept in scope so a test can assert the certificate email actually went out.
const certificateMailer = new LogMailer();
const quizzes = new QuizzesService(prisma);
const tracking = new TrackingService(
  prisma,
  new TrainingService(prisma),
  new TrainingModulesService(prisma, new StorageService()),
  new CertificatesService(prisma, certificateMailer),
);

let tenantId: string;
let token: string;
let quizId: string;

beforeAll(async () => {
  await base.$connect();
  const tenant = await runAsSystem('setup', () =>
    db.tenant.create({ data: { name: `quiz-${Date.now()}`, ndpaAgreementSignedAt: new Date() } }),
  );
  tenantId = tenant.id;
  await runInTenant(tenantId, async () => {
    const employee = await db.employee.create({
      data: { tenantId, email: `q-${Date.now()}@x.test`, name: 'Quiz Taker' },
    });
    const scenario = await db.scenario.create({
      data: {
        tenantId, title: 'Q', difficultyTier: 'medium', subjectLine: 's',
        bodyHtml: '<a href="{{TRACKING_URL}}">x</a>', senderSpoofName: 'IT', redFlags: [],
        approvedAt: new Date(),
      },
    });
    const module = await db.trainingModule.create({
      data: { tenantId, title: 'M', videoUrl: 'https://v/x.mp4', videoSource: 'link' },
    });
    await db.trainingRoutingRule.create({
      data: { tenantId, scenarioId: scenario.id, trainingModuleId: module.id },
    });
    const campaign = await db.campaign.create({ data: { tenantId, name: 'C' } });
    const send = await db.send.create({
      data: {
        tenantId, campaignId: campaign.id, employeeId: employee.id, scenarioId: scenario.id,
        uniqueTrackingToken: `qt-${Date.now()}`, sentAt: new Date(), clickedAt: new Date(),
      },
    });
    token = send.uniqueTrackingToken;
    // assign the training module so a pass can complete it
    await db.trainingAssignment.create({
      data: { tenantId, employeeId: employee.id, trainingModuleId: module.id, curriculumModuleId: 'M', sourceSendId: send.id },
    });
    const quiz = await quizzes.create({
      title: 'Post-video quiz',
      passingScorePct: 67,
      trainingModuleId: module.id,
      questions: [
        { prompt: 'Q1?', options: ['a', 'b'], correctIndex: 1, explanation: 'because b' },
        { prompt: 'Q2?', options: ['a', 'b', 'c'], correctIndex: 0 },
        { prompt: 'Q3?', options: ['a', 'b'], correctIndex: 1 },
      ],
    });
    quizId = quiz.id;
  });
});

afterAll(async () => {
  await runAsSystem('teardown', () => base.tenant.delete({ where: { id: tenantId } }));
  await base.$disconnect();
});

describe('quiz authoring and delivery', () => {
  it('rejects a quiz attached to both a module and a campaign', async () => {
    await expect(
      runInTenant(tenantId, () =>
        quizzes.create({ title: 'bad', trainingModuleId: quizId, campaignId: quizId, questions: [{ prompt: 'x', options: ['a', 'b'], correctIndex: 0 }] }),
      ),
    ).rejects.toThrow(/exactly one/);
  });

  it('delivers the quiz for a token without leaking correct answers', async () => {
    const q = await tracking.getQuizForToken(token);
    expect(q).not.toBeNull();
    expect(q!.questions).toHaveLength(3);
    // No question object should carry the answer.
    for (const question of q!.questions) {
      expect(Object.keys(question)).toEqual(['id', 'prompt', 'options']);
    }
  });

  it('scores a passing submission and completes the training assignment', async () => {
    const q = await tracking.getQuizForToken(token);
    const answers = q!.questions.map((question, i) => ({
      questionId: question.id,
      choice: [1, 0, 1][i], // all correct
    }));
    const res = await tracking.submitQuiz(token, { quizId: q!.quizId, answers });
    expect(res.score).toBe(3);
    expect(res.total).toBe(3);
    expect(res.passed).toBe(true);

    const assignment = await runInTenant(tenantId, () =>
      db.trainingAssignment.findFirst({ where: { sourceSendId: { not: null } } }),
    );
    expect(assignment!.completedAt).not.toBeNull();
  });

  it('scores a failing submission and does not pass', async () => {
    // Fresh employee/send so the post-pass retake guard does not apply.
    const failToken = await runInTenant(tenantId, async () => {
      const emp = await db.employee.create({
        data: { tenantId, email: `fail-${Date.now()}@x.test`, name: 'Failer' },
      });
      const camp = await db.campaign.findFirst({ select: { id: true } });
      const scen = await db.scenario.findFirst({ select: { id: true } });
      const send = await db.send.create({
        data: {
          tenantId, campaignId: camp!.id, employeeId: emp.id, scenarioId: scen!.id,
          uniqueTrackingToken: `fail-tok-${Date.now()}`, sentAt: new Date(), clickedAt: new Date(),
        },
      });
      return send.uniqueTrackingToken;
    });
    const q = await tracking.getQuizForToken(failToken);
    const answers = q!.questions.map((question) => ({ questionId: question.id, choice: 99 }));
    const res = await tracking.submitQuiz(failToken, { quizId: q!.quizId, answers });
    expect(res.score).toBe(0);
    expect(res.passed).toBe(false);
    expect(res.results.every((r) => !r.correct)).toBe(true);
  });

  it('refuses a further attempt after a pass (F4 retake guard)', async () => {
    const q = await tracking.getQuizForToken(token);
    await expect(
      tracking.submitQuiz(token, {
        quizId: q!.quizId,
        answers: q!.questions.map((question) => ({ questionId: question.id, choice: 0 })),
      }),
    ).rejects.toThrow(/already passed/i);
  });

  it('records attempts under the right tenant only', async () => {
    const other = await runAsSystem('other', () => db.tenant.create({ data: { name: `o-${Date.now()}` } }));
    const leaked = await runInTenant(other.id, () => db.quizAttempt.findMany());
    expect(leaked).toEqual([]);
    await runAsSystem('cleanup', () => base.tenant.delete({ where: { id: other.id } }));
  });

  it('quiz tables are unreachable with no tenant in context', async () => {
    await expect(db.quiz.findMany()).rejects.toBeInstanceOf(TenantScopeError);
    await expect(db.quizAttempt.findMany()).rejects.toBeInstanceOf(TenantScopeError);
  });
});

describe('quiz CSV parsing', () => {
  it('parses questions with 1-based correct column into 0-based', () => {
    const csv = Buffer.from(
      'prompt,option1,option2,option3,correct,explanation\n' +
        'What is safest?,Click it,Report it,Ignore it,2,Reporting is best\n',
    );
    const parsed = quizzes.parseCsv(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].correctIndex).toBe(1);
    expect(parsed[0].options).toEqual(['Click it', 'Report it', 'Ignore it']);
    expect(parsed[0].explanation).toBe('Reporting is best');
  });

  it('rejects an out-of-range correct column', () => {
    const csv = Buffer.from('prompt,option1,option2,correct\nQ,a,b,5\n');
    expect(() => quizzes.parseCsv(csv)).toThrow(/correct/);
  });
});
