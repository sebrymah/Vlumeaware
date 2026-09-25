import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { ScenariosService } from './scenarios.service';
import { RequiresWritableTenant } from '../../common/trial/writable-tenant.guard';

type Tier = 'low' | 'medium' | 'high';

class GenerateDto {
  @IsString() @MinLength(2) industry!: string;
  @IsIn(['low', 'medium', 'high']) difficultyTier!: Tier;
  @IsOptional() @IsString() context?: string;
}

class SaveScenarioDto {
  @IsString() @MinLength(2) title!: string;
  @IsIn(['low', 'medium', 'high']) difficultyTier!: Tier;
  @IsOptional() @IsString() industryTag?: string;
  @IsString() @MinLength(2) subjectLine!: string;
  @IsString() @MinLength(10) bodyHtml!: string;
  @IsString() @MinLength(2) senderSpoofName!: string;
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) redFlags!: string[];
  @IsOptional() @IsBoolean() createdByClaude?: boolean;
}

class PreviewScenarioDto {
  @IsString() @MaxLength(200_000) bodyHtml!: string;
}

@Controller('tenants/:tenantId/scenarios')
@Roles(ROLES.superadmin, ROLES.clientAdmin)
export class ScenariosController {
  constructor(private readonly scenarios: ScenariosService) {}

  /**
   * Sanitize-only, for the composer's live preview. Declared before the
   * `:scenarioId` routes so "preview" is never read as an id.
   */
  @Post('preview')
  preview(@Body() dto: PreviewScenarioDto) {
    return this.scenarios.preview(dto.bodyHtml);
  }

  @Post('generate')
  @RequiresWritableTenant()
  generate(@Body() dto: GenerateDto) {
    return this.scenarios.generateDraft(dto);
  }

  @Post()
  @RequiresWritableTenant()
  save(@Body() dto: SaveScenarioDto) {
    return this.scenarios.save({ ...dto, createdByClaude: dto.createdByClaude ?? false });
  }

  @Get()
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  list() {
    return this.scenarios.list();
  }

  @Get(':scenarioId')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  findOne(@Param('scenarioId', ParseUUIDPipe) scenarioId: string) {
    return this.scenarios.findOne(scenarioId);
  }

  @Patch(':scenarioId')
  update(@Param('scenarioId', ParseUUIDPipe) scenarioId: string, @Body() dto: Partial<SaveScenarioDto>) {
    return this.scenarios.update(scenarioId, dto);
  }


  @Delete(':scenarioId')
  remove(@Param('scenarioId', ParseUUIDPipe) scenarioId: string) {
    return this.scenarios.remove(scenarioId);
  }
}
