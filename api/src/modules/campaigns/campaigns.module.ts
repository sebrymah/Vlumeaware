import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { SchedulerProcessor } from '../../queue/scheduler.processor';
import { DomainsModule } from '../domains/domains.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [QueueModule, DomainsModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, SchedulerProcessor],
  exports: [CampaignsService],
})
export class CampaignsModule {}
