import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
import { Public } from '../../common/auth/roles.decorator';
import { LearnService } from './learn.service';

class AnswerDto {
  @IsUUID('4') questionId!: string;
  @IsInt() @Min(0) choice!: number;
}

class QuizDto {
  @IsUUID('4') quizId!: string;
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => AnswerDto)
  answers!: AnswerDto[];
}

/** Public, token-addressed standalone training page (no login). */
@Controller('learn')
@Public()
export class LearnController {
  constructor(private readonly learn: LearnService) {}

  @Get(':token')
  get(@Param('token') token: string) {
    return this.learn.getLearn(token);
  }

  @Post(':token/quiz')
  @HttpCode(200)
  submitQuiz(@Param('token') token: string, @Body() dto: QuizDto) {
    return this.learn.submitQuiz(token, dto);
  }

  @Post(':token/complete')
  @HttpCode(200)
  complete(@Param('token') token: string) {
    return this.learn.markComplete(token);
  }
}
