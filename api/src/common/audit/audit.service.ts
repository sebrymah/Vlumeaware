import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentScope, registerSystemAuditSink, runAsSystem } from '../prisma/tenant-context';

/**
 * Append-only audit trail. AuditLog is a global table (not tenant-scoped), so
 * writes go through runAsSystem. Actor identity comes from the request's async
 * scope, set by the tenant interceptor from the verified JWT.
 */
@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist the security-relevant subset of tenant-scope escapes: a human
   * superadmin reading or acting across tenants from the console. The reason
   * prefix ("superadmin ...") is set by the tenant interceptor. Machinery
   * escapes (token lookups, policy reads) and audit's own writes are logged to
   * the stream only, so this never recurses on its own `runAsSystem` calls.
   */
  onModuleInit() {
    registerSystemAuditSink((reason, actor) => {
      if (!reason.startsWith('superadmin ')) return;
      void this.record('system.cross_tenant_access', reason, undefined, actor);
    });
  }

  onModuleDestroy() {
    registerSystemAuditSink(null);
  }

  /**
   * Append one audit entry. Actor/tenant default to the request's async scope,
   * but callers that run before a scope exists (e.g. login, which authenticates
   * the actor it is about to record) may pass them explicitly.
   */
  async record(
    action: string,
    detail?: string,
    tenantId?: string,
    actor?: { actorId?: string | null; actorRole?: string | null },
  ) {
    const scope = currentScope();
    try {
      await runAsSystem('audit write', () =>
        this.prisma.db.auditLog.create({
          data: {
            tenantId: tenantId ?? scope?.tenantId ?? null,
            actorId: actor?.actorId ?? scope?.actorId ?? null,
            actorRole: actor?.actorRole ?? scope?.actorRole ?? null,
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
