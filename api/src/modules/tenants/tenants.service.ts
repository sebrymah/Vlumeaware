import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { runAsSystem, runInTenant } from '../../common/prisma/tenant-context';
import { AuthService } from '../../common/auth/auth.service';
import { AuditService } from '../../common/audit/audit.service';
import { TrialService } from '../../common/trial/trial.service';
import { StorageService } from '../../providers/storage/storage.service';
import type { TenantRole } from '@prisma/client';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly trial: TrialService,
  ) {}

  create(input: { name: string; brandPrimaryColor?: string; brandLogoUrl?: string }) {
    return this.prisma.db.tenant.create({
      data: {
        name: input.name,
        brandPrimaryColor: input.brandPrimaryColor,
        brandLogoUrl: input.brandLogoUrl,
      },
    });
  }

  list() {
    return this.prisma.db.tenant.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const tenant = await this.prisma.db.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  /** Uploads the signed NDPA agreement and opens the consent gate. */
  async recordAgreement(
    tenantId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
    signedAt: Date,
  ) {
    await this.findOne(tenantId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('An agreement document is required');
    }
    const docUrl = await this.storage.put(`agreements/${tenantId}`, file.buffer, file.mimetype);
    return this.prisma.db.tenant.update({
      where: { id: tenantId },
      data: { ndpaAgreementSignedAt: signedAt, ndpaAgreementDocUrl: docUrl },
    });
  }

  async setStatus(tenantId: string, status: 'active' | 'suspended' | 'offboarded') {
    await this.findOne(tenantId);
    return this.prisma.db.tenant.update({ where: { id: tenantId }, data: { status } });
  }

  /**
   * Sets the client's license tier and seat limit. A seat limit below the
   * client's current employee count is rejected — existing employees are never
   * silently orphaned; the client must remove employees first, or the limit be
   * raised.
   */
  async setLicense(
    tenantId: string,
    input: { licenseTier?: string | null; seatLimit?: number | null },
  ) {
    await this.findOne(tenantId);
    if (input.seatLimit != null) {
      const current = await runAsSystem('license: count employees', () =>
        this.prisma.db.employee.count({ where: { tenantId } }),
      );
      if (input.seatLimit < current) {
        throw new BadRequestException(
          `Seat limit ${input.seatLimit} is below the client's current ${current} employees. Raise the limit or remove employees first.`,
        );
      }
    }
    const updated = await this.prisma.db.tenant.update({
      where: { id: tenantId },
      data: { licenseTier: input.licenseTier, seatLimit: input.seatLimit },
    });
    await this.audit.record(
      'tenant.license',
      `tier=${input.licenseTier ?? '—'} seatLimit=${input.seatLimit ?? 'unlimited'}`,
      tenantId,
    );
    return updated;
  }

  /** Seat usage for display: how many of the licensed seats are in use. */
  async seatUsage(tenantId: string) {
    const tenant = await this.findOne(tenantId);
    const used = await runAsSystem('license: seat usage', () =>
      this.prisma.db.employee.count({ where: { tenantId } }),
    );
    return {
      licenseTier: tenant.licenseTier,
      seatLimit: tenant.seatLimit,
      used,
      remaining: tenant.seatLimit == null ? null : Math.max(0, tenant.seatLimit - used),
    };
  }

  /**
   * Records deliverability readiness: the sending/tracking domain and whether
   * the client's IT team has confirmed our sending IPs are allow-listed at
   * their gateway (the onboarding step every phishing-sim platform needs).
   */
  async setDeliverability(
    tenantId: string,
    input: { sendingDomain?: string; allowlistConfirmed?: boolean },
  ) {
    await this.findOne(tenantId);
    return this.prisma.db.tenant.update({
      where: { id: tenantId },
      data: {
        sendingDomain: input.sendingDomain,
        allowlistConfirmedAt:
          input.allowlistConfirmed === undefined
            ? undefined
            : input.allowlistConfirmed
              ? new Date()
              : null,
      },
    });
  }

  /** Creates a client-side admin or viewer account within one tenant. */
  async createTenantUser(tenantId: string, input: { email: string; password: string; role: TenantRole }) {
    await this.findOne(tenantId);
    const passwordHash = await AuthService.hash(input.password);
    return runInTenant(tenantId, () =>
      this.prisma.db.tenantUser.create({
        data: { tenantId, email: input.email, passwordHash, role: input.role },
        select: { id: true, email: true, role: true, tenantId: true, createdAt: true },
      }),
    );
  }

  listTenantUsers(tenantId: string) {
    return runInTenant(tenantId, () =>
      this.prisma.db.tenantUser.findMany({
        select: { id: true, email: true, role: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  /** Enables/disables the periodic email digest for a tenant. */
  async setDigest(tenantId: string, input: { digestEnabled?: boolean; digestEmail?: string }) {
    await this.findOne(tenantId);
    return this.prisma.db.tenant.update({
      where: { id: tenantId },
      data: { digestEnabled: input.digestEnabled, digestEmail: input.digestEmail },
    });
  }

  /** Self-signups awaiting a Vlumetech admin's approval. */
  listPendingSignups() {
    return runAsSystem('list pending signups', () =>
      this.prisma.db.tenant.findMany({
        where: { selfSignup: true, approvedAt: null, status: { not: 'offboarded' } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          createdAt: true,
          trialEndsAt: true,
          seatLimit: true,
          _count: { select: { tenantUsers: true, employees: true } },
        },
      }),
    );
  }

  /**
   * Approves a self-signup into a standing account. Optionally sets a paid tier
   * and seat limit at the same time; otherwise the free-tier limit carries over.
   */
  async approveSignup(
    tenantId: string,
    actorId: string | undefined,
    input: { licenseTier?: string; seatLimit?: number } = {},
  ) {
    const tenant = await this.findOne(tenantId);
    if (!tenant.selfSignup) {
      throw new BadRequestException('Only self-signup tenants require approval');
    }
    if (input.seatLimit != null) {
      const current = await runAsSystem('approve: count employees', () =>
        this.prisma.db.employee.count({ where: { tenantId } }),
      );
      if (input.seatLimit < current) {
        throw new BadRequestException(
          `Seat limit ${input.seatLimit} is below the client's current ${current} employees.`,
        );
      }
    }
    const updated = await this.prisma.db.tenant.update({
      where: { id: tenantId },
      data: {
        approvedAt: new Date(),
        approvedById: actorId ?? null,
        status: 'active',
        licenseTier: input.licenseTier ?? tenant.licenseTier ?? 'Approved',
        seatLimit: input.seatLimit ?? tenant.seatLimit,
      },
    });
    await this.audit.record('tenant.approve', `approved self-signup "${tenant.name}"`, tenantId);
    return updated;
  }

  /** Trial/access status for a tenant, for banners and gating in the UI. */
  trialStatus(tenantId: string) {
    return this.trial.access(tenantId);
  }

  /** Cross-client overview for the Vlumetech console. */
  async crossClientOverview() {
    return runAsSystem('superadmin cross-client overview', async () => {
      const tenants = await this.prisma.db.tenant.findMany({ orderBy: { name: 'asc' } });
      const rows = await Promise.all(
        tenants.map(async (tenant) => {
          const [campaigns, sends, clicked, reported] = await Promise.all([
            this.prisma.db.campaign.count({ where: { tenantId: tenant.id } }),
            this.prisma.db.send.count({ where: { tenantId: tenant.id, sentAt: { not: null } } }),
            this.prisma.db.send.count({ where: { tenantId: tenant.id, clickedAt: { not: null } } }),
            this.prisma.db.send.count({ where: { tenantId: tenant.id, reportedAt: { not: null } } }),
          ]);
          return {
            tenantId: tenant.id,
            name: tenant.name,
            status: tenant.status,
            agreementSigned: tenant.ndpaAgreementSignedAt !== null,
            campaigns,
            sends,
            clickRate: sends ? clicked / sends : 0,
            reportRate: sends ? reported / sends : 0,
          };
        }),
      );
      return rows;
    });
  }
}
