import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Public } from '../../common/auth/roles.decorator';
import { Throttle } from '../../common/ratelimit/rate-limit.decorator';
import { ConsoleInviteService } from './console-invite.service';

class AcceptInviteDto {
  // The tenant's own policy is enforced in the service; this is the floor that
  // applies before we even look the token up.
  @IsString() @MinLength(8) @MaxLength(200) password!: string;
}

/**
 * The anonymous half of console invitations: what the recipient's page calls.
 * Both routes are unauthenticated by necessity — the link is the credential —
 * so they are rate limited and reveal nothing beyond the address they were sent
 * to.
 */
@Controller('auth/console-invite')
export class ConsoleInviteController {
  constructor(private readonly invites: ConsoleInviteService) {}

  @Public()
  @Throttle({ limit: 30, windowMs: 60_000 })
  @Get(':token')
  peek(@Param('token') token: string) {
    return this.invites.peek(token);
  }

  @Public()
  @Throttle({ limit: 10, windowMs: 60_000 })
  @HttpCode(200)
  @Post(':token')
  accept(@Param('token') token: string, @Body() dto: AcceptInviteDto) {
    return this.invites.accept(token, dto.password);
  }
}
