import { Module } from '@nestjs/common';
import { StorageModule } from '../../providers/storage/storage.module';
import { SharedModulesController } from './shared-modules.controller';
import { SharedModulesService } from './shared-modules.service';

@Module({
  imports: [StorageModule],
  controllers: [SharedModulesController],
  providers: [SharedModulesService],
  exports: [SharedModulesService],
})
export class SharedModulesModule {}
