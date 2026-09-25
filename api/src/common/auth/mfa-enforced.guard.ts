import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { runAsSystem } from '../prisma/tenant-context';
import { ROLES } from '../auth/roles';
import type { JwtPayload } from '../auth/roles';

/** Marks the few routes an un-enrolled account must still be able to reach. */
export const ALLOW_UNENROLLED_MFA_KEY = 'vlumeaware:allow-unenrolled-mfa';
export const AllowUnenrolledMfa = () => SetMetadata(ALLOW_UNENROLLED_MFA_KEY, true);

/**
 * Refuses API access to an account that must have MFA but has not enrolled.
 *
 * Before this existed, "mandatory MFA" was a flag in the login response that
 * only the web console acted on: it redirected the user to the enrolment
 * screen, while the API happily issued a full access token and accepted it.
 * Anyone holding a staff password could therefore ignore the console and call
 * the API directly. This is the server-side enforcement.
 *
 * Grandfathering lives in the data, not in this guard: `mfaRequired` defaults
 * to true and the migration that introduced it backfilled existing accounts to
 * false, so switching enforcement on cannot lock out a user who was already
 * there. Accounts created from now on are covered automatically.
 *
 * The check is a primary-key read per authenticated request. That is deliberate
 * — putting the flag in the JWT would leave a user who enrols mid-session
 * carrying a stale token that still looks un-enrolled.
 */
@Injectable()
export class MfaEnforcedGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const user: JwtPayload | undefined = ctx.switchToHttp().getRequest().user;
    // Public routes and the MFA challenge flow carry no usable identity yet.
    if (!user) return true;

    const exempt = this.reflector.getAllAndOverride<boolean>(ALLOW_UNENROLLED_MFA_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (exempt) return true;

    const state = await this.enrolmentState(user);
    if (!state) return true; // unknown account — other layers decide what to do
    if (state.mfaEnabledAt || !state.mfaRequired) return true;

    throw new ForbiddenException(
      'Multi-factor authentication must be set up on this account before it can be used. ' +
        'Open Security in your console to enrol.',
    );
  }

  private async enrolmentState(
    user: JwtPayload,
  ): Promise<{ mfaRequired: boolean; mfaEnabledAt: Date | null } | null> {
    if (user.role === ROLES.superadmin) {
      return this.prisma.db.user.findUnique({
        where: { id: user.sub },
        select: { mfaRequired: true, mfaEnabledAt: true },
      });
    }
    // A client user has no tenant in scope during a guard (the interceptor runs
    // after guards), so the row is read explicitly by id.
    return runAsSystem('mfa enforcement: read client user enrolment', () =>
      this.prisma.db.tenantUser.findUnique({
        where: { id: user.sub },
        select: { mfaRequired: true, mfaEnabledAt: true },
      }),
    );
  }
}
