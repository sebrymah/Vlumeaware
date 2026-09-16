import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { Public } from '../../common/auth/roles.decorator';
import { Throttle } from '../../common/ratelimit/rate-limit.decorator';
import { SignupService } from './signup.service';

class SignupDto {
  @IsString() @MinLength(2) companyName!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(12) password!: string;
}

@Controller('signup')
@Public()
export class SignupController {
  constructor(private readonly signup: SignupService) {}

  // Public and anti-abuse throttled — a handful of signups per IP per minute.
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post()
  @HttpCode(201)
  create(@Body() dto: SignupDto) {
    return this.signup.signup(dto);
  }
}
