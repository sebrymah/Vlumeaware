import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { runAsSystem } from '../../common/prisma/tenant-context';
import type { QuestionInput } from '../quizzes/quizzes.service';

export interface SharedQuizInput {
  title: string;
  category?: string;
  passingScorePct?: number;
  source?: string;
  questions: QuestionInput[];
}

/**
 * The shared, GLOBAL quiz library. Managed by Vlumetech staff and readable by
 * every client, mirroring SharedModulesService. Reads/writes run under
 * runAsSystem because shared_quizzes has no tenant_id.
 */
@Injectable()
export class SharedQuizzesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return runAsSystem('browse shared quiz library', () =>
      this.prisma.db.sharedQuiz.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }

  async findOne(id: string) {
    const quiz = await runAsSystem('read shared quiz', () =>
      this.prisma.db.sharedQuiz.findUnique({ where: { id } }),
    );
    if (!quiz) throw new NotFoundException('Shared quiz not found');
    return quiz;
  }

  create(input: SharedQuizInput) {
    this.validateQuestions(input.questions);
    return runAsSystem('create shared quiz', () =>
      this.prisma.db.sharedQuiz.create({
        data: {
          title: input.title,
          category: input.category,
          passingScorePct: input.passingScorePct ?? 80,
          source: input.source,
          questions: input.questions as unknown as object,
        },
      }),
    );
  }

  async update(id: string, data: Partial<Omit<SharedQuizInput, 'questions'>> & { questions?: QuestionInput[] }) {
    await this.findOne(id);
    if (data.questions) this.validateQuestions(data.questions);
    return runAsSystem('update shared quiz', () =>
      this.prisma.db.sharedQuiz.update({
        where: { id },
        data: {
          title: data.title,
          category: data.category,
          passingScorePct: data.passingScorePct,
          source: data.source,
          questions: data.questions ? (data.questions as unknown as object) : undefined,
        },
      }),
    );
  }

  async remove(id: string) {
    await this.findOne(id);
    await runAsSystem('delete shared quiz', () =>
      this.prisma.db.sharedQuiz.delete({ where: { id } }),
    );
    return { deleted: true };
  }

  private validateQuestions(questions: QuestionInput[]) {
    if (!questions?.length) throw new BadRequestException('A quiz needs at least one question');
    questions.forEach((q, i) => {
      if (!q.prompt || q.prompt.trim().length < 3) {
        throw new BadRequestException(`Question ${i + 1}: prompt is too short`);
      }
      if (!Array.isArray(q.options) || q.options.length < 2) {
        throw new BadRequestException(`Question ${i + 1}: needs at least 2 options`);
      }
      if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
        throw new BadRequestException(`Question ${i + 1}: correctIndex is out of range`);
      }
    });
  }
}
