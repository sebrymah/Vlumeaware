import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { MAILER } from '../../providers/mailer/mailer.interface';
import type { Mailer } from '../../providers/mailer/mailer.interface';
import { notificationFromAddress } from '../../providers/mailer/from-addresses';
import { publicBaseUrl } from '../tracking/render';
import { escapeHtml as esc } from '../../common/html/escape';
import { PrismaService } from '../../common/prisma/prisma.service';
import { runAsSystem, runInTenant } from '../../common/prisma/tenant-context';
import { AuthService } from '../../common/auth/auth.service';
import { AuditService } from '../../common/audit/audit.service';

/**
 * One-time links that let a console user set their own password.
 *
 * Why a link rather than a password the admin types: the admin creating the
 * account is not the person who should know its password, and emailing a
 * password would leave it readable in a mailbox forever. So the account is
 * created with a random, unknowable hash, and the link is the only way in. The
 * same mechanism serves "resend invitation" and "reset password" — they are the
 * same operation on a different day.
 *
 * Only the SHA-256 of the token is stored (mirroring LicenseToken), so a
 * database leak cannot be redeemed. Links are single-use and expire.
 */
@Injectable()
export class ConsoleInviteService {
  private readonly logger = new Logger(ConsoleInviteService.name);

  /** Seven days: long enough to survive a holiday, short enough to matter. */
  private static readonly TTL_MS =
    Number(process.env.CONSOLE_INVITE_TTL_HOURS ?? 168) * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly audit: AuditService,
  ) {}

  private static hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Issues (or re-issues) a link and emails it. Returns whether the mail was
   * accepted by the provider: a failure here must not roll back the account,
   * which would leave the admin unable to retry.
   */
  async issue(input: {
    tenantId: string;
    userId: string;
    email: string;
    kind: 'invite' | 'reset';
    actorEmail?: string;
  }): Promise<{ emailSent: boolean; expiresAt: Date }> {
    const raw = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ConsoleInviteService.TTL_MS);

    // Re-issuing overwrites the hash, which invalidates any earlier link.
    await runInTenant(input.tenantId, () =>
      this.prisma.db.tenantUser.update({
        where: { id: input.userId },
        data: {
          inviteTokenHash: ConsoleInviteService.hashToken(raw),
          inviteExpiresAt: expiresAt,
          inviteSentAt: new Date(),
        },
      }),
    );

    const [tenant, inviter] = await Promise.all([
      runAsSystem('console invite: tenant name', () =>
        this.prisma.db.tenant.findUnique({ where: { id: input.tenantId }, select: { name: true } }),
      ),
      input.actorEmail
        ? Promise.resolve(input.actorEmail)
        : Promise.resolve(undefined),
    ]);

    const where = esc(tenant?.name ?? 'Vlumeaware');
    const link = `${publicBaseUrl()}/invite/${raw}`;
    const opening =
      input.kind === 'invite'
        ? `You have been added to the <strong>${where}</strong> console on Vlumeaware.`
        : `A new password was requested for your <strong>${where}</strong> console account.`;
    const who = inviter ? `<p>This was requested by ${esc(inviter)}.</p>` : '';

    let emailSent = true;
    try {
      await this.mailer.send({
        to: input.email,
        fromName: 'Vlumeaware',
        fromAddress: notificationFromAddress(),
        subject:
          input.kind === 'invite'
            ? `Set up your ${where} sign-in`
            : `Reset your ${where} password`,
        sendId: `console-invite-${input.userId}-${Date.now()}`,
        html: `
          <p>Hello,</p>
          <p>${opening}</p>
          <p><a href="${link}">Choose your password</a></p>
          <p>The link is for one use only and expires in seven days.</p>
          ${who}
          <p>If you were not expecting this, you can ignore this email — nothing changes until the link is used. Tell the person who administers your account if it looks wrong.</p>
          <p style="color:#64748b;font-size:12px">If the button does not work, paste this into your browser:<br>${link}</p>
        `,
      });
    } catch (err) {
      emailSent = false;
      this.logger.error(
        `Could not email a console ${input.kind} to ${input.email}: ${(err as Error).message}`,
      );
    }

    await this.audit.record(
      input.kind === 'invite' ? 'tenant.user.invite' : 'tenant.user.password_reset',
      `${input.email}${emailSent ? '' : ' (email failed)'}`,
      input.tenantId,
    );

    return { emailSent, expiresAt };
  }

  /** What the recipient's page needs to show before they type a password. */
  async peek(rawToken: string) {
    const user = await this.findByToken(rawToken);
    const tenant = await runAsSystem('console invite: tenant details', () =>
      this.prisma.db.tenant.findUnique({
        where: { id: user.tenantId },
        select: { name: true, passwordMinLength: true },
      }),
    );
    return {
      email: user.email,
      tenantName: tenant?.name ?? 'Vlumeaware',
      // So the page can state the real rule instead of implying a guess. Safe to
      // disclose: the caller already holds a valid one-time link for this account.
      passwordMinLength: tenant?.passwordMinLength ?? 12,
      expiresAt: user.inviteExpiresAt,
    };
  }

  /**
   * Redeems the link. The caller is anonymous, so nothing here trusts anything
   * but the token: it must exist (by hash), be unexpired, and the account's
   * tenant policy governs the password.
   */
  async accept(rawToken: string, password: string) {
    const user = await this.findByToken(rawToken);

    const tenant = await runAsSystem('console invite: policy', () =>
      this.prisma.db.tenant.findUnique({
        where: { id: user.tenantId },
        select: { passwordMinLength: true },
      }),
    );
    const minimum = tenant?.passwordMinLength ?? 12;
    if (password.length < minimum) {
      throw new BadRequestException(
        `Choose a password of at least ${minimum} characters.`,
      );
    }

    const passwordHash = await AuthService.hash(password);
    return runInTenant(user.tenantId, async () => {
      await this.prisma.db.tenantUser.update({
        where: { id: user.id },
        data: {
          passwordHash,
          // Clearing the hash is what makes the link single-use.
          inviteTokenHash: null,
          inviteExpiresAt: null,
          inviteSentAt: null,
          // A fresh password should not inherit an earlier lockout.
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await this.audit.record('tenant.user.password_set', user.email, user.tenantId);
      return { email: user.email };
    });
  }

  private async findByToken(rawToken: string) {
    const token = (rawToken ?? '').trim();
    if (!token) throw new NotFoundException('This link is not valid.');

    // System scope: the caller is anonymous and the tenant is only discoverable
    // from the token itself.
    const user = await runAsSystem('console invite: look up token', () =>
      this.prisma.db.tenantUser.findUnique({
        where: { inviteTokenHash: ConsoleInviteService.hashToken(token) },
        select: {
          id: true,
          tenantId: true,
          email: true,
          inviteExpiresAt: true,
          deactivatedAt: true,
        },
      }),
    );

    if (!user) throw new NotFoundException('This link is not valid.');
    // An account withdrawn after the link was sent must not be able to use it.
    if (user.deactivatedAt) throw new NotFoundException('This link is not valid.');
    if (!user.inviteExpiresAt || user.inviteExpiresAt.getTime() < Date.now()) {
      throw new NotFoundException('This link has expired. Ask an administrator for a new one.');
    }
    return user;
  }
}
