import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId, runAsSystem } from '../../common/prisma/tenant-context';
import { AiAssistantService } from '../../providers/ai/ai-assistant.service';
import type { RiskAdvice } from '../../providers/ai/ai-assistant.service';
import { RiskService } from './risk.service';

export interface RiskAdviceResult extends RiskAdvice {
  /** Resolved names, so the page never has to look an id back up. */
  assignments: Array<{
    employeeId: string;
    employeeName: string;
    moduleId: string;
    moduleTitle: string;
    reason: string;
  }>;
  generatedAt: string;
}

/**
 * Turns the risk table into advice. The assistant only ever sees this
 * tenant's rows and this tenant's modules, and only ids drawn from them can
 * come back — see AiAssistantService.adviseOnRisk.
 */
@Injectable()
export class RiskAdviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly risk: RiskService,
    private readonly ai: AiAssistantService,
  ) {}

  async advise(): Promise<RiskAdviceResult> {
    const tenantId = currentTenantId();
    const [employees, modules, tenant] = await Promise.all([
      this.risk.scoreAll(),
      this.prisma.db.trainingModule.findMany({ select: { id: true, title: true } }),
      runAsSystem('risk advice: tenant name', () =>
        this.prisma.db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      ),
    ]);

    const advice = await this.ai.adviseOnRisk({
      tenantName: tenant?.name ?? 'the organisation',
      employees: employees.map((e) => ({
        id: e.employeeId,
        name: e.name,
        department: e.department,
        riskScore: e.riskScore,
        riskLevel: e.riskLevel,
        sends: e.sends,
        clicks: e.clicks,
        reports: e.reports,
        credentialSubmissions: e.credentialSubmissions,
        quizPasses: e.quizPasses,
        repeatClicker: e.repeatClicker,
      })),
      modules,
    });

    const employeeName = new Map(employees.map((e) => [e.employeeId, e.name]));
    const moduleTitle = new Map(modules.map((m) => [m.id, m.title]));

    return {
      ...advice,
      assignments: advice.assignments.map((a) => ({
        ...a,
        employeeName: employeeName.get(a.employeeId) ?? 'Unknown',
        moduleTitle: moduleTitle.get(a.moduleId) ?? 'Unknown',
      })),
      generatedAt: new Date().toISOString(),
    };
  }
}
