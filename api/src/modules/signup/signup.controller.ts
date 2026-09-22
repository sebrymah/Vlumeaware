import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Equals, IsBoolean, IsEmail, IsString, MinLength } from 'class-validator';
import { Public } from '../../common/auth/roles.decorator';
import { Throttle } from '../../common/ratelimit/rate-limit.decorator';
import { SignupService } from './signup.service';

class SignupDto {
  @IsString() @MinLength(2) companyName!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(12) password!: string;
  /**
   * Must be literally true. A missing or false value is a validation error
   * rather than a silent default, because this is the client's authorization
   * to run phishing simulations against their own staff.
   */
  @IsBoolean()
  @Equals(true, { message: 'You must accept the authorization agreement and terms of use' })
  acceptedAgreement!: boolean;
}

@Controller('signup')
@Public()
export class SignupController {
  constructor(private readonly signup: SignupService) {}

  // Public and anti-abuse throttled — a handful of signups per IP per minute.
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post()
  @HttpCode(201)
  create(@Body() dto: SignupDto, @Req() req: { ip?: string; socket?: { remoteAddress?: string } }) {
    // Stored with the acceptance. Best-effort: behind a proxy this is only as
    // trustworthy as the proxy, which is why it is evidence rather than proof.
    const acceptedIp = req.ip ?? req.socket?.remoteAddress ?? undefined;
    return this.signup.signup({ ...dto, acceptedIp });
  }
}
