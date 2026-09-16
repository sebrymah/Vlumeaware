import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import type { JwtPayload, Role } from './roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const user: JwtPayload | undefined = ctx.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('Authentication required');
    if (!required.includes(user.role)) {
      throw new ForbiddenException(`Role ${user.role} may not perform this action`);
    }
    return true;
  }
}
