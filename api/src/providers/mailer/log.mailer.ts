import { Injectable, Logger } from '@nestjs/common';
import type { Mailer, OutboundEmail } from './mailer.interface';

/**
 * Development and test mailer. Records the message instead of sending it, so an
 * end-to-end campaign can be exercised locally without touching SES or a real
 * inbox.
 */
@Injectable()
export class LogMailer implements Mailer {
  private readonly logger = new Logger(LogMailer.name);
  readonly outbox: OutboundEmail[] = [];

  async send(email: OutboundEmail) {
    this.outbox.push(email);
    const files = email.attachments?.map((a) => a.filename).join(', ');
    this.logger.log(
      `[dev mailer] -> ${email.to} :: ${email.subject}${files ? ` (attached: ${files})` : ''}`,
    );
    // Opt-in, because this mailer is also the fallback for a deploy with no
    // provider configured — and invitation/reset links are credentials. A
    // developer following one locally sets LOG_MAILER_BODY=1 to see it.
    if (process.env.LOG_MAILER_BODY === '1') {
      this.logger.log(`[dev mailer] body for ${email.to}:\n${email.html}`);
    }
    return { messageId: `dev-${email.sendId}` };
  }
}
