import { Body, Controller, Get, Header, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Public } from '../../common/auth/roles.decorator';
import { Throttle } from '../../common/ratelimit/rate-limit.decorator';
import { publicBaseUrl } from './render';
import { TrackingService } from './tracking.service';

/** 1x1 transparent GIF, served whatever happens so email clients see an image. */
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

/**
 * Only non-reversible metadata is accepted. There is deliberately no field for
 * the typed username or password, and forbidNonWhitelisted (set globally)
 * rejects any attempt to post one.
 */
class SubmissionMetadataDto {
  @IsOptional() @IsInt() @Min(0) @Max(512) usernameLength?: number;
  @IsOptional() @IsInt() @Min(0) @Max(512) passwordLength?: number;
  @IsOptional() @IsBoolean() usernameLooksLikeEmail?: boolean;
}

class QuizAnswerDto {
  @IsUUID('4') questionId!: string;
  @IsInt() @Min(0) choice!: number;
}

class QuizSubmissionDto {
  @IsUUID('4') quizId!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => QuizAnswerDto)
  answers!: QuizAnswerDto[];
}

@Controller('track')
@Public()
// Public, unauthenticated and keyed on an opaque token. Generous enough for a
// real inbox (images prefetched, links followed twice) but not for scraping.
@Throttle({ limit: 120, windowMs: 60_000 })
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Get('open/:token')
  @Header('Content-Type', 'image/gif')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  async open(@Param('token') token: string, @Res() res: Response) {
    try {
      await this.tracking.recordOpen(token);
    } catch {
      // A bad token must still return a pixel; never leak validity.
    }
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.status(200).send(PIXEL);
  }

  /**
   * Click endpoint. Logs the click server-side, then redirects to the public
   * teachable-moment page. The redirect carries only the opaque token.
   */
  @Get('click/:token')
  async click(@Param('token') token: string, @Res() res: Response) {
    try {
      await this.tracking.recordClick(token);
      // Realistic flow: land on the simulated login page. The click is already
      // logged above; a skip link and a submit both lead on to the reveal.
      res.redirect(302, `${publicBaseUrl()}/t/${encodeURIComponent(token)}/login`);
    } catch {
      res.redirect(302, `${publicBaseUrl()}/t/invalid`);
    }
  }

  @Post('report/:token')
  @HttpCode(200)
  report(@Param('token') token: string) {
    return this.tracking.recordReport(token);
  }

  /**
   * Simulated login page submission. Accepts the fact of a submission only;
   * the request body is deliberately ignored.
   */
  @Post('submit/:token')
  @HttpCode(200)
  async submit(@Param('token') token: string, @Body() metadata: SubmissionMetadataDto) {
    await this.tracking.recordCredentialSubmission(token, metadata);
    return { recorded: true };
  }

  /** Branding for the simulated login page (pre-reveal, no click logged). */
  @Get('branding/:token')
  branding(@Param('token') token: string) {
    return this.tracking.getLoginBranding(token);
  }

  /** Post-reveal quiz for this send's module/campaign (no answers included). */
  @Get('quiz/:token')
  quiz(@Param('token') token: string) {
    return this.tracking.getQuizForToken(token);
  }

  /** Submit quiz answers; scored server-side. */
  @Post('quiz/:token')
  @HttpCode(200)
  submitQuiz(@Param('token') token: string, @Body() dto: QuizSubmissionDto) {
    return this.tracking.submitQuiz(token, dto);
  }

  /** Data for the teachable-moment page. */
  @Get('moment/:token')
  moment(@Param('token') token: string) {
    return this.tracking.getTeachableMoment(token);
  }
}
