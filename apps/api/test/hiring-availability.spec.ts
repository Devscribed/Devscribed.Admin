import { INestApplication } from '@nestjs/common';
import { bookingWindow, shiftMonth, yearMonthOf } from '@devscribed/validation';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { StubCalendarProvider } from './stub-calendar.provider';
import {
  CV_BYTES,
  TIME_ZONE,
  availabilityFor,
  bootHiringApp,
  firstSlot,
  flattenSlots,
  resetDatabase,
  signup,
} from './hiring.helpers';

/**
 * Availability as the public page consumes it: a window, one month of dates at a time,
 * and — the point of the whole contract — three outcomes that never look alike. A date
 * with no slots is fully booked, a date the response omits is outside the window, and a
 * calendar that cannot be reached is a failure with its own status code.
 */
describe('Hiring — availability', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let calendar: StubCalendarProvider;

  const createVacancy = async (
    session: { organizationId: string; accountId: string; cookies: string[] },
    durationMinutes = 60,
  ): Promise<{ id: string; slug: string }> => {
    const response = await request(app.getHttpServer())
      .post(`/api/organizations/${session.organizationId}/hiring/vacancies`)
      .set('Cookie', session.cookies)
      .send({
        title: 'Senior React Engineer',
        interviewerAccountId: session.accountId,
        durationMinutes,
      });

    if (response.status !== 201) {
      throw new Error(`Precondition failed: vacancy create answered ${response.status}`);
    }
    return { id: response.body.id, slug: response.body.publicSlug };
  };

  const book = (slug: string, startUtc: string, email = 'jane@example.com') =>
    request(app.getHttpServer())
      .post(`/api/book/${slug}`)
      .field('firstName', 'Jane')
      .field('lastName', 'Doe')
      .field('email', email)
      .field('startUtc', startUtc)
      .field('timeZone', TIME_ZONE)
      .attach('cv', CV_BYTES, { filename: 'jane-doe-cv.pdf', contentType: 'application/pdf' });

  beforeAll(async () => {
    const harness = await bootHiringApp();
    app = harness.app;
    prisma = harness.prisma;
    calendar = harness.calendar;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    calendar.reset();
    await resetDatabase(prisma);
  });

  it('answers with the window and one entry per date in the requested month', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);

    const { status, body } = await availabilityFor(app, vacancy.slug);

    expect(status).toBe(200);
    expect(body.timeZone).toBe('UTC');
    expect(body.window).toEqual(bookingWindow(new Date(), 'UTC'));

    const dates = Object.keys(body.dates);
    expect(dates.length).toBeGreaterThan(0);
    // Inside the window, and never a date the window does not cover.
    for (const date of dates) {
      expect(date >= body.window.from).toBe(true);
      expect(date <= body.window.to).toBe(true);
    }
    // Slots are absolute instants, so the client renders them in whatever zone it likes.
    for (const slot of flattenSlots(body)) {
      expect(slot).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(slot).getTime()).toBeGreaterThanOrEqual(Date.now() - 1000);
    }
  });

  it('returns the second month only when it is asked for', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);

    const current = await availabilityFor(app, vacancy.slug);
    const nextMonth = shiftMonth(yearMonthOf(current.body.window.from), 1);
    const next = await availabilityFor(app, vacancy.slug, { month: nextMonth });

    expect(next.status).toBe(200);
    // The window is the same fact whichever month is being looked at.
    expect(next.body.window).toEqual(current.body.window);
    for (const date of Object.keys(next.body.dates)) {
      expect(date.startsWith(nextMonth)).toBe(true);
      expect(date <= next.body.window.to).toBe(true);
    }

    // A month beyond the window is empty rather than an error — the calendar's next
    // control disables before it can be reached.
    const beyond = await availabilityFor(app, vacancy.slug, {
      month: shiftMonth(yearMonthOf(current.body.window.from), 6),
    });
    expect(beyond.status).toBe(200);
    expect(beyond.body.dates).toEqual({});
  });

  it('renders availability in the zone the candidate asked for', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);

    const minsk = await availabilityFor(app, vacancy.slug, { timeZone: 'Europe/Minsk' });

    expect(minsk.status).toBe(200);
    expect(minsk.body.timeZone).toBe('Europe/Minsk');
    // Working hours are 09:00–17:00 UTC, which is 12:00–20:00 in Minsk — the same
    // instants, bucketed onto the dates Minsk reckons them as.
    for (const slot of flattenSlots(minsk.body)) {
      const hour = new Date(slot).getUTCHours();
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThan(17);
    }
  });

  it('drops exactly the slot a busy block covers, and no neighbour', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);
    const target = new Date(await firstSlot(app, vacancy.slug));

    calendar.block(admin.email, target, new Date(target.getTime() + 60 * 60_000));

    const after = flattenSlots((await availabilityFor(app, vacancy.slug)).body);
    expect(after).not.toContain(target.toISOString());
    // The hour that ends where the block begins is untouched: no buffer is applied.
    const adjacent = new Date(target.getTime() + 60 * 60_000).toISOString();
    const sameDay = adjacent.slice(0, 10) === target.toISOString().slice(0, 10);
    if (sameDay) expect(after).toContain(adjacent);
  });

  /** TC-H02-INT-06 */
  it('rejects a slot taken between selection and submission', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);
    const startUtc = await firstSlot(app, vacancy.slug);

    // The interviewer accepts something else for that hour after the page loaded.
    calendar.block(
      admin.email,
      new Date(startUtc),
      new Date(new Date(startUtc).getTime() + 60 * 60_000),
    );

    const response = await book(vacancy.slug, startUtc);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('slot_taken');
    expect(await prisma.application.count()).toBe(0);
    expect([...calendar.events.values()]).toHaveLength(0);
  });

  /** TC-H02-INT-09 */
  it('fails loudly when the calendar cannot be reached, never as emptiness', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);
    calendar.failOnBusy = true;

    const { status, body } = await availabilityFor(app, vacancy.slug);

    expect(status).toBe(503);
    expect(body).toMatchObject({ error: 'availability_unavailable' });
    // The one thing it must never be: a 200 that reads as a fully booked month.
    expect(status).not.toBe(200);
  });

  it('blocks booking while availability is unknown', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);
    const startUtc = await firstSlot(app, vacancy.slug);
    calendar.failOnBusy = true;

    const response = await book(vacancy.slug, startUtc);

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('booking_failed');
    expect(await prisma.application.count()).toBe(0);
  });

  it('treats an interviewer whose mailbox stopped resolving as unavailable, not closed', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);
    calendar.withoutMailbox.add(admin.email);

    const availability = await availabilityFor(app, vacancy.slug);
    expect(availability.status).toBe(503);
    expect(availability.body).toMatchObject({ error: 'availability_unavailable' });

    // The vacancy itself is still open — the position has not been withdrawn.
    const vacancyResponse = await request(app.getHttpServer()).get(`/api/book/${vacancy.slug}`);
    expect(vacancyResponse.status).toBe(200);
    expect(vacancyResponse.body.vacancy.status).toBe('open');
  });

  it('refuses a time zone it cannot resolve', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);

    const missing = await request(app.getHttpServer()).get(`/api/book/${vacancy.slug}/availability`);
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('invalid_time_zone');

    const nonsense = await availabilityFor(app, vacancy.slug, { timeZone: 'Mars/Olympus_Mons' });
    expect(nonsense.status).toBe(400);
  });

  it('anchors start times to the vacancy’s own duration', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const quarterHour = await createVacancy(admin, 15);

    const slots = flattenSlots((await availabilityFor(app, quarterHour.slug)).body);
    expect(slots.length).toBeGreaterThan(1);

    const [first, second] = slots.map((slot) => new Date(slot).getTime());
    expect(second - first).toBe(15 * 60_000);
    // Anchored to 09:00, so every start lands on a quarter past the working-day start.
    for (const slot of slots) {
      const minutes = new Date(slot).getUTCMinutes();
      expect(minutes % 15).toBe(0);
    }
  });

  it('stops offering a slot once it has been booked', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);
    const startUtc = await firstSlot(app, vacancy.slug);

    expect((await book(vacancy.slug, startUtc)).status).toBe(201);

    const after = flattenSlots((await availabilityFor(app, vacancy.slug)).body);
    expect(after).not.toContain(startUtc);
  });

  it('carries the candidate’s zone into the application and the invite', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(admin);
    const startUtc = await firstSlot(app, vacancy.slug);

    const response = await request(app.getHttpServer())
      .post(`/api/book/${vacancy.slug}`)
      .field('firstName', 'Jane')
      .field('lastName', 'Doe')
      .field('email', 'jane@example.com')
      .field('startUtc', startUtc)
      .field('timeZone', 'Europe/Minsk')
      .attach('cv', CV_BYTES, { filename: 'jane-doe-cv.pdf', contentType: 'application/pdf' });

    expect(response.status).toBe(201);
    expect(response.body.timeZone).toBe('Europe/Minsk');

    const application = (await prisma.application.findFirst())!;
    expect(application.timeZone).toBe('Europe/Minsk');

    const [event] = [...calendar.events.values()];
    expect(event.draft.timeZone).toBe('Europe/Minsk');
    // The body names the zone the candidate booked in, and links to their card.
    expect(event.draft.body).toContain('(Europe/Minsk)');
    expect(event.draft.body).toContain(
      `/org/${admin.organizationId}/hiring/candidates/${application.candidateId}?application=${application.id}`,
    );
    // One event, one body — there is no interviewer-only variant to diverge from.
    expect(event.draft.body).toContain('jane@example.com');
  });
});
