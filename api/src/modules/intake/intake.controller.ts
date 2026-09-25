import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { ROLES } from '../../common/auth/roles';
import { Public, Roles } from '../../common/auth/roles.decorator';
import { Throttle } from '../../common/ratelimit/rate-limit.decorator';
import { IntakeSecretGuard } from './intake-secret.guard';
import { IntakeService } from './intake.service';

class IngestDto {
  @IsEmail() reporterEmail!: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() sender?: string;
  @IsOptional() @IsString() rawBody?: string;
}

@Controller()
export class IntakeController {
  constructor(private readonly intake: IntakeService) {}

  /**
   * Inbound webhook for the monitored report-a-phish address. In production
   * this is fed by an SES-inbound → Lambda/webhook pipeline; the shape is a
   * parsed message. Public by necessity, so it is rate-limited and
   * authenticated by the shared secret in `X-Vlumeaware-Intake-Secret`
   * (`INTAKE_SHARED_SECRET`) — without that check anyone could write
   * phish-report rows against any enrolled employee.
   */
  @Public()
  @UseGuards(IntakeSecretGuard)
  @Throttle({ limit: 60, windowMs: 60_000 })
  @Post('intake/phish-report')
  @HttpCode(200)
  ingest(@Body() dto: IngestDto) {
    return this.intake.ingest(dto);
  }

  @Get('tenants/:tenantId/phish-reports')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  list(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.intake.list(tenantId);
  }
}
