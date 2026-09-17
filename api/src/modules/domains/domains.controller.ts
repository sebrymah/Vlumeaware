import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { DomainsService } from './domains.service';
import { RequiresWritableTenant } from '../../common/trial/writable-tenant.guard';

class AddDomainDto {
  @IsString() @MinLength(3) domain!: string;
}

@Controller('tenants/:tenantId/domains')
@Roles(ROLES.superadmin, ROLES.clientAdmin)
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  list() {
    return this.domains.list();
  }

  @Post()
  @RequiresWritableTenant()
  add(@Body() dto: AddDomainDto) {
    return this.domains.add(dto.domain);
  }

  /** Re-check DNS and flip to verified if the TXT record is present. */
  @Post(':domainId/verify')
  verify(@Param('domainId', ParseUUIDPipe) domainId: string) {
    return this.domains.verify(domainId);
  }

  @Delete(':domainId')
  remove(@Param('domainId', ParseUUIDPipe) domainId: string) {
    return this.domains.remove(domainId);
  }
}
