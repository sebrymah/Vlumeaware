import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { runAsSystem } from '../../common/prisma/tenant-context';
import { AuditService } from '../../common/audit/audit.service';
import {
  generateLicenseKey,
  hashLicenseKey,
  licenseKeyHint,
  normaliseLicenseKey,
} from './license-key';

const DEFAULT_VALID_DAYS = 30;

/**
 * License keys: Vlumetech issues one for a client, the client admin redeems it
 * in their own console, and that single action sets the tier, the seat limit
 * and activates the account.
 *
 * The point is timing. Activation used to be a Vlumetech action taken at a
 * moment only the client knew was right, so it either happened early or the
 * client waited. A key hands the client the trigger without handing them the
 * ability to choose their own tier.
 */
@Injectable()
export class LicensesService {
  private readonly logger = new Logger(LicensesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Issues a key for one client. The plaintext is returned exactly once — it
   * is not stored, and there is no endpoint that can show it again. Losing it
   * means revoking and issuing another, which is the correct trade.
   */
  async issue(
    tenantId: string,
    actorId: string | undefined,
    input: { licenseTier: string; seatLimit?: number; validDays?: number },
  ) {
    const tenant = await runAsSystem('license: read tenant', () =>
      this.prisma.db.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } }),
    );
    if (!tenant) throw new NotFoundException('Tenant not found');

    const key = generateLicenseKey();
    const validDays = input.validDays ?? DEFAULT_VALID_DAYS;
    const expiresAt = new Date(Date.now() + validDays * 86_400_000);

    const token = await runAsSystem('license: issue key', () =>
      this.prisma.db.licenseToken.create({
        data: {
          tokenHash: hashLicenseKey(key),
          displayHint: licenseKeyHint(key),
          tenantId,
          licenseTier: input.licenseTier,
          seatLimit: input.seatLimit ?? null,
          createdById: actorId ?? null,
          expiresAt,
        },
      }),
    );

    await this.audit.record(
      'license.issue',
      `issued a ${input.licenseTier} license key (…${token.displayHint}) for "${tenant.name}"` +
        `${input.seatLimit != null ? `, ${input.seatLimit} seats` : ''}, valid ${validDays} days`,
      tenantId,
    );

    // The only time the plaintext exists outside the client's hands.
    return { key, id: token.id, expiresAt, licenseTier: token.licenseTier, seatLimit: token.seatLimit };
  }

  /** Keys issued for a client. Never includes the key itself — only the hint. */
  list(tenantId: string) {
    return runAsSystem('license: list keys', () =>
      this.prisma.db.licenseToken.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          displayHint: true,
          licenseTier: true,
          seatLimit: true,
          createdAt: true,
          expiresAt: true,
          redeemedAt: true,
          redeemedBy: true,
          revokedAt: true,
        },
      }),
    );
  }

  /** Stops an unredeemed key working, e.g. after it was sent to the wrong address. */
  async revoke(tenantId: string, tokenId: string) {
    const token = await runAsSystem('license: read key', () =>
      this.prisma.db.licenseToken.findUnique({ where: { id: tokenId } }),
    );
    if (!token || token.tenantId !== tenantId) throw new NotFoundException('License key not found');
    if (token.redeemedAt) {
      throw new BadRequestException(
        'That key has already been redeemed. Revoking it would not undo the license — change the tier directly instead.',
      );
    }
    const updated = await runAsSystem('license: revoke key', () =>
      this.prisma.db.licenseToken.update({ where: { id: tokenId }, data: { revokedAt: new Date() } }),
    );
    await this.audit.record('license.revoke', `revoked license key …${token.displayHint}`, tenantId);
    return updated;
  }

  /**
   * Redeemed by the client admin, against their own tenant.
   *
   * Every rejection returns the same shape of error regardless of cause, so a
   * caller cannot use the response to tell "no such key" from "issued to
   * someone else" and enumerate valid keys.
   */
  async redeem(tenantId: string, redeemedBy: string, rawKey: string) {
    const key = normaliseLicenseKey(rawKey);
    const token = await runAsSystem('license: look up key', () =>
      this.prisma.db.licenseToken.findUnique({ where: { tokenHash: hashLicenseKey(key) } }),
    );

    const reject = (reason: string) => {
      this.logger.warn(`License redemption refused for tenant ${tenantId}: ${reason}`);
      return new BadRequestException(
        'That license key is not valid for this account. Check it was copied in full, or ask Vlumetech for a new one.',
      );
    };

    if (!token) throw reject('no such key');
    if (token.tenantId !== tenantId) throw reject(`key belongs to tenant ${token.tenantId}`);
    if (token.revokedAt) throw reject('key was revoked');
    if (token.redeemedAt) throw reject('key already redeemed');
    if (token.expiresAt.getTime() < Date.now()) throw reject('key expired');

    // A license that would strand existing people is refused outright rather
    // than silently capping a roster the client has already built.
    if (token.seatLimit != null) {
      const current = await runAsSystem('license: count employees', () =>
        this.prisma.db.employee.count({ where: { tenantId } }),
      );
      if (token.seatLimit < current) {
        throw new BadRequestException(
          `This key grants ${token.seatLimit} seats but the account already has ${current} employees. ` +
            'Contact Vlumetech for a key that covers your roster.',
        );
      }
    }

    const tenant = await runAsSystem('license: activate tenant', () =>
      this.prisma.db.$transaction(async (tx) => {
        // Guarded on redeemedAt so two simultaneous redemptions cannot both
        // win: the second updates zero rows.
        const claimed = await tx.licenseToken.updateMany({
          where: { id: token.id, redeemedAt: null },
          data: { redeemedAt: new Date(), redeemedBy },
        });
        if (claimed.count === 0) throw new BadRequestException('That license key has already been redeemed.');

        return tx.tenant.update({
          where: { id: tenantId },
          data: {
            licenseTier: token.licenseTier,
            seatLimit: token.seatLimit,
            status: 'active',
            approvedAt: new Date(),
            // The trial no longer governs this account.
            trialEndsAt: null,
          },
        });
      }),
    );

    await this.audit.record(
      'license.redeem',
      `${redeemedBy} redeemed license key …${token.displayHint}: ${token.licenseTier}` +
        `${token.seatLimit != null ? `, ${token.seatLimit} seats` : ''}`,
      tenantId,
    );

    return {
      activated: true,
      licenseTier: tenant.licenseTier,
      seatLimit: tenant.seatLimit,
    };
  }
}
