import { Module } from '@nestjs/common';
import { AuthModule } from '../../common/auth/auth.module';
import { StorageModule } from '../../providers/storage/storage.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
