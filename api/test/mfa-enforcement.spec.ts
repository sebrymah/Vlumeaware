import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import {
  ALLOW_UNENROLLED_MFA_KEY,
  AllowUnenrolledMfa,
  MfaEnforcedGuard,
} from '../src/common/auth/mfa-enforced.guard';
import type { JwtPayload } from '../src/common/auth/roles';
import type { PrismaService } from '../src/common/prisma/prisma.service';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant } from '../src/common/prisma/tenant-context';

/**
 * MFA enforcement (security review R8).
 *
 * The rule these tests pin down: an account that must enrol and has not is
 * refused, and an account that predates enforcement is not. "Mandatory MFA" was
 * previously a flag in the login response that only the console honoured, so
 * anyone holding a staff password could ignore the UI and call the API
 * directly.
 *
 * Needs the test database, like the isolation suite.
 */
const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);

/** The guard wired to the real database, with a stubbed route metadata lookup. */
function guard(options: { exempt?: boolean } = {}) {
  const reflector = { getAllAndOverride: () => options.exempt ?? false } as unknown as Reflector;
  return new MfaEnforcedGuard({ db } as unknown as PrismaService, reflector);
}

/** Minimal ExecutionContext — the guard only reads `req.user`. */
function contextFor(user: JwtPayload | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('MFA enforcement', () => {
  const staffIds: string[] = [];
  const tenantIds: string[] = [];
  let seq = 0;

  afterAll(async () => {
    await runAsSystem('test teardown', async () => {
      await db.user.deleteMany({ where: { id: { in: staffIds } } });
      await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    });
    await base.$disconnect();
  });

  /** A staff account with the given enforcement and enrolment state. */
  async function newStaff(mfaRequired: boolean, enrolled: boolean) {
    seq += 1;
    const row = await db.user.create({
      data: {
        email: `mfa-${seq}-${Date.now()}@example.test`,
        passwordHash: 'x',
        role: 'vlumetech_superadmin',
        mfaRequired,
        mfaEnabledAt: enrolled ? new Date() : null,
      },
    });
    staffIds.push(row.id);
    const user: JwtPayload = { sub: row.id, email: row.email, role: 'vlumetech_superadmin' };
    return user;
  }

  it('refuses a staff account that must enrol and has not', async () => {
    const user = await newStaff(true, false);
    await expect(guard().canActivate(contextFor(user))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a staff account once it has enrolled', async () => {
    const user = await newStaff(true, true);
    await expect(guard().canActivate(contextFor(user))).resolves.toBe(true);
  });

  it('grandfathers an account that predates enforcement', async () => {
    const user = await newStaff(false, false);
    await expect(guard().canActivate(contextFor(user))).resolves.toBe(true);
  });

  it('lets an exempt route through, so enrolment stays reachable', async () => {
    const user = await newStaff(true, false);
    await expect(guard({ exempt: true }).canActivate(contextFor(user))).resolves.toBe(true);
  });

  it('ignores unauthenticated requests — public routes are the JWT guard’s business', async () => {
    await expect(guard().canActivate(contextFor(undefined))).resolves.toBe(true);
  });

  it('refuses a client user whose tenant requires MFA and who has not enrolled', async () => {
    seq += 1;
    const tenant = await runAsSystem('test setup', () =>
      db.tenant.create({ data: { name: `mfa-enforce-${seq}-${Date.now()}`, requireMfa: true } }),
    );
    tenantIds.push(tenant.id);

    const clientUser = await runInTenant(tenant.id, () =>
      db.tenantUser.create({
        data: {
          tenantId: tenant.id,
          email: `client-${seq}-${Date.now()}@example.test`,
          passwordHash: 'x',
          role: 'client_admin',
          // What createTenantUser copies from the tenant's policy.
          mfaRequired: true,
        },
      }),
    );

    const user: JwtPayload = {
      sub: clientUser.id,
      email: clientUser.email,
      role: 'client_admin',
      tenantId: tenant.id,
    };
    await expect(guard().canActivate(contextFor(user))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reads the same exemption the enrolment routes set', () => {
    // If the decorator and the guard ever disagreed on the metadata key, every
    // new account would be locked out of the only page that can unblock it.
    class Probe {
      @AllowUnenrolledMfa()
      handler() {
        return undefined;
      }
    }
    expect(new Reflector().get(ALLOW_UNENROLLED_MFA_KEY, Probe.prototype.handler)).toBe(true);
  });
});
