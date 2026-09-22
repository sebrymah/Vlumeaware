import { Module } from '@nestjs/common';
import { EmailDomainsModule } from '../../providers/email-domains/email-domains.module';
import { SendingDomainsController } from './sending-domains.controller';
import { SendingDomainsService } from './sending-domains.service';

@Module({
  imports: [EmailDomainsModule],
  controllers: [SendingDomainsController],
  providers: [SendingDomainsService],
  exports: [SendingDomainsService],
})
export class SendingDomainsModule {}
