import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { TemplatesService } from './templates.service';
import { RequiresWritableTenant } from '../../common/trial/writable-tenant.guard';

class TemplateFilterDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high']) difficultyTier?: 'low' | 'medium' | 'high';
  @IsOptional() @IsString() industryTag?: string;
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

  /** Clone a catalogue template into this tenant's editable library. */
  @Post('tenants/:tenantId/scenarios/from-template/:templateId')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  @RequiresWritableTenant()
  clone(@Param('templateId', ParseUUIDPipe) templateId: string) {
    return this.templates.cloneToTenant(templateId);
  }
}
