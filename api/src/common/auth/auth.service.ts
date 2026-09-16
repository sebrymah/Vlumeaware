import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { runAsSystem } from '../prisma/tenant-context';
import { ROLES } from './roles';
import type { JwtPayload } from './roles';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<{ accessToken: string; role: string; tenantId?: string }> {
    const staff = await this.prisma.db.user.findUnique({ where: { email } });
    if (staff && (await bcrypt.compare(password, staff.passwordHash))) {
      return this.issue({ sub: staff.id, email: staff.email, role: ROLES.superadmin });
    }

    // Login predates any tenant context, so the lookup is explicitly system
    // scoped. It reads only the credential row it was asked for.
    const tenantUser = await runAsSystem('login: resolve tenant user by email', () =>
      this.prisma.db.tenantUser.findFirst({ where: { email } }),
    );
    if (tenantUser && (await bcrypt.compare(password, tenantUser.passwordHash))) {
      return this.issue({
        sub: tenantUser.id,
        email: tenantUser.email,
        role: tenantUser.role,
        tenantId: tenantUser.tenantId,
      });
    }

    throw new UnauthorizedException('Invalid credentials');
  }

  private issue(payload: JwtPayload) {
    return {
      accessToken: this.jwt.sign(payload),
      role: payload.role,
      tenantId: payload.tenantId,
    };
  }

  static hash(password: string) {
    return bcrypt.hash(password, 12);
  }
}
