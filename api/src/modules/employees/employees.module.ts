import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { RiskService } from './risk.service';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, RiskService],
  exports: [EmployeesService, RiskService],
})
export class EmployeesModule {}
