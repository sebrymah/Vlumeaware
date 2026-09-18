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

  /** Begin enrolment (signed-in staff). Returns the otpauth URI + secret. */
  @Roles(ROLES.superadmin)
  @Post('mfa/setup')
  setupMfa(@CurrentUser() user: JwtPayload) {
    return this.auth.setupMfa(user.sub);
  }

  /** Finish enrolment by confirming a code from the authenticator app. */
  @Roles(ROLES.superadmin)
  @HttpCode(200)
  @Post('mfa/activate')
  activateMfa(@CurrentUser() user: JwtPayload, @Body() dto: MfaCodeDto) {
    return this.auth.activateMfa(user.sub, dto.code);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }
}
