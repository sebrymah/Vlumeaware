import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ROLES } from '../auth/roles';
import { Roles } from '../auth/roles.decorator';
import { AuditService } from './audit.service';

class AuditFilterDto {
  @IsOptional() @IsUUID('4') tenantId?: string;
  @IsOptional() @IsString() action?: string;
}

/** Super-admin only: cross-tenant audit trail. */
@Controller('audit-logs')
@Roles(ROLES.superadmin)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() filter: AuditFilterDto) {
    return this.audit.list(filter);
  }
}
