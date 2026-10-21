import { Module } from '@nestjs/common';
import { IntakeController } from './intake.controller';
import { IntakeService } from './intake.service';
import { PostmarkController } from './postmark.controller';
import { ReportChannelModule } from '../report-channel/report-channel.module';

@Module({
  imports: [ReportChannelModule],
  controllers: [IntakeController, PostmarkController],
  providers: [IntakeService],
  exports: [IntakeService],
})
export class IntakeModule {}
