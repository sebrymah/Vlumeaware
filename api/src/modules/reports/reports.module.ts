import { Module } from '@nestjs/common';
import { AiModule } from '../../providers/ai/ai.module';
import { QueueModule } from '../../queue/queue.module';
import { MailerModule } from '../../providers/mailer/mailer.module';
import { DigestProcessor } from '../../queue/digest.processor';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AiModule, QueueModule, MailerModule],
  controllers: [ReportsController],
  providers: [ReportsService, DigestProcessor],
  exports: [ReportsService],
})
export class ReportsModule {}
