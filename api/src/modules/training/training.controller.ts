import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { TrainingService } from './training.service';
import { RequiresWritableTenant } from '../../common/trial/writable-tenant.guard';

class RuleDto {
  @IsUUID('4') trainingModuleId!: string;
}

@Controller('tenants/:tenantId')
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  @Get('routing-rules')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  listRules() {
    return this.training.listRules();
  }

  @Put('routing-rules/:scenarioId')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  @RequiresWritableTenant()
  upsertRule(@Param('scenarioId', ParseUUIDPipe) scenarioId: string, @Body() dto: RuleDto) {
    return this.training.upsertRule(scenarioId, dto.trainingModuleId);
  }

  @Delete('routing-rules/:scenarioId')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  deleteRule(@Param('scenarioId', ParseUUIDPipe) scenarioId: string) {
    return this.training.deleteRule(scenarioId);
  }

  @Get('training-assignments')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  listAssignments() {
    return this.training.listAssignments();
  }

  @Post('training-assignments/:assignmentId/complete')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  complete(@Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return this.training.markComplete(assignmentId);
  }
}
