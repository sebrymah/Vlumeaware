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
    employeeIds?: string[];
    scheduledSendAt?: Date;
    sendWindowMinutes?: number;
    recurrenceDays?: number;
    sendingDomainId?: string;
    fromLocalPart?: string;
  }) {
    if (!input.scenarioIds.length) {
      throw new BadRequestException('A campaign needs at least one scenario');
    }

    // Recipient targeting: empty = all staff. Any explicit IDs must be this
    // tenant's own employees (read under tenant scope, so cross-tenant IDs
    // simply won't be found).
    const targetEmployeeIds = input.employeeIds ?? [];
    if (targetEmployeeIds.length) {
      const found = await this.prisma.db.employee.count({ where: { id: { in: targetEmployeeIds } } });
      if (found !== targetEmployeeIds.length) {
        throw new BadRequestException('One or more selected recipients do not exist in this tenant');
      }
    }

    // Scenario approval was removed: a client's own scenarios, and the ones
    // they take from the shared library, are usable as soon as they exist.
    // Attachment now only checks the scenarios are real and belong here.
    const scenarios = await this.prisma.db.scenario.findMany({
      where: { id: { in: input.scenarioIds } },
      select: { id: true },
    });
    if (scenarios.length !== input.scenarioIds.length) {
      throw new BadRequestException('One or more scenarios do not exist in this tenant');
    }

    // A chosen sending domain must be this tenant's own and verified. Read
    // under tenant scope, so another tenant's domain simply is not found.
    if (input.sendingDomainId) {
      const domain = await this.prisma.db.sendingDomain.findUnique({
        where: { id: input.sendingDomainId },
        select: { status: true },
      });
      if (!domain) throw new BadRequestException('Selected sending domain does not exist in this tenant');
      if (domain.status !== 'verified') {
        throw new BadRequestException('Selected sending domain is not verified yet');
      }
    }

    const tenantId = currentTenantId();
    const campaign = await this.prisma.db.campaign.create({
      data: {
        tenantId,
        name: input.name,
        scheduledSendAt: input.scheduledSendAt,
        sendWindowMinutes: input.sendWindowMinutes ?? 0,
        recurrenceDays: input.recurrenceDays,
        targetEmployeeIds,
        sendingDomainId: input.sendingDomainId ?? null,
        fromLocalPart: input.fromLocalPart?.trim() || null,
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
          allowlistConfirmedAt: true,
        },
      }),
    );

    const [employeeCount, scenarioCount, sendingDomain] = await Promise.all([
      this.prisma.db.employee.count(),
      this.prisma.db.campaignScenario.count({ where: { campaignId } }),
      campaign.sendingDomainId
        ? this.prisma.db.sendingDomain.findUnique({
            where: { id: campaign.sendingDomainId },
            select: { domain: true, status: true },
          })
        : Promise.resolve(null),
    ]);

    const checks = [
      { key: 'agreementSigned', label: 'NDPA authorization agreement signed', ok: !!tenant?.ndpaAgreementSignedAt },
      { key: 'employeesUploaded', label: 'Employees uploaded', ok: employeeCount > 0, detail: `${employeeCount} employees` },
      { key: 'scenariosAttached', label: 'At least one scenario attached', ok: scenarioCount > 0 },
      {
        key: 'sendingDomain',
        label: 'Verified sending domain chosen for this campaign',
        ok: !!sendingDomain && sendingDomain.status === 'verified',
        detail: sendingDomain
          ? `${sendingDomain.domain}${sendingDomain.status !== 'verified' ? ' (not verified)' : ''}`
          : 'none chosen',
      },
      { key: 'trackingConfigured', label: 'Tracking domain configured', ok: !!process.env.TRACKING_BASE_URL },
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

  /** Per-recipient delivery + engagement status for a campaign. */
  async recipients(campaignId: string) {
    await this.findOne(campaignId);
    const rows = await this.prisma.db.send.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'asc' },
      include: { employee: { select: { id: true, name: true, email: true, department: true } } },
    });
    return rows.map((s) => ({
      employeeId: s.employee.id,
      name: s.employee.name,
      email: s.employee.email,
      department: s.employee.department,
      sentAt: s.sentAt,
      openedAt: s.openedAt,
      clickedAt: s.clickedAt,
      credentialsSubmitted: s.credentialsSubmitted,
      reportedAt: s.reportedAt,
    }));
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

    // The preflight gates are enforced here, not merely reported. They used to
    // be advisory: the endpoint existed, nothing called it, and a campaign
    // could go out with an unsigned agreement or a mail gateway that had never
    // been told to let it through — which lands the whole send in quarantine
    // and reports a clean result that is not real.
    //
    // Enforcing in launch() rather than in the controller covers the scheduler
    // too: SchedulerProcessor auto-launches due campaigns through this same
    // method, and a scheduled send is exactly the one nobody is watching.
    const pre = await this.preflight(campaignId);
    if (!pre.ready) {
      const outstanding = pre.checks.filter((c) => !c.ok);
      throw new BadRequestException(
        `Not ready to launch. Outstanding: ${outstanding
          .map((c) => c.detail ? `${c.label} (${c.detail})` : c.label)
          .join('; ')}.`,
      );
    }

    // Recipient set: the campaign's selected employees, or the whole roster
    // when none were selected.
    const targetIds = campaign.targetEmployeeIds ?? [];
    const allEmployees = await this.prisma.db.employee.findMany({
      where: targetIds.length ? { id: { in: targetIds } } : undefined,
      select: { id: true, email: true },
    });
    if (!allEmployees.length) {
      throw new BadRequestException(
        targetIds.length
          ? 'None of the selected recipients are on the roster anymore.'
          : 'No employees uploaded for this tenant',
      );
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
