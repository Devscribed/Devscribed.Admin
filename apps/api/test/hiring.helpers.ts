import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { shiftMonth, yearMonthOf } from '@devscribed/validation';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CalendarProvider } from '../src/hiring/calendar/calendar-provider';
import { PrismaService } from '../src/prisma.service';
import { StubCalendarProvider } from './stub-calendar.provider';

export interface Harness {
  app: INestApplication;
  prisma: PrismaService;
  calendar: StubCalendarProvider;
}

/**
 * Boots the application with the stub calendar in place of whichever provider the
 * module would otherwise choose. Overriding the token rather than the environment is
 * what keeps the tests independent of how the process happened to be started.
 */
export async function bootHiringApp(): Promise<Harness> {
  const calendar = new StubCalendarProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CalendarProvider)
    .useValue(calendar)
    .compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();

  return { app, prisma: app.get(PrismaService), calendar };
}

/** Every hiring table, then the account tables the rest of the suite already clears. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.application.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.vacancy.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.account.deleteMany();
}

export interface Signed {
  cookies: string[];
  accountId: string;
  organizationId: string;
  email: string;
}

/** Registers an organization and returns its admin's cookie jar. */
export async function signup(
  app: INestApplication,
  email: string,
  orgName = 'Acme Inc',
): Promise<Signed> {
  const response = await request(app.getHttpServer())
    .post('/api/signup')
    .send({ orgName, firstName: 'Pat', lastName: 'Owner', email, password: 'Passw0rd' });

  if (response.status !== 201) {
    throw new Error(`Precondition failed: signup for ${email} answered ${response.status}`);
  }

  return {
    cookies: response.headers['set-cookie'] as unknown as string[],
    accountId: response.body.account.id,
    organizationId: response.body.organization.id,
    email,
  };
}

/**
 * There is no invitation endpoint yet (user-management spec 03), so a second member of
 * a given role is written directly. The role column is a plain string, so this creates
 * exactly what an invitation eventually will.
 */
export async function addMember(
  prisma: PrismaService,
  organizationId: string,
  input: { email: string; role: string; firstName?: string; lastName?: string },
): Promise<{ accountId: string }> {
  const account = await prisma.account.create({
    data: {
      email: input.email,
      passwordHash: 'not-a-real-hash',
      firstName: input.firstName ?? 'Sam',
      lastName: input.lastName ?? 'Member',
    },
  });
  await prisma.membership.create({
    data: { accountId: account.id, organizationId, role: input.role, status: 'active' },
  });
  return { accountId: account.id };
}

/** Signs the caller's own membership into a different role, keeping their session. */
export async function setRole(
  prisma: PrismaService,
  accountId: string,
  role: string,
): Promise<void> {
  await prisma.membership.update({ where: { accountId }, data: { role } });
}

export const CV_BYTES = Buffer.from('%PDF-1.4 a perfectly ordinary cv');

/**
 * Every integration booking is made in UTC. The zone the candidate picks is exercised
 * by the availability suite; here it only has to be one the server accepts.
 */
export const TIME_ZONE = 'UTC';

export interface AvailabilityBody {
  timeZone: string;
  window: { from: string; to: string };
  dates: Record<string, string[]>;
}

export async function availabilityFor(
  app: INestApplication,
  slug: string,
  query: { timeZone?: string; month?: string } = {},
): Promise<{ status: number; body: AvailabilityBody }> {
  const response = await request(app.getHttpServer())
    .get(`/api/book/${slug}/availability`)
    .query({ timeZone: query.timeZone ?? TIME_ZONE, ...(query.month ? { month: query.month } : {}) });
  return { status: response.status, body: response.body };
}

/**
 * The earliest bookable start for a vacancy.
 *
 * Availability answers one month at a time, and the current month can legitimately have
 * none left in it — a suite that runs on the last Saturday of a month would otherwise
 * fail for reasons that have nothing to do with what it is testing. So it looks into
 * the following month before giving up.
 */
export async function firstSlot(app: INestApplication, slug: string): Promise<string> {
  const first = await availabilityFor(app, slug);
  if (first.status !== 200) {
    throw new Error(`Precondition failed: availability answered ${first.status}`);
  }

  const slots = flattenSlots(first.body);
  if (slots.length > 0) return slots[0];

  const nextMonth = shiftMonth(yearMonthOf(first.body.window.from), 1);
  const next = await availabilityFor(app, slug, { month: nextMonth });
  const later = flattenSlots(next.body);
  if (later.length === 0) throw new Error('Precondition failed: the window offers no slots');
  return later[0];
}

/** Ascending, across every date the response covers. */
export function flattenSlots(body: AvailabilityBody): string[] {
  return Object.keys(body.dates ?? {})
    .sort()
    .flatMap((date) => body.dates[date]);
}
