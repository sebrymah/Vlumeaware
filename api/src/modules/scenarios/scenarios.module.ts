import { Module } from '@nestjs/common';
import { AiModule } from '../../providers/ai/ai.module';
import { AdminScenariosController } from './admin-scenarios.controller';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';

@Module({
  imports: [AiModule],
  controllers: [AdminScenariosController, ScenariosController],
  providers: [ScenariosService],
  exports: [ScenariosService],
})
export class ScenariosModule {}
