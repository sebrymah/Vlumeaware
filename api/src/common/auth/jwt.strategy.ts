import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from './roles';
import { ROLES } from './roles';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    // A client-side role without a tenant binding would sidestep the tenant
    // guard, so reject the token outright rather than defaulting a tenant.
    if (payload.role !== ROLES.superadmin && !payload.tenantId) {
      throw new UnauthorizedException('Token missing tenant binding');
    }
    return payload;
  }
}
