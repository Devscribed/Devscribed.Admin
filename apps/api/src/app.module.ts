import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccountController } from './account/account.controller';
import { AccountService } from './account/account.service';
import { AccrualController } from './accrual/accrual.controller';
import { AccrualService } from './accrual/accrual.service';
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
import { HealthController } from './health.controller';
import { InternalModule } from './internal/internal.module';
import { KanbanModule } from './kanban/kanban.module';
import { InvitationsController } from './invitations/invitations.controller';
import { InvitationsService } from './invitations/invitations.service';
import { OutboxController } from './mail/outbox.controller';
import { SigningSettingsController } from './organizations/signing-settings.controller';
import { SigningSettingsService } from './organizations/signing-settings.service';
import { TestMailController } from './mail/test-mail.controller';
import { SigningModule } from './signing/signing.module';
import { MeController } from './members/me.controller';
import { MemberProfileController } from './members/member-profile.controller';
import { MemberProfileService } from './members/member-profile.service';
import { MembersController } from './members/members.controller';
import { MembersService } from './members/members.service';
import { ClientsController } from './clients/clients.controller';
import { ClientsService } from './clients/clients.service';
import { HolidaysController } from './holidays/holidays.controller';
import { HolidaysService } from './holidays/holidays.service';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { RequestTopicsController } from './requests/request-topics.controller';
import { RequestTopicsService } from './requests/request-topics.service';
import { RequestsController } from './requests/requests.controller';
import { RequestsService } from './requests/requests.service';
import { RequestEventsService } from './requests/request-events.service';
import { VacationRequestFeedService } from './requests/vacation-request-feed.service';
import { SignupController } from './signup/signup.controller';
import { SignupService } from './signup/signup.service';
import { TimeTrackingController } from './time-tracking/time-tracking.controller';
import { TimeTrackingService } from './time-tracking/time-tracking.service';
import { TestFixturesController } from './test/test-fixtures.controller';
import { TestEnvelopeExpiryController } from './test-support/envelope-expiry.controller';
import { TestSignWellStubController } from './test-support/signwell-stub.controller';
import { WebhooksModule } from './webhooks/webhooks.module';
import { VacationController } from './vacation/vacation.controller';
import { VacationRequestsService } from './vacation/vacation-requests.service';
import { VacationService } from './vacation/vacation.service';

/**
 * Driver selection used to live here, for mail alone. Documents spec 02 added four more
 * ports with the same env-var-or-local-default rule, so each port now chooses its own
 * driver in its own `*.provider.ts` — next to the drivers it chooses between — and
 * `CoreModule` registers all five globally. The rule itself is unchanged: an explicit
 * env var always wins, and the local driver is the default whenever `NODE_ENV` is not
 * `production`. `MAIL_TRANSPORT` is read in `mail/mail.provider.ts`.
 *
 * `PrismaService`, `SessionService`, and the mail transport are deliberately **not**
 * listed as providers here even though several controllers below need them. `CoreModule`
 * is `@Global()` and exports all three; re-providing one would give this module its own
 * instance — a second connection pool, or a second mail sink writing to a mailbox that
 * `/api/test/mail` does not read. See the note in core.module.ts.
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
    // A third, for the same reason: the webhook route has no session, no cookies and no
    // CSRF, and its guard — "the body carries a hash we recognize" — must never be
    // reachable from an org-scoped controller.
    WebhooksModule,
    // Spec 13 — board columns + tasks. Its own module so the shared
    // `KanbanAccessService` isn't fanned out into every other controller.
    KanbanModule,
  ],
  controllers: [
    // First, so that a reader looking for "what does the load balancer call" finds it
    // without reading the rest of the list.
    HealthController,
    SignupController,
    LoginController,
    LogoutController,
    ForgotPasswordController,
    ResetPasswordController,
    MeController,
    MembersController,
    InvitationsController,
    AccountController,
    VacationController,
    RequestsController,
    RequestTopicsController,
    ProjectsController,
    ClientsController,
    HolidaysController,
    TimeTrackingController,
    AccrualController,
    // Spec 03's contract details. Flat here rather than in `DocumentsModule`: the
    // member profile is a member-management resource that the documents area reads,
    // not a documents resource.
    MemberProfileController,
    // Spec 04's signing settings. Flat here rather than in `DocumentsModule`: it is an
    // organization setting that the documents area reads, not a documents resource — the
    // same reasoning that put `MemberProfileController` above.
    SigningSettingsController,
    // The dev outbox. A product screen with the ordinary guard stack, not a fixture —
    // see the note at the top of the controller for why it is not a `/api/test/*` route.
    OutboxController,
    TestMailController,
    // Every other test fixture. One controller rather than two: the membership move and
    // the role switch that used to live beside this were retired by the invitation flow —
    // a test now invites a person the way a person does.
    TestFixturesController,
    // The one fixture no product feature retires: nothing lets a test age an envelope,
    // and nothing should.
    TestEnvelopeExpiryController,
    // The provider stub's control surface, behind the same fence as every other fixture
    // and 404 under any driver but the stub.
    TestSignWellStubController,
  ],
  providers: [
    SignupService,
    LoginService,
    PasswordResetService,
    MemberProfileService,
    InvitationsService,
    MembersService,
    AccountService,
    VacationService,
    VacationRequestsService,
    RequestsService,
    RequestTopicsService,
    RequestEventsService,
    VacationRequestFeedService,
    ProjectsService,
    ClientsService,
    HolidaysService,
    TimeTrackingService,
    AccrualService,
    SigningSettingsService,
  ],
})
export class AppModule {}
