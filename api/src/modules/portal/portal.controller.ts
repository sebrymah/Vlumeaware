import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { IsEmail } from 'class-validator';
import { Public } from '../../common/auth/roles.decorator';
import { Throttle } from '../../common/ratelimit/rate-limit.decorator';
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

  /**
   * Throttled because this sends real mail and rewrites the recipient's portal
   * token: unthrottled, it is both a mail-bomb and a way to invalidate somebody
   * else's sign-in link repeatedly. The response stays identical either way.
   */
  @Post('request-link')
  @Throttle({ limit: 5, windowMs: 60_000 })
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
