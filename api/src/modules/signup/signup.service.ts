import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { runAsSystem, runInTenant } from '../../common/prisma/tenant-context';
import { AuthService } from '../../common/auth/auth.service';
import { AuditService } from '../../common/audit/audit.service';

const TRIAL_DAYS = 7;
const FREE_TIER_SEATS = 20;

@Injectable()
export class SignupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Self-serve signup. Creates a Free-trial tenant plus its first client_admin
   * account. The trial is explore-only (no campaigns) and capped at 20 employee
   * seats; a Vlumetech admin must approve it to unlock full features, and it
   * goes read-only if the 7-day window lapses first.
   */
  async signup(input: { companyName: string; email: string; password: string }) {
    const email = input.email.trim().toLowerCase();
    if (input.password.length < 12) {
      throw new BadRequestException('Password must be at least 12 characters');
    }

    // Email must be unique across staff and all client accounts.
    const clash = await runAsSystem('signup: check email in use', async () => {
      const staff = await this.prisma.db.user.findUnique({ where: { email }, select: { id: true } });
      const tenantUser = await this.prisma.db.tenantUser.findFirst({ where: { email }, select: { id: true } });
      return staff || tenantUser;
    });
    if (clash) throw new ConflictException('That email is already registered');

    const passwordHash = await AuthService.hash(input.password);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

    const tenant = await runAsSystem('signup: create trial tenant', () =>
      this.prisma.db.tenant.create({
        data: {
          name: input.companyName.trim(),
          status: 'active',
          selfSignup: true,
          trialEndsAt,
          licenseTier: 'Free trial',
          seatLimit: FREE_TIER_SEATS,
        },
      }),
    );

    await runInTenant(tenant.id, () =>
      this.prisma.db.tenantUser.create({
        data: { tenantId: tenant.id, email, passwordHash, role: 'client_admin' },
      }),
    );

    await this.audit.record('tenant.signup', `self-signup "${input.companyName}" (${email})`, tenant.id);

    return {
      tenantId: tenant.id,
      email,
      trialEndsAt,
      seatLimit: FREE_TIER_SEATS,
      message:
        'Free trial started. You can set up your workspace now; campaigns unlock once Vlumetech approves your account.',
    };
  }
}
