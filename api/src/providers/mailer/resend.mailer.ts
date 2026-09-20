import { Injectable, Logger } from '@nestjs/common';
import type { Mailer, OutboundEmail } from './mailer.interface';

/**
 * Resend transactional email (https://resend.com) via its HTTP API — no SDK
 * dependency. Selected with MAILER=resend. The From address
 * (SIMULATION_FROM_ADDRESS) must be on a domain verified in the Resend
 * dashboard, and RESEND_API_KEY must be set.
 */
@Injectable()
export class ResendMailer implements Mailer {
  private readonly logger = new Logger(ResendMailer.name);
  private readonly apiKey = process.env.RESEND_API_KEY;

  async send(email: OutboundEmail): Promise<{ messageId: string }> {
    if (!this.apiKey) {
      throw new Error('RESEND_API_KEY is not set — cannot send with MAILER=resend');
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${email.fromName} <${email.fromAddress}>`,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        // Correlates the provider message back to the send row.
        headers: { 'X-Entity-Ref-ID': email.sendId },
        ...(email.attachments?.length
          ? {
              attachments: email.attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString('base64'),
                content_type: a.contentType,
              })),
            }
          : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend send failed (${res.status}): ${detail}`);
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    this.logger.log(`Resend accepted send ${email.sendId} as ${data.id ?? 'unknown'}`);
    return { messageId: data.id ?? `resend-${email.sendId}` };
  }
}
