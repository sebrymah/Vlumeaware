import { Module } from '@nestjs/common';
import { SharedQuizzesController } from './shared-quizzes.controller';
import { SharedQuizzesService } from './shared-quizzes.service';

@Module({
  controllers: [SharedQuizzesController],
  providers: [SharedQuizzesService],
  exports: [SharedQuizzesService],
})
export class SharedQuizzesModule {}
