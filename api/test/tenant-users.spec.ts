import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StorageService } from '../src/providers/storage/storage.service';
import { AuditService } from '../src/common/audit/audit.service';
import { TrialService } from '../src/common/trial/trial.service';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { TenantsController } from '../src/modules/tenants/tenants.controller';
import { ConsoleInviteService } from '../src/modules/console-invite/console-invite.service';
import { JwtStrategy } from '../src/common/auth/jwt.strategy';
import { ROLES_KEY } from '../src/common/auth/roles.decorator';
import { ROLES } from '../src/common/auth/roles';

/**
 * Console users, added by the client admin themselves.
 *
 * Vlumetech used to be the only party who could create a client's console
 * accounts, which made the setup guide's "add a second admin" advice impossible
 * to follow without a support request. This pins the lifecycle that opened up:
 * creating with an emailed link (never an admin-chosen password), resetting, and
 * removing with the two refusals that stop a tenant locking itself out.
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

async function freshTenant(policy: { passwordMinLength?: number; requireMfa?: boolean } = {}) {
  const t = await runAsSystem('setup', () =>
    db.tenant.create({
      data: {
        name: `users-${Date.now()}-${Math.random()}`,
        passwordMinLength: policy.passwordMinLength ?? 12,
        requireMfa: policy.requireMfa ?? false,
      },
    }),
  );
  tenantIds.push(t.id);
  return t;
}

describe('creating a console user', () => {
  it('emails a one-time link instead of taking a password', async () => {
    const t = await freshTenant();
    sent.length = 0;

    const created = await tenants.createTenantUser(t.id, {
      email: '  Second.Admin@Example.TEST ',
      role: 'client_admin',
    });

    expect(created.email).toBe('second.admin@example.test');
    expect(created.role).toBe('client_admin');
    expect(created.invitePending).toBe(true);
    expect(created.emailSent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('second.admin@example.test');
    // The link is the only way in; no password is ever put in the mail.
    expect(sent[0].html).toContain('/invite/');
  });

  it('cannot be signed into until the link is used', async () => {
    const t = await freshTenant();
    const created = await tenants.createTenantUser(t.id, {
      email: 'pending@example.test',
      role: 'client_admin',
    });
    const row = await runInTenant(t.id, () =>
      db.tenantUser.findUnique({
        where: { id: created.id },
        select: { passwordHash: true, inviteTokenHash: true },
      }),
    );
    // A real bcrypt hash — of random bytes nobody was told.
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(row?.inviteTokenHash).toHaveLength(64);
  });

  it('treats a differently-capitalised address as a duplicate, and says so', async () => {
    const t = await freshTenant();
    await tenants.createTenantUser(t.id, { email: 'admin@example.test', role: 'client_admin' });
    await expect(
      tenants.createTenantUser(t.id, { email: 'ADMIN@Example.Test', role: 'client_viewer' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('gives the new account the tenant MFA policy', async () => {
    const t = await freshTenant({ requireMfa: true });
    const created = await tenants.createTenantUser(t.id, {
      email: 'mfa@example.test',
      role: 'client_admin',
    });
    const row = await runInTenant(t.id, () =>
      db.tenantUser.findUnique({ where: { id: created.id }, select: { mfaRequired: true } }),
    );
    expect(row?.mfaRequired).toBe(true);
  });

  it('audits the creation, naming role and address', async () => {
    const t = await freshTenant();
    await tenants.createTenantUser(t.id, { email: 'audited@example.test', role: 'client_viewer' });
    const entry = await runInTenant(t.id, () =>
      db.auditLog.findFirst({
        where: { tenantId: t.id, action: 'tenant.user.create' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(entry?.detail).toContain('audited@example.test');
    expect(entry?.detail).toContain('client_viewer');
  });

  it('is open to client admins and staff, but not to viewers', () => {
    // The class-level @Roles(superadmin) is what made this staff-only; the
    // method-level decorator replaced it, and must not have widened it to
    // viewers, who would otherwise be able to grant themselves an admin login.
    const roles = Reflect.getMetadata(ROLES_KEY, TenantsController.prototype.createUser) as string[];
    expect(roles).toContain(ROLES.superadmin);
    expect(roles).toContain(ROLES.clientAdmin);
    expect(roles).not.toContain(ROLES.clientViewer);
  });
});

describe('removing a console user', () => {
  it('removes the account and records it', async () => {
    const t = await freshTenant();
    const leaver = await tenants.createTenantUser(t.id, {
      email: 'leaver@example.test',
      role: 'client_viewer',
    });
    const removed = await tenants.deleteTenantUser(t.id, leaver.id, { userId: 'someone-else' });
    expect(removed.removed).toBe('leaver@example.test');

    const listed = await tenants.listTenantUsers(t.id);
    expect(listed.map((u) => u.email)).not.toContain('leaver@example.test');

    const entry = await runInTenant(t.id, () =>
      db.auditLog.findFirst({
        where: { tenantId: t.id, action: 'tenant.user.delete' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(entry?.detail).toContain('leaver@example.test');
  });

  it('refuses to remove yourself', async () => {
    const t = await freshTenant();
    const me = await tenants.createTenantUser(t.id, {
      email: 'me@example.test',
      role: 'client_admin',
    });
    await expect(tenants.deleteTenantUser(t.id, me.id, { userId: me.id })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const listed = await tenants.listTenantUsers(t.id);
    expect(listed.map((u) => u.email)).toContain('me@example.test');
  });

  it('refuses to remove the last administrator', async () => {
    const t = await freshTenant();
    const onlyAdmin = await tenants.createTenantUser(t.id, {
      email: 'only-admin@example.test',
      role: 'client_admin',
    });
    await expect(
      tenants.deleteTenantUser(t.id, onlyAdmin.id, { userId: 'another-admin' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows removing an administrator when another remains', async () => {
    const t = await freshTenant();
    await tenants.createTenantUser(t.id, { email: 'first@example.test', role: 'client_admin' });
    const second = await tenants.createTenantUser(t.id, {
      email: 'second@example.test',
      role: 'client_admin',
    });
    const removed = await tenants.deleteTenantUser(t.id, second.id, { userId: 'first-actor' });
    expect(removed.removed).toBe('second@example.test');
  });
});

describe('resetting a console user password', () => {
  it('emails a fresh link and marks the account pending again', async () => {
    const t = await freshTenant();
    const user = await tenants.createTenantUser(t.id, {
      email: 'reset-me@example.test',
      role: 'client_viewer',
    });
    sent.length = 0;

    const result = await tenants.sendConsoleInvite(t.id, user.id, 'admin@example.test');
    expect(result.emailSent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain('/invite/');

    // getSecurity relies on the request scope the interceptor opens in production.
    const security = await runInTenant(t.id, () => tenants.getSecurity(t.id));
    expect(security.users.find((u) => u.email === 'reset-me@example.test')?.invitePending).toBe(true);
  });
});

describe('deactivating a console user', () => {
  it('stops access on the very next request, not at token expiry', async () => {
    const t = await freshTenant();
    // A viewer, so the last-administrator guard does not colour this test: the
    // point here is only that a live token stops working.
    const user = await tenants.createTenantUser(t.id, {
      email: 'offboarded@example.test',
      role: 'client_viewer',
    });
    const payload = {
      sub: user.id,
      email: user.email,
      role: 'client_viewer' as const,
      tenantId: t.id,
    };
    const strategy = new JwtStrategy(prisma);
    await expect(strategy.validate(payload)).resolves.toEqual(payload);

    await tenants.deactivateTenantUser(t.id, user.id, { userId: 'another-admin' });

    await expect(strategy.validate(payload)).rejects.toThrow(/no longer active/i);
  });

  it('keeps the record and can be reversed', async () => {
    const t = await freshTenant();
    const user = await tenants.createTenantUser(t.id, {
      email: 'returning@example.test',
      role: 'client_viewer',
    });
    await tenants.deactivateTenantUser(t.id, user.id, { userId: 'admin-actor' });

    const security = await runInTenant(t.id, () => tenants.getSecurity(t.id));
    expect(security.users.find((u) => u.email === 'returning@example.test')?.deactivated).toBe(true);

    await tenants.reactivateTenantUser(t.id, user.id);
    const after = await runInTenant(t.id, () => tenants.getSecurity(t.id));
    expect(after.users.find((u) => u.email === 'returning@example.test')?.deactivated).toBe(false);

    const strategy = new JwtStrategy(prisma);
    await expect(
      strategy.validate({
        sub: user.id,
        email: user.email,
        role: 'client_viewer',
        tenantId: t.id,
      }),
    ).resolves.toBeTruthy();
  });

  it('is audited', async () => {
    const t = await freshTenant();
    const user = await tenants.createTenantUser(t.id, {
      email: 'audited-offboarding@example.test',
      role: 'client_viewer',
    });
    await tenants.deactivateTenantUser(t.id, user.id, { userId: 'admin-actor' });
    const entry = await runInTenant(t.id, () =>
      db.auditLog.findFirst({
        where: { tenantId: t.id, action: 'tenant.user.deactivate' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(entry?.detail).toContain('audited-offboarding@example.test');
  });

  it('refuses to deactivate you', async () => {
    const t = await freshTenant();
    const me = await tenants.createTenantUser(t.id, {
      email: 'self@example.test',
      role: 'client_admin',
    });
    await expect(
      tenants.deactivateTenantUser(t.id, me.id, { userId: me.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to deactivate the last active administrator', async () => {
    const t = await freshTenant();
    await tenants.createTenantUser(t.id, { email: 'admin-a@example.test', role: 'client_admin' });
    const b = await tenants.createTenantUser(t.id, {
      email: 'admin-b@example.test',
      role: 'client_admin',
    });
    // Two admins: either one can go.
    await tenants.deactivateTenantUser(t.id, b.id, { userId: 'admin-a' });
    // One left: now it is refused.
    const a = (await tenants.listTenantUsers(t.id)).find((u) => u.email === 'admin-a@example.test');
    await expect(
      tenants.deactivateTenantUser(t.id, a!.id, { userId: 'admin-b' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cannot accept an invitation issued before it was withdrawn', async () => {
    const t = await freshTenant();
    sent.length = 0;
    const user = await tenants.createTenantUser(t.id, {
      email: 'invite-then-withdraw@example.test',
      role: 'client_viewer',
    });
    const token = /\/invite\/([A-Za-z0-9_-]+)/.exec(sent[sent.length - 1].html)![1];

    await tenants.deactivateTenantUser(t.id, user.id, { userId: 'admin-actor' });

    await expect(invites.peek(token)).rejects.toThrow();
    await expect(invites.accept(token, 'a properly long password')).rejects.toThrow();
    // And no new link may be issued for it either.
    await expect(tenants.sendConsoleInvite(t.id, user.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
