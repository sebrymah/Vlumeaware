import { Module } from '@nestjs/common';
import { DomainsModule } from '../domains/domains.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { RiskService } from './risk.service';
import { RiskAdviceService } from './risk-advice.service';
import { AiModule } from '../../providers/ai/ai.module';

@Module({
  imports: [DomainsModule, AiModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, RiskService, RiskAdviceService],
  exports: [EmployeesService, RiskService],
})
export class EmployeesModule {}
