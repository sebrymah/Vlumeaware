import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId, runAsSystem, runInTenant } from '../../common/prisma/tenant-context';

/**
 * Ingests REAL phishing emails employees forward to the monitored intake
 * address (the v1 report-a-phish path from the context doc). The reporter is
 * matched to an employee by email address across tenants; if the forwarded
 * message carries one of our simulation tracking tokens, it is flagged as a
 * simulation so a reported simulation is not miscounted as a live threat.
 */
@Injectable()
export class IntakeService {
  private readonly logger = new Logger(IntakeService.name);
  private static readonly TOKEN_RE = /\/track\/(?:click|open)\/([A-Za-z0-9_-]{20,})/;

  constructor(private readonly prisma: PrismaService) {}

  async ingest(input: {
    reporterEmail: string;
    subject?: string;
    sender?: string;
    rawBody?: string;
  }) {
    const reporter = input.reporterEmail.trim().toLowerCase();

    // Resolve which tenant this reporter belongs to (system-scoped lookup).
    const employee = await runAsSystem('intake: match reporter to employee', () =>
      this.prisma.db.employee.findFirst({
        where: { email: reporter },
        select: { id: true, tenantId: true },
      }),
    );

    if (!employee) {
      this.logger.warn(`Phish report from unknown reporter ${reporter}; not recorded`);
      return { recorded: false, reason: 'reporter not recognised' };
    }

    // Did they forward one of our own simulations?
    let matchedSendId: string | null = null;
    let matchedSimulation = false;
    const tokenMatch = input.rawBody?.match(IntakeService.TOKEN_RE);
    if (tokenMatch) {
      const send = await runAsSystem('intake: resolve token in forwarded mail', () =>
        this.prisma.db.send.findUnique({
          where: { uniqueTrackingToken: tokenMatch[1] },
          select: { id: true, tenantId: true },
        }),
      );
      if (send && send.tenantId === employee.tenantId) {
        matchedSendId = send.id;
        matchedSimulation = true;
      }
    }

    const report = await runInTenant(employee.tenantId, () =>
      this.prisma.db.phishReport.create({
        data: {
          tenantId: employee.tenantId,
          employeeId: employee.id,
          reporterEmail: reporter,
          subject: input.subject,
          sender: input.sender,
          matchedSimulation,
          matchedSendId,
        },
      }),
    );

    // A forwarded simulation still counts as a correct catch: credit the report
    // on the send if it was not already clicked.
    if (matchedSimulation && matchedSendId) {
      await runInTenant(employee.tenantId, () =>
        this.prisma.db.send.updateMany({
          where: { id: matchedSendId, reportedAt: null, clickedAt: null },
          data: { reportedAt: new Date() },
        }),
      );
    }

    return { recorded: true, reportId: report.id, matchedSimulation };
  }

  list(tenantId: string) {
    return runInTenant(tenantId, () =>
      this.prisma.db.phishReport.findMany({
        orderBy: { createdAt: 'desc' },
        include: { employee: { select: { name: true, email: true, department: true } } },
      }),
    );
  }
}
