import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Mailer, OutboundEmail } from './mailer.interface';

@Injectable()
export class SesMailer implements Mailer {
  private readonly logger = new Logger(SesMailer.name);
  private readonly client = new SESv2Client({ region: process.env.AWS_REGION ?? 'eu-west-1' });

  async send(email: OutboundEmail) {
    const res = await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: `${email.fromName} <${email.fromAddress}>`,
        Destination: { ToAddresses: [email.to] },
        // Dedicated IP pool keeps simulation traffic off vlumetech.com.ng's
        // sending reputation (context doc §4).
        ConfigurationSetName: process.env.SES_CONFIGURATION_SET,
        // SES's Simple content cannot carry attachments, so a message with
        // files has to be assembled as raw MIME. Simulation sends never have
        // attachments and keep taking the simpler path.
        Content: email.attachments?.length
          ? { Raw: { Data: buildMimeMessage(email) } }
          : {
              Simple: {
                Subject: { Data: email.subject, Charset: 'UTF-8' },
                Body: { Html: { Data: email.html, Charset: 'UTF-8' } },
              },
            },
        EmailTags: [{ Name: 'send_id', Value: email.sendId }],
      }),
    );
    this.logger.log(`SES accepted send ${email.sendId} as ${res.MessageId}`);
    return { messageId: res.MessageId as string };
  }
}

/** RFC 2047 encoded-word, so a non-ASCII header survives the transport. */
function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** MIME requires base64 bodies to be wrapped at 76 characters. */
function wrapBase64(value: string): string {
  return (value.match(/.{1,76}/g) ?? []).join('\r\n');
}

/** Strips characters that would break out of a quoted header parameter. */
function safeFilename(name: string): string {
  return name.replace(/["\r\n\\]/g, '_');
}

/** Assembles a multipart/mixed message: HTML body plus each attachment. */
function buildMimeMessage(email: OutboundEmail): Uint8Array {
  const boundary = `----vlumeaware-${randomBytes(12).toString('hex')}`;
  const lines: string[] = [
    `From: ${encodeHeader(email.fromName)} <${email.fromAddress}>`,
    `To: ${email.to}`,
    `Subject: ${encodeHeader(email.subject)}`,
    `X-Entity-Ref-ID: ${email.sendId}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(email.html, 'utf8').toString('base64')),
  ];

  for (const attachment of email.attachments ?? []) {
    const filename = safeFilename(attachment.filename);
    lines.push(
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}; name="${filename}"`,
      `Content-Disposition: attachment; filename="${filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(attachment.content.toString('base64')),
    );
  }

  lines.push(`--${boundary}--`, '');
  return Buffer.from(lines.join('\r\n'), 'utf8');
}
