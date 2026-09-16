import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { SchedulerProcessor } from '../../queue/scheduler.processor';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [QueueModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, SchedulerProcessor],
  exports: [CampaignsService],
})
export class CampaignsModule {}
