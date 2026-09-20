export interface EmailAttachment {
  filename: string;
  content: Buffer;
  /** MIME type, e.g. application/pdf. */
  contentType: string;
}

export interface OutboundEmail {
  to: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  html: string;
  /** Correlates SES message ids back to the send row. */
  sendId: string;
  /** Files to attach. Simulation sends never use this; certificates do. */
  attachments?: EmailAttachment[];
}

export interface Mailer {
  send(email: OutboundEmail): Promise<{ messageId: string }>;
}

export const MAILER = Symbol('MAILER');
