import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StorageService } from '../src/providers/storage/storage.service';
import { AuditService } from '../src/common/audit/audit.service';
import { TrialService } from '../src/common/trial/trial.service';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { ConsoleInviteService } from '../src/modules/console-invite/console-invite.service';

/**
 * The one-time links that let a console user set their own password.
 *
 * The admin who creates the account is not the person who should know its
 * password, so no password is set at creation and none is emailed. The link is
 * the credential, which makes the properties below security-critical rather than
 * cosmetic: only a hash is stored, it is single-use, it expires, and a
 * re-issue must invalidate the previous link.
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
const tenants = new TenantsService(
  prisma,
  new StorageService(),
  new AuditService(prisma),
  new TrialService(prisma),
  invites,
  mailer as never,
);

const tenantIds: string[] = [];

afterAll(async () => {
  await runAsSystem('teardown', () => db.tenant.deleteMany({ where: { id: { in: tenantIds } } }));
  await base.$disconnect();
});

async function freshTenant(policy: { passwordMinLength?: number } = {}) {
  const t = await runAsSystem('setup', () =>
    db.tenant.create({
      data: {
        name: `invite-${Date.now()}-${Math.random()}`,
        passwordMinLength: policy.passwordMinLength ?? 12,
      },
    }),
  );
  tenantIds.push(t.id);
  return t;
}

/** The token the recipient would click, straight out of the email we sent. */
function tokenFromLastEmail(): string {
  const match = /\/invite\/([A-Za-z0-9_-]+)/.exec(sent[sent.length - 1].html);
  if (!match) throw new Error('no invite link in email');
  return match[1];
}

async function userWithInvite(policy?: { passwordMinLength?: number }) {
  const t = await freshTenant(policy);
  sent.length = 0;
  const user = await tenants.createTenantUser(t.id, {
    email: `invitee-${Math.random().toString(36).slice(2)}@example.test`,
    role: 'client_admin',
  });
  return { tenant: t, user, token: tokenFromLastEmail() };
}

describe('an invitation link', () => {
  it('is stored only as a hash, never as the token that was emailed', async () => {
    const { tenant, user, token } = await userWithInvite();
    const row = await runInTenant(tenant.id, () =>
      db.tenantUser.findUnique({
        where: { id: user.id },
        select: { inviteTokenHash: true },
      }),
    );
    expect(token).toHaveLength(43); // 32 random bytes, base64url
    expect(row?.inviteTokenHash).not.toBe(token);
    expect(row?.inviteTokenHash).toHaveLength(64); // sha256 hex
  });

  it('tells the recipient page who it is for, and for which workspace', async () => {
    const { tenant, user, token } = await userWithInvite();
    const peek = await invites.peek(token);
    expect(peek.email).toBe(user.email);
    expect(peek.tenantName).toBe(tenant.name);
  });

  it('sets a working password, then stops working', async () => {
    const { tenant, user, token } = await userWithInvite();
    const accepted = await invites.accept(token, 'a properly long password');
    expect(accepted.email).toBe(user.email);

    const row = await runInTenant(tenant.id, () =>
      db.tenantUser.findUnique({
        where: { id: user.id },
        select: { passwordHash: true, inviteTokenHash: true, inviteExpiresAt: true },
      }),
    );
    expect(await bcrypt.compare('a properly long password', row!.passwordHash)).toBe(true);
    // Clearing the hash is what makes it single-use.
    expect(row?.inviteTokenHash).toBeNull();
    expect(row?.inviteExpiresAt).toBeNull();

    // The same link cannot be replayed, even by someone who saw the email.
    await expect(invites.accept(token, 'another long password')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('enforces the tenant password policy at the point it matters', async () => {
    const { token } = await userWithInvite({ passwordMinLength: 16 });
    await expect(invites.accept(token, 'fifteen-chars-x')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // The link survives a rejected password, so a typo does not force a new email.
    const ok = await invites.accept(token, 'sixteen-chars-xx');
    expect(ok.email).toContain('@example.test');
  });

  it('rejects an expired link', async () => {
    const { tenant, user, token } = await userWithInvite();
    await runInTenant(tenant.id, () =>
      db.tenantUser.update({
        where: { id: user.id },
        data: { inviteExpiresAt: new Date(Date.now() - 1000) },
      }),
    );
    await expect(invites.accept(token, 'a properly long password')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('invalidates the previous link when a new one is issued', async () => {
    const { tenant, user, token: first } = await userWithInvite();
    sent.length = 0;
    await tenants.sendConsoleInvite(tenant.id, user.id);
    const second = tokenFromLastEmail();
    expect(second).not.toBe(first);

    await expect(invites.accept(first, 'a properly long password')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const ok = await invites.accept(second, 'a properly long password');
    expect(ok.email).toBe(user.email);
  });

  it('rejects a token that was never issued', async () => {
    await expect(invites.peek('not-a-real-token')).rejects.toBeInstanceOf(NotFoundException);
    await expect(invites.accept('not-a-real-token', 'a properly long password')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('records that the password was set', async () => {
    const { tenant, user, token } = await userWithInvite();
    await invites.accept(token, 'a properly long password');
    const entry = await runInTenant(tenant.id, () =>
      db.auditLog.findFirst({
        where: { tenantId: tenant.id, action: 'tenant.user.password_set' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(entry?.detail).toBe(user.email);
  });
});
