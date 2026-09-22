import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { RequiresSignedAgreement } from '../../common/consent/consent.decorator';
import { RequiresApprovedTenant } from '../../common/trial/approved-tenant.guard';
import { CampaignsService } from './campaigns.service';

class CreateCampaignDto {
  @IsString() @MinLength(2) name!: string;
  @IsArray() @ArrayNotEmpty() @IsUUID('4', { each: true }) scenarioIds!: string[];
  /** Recipients. Omit or empty = send to all staff. */
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) employeeIds?: string[];
  @IsOptional() @IsDateString() scheduledSendAt?: string;
  /** Spread sends randomly across this many minutes. 0 = send at once. */
  @IsOptional() @IsInt() @Min(0) @Max(10080) sendWindowMinutes?: number;
  /** Auto-repeat every N days (e.g. 90 for quarterly). */
  @IsOptional() @IsInt() @Min(1) @Max(365) recurrenceDays?: number;
  /** The verified sending domain this campaign sends from. */
  @IsOptional() @IsUUID('4') sendingDomainId?: string;
  /** From local part, e.g. "it-support" -> it-support@<domain>. */
  @IsOptional() @IsString() @MinLength(1) fromLocalPart?: string;
}

class ScheduleDto {
  @IsOptional() @IsDateString() scheduledSendAt?: string;
}

@Controller()
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  /** Blocked by the consent gate until the NDPA agreement is on file. */
  @Post('tenants/:tenantId/campaigns')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  @RequiresSignedAgreement()
  @RequiresApprovedTenant()
  create(@Body() dto: CreateCampaignDto) {
    return this.campaigns.create({
      name: dto.name,
      scenarioIds: dto.scenarioIds,
      employeeIds: dto.employeeIds,
      scheduledSendAt: dto.scheduledSendAt ? new Date(dto.scheduledSendAt) : undefined,
      sendWindowMinutes: dto.sendWindowMinutes,
      recurrenceDays: dto.recurrenceDays,
      sendingDomainId: dto.sendingDomainId,
      fromLocalPart: dto.fromLocalPart,
    });
  }

  @Post('tenants/:tenantId/campaigns/:campaignId/schedule')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  @RequiresSignedAgreement()
  @RequiresApprovedTenant()
  schedule(@Param('campaignId', ParseUUIDPipe) campaignId: string, @Body() dto: ScheduleDto) {
    return this.campaigns.schedule(campaignId, dto.scheduledSendAt ? new Date(dto.scheduledSendAt) : null);
  }

  @Get('tenants/:tenantId/campaigns')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  list() {
    return this.campaigns.list();
  }

  @Get('tenants/:tenantId/campaigns/:campaignId')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  findOne(@Param('campaignId', ParseUUIDPipe) campaignId: string) {
    return this.campaigns.findOne(campaignId);
  }

  @Get('tenants/:tenantId/campaigns/:campaignId/preflight')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  preflight(@Param('campaignId', ParseUUIDPipe) campaignId: string) {
    return this.campaigns.preflight(campaignId);
  }

  /** Per-recipient delivery + engagement status. */
  @Get('tenants/:tenantId/campaigns/:campaignId/recipients')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  recipients(@Param('campaignId', ParseUUIDPipe) campaignId: string) {
    return this.campaigns.recipients(campaignId);
  }

  @Post('tenants/:tenantId/campaigns/:campaignId/launch')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  @RequiresSignedAgreement()
  @RequiresApprovedTenant()
  launch(@Param('campaignId', ParseUUIDPipe) campaignId: string) {
    return this.campaigns.launch(campaignId);
  }

  @Post('tenants/:tenantId/campaigns/:campaignId/pause')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  pause(@Param('campaignId', ParseUUIDPipe) campaignId: string) {
    return this.campaigns.pause(campaignId);
  }

  @Post('tenants/:tenantId/campaigns/:campaignId/resume')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  @RequiresSignedAgreement()
  @RequiresApprovedTenant()
  resume(@Param('campaignId', ParseUUIDPipe) campaignId: string) {
    return this.campaigns.resume(campaignId);
  }

  /** Kill switch. Available to client admins and to Vlumetech across tenants. */
  @Post('tenants/:tenantId/campaigns/:campaignId/kill')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  kill(@Param('campaignId', ParseUUIDPipe) campaignId: string) {
    return this.campaigns.kill(campaignId);
  }
}
