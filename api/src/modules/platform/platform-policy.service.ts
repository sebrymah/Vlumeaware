import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface PlatformPolicy {
  requireMfa: boolean;
  passwordMinLength: number;
  sessionTimeoutMinutes: number;
}

/**
 * The platform's stated security posture for Vlumetech staff.
 *
 * The staff MFA requirement, password minimum and session length used to be
 * constants in the code. A policy an auditor can read — and an administrator can
 * tighten without a deploy — is what ISO 27001 A.9.4 and A.12.4 expect, and it is
 * also what makes the console's claim about its own standard checkable.
 *
 * One row, created on demand so a fresh database behaves like the seeded one.
 */
@Injectable()
export class PlatformPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<PlatformPolicy> {
    const row = await this.prisma.db.platformSecurityPolicy.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
      select: { requireMfa: true, passwordMinLength: true, sessionTimeoutMinutes: true },
    });
    return row;
  }

  async update(
    input: {
      requireMfa?: boolean;
      passwordMinLength?: number;
      sessionTimeoutMinutes?: number;
    },
    actorEmail?: string,
  ): Promise<PlatformPolicy> {
    // A minimum below 12 would be weaker than the value it replaced, and a session
    // longer than a working day is not a session timeout anyone can defend.
    if (input.passwordMinLength !== undefined && input.passwordMinLength < 12) {
      throw new BadRequestException('Staff passwords must be at least 12 characters.');
    }
    if (input.sessionTimeoutMinutes !== undefined) {
      if (input.sessionTimeoutMinutes < 15 || input.sessionTimeoutMinutes > 1440) {
        throw new BadRequestException('Session length must be between 15 minutes and 24 hours.');
      }
    }

    await this.prisma.db.platformSecurityPolicy.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
    const row = await this.prisma.db.platformSecurityPolicy.update({
      where: { id: 'default' },
      data: { ...input, updatedBy: actorEmail ?? null },
      select: { requireMfa: true, passwordMinLength: true, sessionTimeoutMinutes: true },
    });
    return row;
  }
}
