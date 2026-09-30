import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { runAsSystem } from '../prisma/tenant-context';
import { AuditService } from '../audit/audit.service';
import { ROLES } from './roles';
import type { JwtPayload, Role } from './roles';
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
    private readonly audit: AuditService,
  ) {}

  /**
   * Records an authentication event. Login runs before any request scope, so
   * the subject (who is authenticating) is passed as the actor explicitly.
   */
  private authEvent(
    action: string,
    subjectId: string,
    role: Role,
    tenantId?: string,
    detail?: string,
  ) {
    void this.audit.record(action, detail, tenantId, { actorId: subjectId, actorRole: role });
  }

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
        this.authEvent('auth.mfa_challenged', staff.id, ROLES.superadmin);
        return {
          mfaRequired: true,
          mfaChallenge: this.jwt.sign({ sub: staff.id, typ: 'mfa' }, { expiresIn: '5m' }),
        };
      }
      // No MFA yet: staff may sign in, but the console must force enrolment.
      this.authEvent('auth.login', staff.id, ROLES.superadmin, undefined, 'password, MFA enrolment pending');
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
    if (tenantUser) {
      this.assertNotLocked(tenantUser.lockedUntil);
      if (!(await bcrypt.compare(password, tenantUser.passwordHash))) {
        await this.recordTenantUserFailure(
          tenantUser.id,
          tenantUser.failedLoginCount,
          tenantUser.tenantId,
          tenantUser.role,
        );
        throw new UnauthorizedException('Invalid credentials');
      }
      await this.resetTenantUserFailures(tenantUser.id);

      const policy = await this.tenantPolicy(tenantUser.tenantId);

      // MFA active → a challenge, exactly as for staff.
      if (tenantUser.mfaEnabledAt) {
        this.authEvent('auth.mfa_challenged', tenantUser.id, tenantUser.role, tenantUser.tenantId);
        return {
          mfaRequired: true,
          mfaChallenge: this.jwt.sign({ sub: tenantUser.id, typ: 'mfa' }, { expiresIn: '5m' }),
        };
      }
      this.authEvent('auth.login', tenantUser.id, tenantUser.role, tenantUser.tenantId, 'password');
      // The client can require MFA of its own users. They still get a token,
      // because enrolment happens inside the console, but it is flagged so the
      // console can force them through it before anything else.
      return {
        ...this.issue(
          {
            sub: tenantUser.id,
            email: tenantUser.email,
            role: tenantUser.role,
            tenantId: tenantUser.tenantId,
          },
          policy.sessionTimeoutMinutes,
        ),
        ...(policy.requireMfa ? { mfaEnrollmentRequired: true } : {}),
      };
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
    if (staff) {
      if (!staff.mfaSecret || !staff.mfaEnabledAt) {
        throw new UnauthorizedException('MFA is not set up for this account');
      }
      this.assertNotLocked(staff.lockedUntil);
      if (!verifyTotp(staff.mfaSecret, code)) {
        await this.recordStaffFailure(staff.id, staff.failedLoginCount);
        throw new UnauthorizedException('Invalid authentication code');
      }
      await this.resetStaffFailures(staff.id);
      this.authEvent('auth.login', staff.id, ROLES.superadmin, undefined, 'password + MFA');
      return this.issue({ sub: staff.id, email: staff.email, role: ROLES.superadmin });
    }

    const tenantUser = await runAsSystem('mfa: resolve tenant user', () =>
      this.prisma.db.tenantUser.findUnique({ where: { id: sub } }),
    );
    if (!tenantUser || !tenantUser.mfaSecret || !tenantUser.mfaEnabledAt) {
      throw new UnauthorizedException('MFA is not set up for this account');
    }
    this.assertNotLocked(tenantUser.lockedUntil);
    if (!verifyTotp(tenantUser.mfaSecret, code)) {
      await this.recordTenantUserFailure(
        tenantUser.id,
        tenantUser.failedLoginCount,
        tenantUser.tenantId,
        tenantUser.role,
      );
      throw new UnauthorizedException('Invalid authentication code');
    }
    await this.resetTenantUserFailures(tenantUser.id);
    this.authEvent('auth.login', tenantUser.id, tenantUser.role, tenantUser.tenantId, 'password + MFA');
    const policy = await this.tenantPolicy(tenantUser.tenantId);
    return this.issue(
      {
        sub: tenantUser.id,
        email: tenantUser.email,
        role: tenantUser.role,
        tenantId: tenantUser.tenantId,
      },
      policy.sessionTimeoutMinutes,
    );
  }

  /** Begin enrolment: mint a secret (pending until activated) and return the otpauth URI. */
  async setupMfa(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const secret = generateSecret();

    const staff = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (staff) {
      await this.prisma.db.user.update({
        where: { id: userId },
        data: { mfaSecret: secret, mfaEnabledAt: null },
      });
      return { secret, otpauthUrl: otpauthUrl(secret, staff.email) };
    }

    const tenantUser = await runAsSystem('mfa: begin client enrolment', () =>
      this.prisma.db.tenantUser.findUnique({ where: { id: userId } }),
    );
    if (!tenantUser) throw new UnauthorizedException();
    await runAsSystem('mfa: store client secret', () =>
      this.prisma.db.tenantUser.update({
        where: { id: userId },
        data: { mfaSecret: secret, mfaEnabledAt: null },
      }),
    );
    return { secret, otpauthUrl: otpauthUrl(secret, tenantUser.email) };
  }

  /** Finish enrolment: verify a code against the pending secret and switch MFA on. */
  async activateMfa(userId: string, code: string): Promise<{ enabled: true }> {
    const mismatch = 'That code did not match — check your authenticator and try again';

    const staff = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (staff) {
      if (!staff.mfaSecret) throw new BadRequestException('Start MFA setup first');
      if (!verifyTotp(staff.mfaSecret, code)) throw new BadRequestException(mismatch);
      await this.prisma.db.user.update({ where: { id: userId }, data: { mfaEnabledAt: new Date() } });
      this.authEvent('auth.mfa_enrolled', userId, ROLES.superadmin);
      return { enabled: true };
    }

    const tenantUser = await runAsSystem('mfa: finish client enrolment', () =>
      this.prisma.db.tenantUser.findUnique({ where: { id: userId } }),
    );
    if (!tenantUser?.mfaSecret) throw new BadRequestException('Start MFA setup first');
    if (!verifyTotp(tenantUser.mfaSecret, code)) throw new BadRequestException(mismatch);
    await runAsSystem('mfa: activate client', () =>
      this.prisma.db.tenantUser.update({ where: { id: userId }, data: { mfaEnabledAt: new Date() } }),
    );
    this.authEvent('auth.mfa_enrolled', userId, tenantUser.role, tenantUser.tenantId);
    return { enabled: true };
  }

  /**
   * Turns MFA off for the caller. Refused when the client requires it, so a
   * user cannot opt out of their own organisation's policy.
   */
  async disableMfa(userId: string, tenantId?: string): Promise<{ enabled: false }> {
    if (tenantId) {
      const policy = await this.tenantPolicy(tenantId);
      if (policy.requireMfa) {
        throw new BadRequestException(
          'Your organisation requires multi-factor authentication, so it cannot be turned off.',
        );
      }
      await runAsSystem('mfa: disable for client user', () =>
        this.prisma.db.tenantUser.update({
          where: { id: userId },
          data: { mfaSecret: null, mfaEnabledAt: null },
        }),
      );
      this.authEvent('auth.mfa_disabled', userId, ROLES.clientViewer, tenantId);
      return { enabled: false };
    }
    throw new BadRequestException('Vlumetech staff accounts must keep MFA enabled.');
  }

  /** Changes the caller's own password, against their organisation's policy. */
  async changePassword(
    userId: string,
    tenantId: string | undefined,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ changed: true }> {
    const minimum = tenantId ? (await this.tenantPolicy(tenantId)).passwordMinLength : 12;
    if (newPassword.length < minimum) {
      throw new BadRequestException(`Password must be at least ${minimum} characters.`);
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException('The new password must differ from the current one.');
    }

    if (!tenantId) {
      const staff = await this.prisma.db.user.findUnique({ where: { id: userId } });
      if (!staff || !(await bcrypt.compare(currentPassword, staff.passwordHash))) {
        throw new UnauthorizedException('Current password is incorrect');
      }
      await this.prisma.db.user.update({
        where: { id: userId },
        data: { passwordHash: await AuthService.hash(newPassword) },
      });
      this.authEvent('auth.password_changed', userId, ROLES.superadmin);
      return { changed: true };
    }

    const tenantUser = await runAsSystem('password change: read client user', () =>
      this.prisma.db.tenantUser.findUnique({ where: { id: userId } }),
    );
    if (!tenantUser || !(await bcrypt.compare(currentPassword, tenantUser.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await AuthService.hash(newPassword);
    await runAsSystem('password change: write client user', () =>
      this.prisma.db.tenantUser.update({ where: { id: userId }, data: { passwordHash } }),
    );
    this.authEvent('auth.password_changed', userId, ROLES.clientViewer, tenantId);
    return { changed: true };
  }

  private assertNotLocked(lockedUntil: Date | null) {
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException('Account temporarily locked after repeated failures. Try again shortly.');
    }
  }

  /** The client's own security policy, read outside any tenant context. */
  async tenantPolicy(tenantId: string) {
    const tenant = await runAsSystem('security policy: read tenant settings', () =>
      this.prisma.db.tenant.findUnique({
        where: { id: tenantId },
        select: { passwordMinLength: true, sessionTimeoutMinutes: true, requireMfa: true },
      }),
    );
    return {
      passwordMinLength: tenant?.passwordMinLength ?? 12,
      sessionTimeoutMinutes: tenant?.sessionTimeoutMinutes ?? 480,
      requireMfa: tenant?.requireMfa ?? false,
    };
  }

  private async recordTenantUserFailure(
    id: string,
    current: number,
    tenantId?: string,
    role: Role = ROLES.clientViewer,
  ) {
    const next = current + 1;
    const locked = next >= MAX_FAILURES;
    await runAsSystem('login: record failed client attempt', () =>
      this.prisma.db.tenantUser.update({
        where: { id },
        data: {
          failedLoginCount: next,
          lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      }),
    );
    this.authEvent('auth.login_failed', id, role, tenantId, `attempt ${next}`);
    if (locked) {
      this.authEvent('auth.lockout', id, role, tenantId, `locked ${LOCK_MINUTES}m`);
    }
  }

  private async resetTenantUserFailures(id: string) {
    await runAsSystem('login: reset client failures', () =>
      this.prisma.db.tenantUser.update({
        where: { id },
        data: { failedLoginCount: 0, lockedUntil: null },
      }),
    );
  }

  private async recordStaffFailure(id: string, current: number) {
    const next = current + 1;
    const locked = next >= MAX_FAILURES;
    await this.prisma.db.user.update({
      where: { id },
      data: {
        failedLoginCount: next,
        lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    this.authEvent('auth.login_failed', id, ROLES.superadmin, undefined, `attempt ${next}`);
    if (locked) {
      this.authEvent('auth.lockout', id, ROLES.superadmin, undefined, `locked ${LOCK_MINUTES}m`);
    }
  }

  private async resetStaffFailures(id: string) {
    await this.prisma.db.user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  private issue(payload: JwtPayload, sessionMinutes?: number): LoginResult {
    return {
      accessToken: sessionMinutes
        ? this.jwt.sign(payload, { expiresIn: `${sessionMinutes}m` })
        : this.jwt.sign(payload),
      role: payload.role,
      tenantId: payload.tenantId,
    };
  }

  static hash(password: string) {
    return bcrypt.hash(password, 12);
  }
}
