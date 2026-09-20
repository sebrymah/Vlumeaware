import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId, runAsSystem } from '../../common/prisma/tenant-context';
import { AiAssistantService } from '../../providers/ai/ai-assistant.service';
import type { RiskAdvice } from '../../providers/ai/ai-assistant.service';
import { RiskService } from './risk.service';
import type { EmployeeRisk } from './risk.service';
import { renderRiskReportPdf } from './risk-report-pdf';

/** The advice shape a caller may hand back for inclusion in the PDF. */
export interface RiskReportAdvice {
  summary: string;
  actions: string[];
  assignments: Array<{ employeeName: string; moduleTitle: string; reason: string }>;
}

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

  /** The risk table as a CSV file. */
  async csv(): Promise<string> {
    return riskCsv(await this.risk.scoreAll());
  }

  /**
   * The full report as a PDF: the table, and the recommendation when the
   * caller passes back one it has already generated. The advice is not
   * regenerated here — that would bill a second AI call for a download, and
   * would risk the document disagreeing with what the admin read on screen.
   */
  async pdf(advice?: RiskReportAdvice | null): Promise<Buffer> {
    // Read the tenant id before entering system scope. Inside runAsSystem
    // there is no tenant in the async context and currentTenantId() throws.
    const tenantId = currentTenantId();
    const [employees, tenant] = await Promise.all([
      this.risk.scoreAll(),
      runAsSystem('risk report: tenant name', () =>
        this.prisma.db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      ),
    ]);
    return renderRiskReportPdf({
      tenantName: tenant?.name ?? 'Organisation',
      employees,
      advice: advice ?? null,
      generatedAt: new Date(),
    });
  }

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

/** The risk table as CSV, following the campaign export's shape. */
export function riskCsv(employees: EmployeeRisk[]): string {
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const lines = [
    [
      'Employee', 'Email', 'Department', 'Risk score', 'Risk level',
      'Simulations sent', 'Clicks', 'Click rate', 'Reported', 'Report rate',
      'Credential submissions', 'Quiz passes', 'Repeat clicker',
    ]
      .map(esc)
      .join(','),
  ];
  for (const e of employees) {
    lines.push(
      [
        esc(e.name),
        esc(e.email),
        esc(e.department ?? ''),
        esc(e.riskScore),
        esc(e.riskLevel),
        esc(e.sends),
        esc(e.clicks),
        esc(pct(e.clickRate)),
        esc(e.reports),
        esc(pct(e.reportRate)),
        esc(e.credentialSubmissions),
        esc(e.quizPasses),
        esc(e.repeatClicker ? 'yes' : 'no'),
      ].join(','),
    );
  }
  return lines.join('\n');
}
