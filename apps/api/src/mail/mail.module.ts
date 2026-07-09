import { Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { DevMailController } from './dev-mail.controller';

/**
 * Provides the {@link MailerService} (shared singleton) and the dev-only mail
 * sink endpoint. Imported by any module that sends email (e.g. AuthModule).
 */
@Module({
  providers: [MailerService],
  controllers: [DevMailController],
  exports: [MailerService],
})
export class MailModule {}
