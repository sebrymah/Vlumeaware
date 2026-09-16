import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { Injectable, Logger } from '@nestjs/common';
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
        Content: {
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
