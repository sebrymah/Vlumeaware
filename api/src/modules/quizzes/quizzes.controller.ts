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
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { ROSTER_UPLOAD } from '../../common/upload/upload-limits';
import { QuizzesService } from './quizzes.service';
import { RequiresWritableTenant } from '../../common/trial/writable-tenant.guard';

class QuestionDto {
  @IsString() @MinLength(3) prompt!: string;
  @IsArray() @ArrayMinSize(2) @IsString({ each: true }) options!: string[];
  @IsInt() @Min(0) correctIndex!: number;
  @IsOptional() @IsString() explanation?: string;
}

class CreateQuizDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) passingScorePct?: number;
  @IsOptional() @IsBoolean() allowRetakes?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(20) maxAttempts?: number;
  @IsOptional() @IsUUID('4') trainingModuleId?: string;
  @IsOptional() @IsUUID('4') campaignId?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => QuestionDto)
  questions!: QuestionDto[];
}

class UpdateQuizDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) passingScorePct?: number;
  @IsOptional() @IsBoolean() allowRetakes?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(20) maxAttempts?: number;
}

class QuestionsDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => QuestionDto)
  questions!: QuestionDto[];
}

@Controller('tenants/:tenantId/quizzes')
export class QuizzesController {
  constructor(private readonly quizzes: QuizzesService) {}

  @Get()
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  list() {
    return this.quizzes.list();
  }

  @Get(':quizId')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  findOne(@Param('quizId', ParseUUIDPipe) quizId: string) {
    return this.quizzes.findOne(quizId);
  }

  @Get(':quizId/results')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  results(@Param('quizId', ParseUUIDPipe) quizId: string) {
    return this.quizzes.results(quizId);
  }

  @Post()
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  @RequiresWritableTenant()
  create(@Body() dto: CreateQuizDto) {
    return this.quizzes.create(dto);
  }

  @Patch(':quizId')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  update(@Param('quizId', ParseUUIDPipe) quizId: string, @Body() dto: UpdateQuizDto) {
    return this.quizzes.update(quizId, dto);
  }

  /** Replace the question set (bulk JSON). */
  @Post(':quizId/questions')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  setQuestions(@Param('quizId', ParseUUIDPipe) quizId: string, @Body() dto: QuestionsDto) {
    return this.quizzes.setQuestions(quizId, dto.questions);
  }

  /** Upload questions from a CSV (prompt, option1..N, correct, explanation). */
  @Post(':quizId/questions/csv')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  @UseInterceptors(FileInterceptor('file', ROSTER_UPLOAD))
  uploadCsv(
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @UploadedFile() file: { buffer: Buffer },
  ) {
    return this.quizzes.setQuestions(quizId, this.quizzes.parseCsv(file?.buffer));
  }

  @Delete(':quizId')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  remove(@Param('quizId', ParseUUIDPipe) quizId: string) {
    return this.quizzes.remove(quizId);
  }
}
