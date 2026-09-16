import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId, runAsSystem } from '../../common/prisma/tenant-context';
import { ClaudeService } from '../../providers/claude/claude.service';

export interface CampaignMetrics {
  campaignId: string;
  campaignName: string;
  status: string;
  totalRecipients: number;
  totalSent: number;
  opened: number;
  clicked: number;
  reported: number;
  credentialsSubmitted: number;
  submissionAnalytics: {
    submissions: number;
    avgPasswordLength: number | null;
    emailShapedUsernameRate: number | null;
    medianTimeToSubmitMs: number | null;
  };
  openRate: number;
  clickRate: number;
  reportRate: number;
  byDepartment: Array<{ department: string; sent: number; clicked: number; clickRate: number }>;
  trainingAssigned: number;
  trainingCompleted: number;
  quiz: {
    attempts: number;
    passed: number;
    passRate: number | null;
    avgScorePct: number | null;
  };
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  /** Aggregate metrics. Rates are over delivered sends, not over the roster. */
  async metrics(campaignId: string): Promise<CampaignMetrics> {
    const campaign = await this.prisma.db.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const sends = await this.prisma.db.send.findMany({
      where: { campaignId },
      select: {
        sentAt: true,
        openedAt: true,
        clickedAt: true,
        reportedAt: true,
        credentialsSubmitted: true,
        employee: { select: { department: true } },
      },
    });

    const delivered = sends.filter((s) => s.sentAt !== null);
    const totalSent = delivered.length;
    const opened = delivered.filter((s) => s.openedAt).length;
    const clicked = delivered.filter((s) => s.clickedAt).length;
    const reported = delivered.filter((s) => s.reportedAt).length;
    const credentialsSubmitted = delivered.filter((s) => s.credentialsSubmitted).length;

    // Submission analytics from the metadata-only capture. No secret is stored;
    // these are the non-reversible signals a board report can use.
    const submissions = await this.prisma.db.credentialSubmission.findMany({
      where: { send: { campaignId } },
      select: { passwordLength: true, usernameLooksLikeEmail: true, timeToSubmitMs: true },
    });
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const median = (xs: number[]) => {
      if (!xs.length) return null;
      const sorted = [...xs].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    };
    const pwLengths = submissions.map((x) => x.passwordLength).filter((n): n is number => n != null);
    const emailShaped = submissions.filter((x) => x.usernameLooksLikeEmail != null);
    const times = submissions.map((x) => x.timeToSubmitMs).filter((n): n is number => n != null);
    const submissionAnalytics = {
      submissions: submissions.length,
      avgPasswordLength: avg(pwLengths),
      emailShapedUsernameRate: emailShaped.length
        ? emailShaped.filter((x) => x.usernameLooksLikeEmail).length / emailShaped.length
        : null,
      medianTimeToSubmitMs: median(times),
    };

    const departments = new Map<string, { sent: number; clicked: number }>();
    for (const send of delivered) {
      const key = send.employee.department?.trim() || 'Unassigned';
      const bucket = departments.get(key) ?? { sent: 0, clicked: 0 };
      bucket.sent += 1;
      if (send.clickedAt) bucket.clicked += 1;
      departments.set(key, bucket);
    }

    const [trainingAssigned, trainingCompleted] = await Promise.all([
      this.prisma.db.trainingAssignment.count({ where: { sourceSend: { campaignId } } }),
      this.prisma.db.trainingAssignment.count({
        where: { sourceSend: { campaignId }, completedAt: { not: null } },
      }),
    ]);

    const attempts = await this.prisma.db.quizAttempt.findMany({
      where: { sourceSend: { campaignId } },
      select: { passed: true, score: true, total: true },
    });
    const passedCount = attempts.filter((a) => a.passed).length;
    const avgScorePct = attempts.length
      ? attempts.reduce((sum, a) => sum + (a.total ? a.score / a.total : 0), 0) / attempts.length
      : null;
    const quiz = {
      attempts: attempts.length,
      passed: passedCount,
      passRate: attempts.length ? passedCount / attempts.length : null,
      avgScorePct,
    };

    const rate = (n: number) => (totalSent ? n / totalSent : 0);

    return {
      campaignId,
      campaignName: campaign.name,
      status: campaign.status,
      totalRecipients: sends.length,
      totalSent,
      opened,
      clicked,
      reported,
      credentialsSubmitted,
      submissionAnalytics,
      openRate: rate(opened),
      clickRate: rate(clicked),
      reportRate: rate(reported),
      byDepartment: [...departments.entries()]
        .map(([department, v]) => ({
          department,
          sent: v.sent,
          clicked: v.clicked,
          clickRate: v.sent ? v.clicked / v.sent : 0,
        }))
        .sort((a, b) => b.clickRate - a.clickRate),
      trainingAssigned,
      trainingCompleted,
      quiz,
    };
  }

  /**
   * Generates and stores the board-report narrative. Metrics are always
   * returned; if Claude is unavailable the record is still written with an
   * empty narrative so the dashboard is never blocked on the API.
   */
  async generate(campaignId: string) {
    const metrics = await this.metrics(campaignId);
    const tenantId = currentTenantId();

    const tenant = await runAsSystem('report: read tenant name', () =>
      this.prisma.db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    );

    const previous = await this.prisma.db.report.findFirst({
      where: { campaignId: { not: campaignId } },
      orderBy: { generatedAt: 'desc' },
      select: { clickRate: true },
    });

    let narrative = '';
    if (this.claude.available) {
      try {
        narrative = await this.claude.generateReportNarrative({
          tenantName: tenant?.name ?? 'Client',
          campaignName: metrics.campaignName,
          totalSent: metrics.totalSent,
          openRate: metrics.openRate,
          clickRate: metrics.clickRate,
          reportRate: metrics.reportRate,
          credentialSubmissionCount: metrics.credentialsSubmitted,
          emailShapedUsernameRate: metrics.submissionAnalytics.emailShapedUsernameRate,
          previousClickRate: previous?.clickRate ?? null,
          topDepartments: metrics.byDepartment.slice(0, 8),
        });
      } catch (err) {
        this.logger.error(`Narrative generation failed: ${(err as Error).message}`);
      }
    } else {
      this.logger.warn('ANTHROPIC_API_KEY unset; storing report without narrative');
    }

    const report = await this.prisma.db.report.create({
      data: {
        tenantId,
        campaignId,
        generatedNarrative: narrative,
        clickRate: metrics.clickRate,
        reportRate: metrics.reportRate,
        openRate: metrics.openRate,
      },
    });

    return { ...report, metrics };
  }

  /** Dashboard payload: live metrics plus the most recent stored narrative. */
  async dashboard(campaignId: string) {
    const metrics = await this.metrics(campaignId);
    const latest = await this.prisma.db.report.findFirst({
      where: { campaignId },
      orderBy: { generatedAt: 'desc' },
    });
    return { metrics, narrative: latest?.generatedNarrative ?? null, generatedAt: latest?.generatedAt ?? null };
  }

  /** A campaign report as CSV rows (summary + per-department breakdown). */
  async exportCsv(campaignId: string): Promise<string> {
    const m = await this.metrics(campaignId);
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
    const lines: string[] = [];
    lines.push('Section,Metric,Value');
    lines.push(`${esc('Summary')},${esc('Campaign')},${esc(m.campaignName)}`);
    lines.push(`${esc('Summary')},${esc('Status')},${esc(m.status)}`);
    lines.push(`${esc('Summary')},${esc('Delivered')},${esc(m.totalSent)}`);
    lines.push(`${esc('Summary')},${esc('Open rate')},${esc(pct(m.openRate))}`);
    lines.push(`${esc('Summary')},${esc('Click rate')},${esc(pct(m.clickRate))}`);
    lines.push(`${esc('Summary')},${esc('Report rate')},${esc(pct(m.reportRate))}`);
    lines.push(`${esc('Summary')},${esc('Credential submissions')},${esc(m.credentialsSubmitted)}`);
    lines.push(`${esc('Summary')},${esc('Training assigned')},${esc(m.trainingAssigned)}`);
    lines.push(`${esc('Summary')},${esc('Training completed')},${esc(m.trainingCompleted)}`);
    lines.push(`${esc('Summary')},${esc('Quiz pass rate')},${esc(m.quiz.passRate != null ? pct(m.quiz.passRate) : 'n/a')}`);
    lines.push('');
    lines.push('Department,Recipients,Clicked,Click rate');
    for (const d of m.byDepartment) {
      lines.push(`${esc(d.department)},${esc(d.sent)},${esc(d.clicked)},${esc(pct(d.clickRate))}`);
    }
    return lines.join('\n');
  }

  /** Click-rate trend across the tenant's campaigns, oldest first. */
  async trend() {
    const campaigns = await this.prisma.db.campaign.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, createdAt: true, status: true },
    });
    return Promise.all(
      campaigns.map(async (campaign) => {
        const m = await this.metrics(campaign.id);
        return {
          campaignId: campaign.id,
          name: campaign.name,
          createdAt: campaign.createdAt,
          status: campaign.status,
          clickRate: m.clickRate,
          reportRate: m.reportRate,
          totalSent: m.totalSent,
        };
      }),
    );
  }
}
