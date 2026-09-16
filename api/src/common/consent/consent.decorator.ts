import { applyDecorators, UseGuards } from '@nestjs/common';
import { ConsentGuard } from './consent.guard';

/** Marks a route as requiring a signed NDPA agreement. */
export const RequiresSignedAgreement = () => applyDecorators(UseGuards(ConsentGuard));
