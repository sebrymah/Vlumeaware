import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type StaffRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuthService } from '../../common/auth/auth.service';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConsoleInviteService } from '../console-invite/console-invite.service';
import { PlatformPolicyService } from './platform-policy.service';

/**
 * Vlumetech staff accounts.
 *
 * These were seed-only until now: no way to add a colleague, withdraw access when
 * someone leaves, or recover an account whose authenticator was lost. ISO 27001
 * A.9.2 asks precisely for registration, review and removal of access, so each of
 * those is an explicit operation with an audit record rather than a database edit.
 *
 * No administrator ever sets or sees another person's password: a new account is
 * created with a random, unknowable hash and the emailed link is the only way in.
 */
@Injectable()
export class StaffUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: ConsoleInviteService,
    private readonly policy: PlatformPolicyService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.prisma.db.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        mfaEnabledAt: true,
        mfaRequired: true,
        deactivatedAt: true,
        lastLoginAt: true,
        createdAt: true,
        inviteExpiresAt: true,
        inviteSentAt: true,
        passwordSetAt: true,
        lockedUntil: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      mfaEnabled: Boolean(u.mfaEnabledAt),
      deactivated: Boolean(u.deactivatedAt),
      locked: Boolean(u.lockedUntil && u.lockedUntil > new Date()),
      // Invited and no password recorded since: cannot sign in until a new link.
      awaitingPassword: Boolean(u.inviteSentAt && !u.passwordSetAt),
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    }));
  }

  async create(input: { email: string; role?: StaffRole }, actorEmail?: string) {
    const email = input.email.trim().toLowerCase();
    if (!email) throw new BadRequestException('An email address is required.');

    const policy = await this.policy.get();
    // Unknowable: only the emailed link can give this account a password.
    const passwordHash = await AuthService.hash(randomBytes(32).toString('hex'));

    let user;
    try {
      user = await this.prisma.db.user.create({
        data: {
          email,
          passwordHash,
          role: input.role ?? 'vlumetech_superadmin',
          // The platform policy decides whether the new account must enrol a second
          // factor, so raising it covers everyone created afterwards.
          mfaRequired: policy.requireMfa,
        },
        select: { id: true, email: true, role: true, createdAt: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A staff account with that email already exists.');
      }
      throw err;
    }

    const { emailSent, expiresAt } = await this.invites.issue({
      scope: 'staff',
      userId: user.id,
      email: user.email,
      kind: 'invite',
      actorEmail,
    });
    await this.audit.record('platform.staff.create', `${user.role} ${user.email}`);

    return { ...user, awaitingPassword: true, inviteExpiresAt: expiresAt, emailSent };
  }

  async sendInvite(id: string, actorEmail?: string) {
    const user = await this.find(id);
    if (user.deactivatedAt) {
      throw new BadRequestException('Restore this account before sending it a sign-in link.');
    }
    const { emailSent, expiresAt } = await this.invites.issue({
      scope: 'staff',
      userId: user.id,
      email: user.email,
      kind: 'reset',
      actorEmail,
    });
    return { email: user.email, emailSent, inviteExpiresAt: expiresAt };
  }

  /**
   * Clears the second factor so the account must enrol again. This is the recovery
   * path when someone loses their authenticator — without it the only options are a
   * database edit or a permanently locked-out colleague.
   */
  async resetMfa(id: string) {
    const user = await this.find(id);
    const policy = await this.policy.get();
    await this.prisma.db.user.update({
      where: { id: user.id },
      data: {
        mfaSecret: null,
        mfaEnabledAt: null,
        mfaRequired: policy.requireMfa,
        // Enrolment is a fresh start, so a lockout from the old device should not
        // survive it.
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await this.audit.record('platform.staff.mfa_reset', user.email);
    return { email: user.email, mustEnrol: policy.requireMfa };
  }

  async deactivate(id: string, actorId: string) {
    const user = await this.find(id);
    if (user.id === actorId) {
      throw new BadRequestException(
        'You cannot deactivate your own account. Ask another administrator to do it.',
      );
    }
    if (user.deactivatedAt) return { deactivated: user.email, alreadyInactive: true };

    if (user.role === 'vlumetech_superadmin') {
      const active = await this.prisma.db.user.count({
        where: { role: 'vlumetech_superadmin', deactivatedAt: null },
      });
      if (active <= 1) {
        throw new BadRequestException(
          'This is the only active administrator. Add another before withdrawing access, or the platform will be locked out.',
        );
      }
    }

    await this.prisma.db.user.update({
      where: { id: user.id },
      data: {
        deactivatedAt: new Date(),
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
    });
    await this.audit.record('platform.staff.deactivate', `${user.role} ${user.email}`);
    return { deactivated: user.email };
  }

  async reactivate(id: string) {
    const user = await this.find(id);
    await this.prisma.db.user.update({
      where: { id: user.id },
      data: { deactivatedAt: null, failedLoginCount: 0, lockedUntil: null },
    });
    await this.audit.record('platform.staff.reactivate', `${user.role} ${user.email}`);
    return { reactivated: user.email, needsPassword: !user.passwordSetAt };
  }

  private async find(id: string) {
    const user = await this.prisma.db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        deactivatedAt: true,
        passwordSetAt: true,
      },
    });
    if (!user) throw new NotFoundException('Staff account not found');
    return user;
  }
}
