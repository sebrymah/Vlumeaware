import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from './roles';
import { ROLES } from './roles';
import { PrismaService } from '../prisma/prisma.service';
import { runAsSystem } from '../prisma/tenant-context';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }

  /**
   * The token is a bearer credential valid for the whole session, so on its own
   * it would keep working after an administrator withdraws access — up to eight
   * hours by default. Removing someone has to stop them now, so every
   * authenticated request re-reads the account.
   *
   * That also closes two older gaps: a deleted console user's token used to keep
   * working until expiry, and a token outlived any change to the account's role
   * or tenant. One indexed lookup by primary key is a fair price for that.
   */
  async validate(payload: JwtPayload & { typ?: string }): Promise<JwtPayload> {
    // A half-authenticated MFA challenge is not an access token.
    if (payload.typ === 'mfa') {
      throw new UnauthorizedException('MFA challenge cannot be used as an access token');
    }
    // A client-side role without a tenant binding would sidestep the tenant
    // guard, so reject the token outright rather than defaulting a tenant.
    if (payload.role !== ROLES.superadmin && !payload.tenantId) {
      throw new UnauthorizedException('Token missing tenant binding');
    }

    if (payload.role === ROLES.superadmin) {
      const staff = await runAsSystem('auth: staff session check', () =>
        this.prisma.db.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, role: true, deactivatedAt: true },
        }),
      );
      if (!staff || staff.deactivatedAt) {
        throw new UnauthorizedException('This account is no longer active');
      }
      // The row is the source of truth for staff too: a role change (or a
      // deactivation) must not be survivable by a token issued before it.
      if (staff.role !== payload.role) {
        throw new UnauthorizedException('Your access has changed. Sign in again.');
      }
      return payload;
    }

    const account = await runAsSystem('auth: console session check', () =>
      this.prisma.db.tenantUser.findUnique({
        where: { id: payload.sub },
        select: { id: true, tenantId: true, role: true, deactivatedAt: true },
      }),
    );
    if (!account || account.deactivatedAt) {
      throw new UnauthorizedException('This account is no longer active');
    }
    // The row is the source of truth: a role or tenant change must not be
    // survivable by a token issued before it.
    if (account.tenantId !== payload.tenantId || account.role !== payload.role) {
      throw new UnauthorizedException('Your access has changed. Sign in again.');
    }
    return payload;
  }
}
