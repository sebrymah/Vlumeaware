import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsInt, IsOptional, IsString, IsUrl, IsUUID, MinLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { VIDEO_UPLOAD } from '../../common/upload/upload-limits';
import { TrainingModulesService } from './training-modules.service';
import { RequiresWritableTenant } from '../../common/trial/writable-tenant.guard';

class LinkModuleDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsUrl({ require_protocol: true }) videoUrl!: string;
  @IsOptional() @IsInt() @Min(1) durationSeconds?: number;
}

class UploadModuleDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) durationSeconds?: number;
}

class UpdateModuleDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) durationSeconds?: number;
}

class SetQuizDto {
  // The quiz to attach, or null to detach the module's quiz.
  @IsOptional() @IsUUID('4') quizId?: string | null;
}

@Controller('tenants/:tenantId/training-modules')
export class TrainingModulesController {
  constructor(private readonly modules: TrainingModulesService) {}

  @Get()
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  list() {
    return this.modules.list();
  }

  /** Clone an item from the shared Vlumetech library into this tenant. */
  @Post('from-shared/:sharedId')
  @Roles(ROLES.clientAdmin)
  @RequiresWritableTenant()
  cloneShared(@Param('sharedId', ParseUUIDPipe) sharedId: string) {
    return this.modules.cloneFromShared(sharedId);
  }

  /** Register a module from an already-hosted video URL. Client-owned content. */
  @Post('link')
  @Roles(ROLES.clientAdmin)
  @RequiresWritableTenant()
  link(@Body() dto: LinkModuleDto) {
    return this.modules.createFromLink(dto);
  }

  /** Upload a video file (multipart: field "video"). Client-owned content. */
  @Post('upload')
  @Roles(ROLES.clientAdmin)
  @UseInterceptors(FileInterceptor('video', VIDEO_UPLOAD))
  @RequiresWritableTenant()
  upload(
    @Body() dto: UploadModuleDto,
    @UploadedFile() video: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    return this.modules.createFromUpload(video, dto);
  }

  /** Attach (or detach) the quiz for this module, from the module side. */
  @Put(':moduleId/quiz')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  @RequiresWritableTenant()
  setQuiz(@Param('moduleId', ParseUUIDPipe) moduleId: string, @Body() dto: SetQuizDto) {
    return this.modules.setQuiz(moduleId, dto.quizId ?? null);
  }

  @Patch(':moduleId')
  @Roles(ROLES.clientAdmin)
  update(@Param('moduleId', ParseUUIDPipe) moduleId: string, @Body() dto: UpdateModuleDto) {
    return this.modules.update(moduleId, dto);
  }

  @Delete(':moduleId')
  @Roles(ROLES.clientAdmin)
  remove(@Param('moduleId', ParseUUIDPipe) moduleId: string) {
    return this.modules.remove(moduleId);
  }
}
