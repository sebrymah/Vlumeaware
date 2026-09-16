import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { applyDecorators, UseGuards } from '@nestjs/common';
import { ROLES } from '../auth/roles';
import type { JwtPayload } from '../auth/roles';
import { TrialService } from './trial.service';

/**
 * Blocks an action unless the tenant is an approved / full account. This is
 * what keeps a free-trial (or lapsed) self-signup out of campaign features:
 * simulations stay locked until a Vlumetech admin approves the client.
 */
@Injectable()
export class ApprovedTenantGuard implements CanActivate {
  constructor(private readonly trial: TrialService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user: JwtPayload | undefined = req.user;
    const tenantId = user?.role === ROLES.superadmin ? (req.params?.tenantId ?? req.params?.id) : user?.tenantId;
    if (!tenantId) throw new ForbiddenException('No tenant resolved');

    const access = await this.trial.access(tenantId);
    if (access.level === 'full') return true;
    if (access.level === 'trial') {
      throw new ForbiddenException(
        'This is a free-trial account. Campaigns unlock once Vlumetech approves your account.',
      );
    }
    if (access.level === 'readonly') {
      throw new ForbiddenException('Your trial has ended and is awaiting approval — read-only.');
    }
    throw new ForbiddenException(`Account is ${access.level}.`);
  }
}

export const RequiresApprovedTenant = () => applyDecorators(UseGuards(ApprovedTenantGuard));
