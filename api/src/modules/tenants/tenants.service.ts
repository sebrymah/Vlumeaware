import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MAILER } from '../../providers/mailer/mailer.interface';
import type { Mailer } from '../../providers/mailer/mailer.interface';
import { notificationFromAddress } from '../../providers/mailer/from-addresses';
import { publicBaseUrl, trackingBaseUrl } from '../tracking/render';
import { randomBytes } from 'node:crypto';
import { escapeHtml as esc } from '../../common/html/escape';
import { PrismaService } from '../../common/prisma/prisma.service';
import { runAsSystem, runInTenant } from '../../common/prisma/tenant-context';
import { allowlistGuidance } from '../../common/config/allowlist';
import { AGREEMENT_VERSION } from '../../common/config/agreement';
import { AuthService } from '../../common/auth/auth.service';
import { AuditService } from '../../common/audit/audit.service';
import { TrialService } from '../../common/trial/trial.service';
import { StorageService } from '../../providers/storage/storage.service';
import type { TenantRole } from '@prisma/client';

/** A signed NDPA agreement: a PDF, or a photograph/scan of the signed page. */
const AGREEMENT_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg']);

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly trial: TrialService,
    @Inject(MAILER) private readonly mailer: Mailer,
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
    if (!AGREEMENT_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        `An agreement must be a PDF or a scanned image — ${file.mimetype} is not accepted.`,
      );
    }
    const docUrl = await this.storage.put(`agreements/${tenantId}`, file.buffer, file.mimetype);
    return this.prisma.db.tenant.update({
      where: { id: tenantId },
      data: {
        ndpaAgreementSignedAt: signedAt,
        ndpaAgreementDocUrl: docUrl,
        agreementMethod: 'signed_document',
        agreementVersion: AGREEMENT_VERSION,
      },
    });
  }

  /**
   * The client's own security posture: the policy they set, and the state of
   * each of their console users. Deliberately narrow, like getBranding.
   */
  async getSecurity(tenantId: string) {
    const tenant = await this.prisma.db.tenant.findUnique({
      where: { id: tenantId },
      select: { passwordMinLength: true, sessionTimeoutMinutes: true, requireMfa: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const users = await this.prisma.db.tenantUser.findMany({
      where: { tenantId },
      select: { id: true, email: true, role: true, mfaEnabledAt: true, lockedUntil: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      passwordMinLength: tenant.passwordMinLength,
      sessionTimeoutMinutes: tenant.sessionTimeoutMinutes,
      requireMfa: tenant.requireMfa,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        mfaEnabled: Boolean(u.mfaEnabledAt),
        locked: Boolean(u.lockedUntil && u.lockedUntil > new Date()),
        createdAt: u.createdAt,
      })),
    };
  }

  async setSecurity(
    tenantId: string,
    input: { passwordMinLength?: number; sessionTimeoutMinutes?: number; requireMfa?: boolean },
  ) {
    await this.findOne(tenantId);
    await this.prisma.db.tenant.update({ where: { id: tenantId }, data: input });
    return this.getSecurity(tenantId);
  }

  /** Releases a lockout early, so an admin is not stuck waiting one out. */
  async unlockUser(tenantId: string, userId: string) {
    const user = await this.prisma.db.tenantUser.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.db.tenantUser.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    return { unlocked: true };
  }

  /** This client's slice of the audit trail. */
  auditLog(tenantId: string, limit = 100) {
    return runAsSystem('client reads own audit log', () =>
      this.prisma.db.auditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 500),
      }),
    );
  }

  /**
   * The branding a client admin may read about their own tenant. Deliberately
   * narrow: findOne returns the whole tenant row — agreement document, seat
   * limits, approval metadata — which is Vlumetech's to see, not the client's.
   */
  async getBranding(tenantId: string) {
    const tenant = await this.prisma.db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        brandLogoUrl: true,
        brandPrimaryColor: true,
        certificateTemplate: true,
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return {
      name: tenant.name,
      brandPrimaryColor: tenant.brandPrimaryColor,
      certificateTemplate: tenant.certificateTemplate,
      // The stored value is a private storage reference; the page needs
      // something it can actually render.
      logoUrl: tenant.brandLogoUrl ? await this.storage.signedUrl(tenant.brandLogoUrl) : null,
    };
  }

  /**
   * Branding a client controls for themselves: the colour and certificate
   * layout their employees see. The logo is uploaded separately.
   */
  async setBranding(
    tenantId: string,
    input: { brandPrimaryColor?: string; certificateTemplate?: string },
  ) {
    await this.findOne(tenantId);
    return this.prisma.db.tenant.update({
      where: { id: tenantId },
      data: {
        brandPrimaryColor: input.brandPrimaryColor,
        certificateTemplate: input.certificateTemplate,
      },
    });
  }

  /**
   * Stores the client's logo. PNG and JPEG only: the certificate renderer
   * embeds the bytes directly into the PDF and pdf-lib can embed those two
   * formats only — an SVG would be accepted here and then fail silently at
   * render time, so it is refused up front.
   */
  async setLogo(tenantId: string, file: { buffer: Buffer; mimetype: string }) {
    await this.findOne(tenantId);
    if (!file?.buffer?.length) throw new BadRequestException('A logo image is required');
    if (!['image/png', 'image/jpeg'].includes(file.mimetype)) {
      throw new BadRequestException(
        `Logo must be a PNG or JPEG — ${file.mimetype} cannot be embedded in a certificate.`,
      );
    }
    const logoUrl = await this.storage.put(`tenant-logos/${tenantId}`, file.buffer, file.mimetype);
    return this.prisma.db.tenant.update({
      where: { id: tenantId },
      data: { brandLogoUrl: logoUrl },
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
    input: { licenseTier?: string | null; seatLimit?: number | null; termDays?: number | null },
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
    // termDays is optional and tri-state: undefined leaves the term untouched,
    // a number sets a fresh term from now, null clears it (no expiry).
    const term: { licenseStartsAt?: Date; licenseEndsAt?: Date | null } = {};
    if (input.termDays !== undefined) {
      if (input.termDays === null) {
        term.licenseEndsAt = null;
      } else {
        term.licenseStartsAt = new Date();
        term.licenseEndsAt = new Date(Date.now() + input.termDays * 86_400_000);
      }
    }
    const updated = await this.prisma.db.tenant.update({
      where: { id: tenantId },
      data: { licenseTier: input.licenseTier, seatLimit: input.seatLimit, ...term },
    });
    await this.audit.record(
      'tenant.license',
      `tier=${input.licenseTier ?? '—'} seatLimit=${input.seatLimit ?? 'unlimited'}` +
        `${input.termDays !== undefined ? ` term=${input.termDays === null ? 'none' : `${input.termDays}d`}` : ''}`,
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

  /**
   * Emails the client's admins what their IT team needs to allow, and what is
   * still outstanding. Best effort: a mail failure must not roll back an
   * approval that already succeeded, so it is logged and swallowed.
   */
  async emailSetupInstructions(tenantId: string, tenantName: string): Promise<number> {
    try {
      const [admins, guidance, state] = await Promise.all([
        runAsSystem('setup email: admins', () =>
          this.prisma.db.tenantUser.findMany({
            where: { tenantId, role: 'client_admin' },
            select: { email: true },
          }),
        ),
        this.allowlist(tenantId),
        this.readiness(tenantId),
      ]);
      if (!admins.length) {
        this.logger.warn(`No client_admin to send setup instructions to for ${tenantId}`);
        return 0;
      }

      const ips = guidance.ips.length
        ? guidance.ips.map((ip) => `<li><code>${esc(ip)}</code></li>`).join('')
        : '<li>Vlumetech will confirm these separately.</li>';
      const outstanding = state.checks
        .filter((c) => !c.ok)
        .map((c) => `<li>${esc(c.label)}</li>`)
        .join('');

      let sent = 0;
      for (const admin of admins) {
        await this.mailer.send({
          to: admin.email,
          fromName: 'Vlumeaware',
          fromAddress: notificationFromAddress(),
          subject: `${tenantName} is approved — one thing for your IT team`,
          html: `
            <p>Hello,</p>
            <p>
              Your Vlumeaware account is approved, so live campaigns are unlocked.
              Before the first one, your IT team has to let our simulated mail
              through your gateway. Without it your own filters quarantine the
              test and the result tells you nothing.
            </p>
            <p><strong>Give them these:</strong></p>
            <ul>
              <li>Sending domain: <code>${esc(guidance.sendingDomain ?? 'provided by Vlumetech')}</code></li>
              <li>Link / tracking domain: <code>${esc(guidance.trackingDomain ?? 'provided by Vlumetech')}</code></li>
            </ul>
            <p><strong>Sending IP addresses:</strong></p>
            <ul>${ips}</ul>
            <p>
              In Microsoft 365 this goes under Security &rarr; Policies &amp; rules &rarr;
              Advanced delivery &rarr; Phishing simulation, which needs the domain and the
              IPs together. In Google Workspace it is an inbound gateway or email
              allow-list entry. Use the phishing-simulation setting rather than a blanket
              allow rule, so only this traffic is exempted.
            </p>
            ${outstanding ? `<p><strong>Also still outstanding:</strong></p><ul>${outstanding}</ul>` : ''}
            <p>
              You can see all of this any time under People &rarr; Domains:
              <a href="${publicBaseUrl()}/client/domains">${publicBaseUrl()}/client/domains</a>
            </p>
            <p>Vlumeaware</p>
          `,
          sendId: `setup-${tenantId}-${admin.email}`,
        });
        sent += 1;
      }
      await this.audit.record(
        'tenant.setup.emailed',
        `sent allow-list setup instructions to ${sent} admin(s)`,
        tenantId,
      );
      return sent;
    } catch (err) {
      this.logger.error(
        `Could not email setup instructions for ${tenantId}: ${(err as Error).message}`,
      );
      return 0;
    }
  }

  /**
   * Sends a probe down the real simulation path to prove the client's mail
   * gateway will actually let a campaign through.
   *
   * Deliberately uses SIMULATION_FROM_ADDRESS rather than the notification
   * address: the gate exists because a client's filters quarantine mail from
   * the simulation domain and IPs, so a probe sent from anywhere else proves
   * nothing about the thing being tested.
   *
   * The recipient must be on a domain the client has verified, otherwise this
   * endpoint would send attacker-chosen mail from the phishing domain to any
   * address on the internet.
   */
  async sendAllowlistProbe(tenantId: string, email: string, requestedBy: string) {
    const address = email.trim().toLowerCase();
    const domain = address.slice(address.lastIndexOf('@') + 1);
    if (!address.includes('@') || !domain) {
      throw new BadRequestException('Enter a valid email address.');
    }

    const verified = await runAsSystem('probe: verified domains', () =>
      this.prisma.db.verifiedDomain.count({
        where: { tenantId, domain, status: 'verified' },
      }),
    );
    if (!verified) {
      throw new BadRequestException(
        `${domain} is not one of your verified domains. Verify it under People → Domains ` +
          'first, then send the test to an address on it.',
      );
    }

    const token = randomBytes(24).toString('base64url');
    await runAsSystem('probe: store token', () =>
      this.prisma.db.tenant.update({
        where: { id: tenantId },
        data: {
          allowlistProbeToken: token,
          allowlistProbeEmail: address,
          allowlistProbeSentAt: new Date(),
        },
      }),
    );

    const link = `${trackingBaseUrl()}/track/allowlist/${token}`;
    await this.mailer.send({
      to: address,
      fromName: 'Vlumeaware Delivery Test',
      fromAddress: process.env.SIMULATION_FROM_ADDRESS ?? 'no-reply@vlumesec.com',
      subject: 'Vlumeaware delivery test — please click the link inside',
      html: `
        <p>This is a delivery test from Vlumeaware.</p>
        <p>
          It was sent down exactly the same path a simulated phishing email uses. If you are
          reading it in your inbox rather than a quarantine, your mail gateway is letting our
          messages through.
        </p>
        <p><a href="${esc(link)}">Click here to confirm it arrived</a></p>
        <p>
          Nothing is installed and nothing is collected. The link records that this message
          reached a real mailbox, which is the one thing we cannot check from our side.
        </p>
        <p>Vlumeaware</p>
      `,
      sendId: `allowlist-probe-${tenantId}-${Date.now()}`,
    });

    await this.audit.record(
      'allowlist.probe.sent',
      `${requestedBy} sent a gateway delivery test to ${address}`,
      tenantId,
    );
    return { sent: true, to: address };
  }

  /**
   * Opened from the probe message. Public by necessity — whoever receives the
   * test is an employee, not a console user — so the token is the only
   * authority and is single-use.
   */
  async confirmAllowlistProbe(token: string) {
    const tenant = await runAsSystem('probe: look up token', () =>
      this.prisma.db.tenant.findUnique({
        where: { allowlistProbeToken: token },
        select: { id: true, name: true, allowlistProbeEmail: true },
      }),
    );
    if (!tenant) return null;

    await runAsSystem('probe: confirm', () =>
      this.prisma.db.tenant.update({
        where: { id: tenant.id },
        data: {
          allowlistConfirmedAt: new Date(),
          allowlistConfirmedBy: 'probe',
          // Cleared so a forwarded copy of an old test cannot re-confirm a
          // gateway whose rules have changed since.
          allowlistProbeToken: null,
        },
      }),
    );
    await this.audit.record(
      'allowlist.probe.confirmed',
      `delivery test opened from ${tenant.allowlistProbeEmail ?? 'unknown'}; gateway allow-list confirmed`,
      tenant.id,
    );
    return tenant;
  }

  /**
   * Whether this client is set up enough to run a campaign, as a checklist.
   *
   * The same gates campaign preflight applies, minus the two that belong to a
   * specific campaign (scenarios attached and approved). Split out because a
   * client needs to see what is outstanding *before* they build a campaign —
   * the gateway allow-list in particular is somebody else's IT team and has a
   * lead time measured in days, so discovering it at launch is too late.
   */
  async readiness(tenantId: string) {
    const tenant = await runAsSystem('readiness: read tenant', () =>
      this.prisma.db.tenant.findUnique({
        where: { id: tenantId },
        select: {
          ndpaAgreementSignedAt: true,
          sendingDomain: true,
          allowlistConfirmedAt: true,
        },
      }),
    );
    if (!tenant) throw new NotFoundException('Tenant not found');

    const [employees, verifiedDomains] = await runAsSystem('readiness: counts', () =>
      Promise.all([
        this.prisma.db.employee.count({ where: { tenantId } }),
        this.prisma.db.verifiedDomain.count({ where: { tenantId, status: 'verified' } }),
      ]),
    );

    const checks = [
      {
        key: 'agreementSigned',
        label: 'Authorization agreement accepted',
        ok: !!tenant.ndpaAgreementSignedAt,
        hint: 'Accepted at signup, or filed by Vlumetech as a countersigned document.',
        href: null as string | null,
      },
      {
        key: 'domainVerified',
        label: 'At least one domain verified',
        ok: verifiedDomains > 0,
        hint: 'Simulations can only be sent to addresses on a domain you have proved you own.',
        href: '/client/domains',
      },
      {
        key: 'employeesUploaded',
        label: 'Employees added',
        ok: employees > 0,
        hint: 'Upload a CSV or add people directly.',
        href: '/client/employees',
      },
      {
        key: 'gatewayAllowlist',
        label: 'Mail gateway allow-list applied by your IT',
        ok: !!tenant.allowlistConfirmedAt,
        hint:
          'Your IT team must let our sending domain and IPs through, or your own filters ' +
          'quarantine the simulation and the result means nothing. This one needs another ' +
          'team, so start it early.',
        href: '/client/domains',
      },
    ];

    return {
      ready: checks.every((c) => c.ok),
      outstanding: checks.filter((c) => !c.ok).length,
      checks,
    };
  }

  /**
   * The gateway allow-list details plus this tenant's confirmation state.
   * Deliberately a narrow projection rather than the whole tenant row: this is
   * the only tenants read a client_viewer can reach.
   */
  async allowlist(tenantId: string) {
    const tenant = await runAsSystem('read tenant for allowlist guidance', () =>
      this.prisma.db.tenant.findUnique({
        where: { id: tenantId },
        select: {
          sendingDomain: true,
          allowlistConfirmedAt: true,
          allowlistConfirmedBy: true,
          allowlistProbeEmail: true,
          allowlistProbeSentAt: true,
        },
      }),
    );
    if (!tenant) throw new NotFoundException('Tenant not found');
    return {
      ...allowlistGuidance(tenant.sendingDomain),
      confirmedAt: tenant.allowlistConfirmedAt,
      confirmedBy: tenant.allowlistConfirmedBy,
      probeEmail: tenant.allowlistProbeEmail,
      probeSentAt: tenant.allowlistProbeSentAt,
    };
  }

  /**
   * Permanently removes a client and everything belonging to them.
   *
   * Only a suspended or offboarded tenant can be deleted. An active client is
   * refused: offboarding first is a deliberate speed bump on an operation with
   * no undo, and it gives anyone watching the account a visible state change
   * before the data goes.
   *
   * Rows are removed child-first in an explicit order rather than leaning on
   * the tenant cascade, because two foreign keys are ON DELETE RESTRICT:
   * campaign_scenarios -> scenarios and training_routing_rules ->
   * training_modules (verified against pg_constraint, not just the schema).
   *
   * A plain tenant.delete() does currently succeed, because Postgres happens
   * to cascade the referencing rows away before it reaches the referenced
   * ones. That ordering is trigger-firing order, not a guarantee, and it is
   * not worth betting an irreversible operation on it holding after the next
   * migration. Deleting explicitly makes the order ours.
   *
   * The final tenant.delete() still cascades anything not listed here, so a
   * model added later is removed even if nobody updates this list.
   *
   * Audit rows deliberately survive: audit_logs.tenant_id is a plain column
   * with no foreign key, so the record that this client existed and was
   * deleted outlives the client.
   */
  async remove(tenantId: string, confirmName: string) {
    const tenant = await this.findOne(tenantId);

    if (tenant.status === 'active') {
      throw new BadRequestException(
        'An active client cannot be deleted. Suspend or offboard it first.',
      );
    }
    // Typed confirmation, not a checkbox: the operation is irreversible and
    // the tenant id in the URL is not something a human recognises.
    if (confirmName.trim() !== tenant.name.trim()) {
      throw new BadRequestException(
        `Confirmation does not match. Type the client's name exactly: "${tenant.name}"`,
      );
    }

    // Collected before the rows go, so the objects can be removed afterwards.
    const modules = await runAsSystem('delete tenant: collect stored objects', () =>
      this.prisma.db.trainingModule.findMany({
        where: { tenantId, videoSource: 'upload' },
        select: { videoUrl: true },
      }),
    );
    // Hosted links (videoSource 'link') point at somebody else's server, so
    // only objects we put in our own storage are removed.
    const storedObjects = [
      ...modules.map((m) => m.videoUrl),
      tenant.ndpaAgreementDocUrl,
      tenant.brandLogoUrl,
    ].filter((u): u is string => !!u && !/^https?:/i.test(u));

    const counts = await runAsSystem('delete tenant: remove all rows', () =>
      this.prisma.db.$transaction(async (tx) => {
        const where = { tenantId };
        const n: Record<string, number> = {};
        // Child-first. Order matters for the two RESTRICT edges above.
        n.quizAttempts = (await tx.quizAttempt.deleteMany({ where })).count;
        n.quizQuestions = (await tx.quizQuestion.deleteMany({ where })).count;
        n.certificates = (await tx.certificate.deleteMany({ where })).count;
        n.credentialSubmissions = (await tx.credentialSubmission.deleteMany({ where })).count;
        n.trainingAssignments = (await tx.trainingAssignment.deleteMany({ where })).count;
        n.routingRules = (await tx.trainingRoutingRule.deleteMany({ where })).count;
        n.phishReports = (await tx.phishReport.deleteMany({ where })).count;
        n.reports = (await tx.report.deleteMany({ where })).count;
        n.sends = (await tx.send.deleteMany({ where })).count;
        n.campaignScenarios = (await tx.campaignScenario.deleteMany({ where })).count;
        n.quizzes = (await tx.quiz.deleteMany({ where })).count;
        n.campaigns = (await tx.campaign.deleteMany({ where })).count;
        n.trainingModules = (await tx.trainingModule.deleteMany({ where })).count;
        n.scenarios = (await tx.scenario.deleteMany({ where })).count;
        n.employees = (await tx.employee.deleteMany({ where })).count;
        n.domains = (await tx.verifiedDomain.deleteMany({ where })).count;
        n.users = (await tx.tenantUser.deleteMany({ where })).count;
        await tx.tenant.delete({ where: { id: tenantId } });
        return n;
      }),
    );

    // Best effort, and after the rows are gone. A bucket that is unreachable
    // must not leave the account half-deleted, so failures are counted and
    // reported rather than thrown.
    let filesDeleted = 0;
    const filesFailed: string[] = [];
    for (const uri of storedObjects) {
      if (await this.storage.remove(uri)) filesDeleted += 1;
      else filesFailed.push(uri);
    }

    const rows = Object.values(counts).reduce((a, b) => a + b, 0);
    await this.audit.record(
      'tenant.delete',
      `permanently deleted "${tenant.name}" (${tenant.status}): ${rows} rows, ` +
        `${filesDeleted} stored files` +
        (filesFailed.length ? `, ${filesFailed.length} files could NOT be removed` : ''),
      tenantId,
    );
    if (filesFailed.length) {
      this.logger.warn(
        `Tenant ${tenantId} deleted but ${filesFailed.length} stored objects remain: ${filesFailed.join(', ')}`,
      );
    }

    return { deleted: true, name: tenant.name, rows, counts, filesDeleted, filesFailed };
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
    // Approval is the moment the client can act, and the gateway allow-list is
    // the one task that needs another team and has a lead time. Telling them
    // now, in writing, with the values in the message, is the difference
    // between starting it today and discovering it at launch.
    await this.emailSetupInstructions(tenantId, tenant.name);
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
