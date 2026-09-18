import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { runAsSystem } from '../prisma/tenant-context';
import { ROLES } from './roles';
import type { JwtPayload } from './roles';
import { generateSecret, otpauthUrl, verifyTotp } from './totp';

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

export interface LoginResult {
  accessToken?: string;
  role?: string;
  tenantId?: string;
  /** Set when the account has MFA active: exchange `mfaChallenge` + a code at /auth/mfa/verify. */
  mfaRequired?: boolean;
  mfaChallenge?: string;
  /** Set when a signed-in superadmin must still enrol in MFA (mandatory for staff). */
  mfaEnrollmentRequired?: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const staff = await this.prisma.db.user.findUnique({ where: { email } });
    if (staff) {
      this.assertNotLocked(staff.lockedUntil);
      if (!(await bcrypt.compare(password, staff.passwordHash))) {
        await this.recordStaffFailure(staff.id, staff.failedLoginCount);
        throw new UnauthorizedException('Invalid credentials');
      }
      await this.resetStaffFailures(staff.id);

      // MFA active → hand back a short-lived challenge instead of an access token.
      if (staff.mfaEnabledAt) {
        return {
          mfaRequired: true,
          mfaChallenge: this.jwt.sign({ sub: staff.id, typ: 'mfa' }, { expiresIn: '5m' }),
        };
      }
      // No MFA yet: staff may sign in, but the console must force enrolment.
      return {
        ...this.issue({ sub: staff.id, email: staff.email, role: ROLES.superadmin }),
        mfaEnrollmentRequired: true,
      };
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

  /** Second factor: exchange the login challenge + a TOTP code for an access token. */
  async verifyMfa(challenge: string, code: string): Promise<LoginResult> {
    let sub: string;
    try {
      const payload = this.jwt.verify<{ sub: string; typ?: string }>(challenge);
      if (payload.typ !== 'mfa') throw new Error('wrong token type');
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException('MFA session expired — sign in again');
    }
    const staff = await this.prisma.db.user.findUnique({ where: { id: sub } });
    if (!staff || !staff.mfaSecret || !staff.mfaEnabledAt) {
      throw new UnauthorizedException('MFA is not set up for this account');
    }
    this.assertNotLocked(staff.lockedUntil);
    if (!verifyTotp(staff.mfaSecret, code)) {
      await this.recordStaffFailure(staff.id, staff.failedLoginCount);
      throw new UnauthorizedException('Invalid authentication code');
    }
    await this.resetStaffFailures(staff.id);
    return this.issue({ sub: staff.id, email: staff.email, role: ROLES.superadmin });
  }

  /** Begin enrolment: mint a secret (pending until activated) and return the otpauth URI. */
  async setupMfa(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const staff = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!staff) throw new UnauthorizedException();
    const secret = generateSecret();
    await this.prisma.db.user.update({
      where: { id: userId },
      data: { mfaSecret: secret, mfaEnabledAt: null },
    });
    return { secret, otpauthUrl: otpauthUrl(secret, staff.email) };
  }

  /** Finish enrolment: verify a code against the pending secret and switch MFA on. */
  async activateMfa(userId: string, code: string): Promise<{ enabled: true }> {
    const staff = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!staff?.mfaSecret) throw new BadRequestException('Start MFA setup first');
    if (!verifyTotp(staff.mfaSecret, code)) {
      throw new BadRequestException('That code did not match — check your authenticator and try again');
    }
    await this.prisma.db.user.update({ where: { id: userId }, data: { mfaEnabledAt: new Date() } });
    return { enabled: true };
  }

  private assertNotLocked(lockedUntil: Date | null) {
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException('Account temporarily locked after repeated failures. Try again shortly.');
    }
  }

  private async recordStaffFailure(id: string, current: number) {
    const next = current + 1;
    await this.prisma.db.user.update({
      where: { id },
      data: {
        failedLoginCount: next,
        lockedUntil: next >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
  }

  private async resetStaffFailures(id: string) {
    await this.prisma.db.user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  private issue(payload: JwtPayload): LoginResult {
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
