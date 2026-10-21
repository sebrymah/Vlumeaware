import { Body, Controller, HttpCode, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Public } from '../../common/auth/roles.decorator';
import { Throttle } from '../../common/ratelimit/rate-limit.decorator';
import { PostmarkGuard } from './postmark.guard';
import { IntakeService } from './intake.service';
import { isAuthenticatedSender } from './postmark-auth';
import { ReportChannelService } from '../report-channel/report-channel.service';

class PostmarkAddress {
  @IsOptional() @IsString() Email?: string;
  @IsOptional() @IsString() Name?: string;
}

class PostmarkHeader {
  @IsOptional() @IsString() Name?: string;
  @IsOptional() @IsString() Value?: string;
}

/** The subset of Postmark's inbound payload we use. */
class PostmarkInboundDto {
  /** The token after the "+" in report+<token>@… — resolves the tenant. */
  @IsOptional() @IsString() MailboxHash?: string;
  @IsOptional() @IsString() Subject?: string;
  @IsOptional() @IsString() TextBody?: string;
  @IsOptional() @IsString() HtmlBody?: string;
  @IsOptional() @IsString() From?: string;
  @IsOptional() @ValidateNested() @Type(() => PostmarkAddress) FromFull?: PostmarkAddress;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PostmarkHeader)
  Headers?: PostmarkHeader[];
}

@Controller()
export class PostmarkController {
  constructor(
    private readonly intake: IntakeService,
    private readonly channel: ReportChannelService,
  ) {}

  /**
   * Postmark inbound webhook. The forwarder's address is the reporter; the
   * MailboxHash resolves the tenant. Always 200 so Postmark does not retry a
   * message we have deliberately declined (unknown token / unknown reporter).
   * The local pipe is permissive because Postmark sends many fields the global
   * forbidNonWhitelisted pipe would otherwise reject.
   */
  @Public()
  @UseGuards(PostmarkGuard)
  @Throttle({ limit: 120, windowMs: 60_000 })
  @Post('intake/postmark')
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: false, forbidNonWhitelisted: false }))
  async inbound(@Body() body: PostmarkInboundDto) {
    const token = (body.MailboxHash ?? '').trim();
    const reporterEmail = body.FromFull?.Email ?? body.From;
    if (!token || !reporterEmail) {
      return { recorded: false, reason: 'missing token or sender' };
    }

    const tenant = await this.channel.resolveTenantByToken(token);
    if (!tenant) {
      return { recorded: false, reason: 'unknown report address' };
    }

    const result = await this.intake.ingest(
      { reporterEmail, subject: body.Subject, rawBody: body.TextBody || body.HtmlBody },
      { tenantId: tenant.tenantId, senderAuthenticated: isAuthenticatedSender(body.Headers, reporterEmail) },
    );
    if (result.recorded) await this.channel.markReceived(tenant.tenantId);
    return result;
  }
}
