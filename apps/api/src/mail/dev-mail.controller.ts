import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { SentEmail } from './email.types';

/**
 * Dev/test-only endpoint that exposes captured emails so E2E tests can read
 * links delivered by email (e.g. the password-reset link). It is inert unless
 * `DEV_MAIL_SINK=true` — never enable it in production.
 */
@Controller('dev/emails')
export class DevMailController {
  constructor(private readonly mailer: MailerService) {}

  private assertEnabled(): void {
    if (process.env.DEV_MAIL_SINK !== 'true') {
      throw new NotFoundException();
    }
  }

  /** GET /api/dev/emails/latest?to=<email> — the most recent email to a recipient. */
  @Get('latest')
  latest(@Query('to') to?: string): SentEmail {
    this.assertEnabled();
    if (!to) {
      throw new NotFoundException('missing "to" query param');
    }
    const email = this.mailer.getLastTo(to);
    if (!email) {
      throw new NotFoundException('no email for that recipient');
    }
    return email;
  }
}
