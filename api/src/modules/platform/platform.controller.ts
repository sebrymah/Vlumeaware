import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPayload } from '../../common/auth/roles';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { Throttle } from '../../common/ratelimit/rate-limit.decorator';
import { PlatformPolicyService } from './platform-policy.service';
import { StaffUsersService } from './staff-users.service';

class CreateStaffDto {
  @IsEmail() email!: string;
  // Only one staff role exists today; the field is here so a second one (a
  // read-only analyst, say) does not need a new endpoint.
  @IsOptional() @IsIn(['vlumetech_superadmin']) role?: 'vlumetech_superadmin';
}

class PlatformSecurityDto {
  @IsOptional() @IsBoolean() requireMfa?: boolean;
  // Floor of 12 in the service as well: a policy weaker than the value it replaced
  // is not a policy change, it is a regression.
  @IsOptional() @IsInt() @Min(12) @Max(64) passwordMinLength?: number;
  @IsOptional() @IsInt() @Min(15) @Max(1440) sessionTimeoutMinutes?: number;
}

/**
 * Platform-wide administration for Vlumetech staff. Every route is superadmin-only;
 * there is no second staff role yet, so "least privilege" here means that clients
 * cannot reach any of it and that every change is audited.
 */
@Controller('platform')
@Roles(ROLES.superadmin)
export class PlatformController {
  constructor(
    private readonly staff: StaffUsersService,
    private readonly policy: PlatformPolicyService,
  ) {}

  @Get('staff')
  list() {
    return this.staff.list();
  }

  @Post('staff')
  @Throttle({ limit: 10, windowMs: 60_000 })
  create(@Body() dto: CreateStaffDto, @CurrentUser() user: JwtPayload) {
    return this.staff.create(dto, user.email);
  }

  @Post('staff/:id/password-reset')
  @HttpCode(200)
  @Throttle({ limit: 10, windowMs: 60_000 })
  sendInvite(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.staff.sendInvite(id, user.email);
  }

  @Post('staff/:id/mfa-reset')
  @HttpCode(200)
  resetMfa(@Param('id', ParseUUIDPipe) id: string) {
    return this.staff.resetMfa(id);
  }

  @Post('staff/:id/deactivate')
  @HttpCode(200)
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.staff.deactivate(id, user.sub);
  }

  @Post('staff/:id/reactivate')
  @HttpCode(200)
  reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.staff.reactivate(id);
  }

  @Get('security')
  getPolicy() {
    return this.policy.get();
  }

  @Patch('security')
  updatePolicy(@Body() dto: PlatformSecurityDto, @CurrentUser() user: JwtPayload) {
    return this.policy.update(dto, user.email);
  }
}
