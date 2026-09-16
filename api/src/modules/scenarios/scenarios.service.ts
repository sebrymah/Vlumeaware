import { Injectable, NotFoundException } from '@nestjs/common';
import type { DifficultyTier } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId } from '../../common/prisma/tenant-context';
import { ClaudeService } from '../../providers/claude/claude.service';

@Injectable()
export class ScenariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  /**
   * Returns an unsaved draft. Nothing is persisted until an admin reviews it,
   * so a weak or off-tone generation never reaches the template library.
   */
  generateDraft(input: { industry: string; difficultyTier: DifficultyTier; context?: string }) {
    return this.claude.generateScenario({
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
    return this.prisma.db.scenario.create({ data: { ...input, tenantId: currentTenantId() } });
  }

  list() {
    return this.prisma.db.scenario.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const scenario = await this.prisma.db.scenario.findUnique({ where: { id } });
    if (!scenario) throw new NotFoundException('Scenario not found');
    return scenario;
  }

  async update(id: string, data: Partial<Parameters<ScenariosService['save']>[0]>) {
    await this.findOne(id);
    return this.prisma.db.scenario.update({ where: { id }, data });
  }

  /** Approval is what makes a scenario attachable to a campaign. */
  async approve(id: string) {
    await this.findOne(id);
    return this.prisma.db.scenario.update({ where: { id }, data: { approvedAt: new Date() } });
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
