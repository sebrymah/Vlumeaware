import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { runAsSystem, runInTenant } from '../../common/prisma/tenant-context';
import { MAILER } from '../../providers/mailer/mailer.interface';
import type { Mailer } from '../../providers/mailer/mailer.interface';
import { notificationFromAddress } from '../../providers/mailer/from-addresses';
import { publicBaseUrl } from '../tracking/render';
import { TrainingModulesService } from '../training-modules/training-modules.service';
import { escapeHtml } from '../../common/html/escape';

const PORTAL_TOKEN_TTL_MS = 30 * 86_400_000; // 30 days

/**
 * The employee self-service portal. Employees have no password, so they reach
 * their own dashboard — courses, certificates and simulation history — through
 * a time-limited magic link emailed to their address, mirroring the token model
 * the standalone /learn page already uses.
 */
@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly modules: TrainingModulesService,
  ) {}

  private newToken() {
    return randomBytes(24).toString('base64url');
  }

  /**
   * Emails a sign-in link to every employee row with this address (an address
   * can belong to more than one client). Always resolves the same way whether
   * or not a match was found, so the endpoint cannot be used to discover which
   * emails are enrolled.
   */
  async requestLink(rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    const employees = await runAsSystem('portal: find by email', () =>
      this.prisma.db.employee.findMany({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true, tenantId: true, name: true, email: true },
      }),
    );

    for (const emp of employees) {
      const token = this.newToken();
      await runAsSystem('portal: issue token', () =>
        this.prisma.db.employee.update({
          where: { id: emp.id },
          data: { portalToken: token, portalTokenExpiresAt: new Date(Date.now() + PORTAL_TOKEN_TTL_MS) },
        }),
      );
      const tenant = await runAsSystem('portal: tenant name', () =>
        this.prisma.db.tenant.findUnique({ where: { id: emp.tenantId }, select: { name: true } }),
      );
      const link = `${publicBaseUrl()}/portal/${token}`;
      try {
        await this.mailer.send({
          to: emp.email,
          fromName: `${tenant?.name ?? 'Security Awareness'} Training`,
          fromAddress: notificationFromAddress(),
          subject: 'Your training dashboard sign-in link',
          html:
            `<p>Hi ${escapeHtml(emp.name)},</p>` +
            `<p>Here is your secure link to your security-awareness dashboard — your assigned ` +
            `courses, certificates and history:</p>` +
            `<p><a href="${link}">Open my dashboard</a></p>` +
            `<p>The link works for 30 days. If you did not request it, you can ignore this email.</p>`,
          sendId: `portal-${token.slice(0, 12)}`,
        });
      } catch (err) {
        this.logger.warn(`Portal link email failed for ${emp.id}: ${(err as Error).message}`);
      }
    }
  }

  private async resolveToken(token: string) {
    const emp = await runAsSystem('portal: resolve token', () =>
      this.prisma.db.employee.findUnique({
        where: { portalToken: token },
        select: { id: true, tenantId: true, name: true, email: true, department: true, portalTokenExpiresAt: true },
      }),
    );
    if (!emp || !emp.portalTokenExpiresAt || emp.portalTokenExpiresAt.getTime() < Date.now()) {
      throw new NotFoundException('This link is invalid or has expired. Request a new one.');
    }
    return emp;
  }

  /** Everything the dashboard shows, resolved from the magic-link token. */
  async summary(token: string) {
    const emp = await this.resolveToken(token);

    return runInTenant(emp.tenantId, async () => {
      const tenant = await runAsSystem('portal: tenant', () =>
        this.prisma.db.tenant.findUnique({ where: { id: emp.tenantId }, select: { name: true } }),
      );

      const [assignments, certificates, sends] = await Promise.all([
        this.prisma.db.trainingAssignment.findMany({
          where: { employeeId: emp.id },
          orderBy: { assignedAt: 'desc' },
          select: {
            id: true,
            curriculumModuleId: true,
            assignedAt: true,
            completedAt: true,
            accessToken: true,
            module: { select: { id: true, title: true, videoUrl: true, videoSource: true, durationSeconds: true } },
          },
        }),
        this.prisma.db.certificate.findMany({
          where: { employeeId: emp.id },
          orderBy: { issuedAt: 'desc' },
          select: { serial: true, moduleTitle: true, quizTitle: true, scorePct: true, issuedAt: true },
        }),
        this.prisma.db.send.findMany({
          where: { employeeId: emp.id, sentAt: { not: null } },
          orderBy: { sentAt: 'desc' },
          select: {
            id: true,
            scenarioId: true,
            sentAt: true,
            clickedAt: true,
            reportedAt: true,
            credentialsSubmitted: true,
          },
        }),
      ]);

      // Send has no scenario relation, so resolve the subjects in one query.
      const scenarioIds = [...new Set(sends.map((s) => s.scenarioId))];
      const scenarios = scenarioIds.length
        ? await this.prisma.db.scenario.findMany({
            where: { id: { in: scenarioIds } },
            select: { id: true, subjectLine: true, senderSpoofName: true },
          })
        : [];
      const scenarioById = new Map(scenarios.map((s) => [s.id, s]));

      const training = await Promise.all(
        assignments.map(async (a) => ({
          id: a.id,
          title: a.module?.title ?? a.curriculumModuleId,
          assignedAt: a.assignedAt,
          completedAt: a.completedAt,
          durationSeconds: a.module?.durationSeconds ?? null,
          // Signed, time-limited URL so the employee can rewatch in place.
          videoUrl: a.module ? await this.modules.playableUrl(a.module) : null,
        })),
      );

      return {
        employee: { name: emp.name, email: emp.email, department: emp.department, tenant: tenant?.name ?? '' },
        training,
        certificates: certificates.map((c) => ({
          ...c,
          verifyUrl: `${publicBaseUrl()}/verify/${encodeURIComponent(c.serial)}`,
        })),
        history: sends.map((s) => ({
          id: s.id,
          subject: scenarioById.get(s.scenarioId)?.subjectLine ?? 'Simulated email',
          sender: scenarioById.get(s.scenarioId)?.senderSpoofName ?? '',
          sentAt: s.sentAt,
          outcome: s.reportedAt && !s.clickedAt
            ? 'reported'
            : s.credentialsSubmitted
              ? 'submitted'
              : s.clickedAt
                ? 'clicked'
                : 'no action',
        })),
      };
    });
  }
}
