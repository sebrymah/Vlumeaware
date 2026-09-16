export interface OutboundEmail {
  to: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  html: string;
  /** Correlates SES message ids back to the send row. */
  sendId: string;
}

export interface Mailer {
  send(email: OutboundEmail): Promise<{ messageId: string }>;
}

export const MAILER = Symbol('MAILER');
