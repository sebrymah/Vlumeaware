import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Roles } from '../../common/auth/roles.decorator';
import { ROLES } from '../../common/auth/roles';
import { SendingDomainsService } from './sending-domains.service';

class AddDomainDto {
  @IsString() @MinLength(3) domain!: string;
}

class EnableSharedDto {
  @IsString() @MinLength(3) domain!: string;
}

class SenderNameDto {
  // Blank clears the override, falling back to the scenario's sender name.
  @IsOptional() @IsString() @MaxLength(120) senderName?: string;
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

  /** The Vlumeaware shared domains and whether each is enabled for this tenant. */
  @Get('shared')
  shared() {
    return this.domains.sharedOptions();
  }

  /** Turn on a shared domain — the no-DNS "second method". */
  @Post('shared')
  enableShared(@Body() dto: EnableSharedDto) {
    return this.domains.enableShared(dto.domain);
  }

  @Post()
  add(@Body() dto: AddDomainDto) {
    return this.domains.add(dto.domain);
  }

  /** Set the From display name ("title") for a domain, own or shared. */
  @Put(':id/sender-name')
  setSenderName(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SenderNameDto) {
    return this.domains.setSenderName(id, dto.senderName ?? null);
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
