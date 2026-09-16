import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId, runAsSystem } from '../../common/prisma/tenant-context';

export interface QuestionInput {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

@Injectable()
export class QuizzesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.db.quiz.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { questions: true, attempts: true } },
        module: { select: { id: true, title: true } },
        campaign: { select: { id: true, name: true } },
      },
    });
  }

  async findOne(id: string) {
    const quiz = await this.prisma.db.quiz.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { order: 'asc' } },
        module: { select: { id: true, title: true } },
        campaign: { select: { id: true, name: true } },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    return quiz;
  }

  /**
   * Creates a quiz attached to exactly one of a training module or a campaign.
   * Both attach points are read under tenant scope, so a quiz can only ever
   * bind to this tenant's own module/campaign, and each may hold one quiz.
   */
  async create(input: {
    title: string;
    passingScorePct?: number;
    allowRetakes?: boolean;
    maxAttempts?: number;
    trainingModuleId?: string;
    campaignId?: string;
    questions: QuestionInput[];
  }) {
    if (!input.trainingModuleId === !input.campaignId) {
      throw new BadRequestException('Attach the quiz to exactly one module or campaign');
    }
    this.validateQuestions(input.questions);

    if (input.trainingModuleId) {
      const module = await this.prisma.db.trainingModule.findUnique({
        where: { id: input.trainingModuleId },
        select: { id: true },
      });
      if (!module) throw new NotFoundException('Training module not found');
    } else {
      const campaign = await this.prisma.db.campaign.findUnique({
        where: { id: input.campaignId },
        select: { id: true },
      });
      if (!campaign) throw new NotFoundException('Campaign not found');
    }

    const tenantId = currentTenantId();
    return this.prisma.db.quiz.create({
      data: {
        tenantId,
        title: input.title,
        passingScorePct: input.passingScorePct ?? 70,
        allowRetakes: input.allowRetakes ?? true,
        maxAttempts: input.maxAttempts,
        trainingModuleId: input.trainingModuleId,
        campaignId: input.campaignId,
        questions: {
          create: input.questions.map((q, i) => ({
            tenantId,
            prompt: q.prompt,
            options: q.options,
            correctIndex: q.correctIndex,
            explanation: q.explanation,
            order: i,
          })),
        },
      },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
  }

  /**
   * Clones a quiz from the shared Vlumetech library into this tenant, attaching
   * it to one of the tenant's own training modules or campaigns. The shared
   * quiz is read under system scope; the created quiz is tenant-scoped by
   * create().
   */
  async createFromShared(sharedQuizId: string, attach: { trainingModuleId?: string; campaignId?: string }) {
    const shared = await runAsSystem('read shared quiz for clone', () =>
      this.prisma.db.sharedQuiz.findUnique({ where: { id: sharedQuizId } }),
    );
    if (!shared) throw new NotFoundException('Shared quiz not found');
    const questions = shared.questions as unknown as QuestionInput[];
    return this.create({
      title: shared.title,
      passingScorePct: shared.passingScorePct,
      trainingModuleId: attach.trainingModuleId,
      campaignId: attach.campaignId,
      questions,
    });
  }

  async update(id: string, data: { title?: string; passingScorePct?: number; allowRetakes?: boolean; maxAttempts?: number }) {
    await this.findOne(id);
    return this.prisma.db.quiz.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.db.quiz.delete({ where: { id } });
    return { deleted: true };
  }

  /** Replaces the question set (bulk add). */
  async setQuestions(quizId: string, questions: QuestionInput[]) {
    await this.findOne(quizId);
    this.validateQuestions(questions);
    const tenantId = currentTenantId();
    await this.prisma.db.quizQuestion.deleteMany({ where: { quizId } });
    await this.prisma.db.quizQuestion.createMany({
      data: questions.map((q, i) => ({
        tenantId,
        quizId,
        prompt: q.prompt,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        order: i,
      })),
    });
    return this.findOne(quizId);
  }

  /**
   * Parses a question CSV. Columns: prompt, option1..optionN, correct,
   * explanation. `correct` is 1-based in the file (friendlier for authors) and
   * stored 0-based.
   */
  parseCsv(buffer: Buffer): QuestionInput[] {
    if (!buffer?.length) throw new BadRequestException('CSV file is empty');
    let rows: Record<string, string>[];
    try {
      rows = parse(buffer, {
        columns: (h: string[]) => h.map((x) => x.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
        bom: true,
      });
    } catch (err) {
      throw new BadRequestException(`Could not parse CSV: ${(err as Error).message}`);
    }
    if (!rows.length) throw new BadRequestException('CSV had no data rows');

    return rows.map((r, idx) => {
      const options = Object.keys(r)
        .filter((k) => /^option\d+$/.test(k))
        .sort((a, b) => Number(a.replace('option', '')) - Number(b.replace('option', '')))
        .map((k) => r[k]?.trim())
        .filter((v) => v && v.length > 0) as string[];
      const correct = Number(r.correct);
      if (!r.prompt) throw new BadRequestException(`Row ${idx + 2}: missing prompt`);
      if (options.length < 2) throw new BadRequestException(`Row ${idx + 2}: need at least 2 options`);
      if (!Number.isInteger(correct) || correct < 1 || correct > options.length) {
        throw new BadRequestException(`Row ${idx + 2}: "correct" must be 1..${options.length}`);
      }
      return {
        prompt: r.prompt,
        options,
        correctIndex: correct - 1,
        explanation: r.explanation || undefined,
      };
    });
  }

  results(quizId: string) {
    return this.prisma.db.quizAttempt.findMany({
      where: { quizId },
      orderBy: { completedAt: 'desc' },
      include: { employee: { select: { name: true, email: true, department: true } } },
    });
  }

  private validateQuestions(questions: QuestionInput[]) {
    if (!questions?.length) throw new BadRequestException('A quiz needs at least one question');
    questions.forEach((q, i) => {
      if (!q.prompt?.trim()) throw new BadRequestException(`Question ${i + 1}: missing prompt`);
      if (!Array.isArray(q.options) || q.options.length < 2) {
        throw new BadRequestException(`Question ${i + 1}: needs at least 2 options`);
      }
      if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
        throw new BadRequestException(`Question ${i + 1}: correctIndex out of range`);
      }
    });
  }
}
