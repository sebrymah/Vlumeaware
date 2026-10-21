import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuditService } from '../src/common/audit/audit.service';
import { AuthService } from '../src/common/auth/auth.service';

/**
 * Signing in must not depend on how the address was typed.
 *
 * Accounts created recently store the address lower-cased; older ones store
 * exactly what was entered; and people capitalise their own names. Looking the
 * raw string up meant "Invalid credentials" for a correct password, which is
 * indistinguishable from a wrong one and impossible for a user to diagnose.
 *
 * The same lookup also has to survive one address belonging to two tenants —
 * there the password, not the row order, decides which account is signing in.
 */
const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;

process.env.JWT_SECRET ??= 'test-secret-that-is-at-least-32-characters-long';
const jwt = new JwtService({ secret: process.env.JWT_SECRET });
const auth = new AuthService(prisma, jwt, new AuditService(prisma));

const tenantIds: string[] = [];
const staffIds: string[] = [];

afterAll(async () => {
  await runAsSystem('teardown', () => db.tenant.deleteMany({ where: { id: { in: tenantIds } } }));
  if (staffIds.length) {
    await runAsSystem('teardown staff', () => db.user.deleteMany({ where: { id: { in: staffIds } } }));
  }
  await base.$disconnect();
});

async function freshTenant() {
  const t = await runAsSystem('setup', () =>
    db.tenant.create({ data: { name: `login-${Date.now()}-${Math.random()}` } }),
  );
  tenantIds.push(t.id);
  return t;
}

async function consoleUser(tenantId: string, email: string, password: string) {
  const passwordHash = await AuthService.hash(password);
  return runInTenant(tenantId, () =>
    db.tenantUser.create({
      data: { tenantId, email, passwordHash, role: 'client_admin' },
      select: { id: true, email: true, tenantId: true, role: true },
    }),
  );
}

describe('signing in with a console account', () => {
  it('accepts the address however it is capitalised', async () => {
    const t = await freshTenant();
    const user = await consoleUser(t.id, 'tobi.adeyemo@example.test', 'correct horse battery');

    for (const typed of [
      'tobi.adeyemo@example.test',
      'Tobi.Adeyemo@example.test',
      'TOBI.ADEYEMO@EXAMPLE.TEST',
    ]) {
      const result = await auth.login(typed, 'correct horse battery');
      expect(result.accessToken).toBeTruthy();
      expect(result.role).toBe('client_admin');
      expect(result.tenantId).toBe(t.id);
    }
    expect(user.email).toBe('tobi.adeyemo@example.test');
  });

  it('accepts an address that arrived with stray whitespace', async () => {
    const t = await freshTenant();
    await consoleUser(t.id, 'pasted@example.test', 'correct horse battery');
    const result = await auth.login('  pasted@example.test  ', 'correct horse battery');
    expect(result.accessToken).toBeTruthy();
  });

  it('still rejects a wrong password, and says only that', async () => {
    const t = await freshTenant();
    await consoleUser(t.id, 'wrong-password@example.test', 'correct horse battery');
    await expect(
      auth.login('Wrong.Password@example.test', 'not the password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lets the password choose between two tenants sharing an address', async () => {
    const a = await freshTenant();
    const b = await freshTenant();
    await consoleUser(a.id, 'shared@example.test', 'password-for-tenant-a');
    await consoleUser(b.id, 'shared@example.test', 'password-for-tenant-b');

    // Both rows match the address; only one password fits each.
    const first = await auth.login('Shared@example.test', 'password-for-tenant-a');
    expect(first.tenantId).toBe(a.id);

    const second = await auth.login('shared@example.test', 'password-for-tenant-b');
    expect(second.tenantId).toBe(b.id);
  });

  it('refuses a deactivated account even with the right password', async () => {
    const t = await freshTenant();
    const user = await consoleUser(t.id, 'gone@example.test', 'correct horse battery');
    await runInTenant(t.id, () =>
      db.tenantUser.update({ where: { id: user.id }, data: { deactivatedAt: new Date() } }),
    );
    await expect(auth.login('gone@example.test', 'correct horse battery')).rejects.toThrow(
      /deactivated/i,
    );
  });
});

describe('signing in with a staff account', () => {
  it('accepts the address however it is capitalised', async () => {
    const passwordHash = await AuthService.hash('correct horse battery');
    const staff = await runAsSystem('setup staff', () =>
      db.user.create({
        data: {
          email: 'owner@vlumesec.example',
          passwordHash,
          role: 'vlumetech_superadmin',
        },
        select: { id: true },
      }),
    );
    staffIds.push(staff.id);

    const result = await auth.login('Owner@Vlumetech.example'.replace('Vlumetech', 'vlumesec'), 'correct horse battery');
    expect(result.accessToken).toBeTruthy();
    expect(result.role).toBe('vlumetech_superadmin');
  });
});
