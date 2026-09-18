import { Injectable, NotFoundException } from '@nestjs/common';
import type { DifficultyTier } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId, runAsSystem } from '../../common/prisma/tenant-context';
import { sanitizeHtml } from '../../common/security/sanitize-html';
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

  /**
   * Editing a scenario clears any prior approval and re-queues it (review R2):
   * approved content is locked, so a change can never reach recipients without
   * a fresh Vlumetech review. The body is re-sanitized on the way in.
   */
  async update(id: string, data: Partial<Parameters<ScenariosService['save']>[0]>) {
    await this.findOne(id);
    const clean = { ...data };
    if (typeof clean.bodyHtml === 'string') clean.bodyHtml = sanitizeHtml(clean.bodyHtml);
    return this.prisma.db.scenario.update({
      where: { id },
      data: { ...clean, approvedAt: null },
    });
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

  // --- Vlumetech staff review queue (cross-tenant) -------------------------

  /** Every scenario across all clients that is still waiting for approval. */
  listPendingReview() {
    return runAsSystem('superadmin: scenario review queue', () =>
      this.prisma.db.scenario.findMany({
        where: { approvedAt: null },
        orderBy: { createdAt: 'asc' },
        include: { tenant: { select: { id: true, name: true } } },
      }),
    );
  }

  /** Approve any client's scenario from the staff console. */
  approveAcrossTenants(id: string) {
    return runAsSystem('superadmin: approve scenario', async () => {
      const scenario = await this.prisma.db.scenario.findUnique({ where: { id } });
      if (!scenario) throw new NotFoundException('Scenario not found');
      return this.prisma.db.scenario.update({ where: { id }, data: { approvedAt: new Date() } });
    });
  }

  /**
   * Reject a client's scenario. A scenario has no "rejected" state, so a
   * rejection removes the draft — unless it is already attached to a campaign,
   * in which case it cannot be pending anyway.
   */
  rejectAcrossTenants(id: string) {
    return runAsSystem('superadmin: reject scenario', async () => {
      const scenario = await this.prisma.db.scenario.findUnique({ where: { id } });
      if (!scenario) throw new NotFoundException('Scenario not found');
      const inUse = await this.prisma.db.campaignScenario.count({ where: { scenarioId: id } });
      if (inUse > 0) {
        throw new NotFoundException('Scenario is attached to a campaign and cannot be rejected');
      }
      await this.prisma.db.scenario.delete({ where: { id } });
      return { rejected: true };
    });
  }
}
