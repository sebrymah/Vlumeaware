import { Module } from '@nestjs/common';
import { StorageModule } from '../../providers/storage/storage.module';
import { MailerModule } from '../../providers/mailer/mailer.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { TrainingController } from './training.controller';
import { LearnController } from './learn.controller';
import { TrainingService } from './training.service';
import { LearnService } from './learn.service';

@Module({
  imports: [StorageModule, MailerModule, CertificatesModule],
  controllers: [TrainingController, LearnController],
  providers: [TrainingService, LearnService],
  exports: [TrainingService, LearnService],
})
export class TrainingModule {}
