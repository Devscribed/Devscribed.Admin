import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { LoginController } from './auth/login.controller';
import { LoginService } from './auth/login.service';
import {
  ForgotPasswordController,
  ResetPasswordController,
} from './auth/password-reset.controller';
import { PasswordResetService } from './auth/password-reset.service';
import { SessionService } from './auth/session.service';
import { ConsoleMailService } from './mail/console-mail.service';
import { InMemoryMailService } from './mail/in-memory-mail.service';
import { MailService } from './mail/mail.service';
import { TestMailController } from './mail/test-mail.controller';
import { MembersController } from './members/members.controller';
import { PrismaService } from './prisma.service';
import { SignupController } from './signup/signup.controller';
import { SignupService } from './signup/signup.service';

/**
 * Spec 02 leaves the real transport out of scope, so there are only two stand-ins.
 *
 * The sink is the default outside production: it logs the link exactly like the
 * console transport *and* records it, which is what lets an E2E run read the reset
 * mail. Defaulting rather than requiring `MAIL_TRANSPORT=memory` matters because
 * Playwright reuses an already-running dev server — if the sink were opt-in, whether
 * the suite passed would depend on how that server happened to be started.
 *
 * An explicit `MAIL_TRANSPORT` always wins, and `/api/test/mail` stays 404 in
 * production regardless.
 */
const useMailSink =
  process.env.MAIL_TRANSPORT === 'memory' ||
  (process.env.MAIL_TRANSPORT === undefined && process.env.NODE_ENV !== 'production');

const mailProvider = {
  provide: MailService,
  useClass: useMailSink ? InMemoryMailService : ConsoleMailService,
};

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
    }),
  ],
  controllers: [
    SignupController,
    LoginController,
    ForgotPasswordController,
    ResetPasswordController,
    MembersController,
    TestMailController,
  ],
  providers: [
    PrismaService,
    SignupService,
    LoginService,
    PasswordResetService,
    SessionService,
    mailProvider,
  ],
})
export class AppModule {}
