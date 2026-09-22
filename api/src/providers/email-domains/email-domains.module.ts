import { Module } from '@nestjs/common';
import { EMAIL_DOMAINS } from './email-domains.interface';
import { ResendDomainsProvider } from './resend-domains.provider';

@Module({
  providers: [{ provide: EMAIL_DOMAINS, useClass: ResendDomainsProvider }],
  exports: [EMAIL_DOMAINS],
})
export class EmailDomainsModule {}
