import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { GroupsService } from './groups.service';

class NameDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
}

class MembersDto {
  @IsArray() @ArrayMaxSize(10000) @IsUUID('4', { each: true }) employeeIds!: string[];
}

@Controller('tenants/:tenantId/groups')
@Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  list() {
    return this.groups.list();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.groups.findOne(id);
  }

  // Only client_admin (and staff) may change groups; client_viewer is read-only.
  @Post()
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  create(@Body() dto: NameDto) {
    return this.groups.create(dto.name);
  }

  @Patch(':id')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  rename(@Param('id', ParseUUIDPipe) id: string, @Body() dto: NameDto) {
    return this.groups.rename(id, dto.name);
  }

  @Put(':id/members')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  setMembers(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MembersDto) {
    return this.groups.setMembers(id, dto.employeeIds);
  }

  @Delete(':id')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.groups.remove(id);
  }
}
