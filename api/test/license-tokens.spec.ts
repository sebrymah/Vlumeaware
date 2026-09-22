import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem } from '../src/common/prisma/tenant-context';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuditService } from '../src/common/audit/audit.service';
import { LicensesService } from '../src/modules/licenses/licenses.service';
import { generateLicenseKey, hashLicenseKey, normaliseLicenseKey } from '../src/modules/licenses/license-key';

const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);
const prisma = { db } as unknown as PrismaService;
const licenses = new LicensesService(prisma, new AuditService(prisma));

const uniq = () => `lic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const sys = <T>(fn: () => Promise<T>) => runAsSystem('test', fn);
const created: string[] = [];

async function newTenant(overrides: Record<string, unknown> = {}) {
  const t = await sys(() =>
    db.tenant.create({
      data: { name: uniq(), selfSignup: true, licenseTier: 'Free trial', seatLimit: 20, ...overrides },
    }),
  );
  created.push(t.id);
  return t.id;
}

beforeAll(async () => {
  await base.$connect();
});
afterAll(async () => {
  await sys(() => base.tenant.deleteMany({ where: { id: { in: created } } }));
  await base.$disconnect();
});

describe('license key format', () => {
  it('avoids characters people confuse when retyping a key', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateLicenseKey()).toMatch(/^VLA-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{5}(-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{5}){3}$/);
    }
  });

  it('treats a sloppily pasted key as the same key', () => {
    const key = generateLicenseKey();
    const mangled = key.toLowerCase().replace(/-/g, ' ');
    expect(normaliseLicenseKey(mangled)).toBe(key);
    expect(hashLicenseKey(mangled)).toBe(hashLicenseKey(key));
  });

  it('does not generate the same key twice', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateLicenseKey()));
    expect(seen.size).toBe(500);
  });
});

describe('issuing and redeeming', () => {
  it('activates the account, sets tier and seats, and clears the trial', async () => {
    const tenantId = await newTenant();
    const { key } = await licenses.issue(tenantId, 'staff-1', { licenseTier: 'Growth', seatLimit: 250 });

    const res = await licenses.redeem(tenantId, 'admin@client.test', key);

    expect(res).toEqual({ activated: true, licenseTier: 'Growth', seatLimit: 250 });
    const t = await sys(() => db.tenant.findUnique({ where: { id: tenantId } }));
    expect(t?.licenseTier).toBe('Growth');
    expect(t?.seatLimit).toBe(250);
    expect(t?.status).toBe('active');
    expect(t?.approvedAt).toBeInstanceOf(Date);
    expect(t?.trialEndsAt).toBeNull();
  });

  it('never stores the key itself', async () => {
    const tenantId = await newTenant();
    const { key } = await licenses.issue(tenantId, 'staff-1', { licenseTier: 'Starter' });

    const rows = await sys(() => db.licenseToken.findMany({ where: { tenantId } }));
    const serialised = JSON.stringify(rows);
    expect(serialised).not.toContain(key);
    expect(rows[0].tokenHash).toBe(hashLicenseKey(key));
    // The hint is the last four characters and nothing more.
    expect(rows[0].displayHint).toBe(key.slice(-4));
  });

  it('cannot be redeemed twice', async () => {
    const tenantId = await newTenant();
    const { key } = await licenses.issue(tenantId, 'staff-1', { licenseTier: 'Starter' });
    await licenses.redeem(tenantId, 'admin@client.test', key);
    await expect(licenses.redeem(tenantId, 'admin@client.test', key)).rejects.toThrow(/not valid for this account/i);
  });

  // The key is the only secret, so one leaked key must not upgrade a different
  // client that the holder happens to control.
  it('cannot be redeemed by the tenant it was not issued to', async () => {
    const issuedFor = await newTenant();
    const attacker = await newTenant();
    const { key } = await licenses.issue(issuedFor, 'staff-1', { licenseTier: 'Enterprise', seatLimit: 9999 });

    await expect(licenses.redeem(attacker, 'bad@other.test', key)).rejects.toThrow(/not valid for this account/i);

    const t = await sys(() => db.tenant.findUnique({ where: { id: attacker } }));
    expect(t?.licenseTier).toBe('Free trial');
    expect(t?.seatLimit).toBe(20);
  });

  it('refuses an expired key', async () => {
    const tenantId = await newTenant();
    const { key, id } = await licenses.issue(tenantId, 'staff-1', { licenseTier: 'Starter' });
    await sys(() =>
      db.licenseToken.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } }),
    );
    await expect(licenses.redeem(tenantId, 'admin@client.test', key)).rejects.toThrow(/not valid for this account/i);
  });

  it('refuses a revoked key', async () => {
    const tenantId = await newTenant();
    const { key, id } = await licenses.issue(tenantId, 'staff-1', { licenseTier: 'Starter' });
    await licenses.revoke(tenantId, id);
    await expect(licenses.redeem(tenantId, 'admin@client.test', key)).rejects.toThrow(/not valid for this account/i);
  });

  it('refuses a garbage key without leaking whether it exists', async () => {
    const tenantId = await newTenant();
    await expect(licenses.redeem(tenantId, 'admin@client.test', 'VLA-AAAAA-BBBBB-CCCCC-DDDDD')).rejects.toThrow(
      /not valid for this account/i,
    );
  });

  it('refuses a key that grants fewer seats than the roster already uses', async () => {
    const tenantId = await newTenant();
    await sys(() =>
      db.employee.createMany({
        data: Array.from({ length: 5 }, (_, i) => ({
          tenantId,
          email: `e${i}-${uniq()}@x.test`,
          name: `E${i}`,
        })),
      }),
    );
    const { key } = await licenses.issue(tenantId, 'staff-1', { licenseTier: 'Starter', seatLimit: 3 });

    await expect(licenses.redeem(tenantId, 'admin@client.test', key)).rejects.toThrow(/already has 5 employees/i);
    // And the key is still unredeemed, so a corrected one is not needed twice.
    const rows = await sys(() => db.licenseToken.findMany({ where: { tenantId } }));
    expect(rows[0].redeemedAt).toBeNull();
  });

  it('will not revoke a key that has already been redeemed', async () => {
    const tenantId = await newTenant();
    const { key, id } = await licenses.issue(tenantId, 'staff-1', { licenseTier: 'Starter' });
    await licenses.redeem(tenantId, 'admin@client.test', key);
    await expect(licenses.revoke(tenantId, id)).rejects.toThrow(/already been redeemed/i);
  });

  it('lists issued keys without exposing any of them', async () => {
    const tenantId = await newTenant();
    const a = await licenses.issue(tenantId, 'staff-1', { licenseTier: 'Starter' });
    const b = await licenses.issue(tenantId, 'staff-1', { licenseTier: 'Growth', seatLimit: 100 });

    const list = await licenses.list(tenantId);
    expect(list).toHaveLength(2);
    const serialised = JSON.stringify(list);
    expect(serialised).not.toContain(a.key);
    expect(serialised).not.toContain(b.key);
    expect(serialised).not.toContain('tokenHash');
  });
});
