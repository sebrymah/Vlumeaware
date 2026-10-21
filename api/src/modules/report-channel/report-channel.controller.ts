import { Controller, Get } from '@nestjs/common';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { ReportChannelService } from './report-channel.service';

@Controller('tenants/:tenantId/report-channel')
@Roles(ROLES.superadmin, ROLES.clientAdmin)
export class ReportChannelController {
  constructor(private readonly channel: ReportChannelService) {}

  /** Lazily creates the channel on first read and returns the forwarding address. */
  @Get()
  get() {
    return this.channel.getForTenant();
  }
}
