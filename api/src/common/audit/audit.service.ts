import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentScope, runAsSystem } from '../prisma/tenant-context';

/**
 * Append-only audit trail. AuditLog is a global table (not tenant-scoped), so
 * writes go through runAsSystem. Actor identity comes from the request's async
 * scope, set by the tenant interceptor from the verified JWT.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(action: string, detail?: string, tenantId?: string) {
    const scope = currentScope();
    try {
      await runAsSystem('audit write', () =>
        this.prisma.db.auditLog.create({
          data: {
            tenantId: tenantId ?? scope?.tenantId ?? null,
            actorId: scope?.actorId ?? null,
            actorRole: scope?.actorRole ?? null,
            action,
            detail: detail ?? null,
          },
        }),
      );
    } catch (err) {
      // Never let an audit failure break the action it describes.
      this.logger.error(`Audit write failed for ${action}: ${(err as Error).message}`);
    }
  }

  /** Cross-tenant read for the Vlumetech super-admin console. */
  list(filter: { tenantId?: string; action?: string; limit?: number }) {
    return runAsSystem('audit read', () =>
      this.prisma.db.auditLog.findMany({
        where: { tenantId: filter.tenantId, action: filter.action },
        orderBy: { createdAt: 'desc' },
        take: Math.min(filter.limit ?? 200, 1000),
      }),
    );
  }
}
