import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { runAsSystemSync, runInTenantSync } from '../prisma/tenant-context';
import { ROLES } from './roles';
import type { JwtPayload } from './roles';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opens the tenant async context for the whole request, from the verified JWT
 * rather than from anything the caller can set. A `:tenantId` route param is
 * checked against the token, so a client_admin cannot address another tenant's
 * data by editing the URL.
 */
@Injectable()
export class TenantScopeInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const user: JwtPayload | undefined = req.user;

    // Public routes (the tracking endpoints) resolve their own tenant from the
    // opaque token they were handed.
    if (!user) return next.handle();

    const actor = { actorId: user.sub, actorRole: user.role };
    const param = req.params?.tenantId ?? req.params?.id;
    const addressed = typeof param === 'string' && UUID.test(param) ? param : null;

    if (user.role === ROLES.superadmin) {
      // Scope Vlumetech staff down to the tenant they addressed where the
      // route names one; fall back to system scope only for the genuinely
      // cross-tenant console routes.
      return addressed
        ? this.scoped((fn) => runInTenantSync(addressed, fn, actor), next)
        : this.scoped(
            (fn) => runAsSystemSync(`superadmin ${req.method} ${req.url}`, fn, actor),
            next,
          );
    }

    if (!user.tenantId) throw new ForbiddenException('Token missing tenant binding');
    if (addressed && addressed !== user.tenantId) {
      throw new ForbiddenException('Tenant mismatch');
    }

    const tenantId = user.tenantId;
    return this.scoped((fn) => runInTenantSync(tenantId, fn, actor), next);
  }

  /**
   * Subscribes to the handler *inside* the async scope. Returning
   * `runInTenant(..., () => next.handle())` would not work: Nest subscribes to
   * that Observable after the interceptor returns, by which point the scope has
   * been popped and the handler would run unscoped.
   */
  private scoped(
    enter: <T>(fn: () => T) => T,
    next: CallHandler,
  ): Observable<unknown> {
    return new Observable((subscriber) => {
      const subscription = enter(() => next.handle().subscribe(subscriber));
      return () => subscription.unsubscribe();
    });
  }
}
