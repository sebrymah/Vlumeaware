import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { ScenariosService } from './scenarios.service';

/**
 * Cross-tenant scenario review for Vlumetech staff. These routes carry no
 * `:tenantId`, so the tenant-scope interceptor opens system scope and the
 * service reads/writes every client's scenarios.
 */
@Controller('admin/scenarios')
@Roles(ROLES.superadmin)
export class AdminScenariosController {
  constructor(private readonly scenarios: ScenariosService) {}

  @Get('pending')
  pending() {
    return this.scenarios.listPendingReview();
  }

  @Post(':scenarioId/approve')
  approve(@Param('scenarioId', ParseUUIDPipe) scenarioId: string) {
    return this.scenarios.approveAcrossTenants(scenarioId);
  }

  @Post(':scenarioId/reject')
  reject(@Param('scenarioId', ParseUUIDPipe) scenarioId: string) {
    return this.scenarios.rejectAcrossTenants(scenarioId);
  }
}
