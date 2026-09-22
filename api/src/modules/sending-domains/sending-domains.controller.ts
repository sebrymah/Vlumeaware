import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { Roles } from '../../common/auth/roles.decorator';
import { ROLES } from '../../common/auth/roles';
import { SendingDomainsService } from './sending-domains.service';

class AddDomainDto {
  @IsString() @MinLength(3) domain!: string;
}

@Controller('tenants/:tenantId/sending-domains')
@Roles(ROLES.superadmin, ROLES.clientAdmin)
export class SendingDomainsController {
  constructor(private readonly domains: SendingDomainsService) {}

  // GET refreshes pending domains from the provider, so opening the page
  // reflects DNS that has propagated since it was added.
  @Get()
  list() {
    return this.domains.listRefreshingPending();
  }

  @Get('verified')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  verified() {
    return this.domains.verifiedList();
  }

  @Post()
  add(@Body() dto: AddDomainDto) {
    return this.domains.add(dto.domain);
  }

  @Post(':id/refresh')
  refresh(@Param('id', ParseUUIDPipe) id: string) {
    return this.domains.refresh(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.domains.remove(id);
  }
}
