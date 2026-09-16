import { Module } from '@nestjs/common';
import { ClaudeModule } from '../../providers/claude/claude.module';
import { AdminScenariosController } from './admin-scenarios.controller';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';

@Module({
  imports: [ClaudeModule],
  controllers: [AdminScenariosController, ScenariosController],
  providers: [ScenariosService],
  exports: [ScenariosService],
})
export class ScenariosModule {}
