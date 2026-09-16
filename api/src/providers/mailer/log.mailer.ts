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
    this.logger.log(`[dev mailer] -> ${email.to} :: ${email.subject}`);
    return { messageId: `dev-${email.sendId}` };
  }
}
