import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './common/auth/auth.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { TenantScopeInterceptor } from './common/auth/tenant-scope.interceptor';
import { AuditModule } from './common/audit/audit.module';
import { TrialModule } from './common/trial/trial.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RateLimitGuard } from './common/ratelimit/rate-limit.guard';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ScenariosModule } from './modules/scenarios/scenarios.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { TrainingModule } from './modules/training/training.module';
import { TrainingModulesModule } from './modules/training-modules/training-modules.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { QuizzesModule } from './modules/quizzes/quizzes.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { IntakeModule } from './modules/intake/intake.module';
import { SharedModulesModule } from './modules/shared-modules/shared-modules.module';
import { SignupModule } from './modules/signup/signup.module';

import { HealthController } from './health.controller';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    TrialModule,
    AuthModule,
    TenantsModule,
    EmployeesModule,
    ScenariosModule,
    CampaignsModule,
    TrackingModule,
    TrainingModule,
    TrainingModulesModule,
    TemplatesModule,
    QuizzesModule,
    CertificatesModule,
    IntakeModule,
    SharedModulesModule,
    SignupModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: authenticate, then check role, then open the tenant
    // context from the verified token.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantScopeInterceptor },
  ],
})
export class AppModule {}
