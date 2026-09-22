import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { runAsSystem } from '../prisma/tenant-context';
import { ROLES } from '../auth/roles';
import type { JwtPayload } from '../auth/roles';

/**
 * NDPA consent gate (context doc §12). Any route it protects is refused until
 * the tenant's authorization agreement is on file. The UI also hides the
 * action, but the server is the gate that matters — the legal exposure is real.
 */
@Injectable()
export class ConsentGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user: JwtPayload | undefined = req.user;
    if (!user) throw new ForbiddenException('Authentication required');

    const tenantId =
      user.role === ROLES.superadmin ? (req.params?.tenantId ?? req.params?.id) : user.tenantId;
    if (!tenantId) throw new ForbiddenException('No tenant resolved for consent check');

    // `tenants` is not a tenant-scoped model, but the read happens inside the
    // request's tenant context, so it is fetched explicitly by id.
    const tenant = await runAsSystem('consent gate: read tenant agreement state', () =>
      this.prisma.db.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, status: true, ndpaAgreementSignedAt: true },
      }),
    );

    if (!tenant) throw new ForbiddenException('Unknown tenant');
    if (tenant.status !== 'active') {
      throw new ForbiddenException(`Tenant is ${tenant.status}`);
    }
    if (!tenant.ndpaAgreementSignedAt) {
      throw new ForbiddenException(
        'Blocked: this tenant has not accepted the authorization agreement.',
      );
    }
    return true;
  }
}
