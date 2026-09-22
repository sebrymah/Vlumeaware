import { Module } from '@nestjs/common';
import { AuthModule } from '../../common/auth/auth.module';
import { StorageModule } from '../../providers/storage/storage.module';
import { MailerModule } from '../../providers/mailer/mailer.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [AuthModule, StorageModule, MailerModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
