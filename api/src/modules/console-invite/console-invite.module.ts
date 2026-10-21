import { Module } from '@nestjs/common';
import { MailerModule } from '../../providers/mailer/mailer.module';
import { ConsoleInviteController } from './console-invite.controller';
import { ConsoleInviteService } from './console-invite.service';

/**
 * Exported because the tenant module issues links when an admin creates or
 * resets a console user; the controller here is only the anonymous half.
 */
@Module({
  imports: [MailerModule],
  controllers: [ConsoleInviteController],
  providers: [ConsoleInviteService],
  exports: [ConsoleInviteService],
})
export class ConsoleInviteModule {}
