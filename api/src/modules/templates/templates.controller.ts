import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { TemplatesService } from './templates.service';
import { RequiresWritableTenant } from '../../common/trial/writable-tenant.guard';

class TemplateFilterDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high']) difficultyTier?: 'low' | 'medium' | 'high';
  @IsOptional() @IsString() industryTag?: string;
}

class CreateTemplateDto {
  @IsString() @MinLength(2) title!: string;
  @IsString() @MinLength(2) category!: string;
  @IsIn(['low', 'medium', 'high']) difficultyTier!: 'low' | 'medium' | 'high';
  @IsOptional() @IsString() industryTag?: string;
  @IsString() @MinLength(2) subjectLine!: string;
  @IsString() @MinLength(10) bodyHtml!: string;
  @IsString() @MinLength(2) senderSpoofName!: string;
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) redFlags!: string[];
}

class UpdateTemplateDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() @MinLength(2) category?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high']) difficultyTier?: 'low' | 'medium' | 'high';
  @IsOptional() @IsString() industryTag?: string;
  @IsOptional() @IsString() @MinLength(2) subjectLine?: string;
  @IsOptional() @IsString() @MinLength(10) bodyHtml?: string;
  @IsOptional() @IsString() @MinLength(2) senderSpoofName?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) redFlags?: string[];
}

@Controller()
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /** Global catalogue — any authenticated console user may browse it. */
  @Get('phishing-templates')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  list(@Query() filter: TemplateFilterDto) {
    return this.templates.list(filter);
  }

  @Get('phishing-templates/categories')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  categories() {
    return this.templates.categories();
  }

  @Get('phishing-templates/industries')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  industries() {
    return this.templates.industries();
  }

  @Get('phishing-templates/:templateId')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  findOne(@Param('templateId', ParseUUIDPipe) templateId: string) {
    return this.templates.findOne(templateId);
  }

  // Vlumetech staff author and curate the global catalogue.
  @Post('phishing-templates')
  @Roles(ROLES.superadmin)
  create(@Body() dto: CreateTemplateDto) {
    return this.templates.create(dto);
  }

  @Patch('phishing-templates/:templateId')
  @Roles(ROLES.superadmin)
  update(@Param('templateId', ParseUUIDPipe) templateId: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(templateId, dto);
  }

  @Delete('phishing-templates/:templateId')
  @Roles(ROLES.superadmin)
  remove(@Param('templateId', ParseUUIDPipe) templateId: string) {
    return this.templates.remove(templateId);
  }

  /** Clone a catalogue template into this tenant's editable library. */
  @Post('tenants/:tenantId/scenarios/from-template/:templateId')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  @RequiresWritableTenant()
  clone(@Param('templateId', ParseUUIDPipe) templateId: string) {
    return this.templates.cloneToTenant(templateId);
  }
}
