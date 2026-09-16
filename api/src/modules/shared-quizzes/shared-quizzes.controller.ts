import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { SharedQuizzesService } from './shared-quizzes.service';

class QuestionDto {
  @IsString() @MinLength(3) prompt!: string;
  @IsArray() @ArrayMinSize(2) @IsString({ each: true }) options!: string[];
  @IsInt() @Min(0) correctIndex!: number;
  @IsOptional() @IsString() explanation?: string;
}

class CreateSharedQuizDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) passingScorePct?: number;
  @IsOptional() @IsString() source?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => QuestionDto)
  questions!: QuestionDto[];
}

class UpdateSharedQuizDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) passingScorePct?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => QuestionDto)
  questions?: QuestionDto[];
}

@Controller('shared-quizzes')
export class SharedQuizzesController {
  constructor(private readonly shared: SharedQuizzesService) {}

  /** Any authenticated console user may browse the shared library to clone from it. */
  @Get()
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  list() {
    return this.shared.list();
  }

  @Get(':id')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.shared.findOne(id);
  }

  // Only Vlumetech staff curate the shared library.
  @Post()
  @Roles(ROLES.superadmin)
  create(@Body() dto: CreateSharedQuizDto) {
    return this.shared.create(dto);
  }

  @Patch(':id')
  @Roles(ROLES.superadmin)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSharedQuizDto) {
    return this.shared.update(id, dto);
  }

  @Delete(':id')
  @Roles(ROLES.superadmin)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.shared.remove(id);
  }
}
