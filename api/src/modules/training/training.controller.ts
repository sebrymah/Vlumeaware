import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { TrainingService } from './training.service';
import { LearnService } from './learn.service';
import { RequiresWritableTenant } from '../../common/trial/writable-tenant.guard';

class RuleDto {
  @IsUUID('4') trainingModuleId!: string;
}

class AssignDto {
  @IsUUID('4') employeeId!: string;
  @IsUUID('4') trainingModuleId!: string;
}

class AssignTrainingDto {
  @IsUUID('4') trainingModuleId!: string;
  @IsOptional() @IsArray() @ArrayNotEmpty() @IsUUID('4', { each: true }) employeeIds?: string[];
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsBoolean() all?: boolean;
  @IsOptional() @IsBoolean() notify?: boolean;
}

@Controller('tenants/:tenantId')
export class TrainingController {
  constructor(
    private readonly training: TrainingService,
    private readonly learn: LearnService,
  ) {}

  /** Assign a module to people directly (per-person, a department, or all) and email a link. */
  @Post('training/assign')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  @RequiresWritableTenant()
  assignTraining(@Body() dto: AssignTrainingDto) {
    return this.learn.assign(
      dto.trainingModuleId,
      { employeeIds: dto.employeeIds, department: dto.department, all: dto.all },
      dto.notify ?? true,
    );
  }

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

  /** Manually assign a training module to an employee. */
  @Post('training-assignments')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  @RequiresWritableTenant()
  assign(@Body() dto: AssignDto) {
    return this.training.assignManual(dto.employeeId, dto.trainingModuleId);
  }

  @Post('training-assignments/:assignmentId/complete')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  complete(@Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return this.training.markComplete(assignmentId);
  }
}
