import { Global, Module } from '@nestjs/common';
import { TrialService } from './trial.service';
import { ApprovedTenantGuard } from './approved-tenant.guard';
import { WritableTenantGuard } from './writable-tenant.guard';

@Global()
@Module({
  providers: [TrialService, ApprovedTenantGuard, WritableTenantGuard],
  exports: [TrialService, ApprovedTenantGuard, WritableTenantGuard],
})
export class TrialModule {}
