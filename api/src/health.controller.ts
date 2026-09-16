import { Controller, Get } from '@nestjs/common';
import { Public } from './common/auth/roles.decorator';

/** Liveness probe for the deployment host — no auth, no DB. */
@Controller('health')
@Public()
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'vlumeaware-api', ts: new Date().toISOString() };
  }
}
