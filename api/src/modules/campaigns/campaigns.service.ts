import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { randomBytes, randomInt } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId, runAsSystem } from '../../common/prisma/tenant-context';
import { AuditService } from '../../common/audit/audit.service';
import { DomainsService } from '../domains/domains.service';
import { SEND_QUEUE } from '../../queue/queue.constants';
import type { SendJob } from '../../queue/queue.constants';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly domains: DomainsService,
    @InjectQueue(SEND_QUEUE) private readonly sendQueue: Queue<SendJob>,
  ) {}

  /**
   * Reaching this method already means the consent gate passed. Scenarios must
   * additionally be approved before they can be attached.
   */
  async create(input: {
    name: string;
    scenarioIds: string[];
    scheduledSendAt?: Date;
    sendWindowMinutes?: number;
    recurrenceDays?: number;
  }) {
    if (!input.scenarioIds.length) {
      throw new BadRequestException('A campaign needs at least one scenario');
    }

    const scenarios = await this.prisma.db.scenario.findMany({
      where: { id: { in: input.scenarioIds } },
      select: { id: true, approvedAt: true, title: true },
    });

    if (scenarios.length !== input.scenarioIds.length) {
      throw new BadRequestException('One or more scenarios do not exist in this tenant');
    }
    const unapproved = scenarios.filter((s) => !s.approvedAt);
    if (unapproved.length) {
      throw new BadRequestException(
        `Not approved for use: ${unapproved.map((s) => s.title).join(', ')}`,
      );
    }

    const tenantId = currentTenantId();
    const campaign = await this.prisma.db.campaign.create({
      data: {
        tenantId,
        name: input.name,
        scheduledSendAt: input.scheduledSendAt,
        sendWindowMinutes: input.sendWindowMinutes ?? 0,
        recurrenceDays: input.recurrenceDays,
        campaignScenarios: {
          create: scenarios.map((s) => ({ scenarioId: s.id, tenantId })),
        },
      },
      include: { campaignScenarios: true },
    });
    await this.audit.record(
      'campaign.create',
      `"${input.name}"${input.scheduledSendAt ? ` scheduled ${input.scheduledSendAt.toISOString()}` : ''}${input.recurrenceDays ? ` recurring every ${input.recurrenceDays}d` : ''}`,
    );
    return campaign;
  }

  /** Sets or clears the scheduled send time on a draft campaign. */
  async schedule(campaignId: string, scheduledSendAt: Date | null) {
    const campaign = await this.findOne(campaignId);
    if (campaign.status !== 'draft') {
      throw new ConflictException('Only a draft campaign can be scheduled');
    }
    const updated = await this.prisma.db.campaign.update({
      where: { id: campaignId },
      data: { scheduledSendAt },
    });
    await this.audit.record(
      'campaign.schedule',
      `"${campaign.name}" ${scheduledSendAt ? `-> ${scheduledSendAt.toISOString()}` : 'cleared'}`,
    );
    return updated;
  }

  /**
   * Pre-launch checklist: everything that must be true before a campaign can
   * safely go out. Surfaces the deliverability gate (client IT allow-list) that
   * the onboarding checklist calls for, alongside the consent and content gates.
   */
  async preflight(campaignId: string) {
    const campaign = await this.findOne(campaignId);
    const tenantId = currentTenantId();
    const tenant = await runAsSystem('preflight: read tenant', () =>
      this.prisma.db.tenant.findUnique({
        where: { id: tenantId },
        select: {
          ndpaAgreementSignedAt: true,
          sendingDomain: true,
          allowlistConfirmedAt: true,
        },
      }),
    );

    const [employeeCount, scenarioCount, approvedCount] = await Promise.all([
      this.prisma.db.employee.count(),
      this.prisma.db.campaignScenario.count({ where: { campaignId } }),
      this.prisma.db.scenario.count({
        where: {
          approvedAt: { not: null },
          campaignScenarios: { some: { campaignId } },
        },
      }),
    ]);

    const checks = [
      { key: 'agreementSigned', label: 'NDPA authorization agreement signed', ok: !!tenant?.ndpaAgreementSignedAt },
      { key: 'employeesUploaded', label: 'Employees uploaded', ok: employeeCount > 0, detail: `${employeeCount} employees` },
      { key: 'scenariosAttached', label: 'At least one scenario attached', ok: scenarioCount > 0 },
      { key: 'scenariosApproved', label: 'All attached scenarios approved', ok: scenarioCount > 0 && approvedCount === scenarioCount, detail: `${approvedCount}/${scenarioCount} approved` },
      { key: 'sendingDomain', label: 'Sending / tracking domain configured', ok: !!(tenant?.sendingDomain || process.env.TRACKING_BASE_URL) },
      { key: 'gatewayAllowlist', label: "Client IT confirmed our IPs are allow-listed", ok: !!tenant?.allowlistConfirmedAt },
    ];

    return {
      campaignId,
      status: campaign.status,
      ready: checks.every((c) => c.ok),
      checks,
    };
  }

  list() {
    return this.prisma.db.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: { campaignScenarios: { include: { scenario: { select: { id: true, title: true } } } } },
    });
  }

  async findOne(id: string) {
    const campaign = await this.prisma.db.campaign.findUnique({
      where: { id },
      include: { campaignScenarios: { include: { scenario: true } } },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  /**
   * Materialises one send row per employee per scenario, then enqueues them.
   * Rows are created before any job runs so the kill switch has something to
   * halt and reporting has a complete denominator.
   */
  async launch(campaignId: string) {
    const campaign = await this.findOne(campaignId);
    if (campaign.status === 'killed') {
      throw new ConflictException('Campaign was killed and cannot be relaunched');
    }
    if (campaign.status === 'active') {
      throw new ConflictException('Campaign is already active');
    }
    if (campaign.status === 'completed') {
      throw new ConflictException('Campaign already completed');
    }

    const allEmployees = await this.prisma.db.employee.findMany({ select: { id: true, email: true } });
    if (!allEmployees.length) {
      throw new BadRequestException('No employees uploaded for this tenant');
    }

    // Domain guard (defence in depth): only send to addresses on a verified
    // domain, even if an employee row predates verification.
    const verifiedDomains = await this.domains.verifiedSet();
    const employees = allEmployees.filter((e) => verifiedDomains.has(DomainsService.domainOf(e.email)));
    if (!employees.length) {
      throw new BadRequestException(
        'No recipients on a verified domain. Verify the domain you own under People → Domains before launching.',
      );
    }

    const tenantId = currentTenantId();
    const scenarioIds = campaign.campaignScenarios.map((cs) => cs.scenarioId);

    const rows = employees.flatMap((employee) =>
      scenarioIds.map((scenarioId) => ({
        tenantId,
        campaignId,
        employeeId: employee.id,
        scenarioId,
        uniqueTrackingToken: randomBytes(24).toString('base64url'),
      })),
    );

    await this.prisma.db.send.createMany({ data: rows, skipDuplicates: true });

    // Read back so resumed launches enqueue exactly the un-sent rows.
    const pending = await this.prisma.db.send.findMany({
      where: { campaignId, sentAt: null },
      select: { id: true },
    });

    await this.prisma.db.campaign.update({
      where: { id: campaignId },
      data: { status: 'active', launchedAt: new Date() },
    });

    // Drip delivery: spread sends randomly across the window so they do not
    // land as one identifiable burst. windowMinutes = 0 means send now.
    const windowMs = Math.max(0, campaign.sendWindowMinutes) * 60_000;
    await this.sendQueue.addBulk(
      pending.map((send) => ({
        name: 'send-simulation',
        data: { sendId: send.id, tenantId, campaignId },
        opts: {
          jobId: `send-${send.id}`,
          delay: windowMs > 0 ? randomInt(0, windowMs + 1) : 0,
        },
      })),
    );

    // Recurrence: chain the next occurrence as a fresh scheduled draft. The
    // scheduler tick launches it when due. One clone per launch, so it advances
    // one step at a time rather than fanning out.
    if (campaign.recurrenceDays && campaign.recurrenceDays > 0) {
      await this.scheduleNextOccurrence(campaign, tenantId);
    }

    await this.audit.record(
      'campaign.launch',
      `"${campaign.name}" queued ${pending.length} sends${windowMs ? ` over ${campaign.sendWindowMinutes}m` : ''}`,
    );

    return {
      campaignId,
      status: 'active',
      queued: pending.length,
      windowMinutes: campaign.sendWindowMinutes,
    };
  }

  /** Clones a recurring campaign into the next scheduled draft occurrence. */
  private async scheduleNextOccurrence(
    campaign: { id: string; name: string; recurrenceDays: number | null; sendWindowMinutes: number; parentCampaignId: string | null; campaignScenarios: Array<{ scenarioId: string }> },
    tenantId: string,
  ) {
    const nextAt = new Date(Date.now() + (campaign.recurrenceDays ?? 0) * 86_400_000);
    const root = campaign.parentCampaignId ?? campaign.id;
    await this.prisma.db.campaign.create({
      data: {
        tenantId,
        name: campaign.name,
        status: 'draft',
        scheduledSendAt: nextAt,
        sendWindowMinutes: campaign.sendWindowMinutes,
        recurrenceDays: campaign.recurrenceDays,
        parentCampaignId: root,
        campaignScenarios: {
          create: campaign.campaignScenarios.map((cs) => ({ scenarioId: cs.scenarioId, tenantId })),
        },
      },
    });
  }

  async pause(campaignId: string) {
    const campaign = await this.findOne(campaignId);
    if (campaign.status !== 'active') {
      throw new ConflictException(`Cannot pause a ${campaign.status} campaign`);
    }
    return this.prisma.db.campaign.update({
      where: { id: campaignId },
      data: { status: 'paused' },
    });
  }

  async resume(campaignId: string) {
    const campaign = await this.findOne(campaignId);
    if (campaign.status !== 'paused') {
      throw new ConflictException(`Cannot resume a ${campaign.status} campaign`);
    }
    await this.prisma.db.campaign.update({ where: { id: campaignId }, data: { status: 'active' } });
    return this.launchPending(campaignId);
  }

  /**
   * Kill switch. One action: the status flips first so in-flight workers stop
   * sending, then queued jobs are drained. Irreversible by design.
   */
  async kill(campaignId: string) {
    const campaign = await this.findOne(campaignId);
    if (campaign.status === 'killed') return { campaignId, status: 'killed', removedJobs: 0 };

    await this.prisma.db.campaign.update({
      where: { id: campaignId },
      data: { status: 'killed', killedAt: new Date() },
    });
    await this.audit.record('campaign.kill', `"${campaign.name}" killed`);

    const unsent = await this.prisma.db.send.findMany({
      where: { campaignId, sentAt: null },
      select: { id: true },
    });

    let removedJobs = 0;
    for (const send of unsent) {
      const job = await this.sendQueue.getJob(`send-${send.id}`);
      if (job) {
        try {
          await job.remove();
          removedJobs += 1;
        } catch {
          // Already running: the status check in the processor stops it.
        }
      }
    }

    return { campaignId, status: 'killed', removedJobs, unsentRemaining: unsent.length };
  }

  private async launchPending(campaignId: string) {
    const tenantId = currentTenantId();
    const pending = await this.prisma.db.send.findMany({
      where: { campaignId, sentAt: null },
      select: { id: true },
    });
    await this.sendQueue.addBulk(
      pending.map((send) => ({
        name: 'send-simulation',
        data: { sendId: send.id, tenantId, campaignId },
        opts: { jobId: `send-${send.id}` },
      })),
    );
    return { campaignId, status: 'active', queued: pending.length };
  }
}
