import { Module } from '@nestjs/common';
import { LogMailer } from './log.mailer';
import { MAILER } from './mailer.interface';
import { SesMailer } from './ses.mailer';

/**
 * SES is used only when explicitly configured. Anything else — local dev, CI,
 * a misconfigured deploy — falls back to the log mailer rather than risking a
 * real send to a client's employees.
 */
@Module({
  providers: [
    {
      provide: MAILER,
      useFactory: () => (process.env.MAILER === 'ses' ? new SesMailer() : new LogMailer()),
    },
  ],
  exports: [MAILER],
})
export class MailerModule {}
