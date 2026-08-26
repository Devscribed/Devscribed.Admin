import { Logger, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { LoginController } from './auth/login.controller';
import { LoginService } from './auth/login.service';
import { LogoutController } from './auth/logout.controller';
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
import { MeController } from './members/me.controller';
import { MembersController } from './members/members.controller';
import { MembersService } from './members/members.service';
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
import { CategoriesController } from './hiring/categories.controller';
import { CategoriesService } from './hiring/categories.service';
import { ApplicationsController, CandidatesController } from './hiring/candidates.controller';
import { CandidatesService } from './hiring/candidates.service';
import { CvController } from './hiring/cv.controller';
import { TestCalendarController } from './hiring/calendar/test-calendar.controller';
import { HiringManageGuard } from './hiring/hiring-manage.guard';
import { LocalFsStorage } from './hiring/storage/local-fs.storage';
import { Storage } from './hiring/storage/storage';
import { resolveStorageConfig } from './hiring/storage/storage.config';
import { VacanciesController } from './hiring/vacancies.controller';
import { VacanciesService } from './hiring/vacancies.service';
import { ViewerTimeZoneService } from './hiring/viewer-time-zone.service';
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

/**
 * Storage is resolved at module construction, so a misconfiguration throws before
 * `main.ts` ever reaches `listen()` — an application that would accept bookings and
 * discard every CV must not open a port (hiring 00 requirement 15).
 *
 * `LocalFsStorage` is the only implementation this release ships; `resolveStorageConfig`
 * is what refuses every environment it is wrong for.
 */
const storageProvider = {
  provide: Storage,
  useFactory: (): Storage => new LocalFsStorage(resolveStorageConfig().root),
};

/**
 * One calendar implementation, chosen here so no caller ever names it.
 *
 * Graph whenever the tenant credentials are present, and the fake otherwise — which is
 * every development machine and both automated suites, neither of which can hold a real
 * mailbox. `resolveCalendarConfig` is what refuses the one combination that would take
 * bookings and invite nobody: the fake in production.
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
    VacanciesController,
    CategoriesController,
    BookingController,
    CvController,
    CandidatesController,
    ApplicationsController,
    BoardController,
    PlacementController,
    TestCalendarController,
  ],
  providers: [
    PrismaService,
    SignupService,
    LoginService,
    PasswordResetService,
    SessionService,
    MembersService,
    mailProvider,
    storageProvider,
    calendarProvider,
    HiringManageGuard,
    BoardScopeGuard,
    VacanciesService,
    CategoriesService,
    AvailabilityService,
    BookingService,
    ViewerTimeZoneService,
    CandidatesService,
    BoardService,
  ],
})
export class AppModule {}
