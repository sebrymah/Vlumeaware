import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuditService } from '../src/common/audit/audit.service';
import { ConsoleInviteService } from '../src/modules/console-invite/console-invite.service';
import { PlatformPolicyService } from '../src/modules/platform/platform-policy.service';
import { StaffUsersService } from '../src/modules/platform/staff-users.service';

/**
 * Vlumetech staff accounts and the platform security policy.
 *
 * These are the controls ISO 27001 A.9.2 asks an auditor to see: how access is
 * granted, reviewed and removed. Before this existed, staff accounts were
 * seed-only and there was no way to withdraw access at all — so the tests below
 * are less about UI than about the claims the console makes.
 */
const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;

const sent: Array<{ to: string; subject: string; html: string }> = [];
const mailer = {
  send: async (e: { to: string; subject: string; html: string }) => {
    sent.push(e);
    return { messageId: 'test' };
  },
};
const invites = new ConsoleInviteService(prisma, mailer as never, new AuditService(prisma));
const policy = new PlatformPolicyService(prisma);
const staff = new StaffUsersService(prisma, invites, policy, new AuditService(prisma));

const emails: string[] = [];
const uniq = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@vlumetech.test`;

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await base.$disconnect();
});

async function createStaff(label: string) {
  const email = uniq(label);
  emails.push(email);
  const created = await staff.create({ email }, 'admin@vlumetech.test');
  return created;
}

describe('creating a staff account', () => {
  it('emails a one-time link and gives the account no usable password', async () => {
    sent.length = 0;
    const created = await createStaff('invite');

    expect(created.awaitingPassword).toBe(true);
    expect(created.emailSent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(created.email);
    expect(sent[0].html).toContain('/invite/');

    const row = await db.user.findUnique({ where: { id: created.id } });
    // A real bcrypt hash — of random bytes nobody was told.
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(row?.inviteTokenHash).toHaveLength(64);
    expect(row?.passwordSetAt).toBeNull();
  });

  it('lower-cases the address and refuses a duplicate', async () => {
    const created = await createStaff('dupe');
    await expect(
      staff.create({ email: `  ${created.email.toUpperCase()}  ` }, 'admin@vlumetech.test'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('inherits the platform MFA requirement', async () => {
    await policy.update({ requireMfa: true }, 'admin@vlumetech.test');
    const created = await createStaff('mfa');
    const row = await db.user.findUnique({ where: { id: created.id }, select: { mfaRequired: true } });
    expect(row?.mfaRequired).toBe(true);
  });

  it('stops awaiting a password once the link is used', async () => {
    sent.length = 0;
    const created = await createStaff('accepted');
    const token = /\/invite\/([A-Za-z0-9_-]+)/.exec(sent[sent.length - 1].html)![1];

    const peek = await invites.peek(token);
    expect(peek.tenantName).toBe('Vlumetech');

    await invites.accept(token, 'a properly long password');
    const after = (await staff.list()).find((u) => u.email === created.email);
    expect(after?.awaitingPassword).toBe(false);
  });
});

describe('withdrawing staff access', () => {
  it('refuses to deactivate you', async () => {
    const me = await createStaff('self');
    await expect(staff.deactivate(me.id, me.id)).rejects.toBeInstanceOf(BadRequestException);
    const row = await db.user.findUnique({ where: { id: me.id }, select: { deactivatedAt: true } });
    expect(row?.deactivatedAt).toBeNull();
  });

  it('deactivates another administrator when more than one remains', async () => {
    const keeper = await createStaff('keeper');
    const leaver = await createStaff('leaver');
    // Two active accounts exist now, so either may go.
    const result = await staff.deactivate(leaver.id, keeper.id);
    expect(result.deactivated).toBe(leaver.email);

    const row = await db.user.findUnique({ where: { id: leaver.id }, select: { deactivatedAt: true } });
    expect(row?.deactivatedAt).not.toBeNull();
  });

  it('restores an account and says whether it needs a password', async () => {
    const user = await createStaff('restore');
    await staff.deactivate(user.id, 'some-other-admin');
    const restored = await staff.reactivate(user.id);
    expect(restored.reactivated).toBe(user.email);
    expect(restored.needsPassword).toBe(true);
  });
});

describe('resetting a staff second factor', () => {
  it('clears the secret so the account must enrol again', async () => {
    const user = await createStaff('mfa-reset');
    await db.user.update({
      where: { id: user.id },
      data: { mfaSecret: 'JBSWY3DPEHPK3PXP', mfaEnabledAt: new Date() },
    });

    const result = await staff.resetMfa(user.id);
    expect(result.mustEnrol).toBe(true);

    const row = await db.user.findUnique({
      where: { id: user.id },
      select: { mfaSecret: true, mfaEnabledAt: true, lockedUntil: true },
    });
    expect(row?.mfaSecret).toBeNull();
    expect(row?.mfaEnabledAt).toBeNull();
    expect(row?.lockedUntil).toBeNull();
  });
});

describe('the platform security policy', () => {
  it('refuses a password minimum weaker than the 12 it replaced', async () => {
    await expect(policy.update({ passwordMinLength: 8 }, 'admin')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses an implausible session length', async () => {
    await expect(policy.update({ sessionTimeoutMinutes: 5 }, 'admin')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(policy.update({ sessionTimeoutMinutes: 5000 }, 'admin')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('applies a valid change and records who made it', async () => {
    const updated = await policy.update({ sessionTimeoutMinutes: 120 }, 'owner@vlumetech.test');
    expect(updated.sessionTimeoutMinutes).toBe(120);
    const row = await db.platformSecurityPolicy.findUnique({ where: { id: 'default' } });
    expect(row?.updatedBy).toBe('owner@vlumetech.test');
    // leave the shared test database as it was found
    await policy.update({ sessionTimeoutMinutes: 480, passwordMinLength: 12 }, 'test-cleanup');
  });
});
