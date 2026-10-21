import { ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StorageService } from '../src/providers/storage/storage.service';
import { AuditService } from '../src/common/audit/audit.service';
import { TrialService } from '../src/common/trial/trial.service';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { TenantsController } from '../src/modules/tenants/tenants.controller';
import { ROLES_KEY } from '../src/common/auth/roles.decorator';
import { ROLES } from '../src/common/auth/roles';

/**
 * Console users, added by the client admin themselves.
 *
 * Vlumetech used to be the only party who could create a client's console
 * accounts, which made the setup guide's "add a second admin" advice impossible
 * to follow without a support request. Opening the route to client admins means
 * the checks around it stop being staff-only conveniences and start being the
 * account's real policy — so they are pinned here:
 *
 *  - the tenant's own password minimum, not just the DTO's 12-character floor;
 *  - the address normalised, so case cannot sneak a duplicate past the unique
 *    index;
 *  - a duplicate reported as a conflict rather than a 500;
 *  - a durable audit row, since the new account can administer the tenant;
 *  - the role set, which is what stops this minting staff or escalating a viewer.
 */
const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;
const noopMailer = { send: async () => ({ messageId: 'test' }) } as never;
const tenants = new TenantsService(
  prisma,
  new StorageService(),
  new AuditService(prisma),
  new TrialService(prisma),
  noopMailer,
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

describe('a client admin creating console users', () => {
  it('creates an admin and normalises the address', async () => {
    const t = await freshTenant();
    const created = await tenants.createTenantUser(t.id, {
      email: '  Second.Admin@Example.TEST ',
      password: 'correct horse battery',
      role: 'client_admin',
    });
    expect(created.email).toBe('second.admin@example.test');
    expect(created.role).toBe('client_admin');

    const listed = await tenants.listTenantUsers(t.id);
    expect(listed.map((u) => u.email)).toContain('second.admin@example.test');
  });

  it('enforces the tenant password minimum, not just the DTO floor', async () => {
    const t = await freshTenant({ passwordMinLength: 16 });
    await expect(
      tenants.createTenantUser(t.id, {
        email: 'short@example.test',
        password: 'fifteen-chars-x', // 15 characters: fine for the DTO, short for this tenant
        role: 'client_admin',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const created = await tenants.createTenantUser(t.id, {
      email: 'long-enough@example.test',
      password: 'sixteen-chars-xx',
      role: 'client_admin',
    });
    expect(created.email).toBe('long-enough@example.test');
  });

  it('treats a differently-capitalised address as a duplicate, and says so', async () => {
    const t = await freshTenant();
    await tenants.createTenantUser(t.id, {
      email: 'admin@example.test',
      password: 'correct horse battery',
      role: 'client_admin',
    });
    await expect(
      tenants.createTenantUser(t.id, {
        email: 'ADMIN@Example.Test',
        password: 'correct horse battery',
        role: 'client_viewer',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('gives the new account the tenant MFA policy', async () => {
    const t = await freshTenant({ requireMfa: true });
    const created = await tenants.createTenantUser(t.id, {
      email: 'mfa@example.test',
      password: 'correct horse battery',
      role: 'client_admin',
    });
    const row = await runInTenant(t.id, () =>
      db.tenantUser.findUnique({ where: { id: created.id }, select: { mfaRequired: true } }),
    );
    expect(row?.mfaRequired).toBe(true);
  });

  it('leaves a durable audit record naming what was created', async () => {
    const t = await freshTenant();
    await tenants.createTenantUser(t.id, {
      email: 'audited@example.test',
      password: 'correct horse battery',
      role: 'client_viewer',
    });
    const entry = await runInTenant(t.id, () =>
      db.auditLog.findFirst({
        where: { tenantId: t.id, action: 'tenant.user.create' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(entry).not.toBeNull();
    expect(entry?.detail).toContain('audited@example.test');
    expect(entry?.detail).toContain('client_viewer');
  });

  it('is open to client admins and to staff, but not to viewers', () => {
    // The class-level @Roles(superadmin) is what made this staff-only; the
    // method-level decorator replaced it, and must not have widened it to
    // viewers, who would otherwise be able to grant themselves an admin login.
    const roles = Reflect.getMetadata(ROLES_KEY, TenantsController.prototype.createUser) as string[];
    expect(roles).toContain(ROLES.superadmin);
    expect(roles).toContain(ROLES.clientAdmin);
    expect(roles).not.toContain(ROLES.clientViewer);
  });
});
