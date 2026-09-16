import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConsentGuard } from '../src/common/consent/consent.guard';
import { ROLES } from '../src/common/auth/roles';

function ctx(user: unknown, params: Record<string, string> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  } as unknown as ExecutionContext;
}

function guardWith(tenant: unknown) {
  const prisma = { db: { tenant: { findUnique: jest.fn().mockResolvedValue(tenant) } } };
  return { guard: new ConsentGuard(prisma as never), prisma };
}

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

describe('ConsentGuard', () => {
  it('blocks a tenant with no signed agreement', async () => {
    const { guard } = guardWith({ id: TENANT_ID, status: 'active', ndpaAgreementSignedAt: null });
    await expect(
      guard.canActivate(ctx({ role: ROLES.clientAdmin, tenantId: TENANT_ID })),
    ).rejects.toThrow(/no signed NDPA authorization agreement/i);
  });

  it('allows a tenant with a signed agreement', async () => {
    const { guard } = guardWith({
      id: TENANT_ID,
      status: 'active',
      ndpaAgreementSignedAt: new Date(),
    });
    await expect(
      guard.canActivate(ctx({ role: ROLES.clientAdmin, tenantId: TENANT_ID })),
    ).resolves.toBe(true);
  });

  it('blocks a suspended tenant even with a signed agreement', async () => {
    const { guard } = guardWith({
      id: TENANT_ID,
      status: 'suspended',
      ndpaAgreementSignedAt: new Date(),
    });
    await expect(
      guard.canActivate(ctx({ role: ROLES.clientAdmin, tenantId: TENANT_ID })),
    ).rejects.toThrow(/suspended/);
  });

  it('blocks an unknown tenant', async () => {
    const { guard } = guardWith(null);
    await expect(
      guard.canActivate(ctx({ role: ROLES.clientAdmin, tenantId: TENANT_ID })),
    ).rejects.toThrow(/Unknown tenant/);
  });

  it('requires authentication', async () => {
    const { guard } = guardWith({ id: TENANT_ID, status: 'active', ndpaAgreementSignedAt: new Date() });
    await expect(guard.canActivate(ctx(undefined))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('checks the addressed tenant for a superadmin, not their own', async () => {
    const { guard, prisma } = guardWith({
      id: TENANT_ID,
      status: 'active',
      ndpaAgreementSignedAt: new Date(),
    });
    await expect(
      guard.canActivate(ctx({ role: ROLES.superadmin }, { tenantId: TENANT_ID })),
    ).resolves.toBe(true);
    expect(prisma.db.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TENANT_ID } }),
    );
  });
});
