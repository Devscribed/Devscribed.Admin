import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { LoginController } from './auth/login.controller';
import { LoginService } from './auth/login.service';
import { LogoutController } from './auth/logout.controller';
import {
  ForgotPasswordController,
  ResetPasswordController,
} from './auth/password-reset.controller';
import { PasswordResetService } from './auth/password-reset.service';
import { CoreModule } from './core.module';
import { DocumentsModule } from './documents/documents.module';
import { ConsoleMailService } from './mail/console-mail.service';
import { InMemoryMailService } from './mail/in-memory-mail.service';
import { MailService } from './mail/mail.service';
import { TestMailController } from './mail/test-mail.controller';
import { MeController } from './members/me.controller';
import { MembersController } from './members/members.controller';
import { SignupController } from './signup/signup.controller';
import { SignupService } from './signup/signup.service';
import { TestRoleController } from './test-support/test-role.controller';

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
    // Prisma and the session reader, shared by every module rather than duplicated
    // into each one — see the note in core.module.ts.
    CoreModule,
    // The first feature module in the codebase. Everything below stays flat; the
    // documents area brings its own controllers rather than lengthening this list.
    DocumentsModule,
  ],
  controllers: [
    SignupController,
    LoginController,
    LogoutController,
    ForgotPasswordController,
    ResetPasswordController,
    MeController,
    MembersController,
    TestMailController,
    TestRoleController,
  ],
  providers: [SignupService, LoginService, PasswordResetService, mailProvider],
})
export class AppModule {}
