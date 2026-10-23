import { UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { JwtStrategy } from '../src/common/auth/jwt.strategy';
import { ROLES } from '../src/common/auth/roles';
import type { JwtPayload } from '../src/common/auth/roles';

/**
 * A staff (superadmin) bearer token must stop working the moment the account is
 * deactivated — not at token expiry. The strategy re-reads the row on every
 * request; this proves the staff branch honours deactivation, which it did not
 * before (it only checked the row existed).
 */
process.env.JWT_SECRET ??= 'test-secret-that-is-at-least-32-characters-long';
const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;
const strategy = new JwtStrategy(prisma);

const staffIds: string[] = [];

afterAll(async () => {
  if (staffIds.length) {
    await runAsSystem('teardown', () => db.user.deleteMany({ where: { id: { in: staffIds } } }));
  }
  await base.$disconnect();
});

async function staff(data: Record<string, unknown> = {}) {
  const u = await runAsSystem('setup', () =>
    db.user.create({
      data: {
        email: `staff-${Date.now()}-${Math.random()}@x.test`,
        passwordHash: 'x',
        role: 'vlumetech_superadmin',
        ...data,
      },
    }),
  );
  staffIds.push(u.id);
  return u;
}

const token = (sub: string): JwtPayload => ({ sub, email: 's@x.test', role: ROLES.superadmin });

describe('JwtStrategy — staff session revocation', () => {
  it('accepts an active staff token', async () => {
    const u = await staff();
    await expect(strategy.validate(token(u.id))).resolves.toMatchObject({ sub: u.id });
  });

  it('rejects a deactivated staff token even though the row still exists', async () => {
    const u = await staff({ deactivatedAt: new Date() });
    await expect(strategy.validate(token(u.id))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token whose staff subject no longer exists', async () => {
    await expect(strategy.validate(token('00000000-0000-0000-0000-000000000000'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
