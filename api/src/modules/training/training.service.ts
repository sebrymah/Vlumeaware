import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId } from '../../common/prisma/tenant-context';

@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);

  constructor(private readonly prisma: PrismaService) {}

  listRules() {
    return this.prisma.db.trainingRoutingRule.findMany({
      include: {
        scenario: { select: { id: true, title: true, difficultyTier: true } },
        module: { select: { id: true, title: true, videoSource: true } },
      },
    });
  }

  /** One rule per scenario, so routing is a table lookup and never per-employee. */
  async upsertRule(scenarioId: string, trainingModuleId: string) {
    const tenantId = currentTenantId();
    // Both ids are read under tenant scope, so a rule can only ever point a
    // tenant's scenario at that same tenant's module.
    const [scenario, module] = await Promise.all([
      this.prisma.db.scenario.findUnique({ where: { id: scenarioId }, select: { id: true } }),
      this.prisma.db.trainingModule.findUnique({ where: { id: trainingModuleId }, select: { id: true } }),
    ]);
    if (!scenario) throw new NotFoundException('Scenario not found');
    if (!module) throw new NotFoundException('Training module not found');
    return this.prisma.db.trainingRoutingRule.upsert({
      where: { tenantId_scenarioId: { tenantId, scenarioId } },
      create: { tenantId, scenarioId, trainingModuleId },
      update: { trainingModuleId },
    });
  }

  async deleteRule(scenarioId: string) {
    await this.prisma.db.trainingRoutingRule.deleteMany({ where: { scenarioId } });
    return { deleted: true };
  }

  /**
   * Fires when an employee clicks. Returns the assigned module, or null when
   * the tenant has no rule for that scenario yet. Idempotent: a second click
   * on the same link must not double-assign.
   */
  async assignFromClick(input: {
    employeeId: string;
    scenarioId: string;
    sendId: string;
  }): Promise<{
    trainingModuleId: string;
    moduleTitle: string;
    alreadyAssigned: boolean;
  } | null> {
    const rule = await this.prisma.db.trainingRoutingRule.findFirst({
      where: { scenarioId: input.scenarioId },
      include: { module: { select: { id: true, title: true } } },
    });
    if (!rule) {
      this.logger.warn(`No routing rule for scenario ${input.scenarioId}; no module assigned`);
      return null;
    }

    const existing = await this.prisma.db.trainingAssignment.findFirst({
      where: {
        employeeId: input.employeeId,
        trainingModuleId: rule.trainingModuleId,
        sourceSendId: input.sendId,
      },
    });
    if (existing) {
      return {
        trainingModuleId: rule.trainingModuleId,
        moduleTitle: rule.module.title,
        alreadyAssigned: true,
      };
    }

    await this.prisma.db.trainingAssignment.create({
      data: {
        tenantId: currentTenantId(),
        employeeId: input.employeeId,
        trainingModuleId: rule.trainingModuleId,
        // Snapshot the title so history survives a later rename or delete.
        curriculumModuleId: rule.module.title,
        sourceSendId: input.sendId,
      },
    });
    return {
      trainingModuleId: rule.trainingModuleId,
      moduleTitle: rule.module.title,
      alreadyAssigned: false,
    };
  }

  /**
   * Admin manually assigns a training module to an employee (e.g. someone who
   * clicked or submitted credentials). Distinct from the automatic click-routed
   * path — no source send. Skips re-assigning a module the person already has
   * outstanding.
   */
  async assignManual(employeeId: string, trainingModuleId: string) {
    const tenantId = currentTenantId();
    const [employee, module] = await Promise.all([
      this.prisma.db.employee.findUnique({ where: { id: employeeId }, select: { id: true } }),
      this.prisma.db.trainingModule.findUnique({
        where: { id: trainingModuleId },
        select: { id: true, title: true },
      }),
    ]);
    if (!employee) throw new NotFoundException('Employee not found');
    if (!module) throw new NotFoundException('Training module not found');

    const existing = await this.prisma.db.trainingAssignment.findFirst({
      where: { employeeId, trainingModuleId, completedAt: null },
    });
    if (existing) return { ...existing, alreadyAssigned: true };

    const created = await this.prisma.db.trainingAssignment.create({
      data: {
        tenantId,
        employeeId,
        trainingModuleId,
        curriculumModuleId: module.title,
        sourceSendId: null,
      },
    });
    return { ...created, alreadyAssigned: false };
  }

  listAssignments() {
    return this.prisma.db.trainingAssignment.findMany({
      orderBy: { assignedAt: 'desc' },
      include: {
        employee: { select: { id: true, name: true, email: true, department: true } },
        module: { select: { id: true, title: true, videoSource: true } },
      },
    });
  }

  async markComplete(assignmentId: string) {
    await this.prisma.db.trainingAssignment.updateMany({
      where: { id: assignmentId, completedAt: null },
      data: { completedAt: new Date() },
    });
    return this.prisma.db.trainingAssignment.findUnique({ where: { id: assignmentId } });
  }
}
