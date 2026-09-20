import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { runAsSystem, runInTenant } from '../../common/prisma/tenant-context';
import { TrainingService } from '../training/training.service';
import { TrainingModulesService } from '../training-modules/training-modules.service';
import { CertificatesService } from '../certificates/certificates.service';

export interface TeachableMoment {
  tenant: { name: string; brandLogoUrl: string | null; brandPrimaryColor: string | null };
  employeeName: string;
  scenario: { title: string; subjectLine: string; senderSpoofName: string; redFlags: string[] };
  assignedModule: {
    id: string;
    title: string;
    videoUrl: string;
  } | null;
  alreadyClicked: boolean;
  reportedFirst: boolean;
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly training: TrainingService,
    private readonly modules: TrainingModulesService,
    private readonly certificates: CertificatesService,
  ) {}

  /**
   * Resolves a public tracking token to its tenant. This is the one read that
   * cannot already know its tenant, so it is system-scoped and returns ids
   * only — everything after it runs inside runInTenant.
   */
  private async resolveToken(token: string) {
    const send = await runAsSystem('tracking: resolve token to tenant', () =>
      this.prisma.db.send.findUnique({
        where: { uniqueTrackingToken: token },
        select: { id: true, tenantId: true, campaignId: true, employeeId: true, scenarioId: true },
      }),
    );
    if (!send) throw new NotFoundException('Unknown tracking token');
    return send;
  }

  /** Pixel endpoint. First open wins; later opens are not overwritten. */
  async recordOpen(token: string): Promise<void> {
    const ref = await this.resolveToken(token);
    await runInTenant(ref.tenantId, () =>
      this.prisma.db.send.updateMany({
        where: { id: ref.id, openedAt: null },
        data: { openedAt: new Date() },
      }),
    );
  }

  /**
   * Click endpoint. Records the click, fires the routing rule, and returns the
   * data the teachable-moment page renders. An employee who already reported
   * the email keeps that credit.
   */
  async recordClick(token: string): Promise<TeachableMoment> {
    const ref = await this.resolveToken(token);

    return runInTenant(ref.tenantId, async () => {
      const before = await this.prisma.db.send.findUnique({
        where: { id: ref.id },
        select: { clickedAt: true, reportedAt: true },
      });

      await this.prisma.db.send.updateMany({
        where: { id: ref.id, clickedAt: null },
        data: { clickedAt: new Date() },
      });

      const assignment = await this.training.assignFromClick({
        employeeId: ref.employeeId,
        scenarioId: ref.scenarioId,
        sendId: ref.id,
      });

      const [tenant, employee, scenario] = await Promise.all([
        runAsSystem('tracking: read tenant branding', () =>
          this.prisma.db.tenant.findUnique({
            where: { id: ref.tenantId },
            select: { name: true, brandLogoUrl: true, brandPrimaryColor: true },
          }),
        ),
        this.prisma.db.employee.findUnique({
          where: { id: ref.employeeId },
          select: { name: true },
        }),
        this.prisma.db.scenario.findUnique({
          where: { id: ref.scenarioId },
          select: { title: true, subjectLine: true, senderSpoofName: true, redFlags: true },
        }),
      ]);

      if (!tenant || !employee || !scenario) throw new NotFoundException('Simulation data missing');

      // Resolve the assigned module to a playable link for the reveal page.
      let assignedModule: TeachableMoment['assignedModule'] = null;
      if (assignment) {
        const module = await this.prisma.db.trainingModule.findUnique({
          where: { id: assignment.trainingModuleId },
          select: { id: true, title: true, videoUrl: true, videoSource: true },
        });
        if (module) {
          assignedModule = {
            id: module.id,
            title: module.title,
            videoUrl: await this.modules.playableUrl(module),
          };
        }
      }

      return {
        tenant,
        employeeName: employee.name,
        scenario,
        assignedModule,
        alreadyClicked: before?.clickedAt !== null,
        reportedFirst: before?.reportedAt !== null,
      };
    });
  }

  /**
   * Employee reported the simulated email. Only credited when it arrives
   * before a click — reporting after clicking is not a successful catch.
   */
  async recordReport(token: string): Promise<{ credited: boolean; reason?: string }> {
    const ref = await this.resolveToken(token);

    return runInTenant(ref.tenantId, async () => {
      const send = await this.prisma.db.send.findUnique({
        where: { id: ref.id },
        select: { clickedAt: true, reportedAt: true },
      });
      if (send?.reportedAt) return { credited: true, reason: 'already reported' };
      if (send?.clickedAt) {
        return { credited: false, reason: 'reported after clicking' };
      }
      await this.prisma.db.send.updateMany({
        where: { id: ref.id, reportedAt: null },
        data: { reportedAt: new Date() },
      });
      return { credited: true };
    });
  }

  /**
   * Records a submission on the simulated login page.
   *
   * Legal cleared credential capture (§13); the design is metadata only. The
   * browser derives these non-reversible metrics locally and posts integers
   * plus one boolean — the typed username and password never reach the server.
   * `timeToSubmitMs` is computed here from the click, which is more trustworthy
   * than a client-supplied timer. The `sends` boolean stays as the summary flag.
   */
  async recordCredentialSubmission(
    token: string,
    metadata: {
      usernameLength?: number;
      passwordLength?: number;
      usernameLooksLikeEmail?: boolean;
    } = {},
  ): Promise<void> {
    const ref = await this.resolveToken(token);
    await runInTenant(ref.tenantId, async () => {
      const send = await this.prisma.db.send.findUnique({
        where: { id: ref.id },
        select: { clickedAt: true },
      });
      const timeToSubmitMs = send?.clickedAt
        ? Math.max(0, Date.now() - send.clickedAt.getTime())
        : null;

      await this.prisma.db.credentialSubmission.create({
        data: {
          tenantId: ref.tenantId,
          sendId: ref.id,
          usernameLength: metadata.usernameLength ?? null,
          passwordLength: metadata.passwordLength ?? null,
          usernameLooksLikeEmail: metadata.usernameLooksLikeEmail ?? null,
          timeToSubmitMs,
        },
      });

      await this.prisma.db.send.updateMany({
        where: { id: ref.id },
        data: { credentialsSubmitted: true },
      });
    });
  }

  /** Read-only fetch for the landing page, so a refresh is not a new click. */
  async getTeachableMoment(token: string): Promise<TeachableMoment> {
    return this.recordClick(token);
  }

  /**
   * Branding for the simulated login page shown before the reveal. Returns only
   * what a convincing login needs — never the red flags — and does not log a
   * click (the click was already recorded by the redirect that led here).
   */
  async getLoginBranding(token: string): Promise<{
    tenant: { name: string; brandLogoUrl: string | null; brandPrimaryColor: string | null };
    senderSpoofName: string;
  }> {
    const ref = await this.resolveToken(token);
    return runInTenant(ref.tenantId, async () => {
      const [tenant, scenario] = await Promise.all([
        runAsSystem('tracking: login-page branding', () =>
          this.prisma.db.tenant.findUnique({
            where: { id: ref.tenantId },
            select: { name: true, brandLogoUrl: true, brandPrimaryColor: true },
          }),
        ),
        this.prisma.db.scenario.findUnique({
          where: { id: ref.scenarioId },
          select: { senderSpoofName: true },
        }),
      ]);
      if (!tenant || !scenario) throw new NotFoundException('Simulation data missing');
      return { tenant, senderSpoofName: scenario.senderSpoofName };
    });
  }

  /**
   * Returns the quiz an employee should take after the reveal, WITHOUT the
   * correct answers. Prefers the assigned module's quiz; falls back to the
   * send's campaign quiz. Null when neither exists.
   */
  async getQuizForToken(token: string): Promise<{
    quizId: string;
    title: string;
    passingScorePct: number;
    alreadyPassed: boolean;
    attemptsUsed: number;
    attemptsRemaining: number | null;
    questions: Array<{ id: string; prompt: string; options: string[] }>;
  } | null> {
    const ref = await this.resolveToken(token);
    return runInTenant(ref.tenantId, async () => {
      const rule = await this.prisma.db.trainingRoutingRule.findFirst({
        where: { scenarioId: ref.scenarioId },
        select: { trainingModuleId: true },
      });

      let quiz = rule
        ? await this.prisma.db.quiz.findFirst({
            where: { trainingModuleId: rule.trainingModuleId },
            include: { questions: { orderBy: { order: 'asc' } } },
          })
        : null;

      if (!quiz) {
        quiz = await this.prisma.db.quiz.findFirst({
          where: { campaignId: ref.campaignId },
          include: { questions: { orderBy: { order: 'asc' } } },
        });
      }
      if (!quiz || !quiz.questions.length) return null;

      const prior = await this.prisma.db.quizAttempt.findMany({
        where: { quizId: quiz.id, employeeId: ref.employeeId },
        select: { passed: true },
      });
      const alreadyPassed = prior.some((a) => a.passed);
      const cap = quiz.allowRetakes ? quiz.maxAttempts ?? null : 1;

      return {
        quizId: quiz.id,
        title: quiz.title,
        passingScorePct: quiz.passingScorePct,
        alreadyPassed,
        attemptsUsed: prior.length,
        attemptsRemaining: cap === null ? null : Math.max(0, cap - prior.length),
        // Correct answers are never sent to the browser.
        questions: quiz.questions.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options })),
      };
    });
  }

  /**
   * Scores a quiz submission server-side, records the attempt, and — on a pass
   * — marks the employee's training assignment for this send complete. Returns
   * per-question correctness and explanations for the reveal page.
   */
  async submitQuiz(
    token: string,
    input: { quizId: string; answers: Array<{ questionId: string; choice: number }> },
  ): Promise<{
    score: number;
    total: number;
    passed: boolean;
    passingScorePct: number;
    results: Array<{ questionId: string; correct: boolean; correctIndex: number; explanation: string | null }>;
    certificateId: string | null;
  }> {
    const ref = await this.resolveToken(token);
    return runInTenant(ref.tenantId, async () => {
      const quiz = await this.prisma.db.quiz.findUnique({
        where: { id: input.quizId },
        include: { questions: true },
      });
      if (!quiz) throw new NotFoundException('Quiz not found');

      // Retake / attempt-cap enforcement. A prior pass is always final; further
      // attempts are refused. maxAttempts caps failing retakes.
      const priorAttempts = await this.prisma.db.quizAttempt.findMany({
        where: { quizId: quiz.id, employeeId: ref.employeeId },
        select: { passed: true },
      });
      const alreadyPassed = priorAttempts.some((a) => a.passed);
      const cap = quiz.allowRetakes ? quiz.maxAttempts ?? null : 1;
      if (alreadyPassed) {
        throw new BadRequestException('You have already passed this quiz.');
      }
      if (cap !== null && priorAttempts.length >= cap) {
        throw new BadRequestException('No attempts remaining for this quiz.');
      }

      const chosen = new Map(input.answers.map((a) => [a.questionId, a.choice]));
      const results = quiz.questions.map((q) => {
        const choice = chosen.get(q.id);
        return {
          questionId: q.id,
          correct: choice === q.correctIndex,
          correctIndex: q.correctIndex,
          explanation: q.explanation ?? null,
        };
      });
      const score = results.filter((r) => r.correct).length;
      const total = quiz.questions.length;
      const passed = total > 0 && Math.round((score / total) * 100) >= quiz.passingScorePct;

      await this.prisma.db.quizAttempt.create({
        data: {
          tenantId: ref.tenantId,
          quizId: quiz.id,
          employeeId: ref.employeeId,
          sourceSendId: ref.id,
          score,
          total,
          passed,
        },
      });

      let certificateId: string | null = null;
      let certificateEmailed = false;
      if (passed) {
        await this.prisma.db.trainingAssignment.updateMany({
          where: { employeeId: ref.employeeId, sourceSendId: ref.id, completedAt: null },
          data: { completedAt: new Date() },
        });

        // Issue a completion certificate for module quizzes.
        if (quiz.trainingModuleId) {
          const module = await this.prisma.db.trainingModule.findUnique({
            where: { id: quiz.trainingModuleId },
            select: { title: true },
          });
          const cert = await this.certificates.issueAndEmail({
            employeeId: ref.employeeId,
            moduleTitle: module?.title ?? 'Security awareness module',
            quizTitle: quiz.title,
            scorePct: total ? Math.round((score / total) * 100) : 0,
            sourceSendId: ref.id,
          });
          certificateId = cert.id;
          certificateEmailed = cert.emailed;
        }
      }

      return {
        score,
        total,
        passed,
        passingScorePct: quiz.passingScorePct,
        results,
        certificateId,
        certificateEmailed,
      };
    });
  }
}
