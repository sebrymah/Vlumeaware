import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { IsEmail } from 'class-validator';
import { Public } from '../../common/auth/roles.decorator';
import { PortalService } from './portal.service';

class RequestLinkDto {
  @IsEmail() email!: string;
}

/**
 * Public employee portal. No JWT — the magic-link token in the path is the
 * credential (like /learn). request-link never reveals whether an email exists.
 */
@Controller('portal')
@Public()
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Post('request-link')
  @HttpCode(200)
  async requestLink(@Body() dto: RequestLinkDto) {
    await this.portal.requestLink(dto.email);
    // Deliberately identical whether or not a match was found.
    return { ok: true };
  }

  @Get(':token/summary')
  summary(@Param('token') token: string) {
    return this.portal.summary(token);
  }
}
