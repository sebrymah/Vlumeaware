import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId, runAsSystem, runInTenant } from '../../common/prisma/tenant-context';
import { StorageService } from '../../providers/storage/storage.service';
import { CertificatesService } from '../certificates/certificates.service';
import { MAILER } from '../../providers/mailer/mailer.interface';
import type { Mailer } from '../../providers/mailer/mailer.interface';
import { publicBaseUrl } from '../tracking/render';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface AssignTargets {
  employeeIds?: string[];
  department?: string;
  all?: boolean;
}

/**
 * Standalone (non-phishing) training delivery. An admin assigns a module to
 * employees directly; each gets an opaque /learn link by email. The public
 * page plays the video, runs the module's quiz, and — on a pass — completes the
 * assignment and issues a certificate.
 */
@Injectable()
export class LearnService {
  private readonly logger = new Logger(LearnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly certificates: CertificatesService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  private newToken() {
    return randomBytes(24).toString('base64url');
  }

  /** Assign a module to a set of employees and (optionally) email each a link. */
  async assign(trainingModuleId: string, targets: AssignTargets, notify = true) {
    const tenantId = currentTenantId();
    const module = await this.prisma.db.trainingModule.findUnique({
      where: { id: trainingModuleId },
      select: { id: true, title: true },
    });
    if (!module) throw new NotFoundException('Training module not found');

    let where: { department?: string; id?: { in: string[] } } | undefined;
    if (targets.all) where = undefined;
    else if (targets.department) where = { department: targets.department };
    else if (targets.employeeIds?.length) where = { id: { in: targets.employeeIds } };
    else throw new BadRequestException('Choose who to assign the training to');

    const employees = await this.prisma.db.employee.findMany({
      where,
      select: { id: true, name: true, email: true },
    });
    if (!employees.length) throw new BadRequestException('No matching employees to assign');

    const tenant = await runAsSystem('learn: tenant name', () =>
      this.prisma.db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    );

    let assigned = 0;
    let skipped = 0;
    let notified = 0;
    for (const emp of employees) {
      const existing = await this.prisma.db.trainingAssignment.findFirst({
        where: { employeeId: emp.id, trainingModuleId, completedAt: null },
      });
      let token = existing?.accessToken ?? null;
      if (existing) {
        skipped += 1;
        if (!token) {
          token = this.newToken();
          await this.prisma.db.trainingAssignment.update({ where: { id: existing.id }, data: { accessToken: token } });
        }
      } else {
        token = this.newToken();
        await this.prisma.db.trainingAssignment.create({
          data: {
            tenantId,
            employeeId: emp.id,
            trainingModuleId,
            curriculumModuleId: module.title,
            sourceSendId: null,
            accessToken: token,
          },
        });
        assigned += 1;
      }
      if (notify && token) {
        const link = `${publicBaseUrl()}/learn/${token}`;
        try {
          await this.mailer.send({
            to: emp.email,
            fromName: `${tenant?.name ?? 'Vlumeaware'} Security Awareness`,
            fromAddress: process.env.SIMULATION_FROM_ADDRESS ?? 'no-reply@vlumesec.com',
            subject: `Training assigned: ${module.title}`,
            html:
              `<p>Hi ${esc(emp.name)},</p>` +
              `<p>You've been assigned a short security awareness module: <strong>${esc(module.title)}</strong>.</p>` +
              `<p><a href="${link}">Start the training</a> — it takes a few minutes and finishes with a quick quiz.</p>` +
              `<p>Thank you,<br/>${esc(tenant?.name ?? 'Security Awareness')}</p>`,
            sendId: `learn-${token.slice(0, 12)}`,
          });
          notified += 1;
        } catch (e) {
          this.logger.warn(`learn invite email failed for ${emp.email}: ${(e as Error).message}`);
        }
      }
    }
    return { assigned, skipped, notified, total: employees.length };
  }

  private async resolveToken(token: string) {
    const ref = await runAsSystem('learn: resolve token', () =>
      this.prisma.db.trainingAssignment.findUnique({
        where: { accessToken: token },
        select: { id: true, tenantId: true, employeeId: true, trainingModuleId: true },
      }),
    );
    if (!ref || !ref.trainingModuleId) throw new NotFoundException('Training not found');
    return ref as { id: string; tenantId: string; employeeId: string; trainingModuleId: string };
  }

  /** Public: the training a /learn link resolves to. */
  async getLearn(token: string) {
    const ref = await this.resolveToken(token);
    return runInTenant(ref.tenantId, async () => {
      const [assignment, module, employee, quiz] = await Promise.all([
        this.prisma.db.trainingAssignment.findUnique({ where: { id: ref.id }, select: { completedAt: true } }),
        this.prisma.db.trainingModule.findUnique({
          where: { id: ref.trainingModuleId },
          select: { title: true, description: true, videoUrl: true },
        }),
        this.prisma.db.employee.findUnique({ where: { id: ref.employeeId }, select: { name: true } }),
        this.prisma.db.quiz.findFirst({
          where: { trainingModuleId: ref.trainingModuleId },
          include: { questions: { orderBy: { order: 'asc' } } },
        }),
      ]);
      const tenant = await runAsSystem('learn: branding', () =>
        this.prisma.db.tenant.findUnique({
          where: { id: ref.tenantId },
          select: { name: true, brandLogoUrl: true, brandPrimaryColor: true },
        }),
      );
      // The completion page is addressed by the same token and may be opened
      // directly or refreshed, so the certificate has to come from the record
      // rather than from whatever was in memory after the quiz was submitted.
      const certificate =
        assignment?.completedAt && module
          ? await this.prisma.db.certificate.findFirst({
              where: { employeeId: ref.employeeId, moduleTitle: module.title, sourceSendId: null },
              select: { serial: true, moduleTitle: true, scorePct: true, issuedAt: true },
              orderBy: { issuedAt: 'desc' },
            })
          : null;

      return {
        employeeName: employee?.name ?? 'there',
        tenant,
        completed: !!assignment?.completedAt,
        certificate,
        module: module
          ? { title: module.title, description: module.description, videoUrl: await this.storage.signedUrl(module.videoUrl) }
          : null,
        quiz:
          quiz && quiz.questions.length
            ? {
                quizId: quiz.id,
                title: quiz.title,
                passingScorePct: quiz.passingScorePct,
                questions: quiz.questions.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options })),
              }
            : null,
      };
    });
  }

  /** Public: score the quiz, complete the assignment, issue a certificate on pass. */
  async submitQuiz(token: string, input: { quizId: string; answers: Array<{ questionId: string; choice: number }> }) {
    const ref = await this.resolveToken(token);
    return runInTenant(ref.tenantId, async () => {
      const quiz = await this.prisma.db.quiz.findUnique({
        where: { id: input.quizId },
        include: { questions: { orderBy: { order: 'asc' } } },
      });
      if (!quiz) throw new NotFoundException('Quiz not found');

      const prior = await this.prisma.db.quizAttempt.findMany({
        where: { quizId: quiz.id, employeeId: ref.employeeId },
        select: { passed: true },
      });
      if (prior.some((a) => a.passed)) throw new BadRequestException('You have already passed this quiz.');
      const cap = quiz.allowRetakes ? quiz.maxAttempts ?? null : 1;
      if (cap !== null && prior.length >= cap) throw new BadRequestException('No attempts remaining for this quiz.');

      const chosen = new Map(input.answers.map((a) => [a.questionId, a.choice]));
      const results = quiz.questions.map((q) => ({
        questionId: q.id,
        correct: chosen.get(q.id) === q.correctIndex,
        correctIndex: q.correctIndex,
        explanation: q.explanation ?? null,
      }));
      const score = results.filter((r) => r.correct).length;
      const total = quiz.questions.length;
      const scorePct = total > 0 ? Math.round((score / total) * 100) : 0;
      const passed = total > 0 && scorePct >= quiz.passingScorePct;

      await this.prisma.db.quizAttempt.create({
        data: { tenantId: ref.tenantId, quizId: quiz.id, employeeId: ref.employeeId, sourceSendId: null, score, total, passed },
      });

      let certificateId: string | null = null;
      let certificateEmailed = false;
      if (passed) {
        await this.prisma.db.trainingAssignment.updateMany({
          where: { id: ref.id, completedAt: null },
          data: { completedAt: new Date() },
        });
        const module = quiz.trainingModuleId
          ? await this.prisma.db.trainingModule.findUnique({ where: { id: quiz.trainingModuleId }, select: { title: true } })
          : null;
        const cert = await this.certificates.issueAndEmail({
          employeeId: ref.employeeId,
          moduleTitle: module?.title ?? quiz.title,
          quizTitle: quiz.title,
          scorePct,
        });
        certificateId = cert.id;
        certificateEmailed = cert.emailed;
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

  /** Public: mark a quiz-less module as watched/complete. */
  async markComplete(token: string) {
    const ref = await this.resolveToken(token);
    return runInTenant(ref.tenantId, async () => {
      await this.prisma.db.trainingAssignment.updateMany({
        where: { id: ref.id, completedAt: null },
        data: { completedAt: new Date() },
      });
      return { completed: true };
    });
  }
}
