import { Module } from '@nestjs/common';
import { MailerModule } from '../../providers/mailer/mailer.module';
import { StorageModule } from '../../providers/storage/storage.module';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';

@Module({
  imports: [MailerModule, StorageModule],
  controllers: [CertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
