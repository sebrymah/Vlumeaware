import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { IsEmail, IsString, Length, Matches, MinLength } from 'class-validator';
import { Throttle } from '../ratelimit/rate-limit.decorator';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { Public } from './roles.decorator';
import { Roles } from './roles.decorator';
import { ROLES } from './roles';
import type { JwtPayload } from './roles';

class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
}

class MfaVerifyDto {
  @IsString() challenge!: string;
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' }) code!: string;
}

class ChangePasswordDto {
  @IsString() currentPassword!: string;
  // The real minimum is the tenant's policy, checked server-side; this is only
  // a floor so an obviously bad value never reaches the hash.
  @IsString() @MinLength(8) newPassword!: string;
}

class MfaCodeDto {
  @IsString() @Length(6, 6) @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' }) code!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  // Credential stuffing is the realistic attack on this endpoint.
  @Throttle({ limit: 10, windowMs: 60_000 })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  /** Second factor: exchange the login challenge + a TOTP code for an access token. */
  @Public()
  @Throttle({ limit: 10, windowMs: 60_000 })
  @Post('mfa/verify')
  verifyMfa(@Body() dto: MfaVerifyDto) {
    return this.auth.verifyMfa(dto.challenge, dto.code);
  }

  /** Begin enrolment for whoever is signed in, staff or client user. */
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  @Post('mfa/setup')
  setupMfa(@CurrentUser() user: JwtPayload) {
    return this.auth.setupMfa(user.sub);
  }

  /** Finish enrolment by confirming a code from the authenticator app. */
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  @HttpCode(200)
  @Post('mfa/activate')
  activateMfa(@CurrentUser() user: JwtPayload, @Body() dto: MfaCodeDto) {
    return this.auth.activateMfa(user.sub, dto.code);
  }

  /** Turn MFA off. Refused when the client's policy requires it. */
  @Roles(ROLES.clientAdmin, ROLES.clientViewer)
  @HttpCode(200)
  @Post('mfa/disable')
  disableMfa(@CurrentUser() user: JwtPayload) {
    return this.auth.disableMfa(user.sub, user.tenantId);
  }

  /** Change your own password, checked against your organisation's minimum. */
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @HttpCode(200)
  @Post('password')
  changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.sub, user.tenantId, dto.currentPassword, dto.newPassword);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }
}
