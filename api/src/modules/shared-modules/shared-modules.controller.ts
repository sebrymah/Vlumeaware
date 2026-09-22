import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUrl, Min, MinLength } from 'class-validator';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { VIDEO_UPLOAD } from '../../common/upload/upload-limits';
import { SharedModulesService } from './shared-modules.service';

class LinkDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() @MinLength(2) category!: string;
  @IsUrl({ require_protocol: true }) videoUrl!: string;
  @IsOptional() @IsInt() @Min(1) durationSeconds?: number;
}

class UploadDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() @MinLength(2) category!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) durationSeconds?: number;
}

class UpdateDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsInt() @Min(1) durationSeconds?: number;
}

@Controller('shared-training-modules')
export class SharedModulesController {
  constructor(private readonly shared: SharedModulesService) {}

  /** Any authenticated console user may browse the shared library to clone from it. */
  @Get()
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  list() {
    return this.shared.list();
  }

  // Only Vlumetech staff curate the shared library.
  @Post('link')
  @Roles(ROLES.superadmin)
  link(@Body() dto: LinkDto) {
    return this.shared.createFromLink(dto);
  }

  @Post('upload')
  @Roles(ROLES.superadmin)
  @UseInterceptors(FileInterceptor('video', VIDEO_UPLOAD))
  upload(@Body() dto: UploadDto, @UploadedFile() video: { buffer: Buffer; mimetype: string; originalname: string }) {
    return this.shared.createFromUpload(video, dto);
  }

  @Patch(':id')
  @Roles(ROLES.superadmin)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDto) {
    return this.shared.update(id, dto);
  }

  @Delete(':id')
  @Roles(ROLES.superadmin)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.shared.remove(id);
  }
}
