import { Module } from '@nestjs/common';
import { MailerModule } from '../../providers/mailer/mailer.module';
import { TrainingModulesModule } from '../training-modules/training-modules.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [MailerModule, TrainingModulesModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
