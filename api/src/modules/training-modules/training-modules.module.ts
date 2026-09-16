import { Module } from '@nestjs/common';
import { StorageModule } from '../../providers/storage/storage.module';
import { TrainingModulesController } from './training-modules.controller';
import { TrainingModulesService } from './training-modules.service';

@Module({
  imports: [StorageModule],
  controllers: [TrainingModulesController],
  providers: [TrainingModulesService],
  exports: [TrainingModulesService],
})
export class TrainingModulesModule {}
