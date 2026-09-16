import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { Throttle } from '../ratelimit/rate-limit.decorator';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { Public } from './roles.decorator';
import type { JwtPayload } from './roles';

class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
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

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }
}
