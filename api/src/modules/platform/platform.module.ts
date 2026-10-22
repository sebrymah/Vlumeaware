import { Module } from '@nestjs/common';
import { ConsoleInviteModule } from '../console-invite/console-invite.module';
import { PlatformController } from './platform.controller';
import { PlatformPolicyService } from './platform-policy.service';
import { StaffUsersService } from './staff-users.service';

/**
 * Staff account lifecycle and the platform security policy. It issues invitations
 * through the console-invite service, so one token scheme and one public
 * acceptance endpoint serve both kinds of account.
 */
@Module({
  imports: [ConsoleInviteModule],
  controllers: [PlatformController],
  providers: [PlatformPolicyService, StaffUsersService],
  exports: [PlatformPolicyService],
})
export class PlatformModule {}
