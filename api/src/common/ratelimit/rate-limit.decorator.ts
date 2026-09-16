import { SetMetadata } from '@nestjs/common';
import { RATE_LIMIT_KEY } from './rate-limit.guard';
import type { RateLimit } from './rate-limit.guard';

/** e.g. `@Throttle({ limit: 10, windowMs: 60_000 })` */
export const Throttle = (rule: RateLimit) => SetMetadata(RATE_LIMIT_KEY, rule);
