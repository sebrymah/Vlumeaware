import { Module } from '@nestjs/common';
import { LogMailer } from './log.mailer';
import { MAILER } from './mailer.interface';
import { ResendMailer } from './resend.mailer';
import { SesMailer } from './ses.mailer';

/**
 * A real mailer is used ONLY when explicitly selected via MAILER=resend|ses.
 * Anything else — local dev, CI, a misconfigured deploy — falls back to the log
 * mailer rather than risking a real send to a client's employees.
 */
@Module({
  providers: [
    {
      provide: MAILER,
      useFactory: () => {
        switch ((process.env.MAILER ?? '').toLowerCase()) {
          case 'resend':
            return new ResendMailer();
          case 'ses':
            return new SesMailer();
          default:
            return new LogMailer();
        }
      },
    },
  ],
  exports: [MAILER],
})
export class MailerModule {}
