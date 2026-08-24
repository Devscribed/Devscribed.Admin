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
import { InternalModule } from './internal/internal.module';
import { TestMailController } from './mail/test-mail.controller';
import { SigningModule } from './signing/signing.module';
import { MeController } from './members/me.controller';
import { MemberProfileController } from './members/member-profile.controller';
import { MemberProfileService } from './members/member-profile.service';
import { MembersController } from './members/members.controller';
import { SignupController } from './signup/signup.controller';
import { SignupService } from './signup/signup.service';
import { TestRoleController } from './test-support/test-role.controller';

/**
 * Driver selection used to live here, for mail alone. Documents spec 02 added four more
 * ports with the same env-var-or-local-default rule, so each port now chooses its own
 * driver in its own `*.provider.ts` — next to the drivers it chooses between — and
 * `CoreModule` registers all five globally. The rule itself is unchanged: an explicit
 * env var always wins, and the local driver is the default whenever `NODE_ENV` is not
 * `production`. `MAIL_TRANSPORT` is read in `mail/mail.provider.ts`.
 */
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
    }),
    // Prisma, the session reader, and the five infrastructure ports, shared by every
    // module rather than duplicated into each one — see the note in core.module.ts.
    CoreModule,
    // The first feature module in the codebase. Everything below stays flat; the
    // documents area brings its own controllers rather than lengthening this list.
    DocumentsModule,
    // Two more modules rather than more controllers here, because both have an
    // authorization model that is not this application's: `SigningModule` is session-less
    // and authorized by a token, `InternalModule` by a shared secret. Keeping them apart
    // is what stops a guard from being applied to the wrong half by accident.
    SigningModule,
    InternalModule,
  ],
  controllers: [
    SignupController,
    LoginController,
    LogoutController,
    ForgotPasswordController,
    ResetPasswordController,
    MeController,
    MembersController,
    // Spec 03's contract details. Flat here rather than in `DocumentsModule`: the
    // member profile is a member-management resource that the documents area reads,
    // not a documents resource.
    MemberProfileController,
    TestMailController,
    TestRoleController,
  ],
  providers: [SignupService, LoginService, PasswordResetService, MemberProfileService],
})
export class AppModule {}
