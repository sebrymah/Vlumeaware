import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ROSTER_UPLOAD } from '../../common/upload/upload-limits';
import { ArrayMaxSize, IsArray, IsEmail, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { EmployeesService } from './employees.service';
import { RiskService } from './risk.service';
import { RiskAdviceService } from './risk-advice.service';
import { RequiresWritableTenant } from '../../common/trial/writable-tenant.guard';

class EmployeeRowDto {
  @IsEmail() email!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() department?: string;
}

class EnrolDto {
  @IsUUID('4') trainingModuleId!: string;
}

class BulkEmployeesDto {
  @IsArray()
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => EmployeeRowDto)
  employees!: EmployeeRowDto[];
}

@Controller('tenants/:tenantId/employees')
@Roles(ROLES.superadmin, ROLES.clientAdmin)
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly risk: RiskService,
    private readonly riskAdvice: RiskAdviceService,
  ) {}

  @Get()
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  list() {
    return this.employees.list();
  }

  /** Per-employee risk scores across all campaigns. */
  @Get('risk')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  riskAll() {
    return this.risk.scoreAll();
  }

  /**
   * What to do about the risk on that page. POST because each call is a paid
   * request to the AI provider, and client_admin only: a read-only viewer
   * should not be able to spend the tenant's budget.
   */
  @Post('risk/advice')
  @HttpCode(200)
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  adviseOnRisk() {
    return this.riskAdvice.advise();
  }

  /** Employees who clicked in two or more simulations. */
  @Get('repeat-clickers')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  repeatClickers() {
    return this.risk.repeatClickers();
  }

  /** Auto-enrol every repeat clicker into a remediation module. */
  @Post('repeat-clickers/enrol')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  enrol(@Body() dto: EnrolDto) {
    return this.risk.autoEnrolRepeatClickers(dto.trainingModuleId);
  }

  /** JSON bulk create. */
  @Post()
  @RequiresWritableTenant()
  bulk(@Body() dto: BulkEmployeesDto) {
    return this.employees.bulkUpload(dto.employees);
  }

  /** CSV bulk create — the path the client console uses. */
  @Post('csv')
  @UseInterceptors(FileInterceptor('file', ROSTER_UPLOAD))
  @RequiresWritableTenant()
  async csv(@UploadedFile() file: { buffer: Buffer }) {
    return this.employees.bulkUpload(this.employees.parseCsv(file?.buffer));
  }

  @Delete(':employeeId')
  remove(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.employees.remove(employeeId);
  }
}
