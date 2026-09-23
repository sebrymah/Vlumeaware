import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId } from '../../common/prisma/tenant-context';

export interface EmployeeRisk {
  employeeId: string;
  name: string;
  email: string;
  department: string | null;
  sends: number;
  clicks: number;
  reports: number;
  credentialSubmissions: number;
  quizPasses: number;
  clickRate: number;
  reportRate: number;
  riskScore: number; // 0 (safe) .. 100 (high risk)
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  repeatClicker: boolean;
  /** Exactly how the score was reached — every factor, signed, as shown to the client. */
  breakdown: Array<{ factor: string; detail: string; points: number }>;
}

/**
 * Per-employee risk, computed from their whole simulation history rather than
 * one campaign. The score rewards reporting and quiz passes and penalises
 * clicks and credential submissions, so it tracks behaviour over time — the
 * number a board actually asks for.
 */
@Injectable()
export class RiskService {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly REPEAT_CLICKER_THRESHOLD = 2;

  async scoreAll(): Promise<EmployeeRisk[]> {
    const employees = await this.prisma.db.employee.findMany({
      select: { id: true, name: true, email: true, department: true },
    });

    const rows = await Promise.all(employees.map((e) => this.scoreOne(e)));
    return rows.sort((a, b) => b.riskScore - a.riskScore);
  }

  async scoreOne(employee: {
    id: string;
    name: string;
    email: string;
    department: string | null;
  }): Promise<EmployeeRisk> {
    const [sends, clicks, reports, creds, quizPasses] = await Promise.all([
      this.prisma.db.send.count({ where: { employeeId: employee.id, sentAt: { not: null } } }),
      this.prisma.db.send.count({ where: { employeeId: employee.id, clickedAt: { not: null } } }),
      this.prisma.db.send.count({ where: { employeeId: employee.id, reportedAt: { not: null } } }),
      this.prisma.db.send.count({ where: { employeeId: employee.id, credentialsSubmitted: true } }),
      this.prisma.db.quizAttempt.count({ where: { employeeId: employee.id, passed: true } }),
    ]);

    const clickRate = sends ? clicks / sends : 0;
    const reportRate = sends ? reports / sends : 0;

    // Weighted score. Clicks and especially credential submissions raise risk;
    // reports and quiz passes lower it. Clamped to 0..100. Every term is also
    // captured in `breakdown` so the client sees exactly how the number formed.
    const submitRate = sends ? creds / sends : 0;
    const parts = {
      click: clickRate * 60,
      submit: submitRate * 40,
      repeat: Math.min(clicks, 5) * 4, // repeated clicks compound
      report: -(reportRate * 25),
      quiz: -(Math.min(quizPasses, 5) * 3),
    };
    const score = parts.click + parts.submit + parts.repeat + parts.report + parts.quiz;
    const riskScore = Math.max(0, Math.min(100, Math.round(score)));

    const breakdown: EmployeeRisk['breakdown'] = [
      { factor: 'Click rate', detail: `${clicks}/${sends} clicked × 60`, points: Math.round(parts.click) },
      { factor: 'Credentials submitted', detail: `${creds}/${sends} submitted × 40`, points: Math.round(parts.submit) },
      { factor: 'Repeat clicks', detail: `${Math.min(clicks, 5)} × 4 (capped at 5)`, points: Math.round(parts.repeat) },
      { factor: 'Reported the phish', detail: `${reports}/${sends} reported × −25`, points: Math.round(parts.report) },
      { factor: 'Quiz passes', detail: `${Math.min(quizPasses, 5)} × 3 (capped at 5)`, points: Math.round(parts.quiz) },
    ];

    const riskLevel: EmployeeRisk['riskLevel'] =
      riskScore >= 75 ? 'critical' : riskScore >= 50 ? 'high' : riskScore >= 25 ? 'moderate' : 'low';

    return {
      employeeId: employee.id,
      name: employee.name,
      email: employee.email,
      department: employee.department,
      sends,
      clicks,
      reports,
      credentialSubmissions: creds,
      quizPasses,
      clickRate,
      reportRate,
      riskScore,
      riskLevel,
      repeatClicker: clicks >= RiskService.REPEAT_CLICKER_THRESHOLD,
      breakdown,
    };
  }

  /** Employees who clicked in two or more simulations — the remediation list. */
  async repeatClickers(): Promise<EmployeeRisk[]> {
    return (await this.scoreAll()).filter((e) => e.repeatClicker);
  }

  /**
   * Auto-enrols every repeat clicker into a remediation module by creating a
   * training assignment (idempotent per employee+module). Returns who was
   * newly enrolled.
   */
  async autoEnrolRepeatClickers(trainingModuleId: string) {
    const module = await this.prisma.db.trainingModule.findUnique({
      where: { id: trainingModuleId },
      select: { id: true, title: true },
    });
    if (!module) throw new Error('Training module not found');

    const clickers = await this.repeatClickers();
    const enrolled: string[] = [];

    for (const employee of clickers) {
      const existing = await this.prisma.db.trainingAssignment.findFirst({
        where: {
          employeeId: employee.employeeId,
          trainingModuleId: module.id,
          sourceSendId: null,
        },
      });
      if (existing) continue;
      await this.prisma.db.trainingAssignment.create({
        data: {
          tenantId: currentTenantId(),
          employeeId: employee.employeeId,
          trainingModuleId: module.id,
          curriculumModuleId: module.title,
          sourceSendId: null,
        },
      });
      enrolled.push(employee.employeeId);
    }
    return { moduleId: module.id, repeatClickers: clickers.length, newlyEnrolled: enrolled.length };
  }
}
