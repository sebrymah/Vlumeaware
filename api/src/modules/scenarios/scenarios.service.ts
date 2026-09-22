import { Injectable, NotFoundException } from '@nestjs/common';
import type { DifficultyTier } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId, runAsSystem } from '../../common/prisma/tenant-context';
import { sanitizeHtml } from '../../common/security/sanitize-html';
import { AiAssistantService } from '../../providers/ai/ai-assistant.service';

@Injectable()
export class ScenariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiAssistantService,
  ) {}

  /**
   * Returns an unsaved draft. Nothing is persisted until an admin reviews it,
   * so a weak or off-tone generation never reaches the template library.
   */
  generateDraft(input: { industry: string; difficultyTier: DifficultyTier; context?: string }) {
    return this.ai.generateScenario({
      industry: input.industry,
      difficultyTier: input.difficultyTier,
      context: input.context,
    });
  }

  save(input: {
    title: string;
    difficultyTier: DifficultyTier;
    industryTag?: string;
    subjectLine: string;
    bodyHtml: string;
    senderSpoofName: string;
    redFlags: string[];
    createdByClaude: boolean;
  }) {
    return this.prisma.db.scenario.create({
      data: { ...input, bodyHtml: sanitizeHtml(input.bodyHtml), tenantId: currentTenantId() },
    });
  }

  list() {
    return this.prisma.db.scenario.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const scenario = await this.prisma.db.scenario.findUnique({ where: { id } });
    if (!scenario) throw new NotFoundException('Scenario not found');
    return scenario;
  }

  /** The body is re-sanitized on the way in. */
  async update(id: string, data: Partial<Parameters<ScenariosService['save']>[0]>) {
    await this.findOne(id);
    const clean = { ...data };
    if (typeof clean.bodyHtml === 'string') clean.bodyHtml = sanitizeHtml(clean.bodyHtml);
    return this.prisma.db.scenario.update({ where: { id }, data: clean });
  }

  async remove(id: string) {
    await this.findOne(id);
    const inUse = await this.prisma.db.campaignScenario.count({ where: { scenarioId: id } });
    if (inUse > 0) {
      throw new NotFoundException('Scenario is attached to a campaign and cannot be deleted');
    }
    await this.prisma.db.scenario.delete({ where: { id } });
    return { deleted: true };
  }
}
