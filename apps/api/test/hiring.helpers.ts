import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { shiftMonth, yearMonthOf } from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
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
  await prisma.vacancyCategory.deleteMany();
  await prisma.vacancy.deleteMany();
  await prisma.category.deleteMany();
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

/** The password every seeded member signs in with. */
export const MEMBER_PASSWORD = 'Passw0rd';

/**
 * There is no invitation endpoint yet (user-management spec 03), so a second member of
 * a given role is written directly. The role column is a plain string, so this creates
 * exactly what an invitation eventually will.
 *
 * The password hash is real, so `signInAs` can mint this member a genuine session
 * rather than a hand-assembled cookie — the guards a test is exercising are the same
 * ones the login endpoint's cookie goes through.
 */
export async function addMember(
  prisma: PrismaService,
  organizationId: string,
  input: { email: string; role: string; firstName?: string; lastName?: string },
): Promise<{ accountId: string }> {
  const account = await prisma.account.create({
    data: {
      email: input.email,
      passwordHash: await bcrypt.hash(MEMBER_PASSWORD, 10),
      firstName: input.firstName ?? 'Sam',
      lastName: input.lastName ?? 'Member',
    },
  });
  await prisma.membership.create({
    data: { accountId: account.id, organizationId, role: input.role, status: 'active' },
  });
  return { accountId: account.id };
}

/** Signs a seeded member in through the real endpoint and returns their cookie jar. */
export async function signInAs(
  app: INestApplication,
  member: { email: string; accountId: string; organizationId: string },
): Promise<Signed> {
  const response = await request(app.getHttpServer())
    .post('/api/login')
    .send({ email: member.email, password: MEMBER_PASSWORD });

  if (response.status !== 200) {
    throw new Error(`Precondition failed: login for ${member.email} answered ${response.status}`);
  }

  return {
    cookies: response.headers['set-cookie'] as unknown as string[],
    accountId: member.accountId,
    organizationId: member.organizationId,
    email: member.email,
  };
}

/** Signs the caller's own membership into a different role, keeping their session. */
export async function setRole(
  prisma: PrismaService,
  accountId: string,
  role: string,
): Promise<void> {
  await prisma.membership.update({ where: { accountId }, data: { role } });
}

export interface SeededVacancy {
  id: string;
  slug: string;
  title: string;
}

/** Creates a vacancy through the API — a precondition, not the thing under test. */
export async function createVacancy(
  app: INestApplication,
  session: Signed,
  overrides: {
    title?: string;
    durationMinutes?: number;
    interviewerAccountId?: string;
    categoryIds?: string[];
    newCategoryNames?: string[];
  } = {},
): Promise<SeededVacancy> {
  const response = await request(app.getHttpServer())
    .post(`/api/organizations/${session.organizationId}/hiring/vacancies`)
    .set('Cookie', session.cookies)
    .send({
      title: overrides.title ?? 'Senior React Engineer',
      interviewerAccountId: overrides.interviewerAccountId ?? session.accountId,
      durationMinutes: overrides.durationMinutes ?? 60,
      ...(overrides.categoryIds ? { categoryIds: overrides.categoryIds } : {}),
      ...(overrides.newCategoryNames ? { newCategoryNames: overrides.newCategoryNames } : {}),
    });

  if (response.status !== 201) {
    throw new Error(`Precondition failed: vacancy create answered ${response.status}`);
  }
  return { id: response.body.id, slug: response.body.publicSlug, title: response.body.title };
}

/** Creates a category through the API — a precondition, not the thing under test. */
export async function createCategory(
  app: INestApplication,
  session: Signed,
  name: string,
): Promise<{ id: string; name: string }> {
  const response = await request(app.getHttpServer())
    .post(`/api/organizations/${session.organizationId}/hiring/categories`)
    .set('Cookie', session.cookies)
    .send({ name });

  if (response.status !== 201) {
    throw new Error(`Precondition failed: category create answered ${response.status}`);
  }
  return { id: response.body.id, name: response.body.name };
}

/**
 * A real, minimal PDF: 303 bytes, one blank A4 page, no fonts and no content stream.
 *
 * It has to be a PDF a reader can actually open, not merely a file the CV validator
 * accepts — the card's **View** action hands it to the browser's PDF viewer, and a
 * fixture that only satisfies the extension check makes that button look broken when it
 * is working perfectly.
 *
 * Base64 rather than a string literal because a PDF's cross-reference table is
 * byte-addressed and each of its entries ends in a significant trailing space. An editor
 * set to trim trailing whitespace would silently shift every offset and break the file.
 */
const BLANK_PDF_BASE64 =
  'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNTk1IDg0Ml0+PmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1MiAwMDAwMCBuIAowMDAwMDAwMTAxIDAwMDAwIG4gCnRyYWlsZXI8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxNjQKJSVFT0YK';

export const CV_BYTES = Buffer.from(BLANK_PDF_BASE64, 'base64');

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
  return (await firstSlots(app, slug, 1))[0];
}

/** The earliest `count` bookable starts, in ascending order. */
export async function firstSlots(
  app: INestApplication,
  slug: string,
  count: number,
): Promise<string[]> {
  const first = await availabilityFor(app, slug);
  if (first.status !== 200) {
    throw new Error(`Precondition failed: availability answered ${first.status}`);
  }

  const slots = flattenSlots(first.body);
  if (slots.length >= count) return slots.slice(0, count);

  const nextMonth = shiftMonth(yearMonthOf(first.body.window.from), 1);
  const next = await availabilityFor(app, slug, { month: nextMonth });
  const all = [...slots, ...flattenSlots(next.body)];
  if (all.length < count) throw new Error('Precondition failed: the window offers too few slots');
  return all.slice(0, count);
}

/** Ascending, across every date the response covers. */
export function flattenSlots(body: AvailabilityBody): string[] {
  return Object.keys(body.dates ?? {})
    .sort()
    .flatMap((date) => body.dates[date]);
}

/** Books an interview through the public endpoint, exactly as a candidate would. */
export function bookInterview(
  app: INestApplication,
  slug: string,
  values: { firstName: string; lastName: string; email: string; startUtc: string },
) {
  return request(app.getHttpServer())
    .post(`/api/book/${slug}`)
    .field('firstName', values.firstName)
    .field('lastName', values.lastName)
    .field('email', values.email)
    .field('startUtc', values.startUtc)
    .field('timeZone', TIME_ZONE)
    .attach('cv', CV_BYTES, { filename: 'cv.pdf', contentType: 'application/pdf' });
}
