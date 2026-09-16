import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { runAsSystem } from '../prisma/tenant-context';

export type AccessLevel = 'full' | 'trial' | 'readonly' | 'suspended' | 'offboarded';

export interface TenantAccess {
  level: AccessLevel;
  selfSignup: boolean;
  approved: boolean;
  trialEndsAt: Date | null;
  daysLeft: number | null;
  seatLimit: number | null;
  licenseTier: string | null;
}

/**
 * Resolves what a tenant may currently do. Self-signup clients get a 7-day
 * explore-only trial (no campaigns) that becomes read-only if it lapses before
 * a Vlumetech admin approves them. Approved clients, and all staff-onboarded
 * (non-self-signup) clients, get full access subject to normal status.
 */
@Injectable()
export class TrialService {
  constructor(private readonly prisma: PrismaService) {}

  async access(tenantId: string): Promise<TenantAccess> {
    const t = await runAsSystem('trial: read tenant access', () =>
      this.prisma.db.tenant.findUnique({
        where: { id: tenantId },
        select: {
          status: true,
          selfSignup: true,
          trialEndsAt: true,
          approvedAt: true,
          seatLimit: true,
          licenseTier: true,
        },
      }),
    );

    const base = {
      selfSignup: t?.selfSignup ?? false,
      approved: t?.approvedAt != null,
      trialEndsAt: t?.trialEndsAt ?? null,
      seatLimit: t?.seatLimit ?? null,
      licenseTier: t?.licenseTier ?? null,
    };

    if (!t) return { level: 'offboarded', daysLeft: null, ...base };
    if (t.status === 'offboarded') return { level: 'offboarded', daysLeft: null, ...base };
    if (t.status === 'suspended') return { level: 'suspended', daysLeft: null, ...base };

    // Approved, or never a self-signup → full access (normal status applies).
    if (!t.selfSignup || t.approvedAt) return { level: 'full', daysLeft: null, ...base };

    // Unapproved self-signup: trial while the clock runs, then read-only.
    const now = Date.now();
    const ends = t.trialEndsAt ? t.trialEndsAt.getTime() : now;
    if (now < ends) {
      const daysLeft = Math.ceil((ends - now) / 86_400_000);
      return { level: 'trial', daysLeft, ...base };
    }
    return { level: 'readonly', daysLeft: 0, ...base };
  }
}
