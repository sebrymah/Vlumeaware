import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { LandingPagesService } from './landing-pages.service';

class CreateLandingPageDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsString() @MinLength(1) @MaxLength(200_000) html!: string;
}

class PreviewLandingPageDto {
  @IsString() @MaxLength(200_000) html!: string;
}

@Controller('tenants/:tenantId/landing-pages')
@Roles(ROLES.superadmin, ROLES.clientAdmin)
export class LandingPagesController {
  constructor(private readonly pages: LandingPagesService) {}

  @Get()
  list() {
    return this.pages.list();
  }

  /** Sanitize-only, for the live preview while building a page. Saves nothing. */
  @Post('preview')
  preview(@Body() dto: PreviewLandingPageDto) {
    return this.pages.preview(dto.html);
  }

  @Post()
  create(@Body() dto: CreateLandingPageDto) {
    return this.pages.create(dto.name ?? '', dto.html);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.pages.remove(id);
  }
}
