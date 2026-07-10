import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { InvitationsModule } from './invitations/invitations.module';
import { MailModule } from './mail/mail.module';
import { MembersModule } from './members/members.module';

@Module({
  imports: [DatabaseModule, AuthModule, MembersModule, MailModule, InvitationsModule],
  controllers: [HealthController],
})
export class AppModule {}
