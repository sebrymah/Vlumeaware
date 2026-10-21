import { Module } from '@nestjs/common';
import { ReportChannelController } from './report-channel.controller';
import { ReportChannelService } from './report-channel.service';

@Module({
  controllers: [ReportChannelController],
  providers: [ReportChannelService],
  exports: [ReportChannelService],
})
export class ReportChannelModule {}
