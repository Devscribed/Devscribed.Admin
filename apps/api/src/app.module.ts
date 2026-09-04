import { Logger, Module } from '@nestjs/common';
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
import { ClientContactsController } from './clients/client-contacts.controller';
import { ClientContactsService } from './clients/client-contacts.service';
import { ClientsController } from './clients/clients.controller';
import { ClientsService } from './clients/clients.service';
import { HolidaysController } from './holidays/holidays.controller';
import { HolidaysService } from './holidays/holidays.service';
import { ReportsModule } from './reports/reports.module';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { RequestTopicsController } from './requests/request-topics.controller';
import { RequestTopicsService } from './requests/request-topics.service';
import { RequestsController } from './requests/requests.controller';
import { RequestsService } from './requests/requests.service';
import { RequestEventsService } from './requests/request-events.service';
import { RequestNotificationsService } from './requests/request-notifications.service';
import { VacationRequestFeedService } from './requests/vacation-request-feed.service';
import { TestMembersController } from './members/test-members.controller';
import { ApplicationSchedulingController } from './hiring/application-scheduling.controller';
import { ApplicationSchedulingService } from './hiring/application-scheduling.service';
import { AvailabilityService } from './hiring/availability.service';
import { BoardController, PlacementController } from './hiring/board.controller';
import { BoardScopeGuard } from './hiring/board-scope.guard';
import { BoardService } from './hiring/board.service';
import { BookingController } from './hiring/booking.controller';
import { BookingService } from './hiring/booking.service';
import { CalendarProvider } from './hiring/calendar/calendar-provider';
import { resolveCalendarConfig } from './hiring/calendar/calendar.config';
import { FakeCalendarProvider } from './hiring/calendar/fake-calendar.provider';
import { TenantAppOnlyProvider } from './hiring/calendar/graph-calendar.provider';
import { CandidateDatabaseController } from './hiring/candidate-database.controller';
import { CandidateDatabaseGuard } from './hiring/candidate-database.guard';
import { CandidateDatabaseService } from './hiring/candidate-database.service';
import { CategoriesController } from './hiring/categories.controller';
import { CategoriesService } from './hiring/categories.service';
import { CriteriaController } from './hiring/criteria.controller';
import { CriteriaService } from './hiring/criteria.service';
import {
  ApplicationsController,
  CandidateDeletionController,
  CandidatesController,
} from './hiring/candidates.controller';
import { CandidatesService } from './hiring/candidates.service';
import { CvController } from './hiring/cv.controller';
import { CvReplacementService } from './hiring/cv-replacement.service';
import { TestCalendarController } from './hiring/calendar/test-calendar.controller';
import { HiringManageGuard } from './hiring/hiring-manage.guard';
import { InterviewSchedulingService } from './hiring/interview-scheduling.service';
import { InterviewerScopeGuard } from './hiring/interviewer-scope.guard';
import { MyInterviewsController } from './hiring/my-interviews.controller';
import { MyInterviewsService } from './hiring/my-interviews.service';
import { ManageController } from './hiring/manage.controller';
import { ManageService } from './hiring/manage.service';
import { LocalFsStorage } from './hiring/storage/local-fs.storage';
import { Storage } from './hiring/storage/storage';
import { resolveStorageConfig } from './hiring/storage/storage.config';
import { VacanciesController } from './hiring/vacancies.controller';
import { VacanciesService } from './hiring/vacancies.service';
import { ViewerTimeZoneService } from './hiring/viewer-time-zone.service';
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
 *
 * Hiring's two ports are the exception and stay here: `Storage` and `CalendarProvider`
 * are needed by this module's controllers alone, and neither has a second consumer.
 */

/**
 * Storage is resolved at module construction, so a misconfiguration throws before
 * `main.ts` ever reaches `listen()`.
 *
 * `LocalFsStorage` is the only implementation this release ships. `resolveStorageConfig`
 * reads `STORAGE_PROVIDER` as given in every environment (hiring 00 requirement 15) and
 * refuses only a value it has no implementation for.
 */
const storageProvider = {
  provide: Storage,
  useFactory: (): Storage => new LocalFsStorage(resolveStorageConfig().root),
};

/**
 * One calendar implementation, chosen here so no caller ever names it.
 *
 * Graph whenever the tenant credentials are present, and the fake otherwise — which is
 * every development machine, both automated suites, and any deployed stand that sets
 * `CALENDAR_PROVIDER=fake` and accepts that bookings then invite nobody. The choice is
 * read as given in every environment (hiring 00 requirement 15).
 */
const calendarProvider = {
  provide: CalendarProvider,
  useFactory: (): CalendarProvider => {
    const config = resolveCalendarConfig();
    // Which calendar is in play decides whether a booking reaches anyone's Outlook, so
    // it is stated at boot rather than inferred from behaviour later.
    new Logger('CalendarProvider').log(
      config.provider === 'graph'
        ? `Microsoft Graph, tenant ${config.graph.tenantId}`
        : 'Fake calendar — bookings create no real event',
    );
    return config.provider === 'graph'
      ? new TenantAppOnlyProvider(config.graph)
      : new FakeCalendarProvider();
  },
};

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
    // Spec reports/01 — the report family. First vertical slice implements
    // Amounts Owed only (JSON + PDF, All + My). Own module because the
    // aggregation surface is self-contained and both slices ahead will fold
    // into it.
    ReportsModule,
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
    // Requests spec 03 — the contacts of one client. Its own controller rather than more
    // handlers on ClientsController: the two surfaces answer to different capabilities
    // on the read side, and the contact is a principal rather than part of the record.
    ClientContactsController,
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
    TestMembersController,
    VacanciesController,
    CategoriesController,
    CriteriaController,
    BookingController,
    ManageController,
    CvController,
    CandidatesController,
    CandidateDeletionController,
    CandidateDatabaseController,
    MyInterviewsController,
    ApplicationsController,
    ApplicationSchedulingController,
    BoardController,
    PlacementController,
    TestCalendarController,
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
    RequestNotificationsService,
    VacationRequestFeedService,
    ProjectsService,
    ClientsService,
    ClientContactsService,
    HolidaysService,
    TimeTrackingService,
    AccrualService,
    SigningSettingsService,
    storageProvider,
    calendarProvider,
    HiringManageGuard,
    BoardScopeGuard,
    CandidateDatabaseGuard,
    InterviewerScopeGuard,
    VacanciesService,
    CategoriesService,
    CriteriaService,
    AvailabilityService,
    BookingService,
    InterviewSchedulingService,
    CvReplacementService,
    ManageService,
    ApplicationSchedulingService,
    ViewerTimeZoneService,
    CandidatesService,
    CandidateDatabaseService,
    MyInterviewsService,
    BoardService,
  ],
})
export class AppModule {}
