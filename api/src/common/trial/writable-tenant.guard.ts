import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { applyDecorators, UseGuards } from '@nestjs/common';
import { ROLES } from '../auth/roles';
import type { JwtPayload } from '../auth/roles';
import { TrialService } from './trial.service';

/**
 * Blocks writes when a tenant is read-only (a lapsed, unapproved trial) or
 * suspended/offboarded. Trial and full accounts may write — a trial client can
 * still set up (add employees, author content); they just cannot run campaigns
 * (that is the ApprovedTenantGuard's job).
 */
@Injectable()
export class WritableTenantGuard implements CanActivate {
  constructor(private readonly trial: TrialService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user: JwtPayload | undefined = req.user;
    // Staff act cross-tenant and are never trial-gated.
    if (user?.role === ROLES.superadmin) return true;
    const tenantId = user?.tenantId;
    if (!tenantId) throw new ForbiddenException('No tenant resolved');

    const access = await this.trial.access(tenantId);
    if (access.level === 'full' || access.level === 'trial') return true;
    if (access.level === 'readonly') {
      throw new ForbiddenException(
        'Your free trial has ended and is awaiting Vlumetech approval — the account is read-only.',
      );
    }
    throw new ForbiddenException(`Account is ${access.level}.`);
  }
}

export const RequiresWritableTenant = () => applyDecorators(UseGuards(WritableTenantGuard));
