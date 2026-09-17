import { Module } from '@nestjs/common';
import { DomainsModule } from '../domains/domains.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { RiskService } from './risk.service';

@Module({
  imports: [DomainsModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, RiskService],
  exports: [EmployeesService, RiskService],
})
export class EmployeesModule {}
