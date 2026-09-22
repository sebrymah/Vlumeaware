import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { ROLES } from '../../common/auth/roles';
import type { JwtPayload } from '../../common/auth/roles';
import { Throttle } from '../../common/ratelimit/rate-limit.decorator';
import { LicensesService } from './licenses.service';

class IssueDto {
  @IsString() @MinLength(2) licenseTier!: string;
  @IsOptional() @IsInt() @Min(1) @Max(100_000) seatLimit?: number;
  @IsOptional() @IsInt() @Min(1) @Max(365) validDays?: number;
}

class RedeemDto {
  @IsString() @MinLength(8) key!: string;
}

@Controller('tenants/:tenantId/license')
export class LicensesController {
  constructor(private readonly licenses: LicensesService) {}

  /** Vlumetech issues a key for this client. Returns the plaintext once. */
  @Post('keys')
  @Roles(ROLES.superadmin)
  @HttpCode(201)
  issue(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: IssueDto,
  ) {
    return this.licenses.issue(tenantId, user.sub, dto);
  }

  @Get('keys')
  @Roles(ROLES.superadmin)
  list(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.licenses.list(tenantId);
  }

  @Delete('keys/:tokenId')
  @Roles(ROLES.superadmin)
  @HttpCode(200)
  revoke(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
  ) {
    return this.licenses.revoke(tenantId, tokenId);
  }

  /**
   * The client admin activates their own account. Throttled: the key is the
   * only secret here, so redemption must not be a guessing surface.
   */
  @Post('redeem')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @HttpCode(200)
  redeem(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RedeemDto,
  ) {
    return this.licenses.redeem(tenantId, user.email ?? user.sub ?? 'unknown', dto.key);
  }
}
