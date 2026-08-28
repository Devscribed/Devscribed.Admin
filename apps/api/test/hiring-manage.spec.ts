import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { StubCalendarProvider } from './stub-calendar.provider';
import {
  TIME_ZONE,
  addMember,
  availabilityFor,
  bookInterview,
  bookedApplication,
  bootHiringApp,
  createCriterion,
  createVacancy,
  firstSlot,
  firstSlots,
  flattenSlots,
  manageTokenFor,
  resetDatabase,
  signup,
  type Signed,
} from './hiring.helpers';

/**
 * The manage page's API (spec 07, phase one): the link, the blur, and cancelling.
 *
 * The rule that shapes most of this suite is 07 §04.17 — **every non-live state is one
 * answer**. The tests below are as interested in what the responses do *not*
 * distinguish as in what they carry.
 */
describe('Hiring — manage booking', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let calendar: StubCalendarProvider;

  const view = (slug: string, token: string) =>
    request(app.getHttpServer()).get(`/api/manage/${slug}/${token}`);

  const cancel = (slug: string, token: string) =>
    request(app.getHttpServer()).post(`/api/manage/${slug}/${token}/cancel`);

  const reschedule = (
    slug: string,
    token: string,
    body: { startUtc?: string; timeZone?: string },
  ) =>
    request(app.getHttpServer())
      .post(`/api/manage/${slug}/${token}/reschedule`)
      .send({ timeZone: TIME_ZONE, ...body });

  const availability = (
    slug: string,
    token: string,
    query: { timeZone?: string; month?: string } = {},
  ) =>
    request(app.getHttpServer())
      .get(`/api/manage/${slug}/${token}/availability`)
      .query({ timeZone: query.timeZone ?? TIME_ZONE, ...(query.month ? { month: query.month } : {}) });

  /** Every start the reschedule picker would offer for the month an instant falls in. */
  async function offeredSlots(
    slug: string,
    token: string,
    around: string,
  ): Promise<string[]> {
    const response = await availability(slug, token, { month: around.slice(0, 7) });
    if (response.status !== 200) {
      throw new Error(`Precondition failed: manage availability answered ${response.status}`);
    }
    return flattenSlots(response.body);
  }

  const assess = (
    session: Signed,
    applicationId: string,
    criterionId: string,
    value: Record<string, unknown>,
  ) =>
    request(app.getHttpServer())
      .put(
        `/api/organizations/${session.organizationId}/hiring/applications/${applicationId}/criteria/${criterionId}`,
      )
      .set('Cookie', session.cookies)
      .send(value)
      .expect(200);

  /** Books through the public endpoint and hands back the row it wrote. */
  async function book(
    slug: string,
    values: { email?: string; startUtc?: string } = {},
  ): Promise<{ id: string; token: string; startUtc: string }> {
    const startUtc = values.startUtc ?? (await firstSlot(app, slug));
    const response = await bookInterview(app, slug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: values.email ?? 'jane@example.com',
      startUtc,
    });
    if (response.status !== 201) {
      throw new Error(`Precondition failed: booking answered ${response.status}`);
    }
    const { id } = await bookedApplication(prisma, {
      startUtc,
      email: values.email ?? 'jane@example.com',
    });
    return { id, token: await manageTokenFor(prisma, id), startUtc };
  }

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

  /* ---------------------------------------------------------------- *
   * The link itself
   * ---------------------------------------------------------------- */

  it('mints a unique token per booking and carries it into the invite', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);

    const first = await book(vacancy.slug, { email: 'jane@example.com', startUtc: firstStart });
    const second = await book(vacancy.slug, { email: 'sam@example.com', startUtc: secondStart });

    expect(first.token).not.toBe(second.token);
    // `randomBytes(16).base64url` — 128 bits, twice the slug's 72 (07 §15.71).
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{22}$/);

    // Each token resolves its own booking and no other.
    expect((await view(vacancy.slug, first.token)).body.booking.startUtc).toBe(firstStart);
    expect((await view(vacancy.slug, second.token)).body.booking.startUtc).toBe(secondStart);

    // The link reaches the candidate in the event body, which both parties receive —
    // the recorded departure from 00 §04.19 (07 §03.15).
    const events = [...calendar.events.values()];
    expect(events).toHaveLength(2);
    expect(events[0].draft.body).toContain(`/manage/${vacancy.slug}/${first.token}`);
    expect(events[1].draft.body).toContain(`/manage/${vacancy.slug}/${second.token}`);
  });

  it('stamps the interviewer the booking was actually made with', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);

    const application = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    expect(application.interviewerAccountId).toBe(admin.accountId);
  });

  it('opens the scheduling log with one booked entry', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);

    const events = await prisma.applicationScheduleEvent.findMany({
      where: { applicationId: booked.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'booked',
      actor: 'candidate',
      actorAccountId: null,
      fromStart: null,
      timeZone: TIME_ZONE,
      reason: null,
    });
    expect(events[0].toStart?.toISOString()).toBe(booked.startUtc);
  });

  it('renders the live booking, and names nobody at all', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);

    const response = await view(vacancy.slug, booked.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      organizationName: 'Acme Inc',
      vacancy: { title: 'Senior React Engineer', durationMinutes: 60, status: 'open' },
      booking: {
        startUtc: booked.startUtc,
        durationMinutes: 60,
        timeZone: TIME_ZONE,
        // A boolean: a CV is on file, and the response does not say which.
        hasCv: true,
      },
    });

    /*
     * Absent from the response, not merely unrendered (07 §04.21) — the interviewer, as
     * 02's public surface has always withheld them, and now the candidate too. The link
     * rides in a calendar event both parties hold and can forward onward, and a live one
     * that answered with a name, an address and `jane-doe-cv.pdf` gave away more than
     * the blur on a dead link was protecting.
     */
    const body = JSON.stringify(response.body);
    for (const secret of [
      'pat@acme.com',
      'Pat Owner',
      'jane@example.com',
      'Jane',
      'Doe',
      'cv.pdf',
    ]) {
      expect(body).not.toContain(secret);
    }
  });

  it('answers 404 only for an unknown slug', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);

    const unknownSlug = await view('does-not-exist-AAAAAAAAAAAA', booked.token);
    expect(unknownSlug.status).toBe(404);
    expect(JSON.stringify(unknownSlug.body)).not.toContain('Acme');

    // A real token on the wrong vacancy is a link that does not resolve, not a redirect
    // to fix — and it must not be distinguishable from any other dead token.
    const other = await createVacancy(app, admin, { title: 'Backend Engineer' });
    const wrongVacancy = await view(other.slug, booked.token);
    expect(wrongVacancy.status).toBe(200);
    expect(wrongVacancy.body.booking).toBeNull();
  });

  /* ---------------------------------------------------------------- *
   * TC-H07-INT-01
   * ---------------------------------------------------------------- */

  /** TC-H07-INT-01 */
  it('answers identically for every non-live cause', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);

    const cancelled = await book(vacancy.slug, {
      email: 'cancelled@example.com',
      startUtc: firstStart,
    });
    expect((await cancel(vacancy.slug, cancelled.token)).status).toBe(200);

    const passed = await book(vacancy.slug, {
      email: 'passed@example.com',
      startUtc: secondStart,
    });
    // One minute into the past: the actions withdraw at `start`, with no lead time
    // either side of it (07 §14.65).
    await prisma.application.update({
      where: { id: passed.id },
      data: { start: new Date(Date.now() - 60_000), end: new Date(Date.now() + 59 * 60_000) },
    });

    const responses = await Promise.all([
      view(vacancy.slug, cancelled.token),
      view(vacancy.slug, passed.token),
      // Well-formed, and matching nothing.
      view(vacancy.slug, 'AAAAAAAAAAAAAAAAAAAAAA'),
      view(vacancy.slug, 'not-a-token'),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.body.booking).toBeNull();
      // The organization and the vacancy are present in all four, because the slug
      // resolves even when the token does not (07 §04.20).
      expect(response.body.organizationName).toBe('Acme Inc');
      expect(response.body.vacancy.title).toBe('Senior React Engineer');
    }

    // Not "equivalent" — identical. Nothing in the body separates the four causes.
    const [reference] = responses;
    for (const response of responses) {
      expect(response.body).toEqual(reference.body);
    }
  });

  /** The public half of TC-H07-INT-07: no action is reachable by calling the API. */
  it('refuses to cancel an interview that has already started', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);
    await prisma.application.update({
      where: { id: booked.id },
      data: { start: new Date(Date.now() - 60_000) },
    });

    expect((await cancel(vacancy.slug, booked.token)).status).toBe(404);

    const application = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    expect(application.isCancelled).toBe(false);
    expect(calendar.cancelled).toHaveLength(0);
  });

  /* ---------------------------------------------------------------- *
   * TC-H07-INT-02
   * ---------------------------------------------------------------- */

  /** TC-H07-INT-02 */
  it('flags the application on cancel and leaves the board alone', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const criterion = await createCriterion(app, admin, { name: 'English' });
    const booked = await book(vacancy.slug);

    await prisma.application.update({
      where: { id: booked.id },
      data: { status: 'maybe', position: 2000 },
    });
    await assess(admin, booked.id, criterion.id, { valueId: criterion.values[0].id });

    const response = await cancel(vacancy.slug, booked.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      organizationName: 'Acme Inc',
      vacancy: { title: 'Senior React Engineer', status: 'open' },
      cancelled: true,
    });

    // The flag, and nothing else. `status` and `position` are the hiring manager's own
    // ordering and are never touched from outside the building (07 §01.3).
    const application = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    expect(application.isCancelled).toBe(true);
    expect(application.status).toBe('maybe');
    expect(application.position).toBe(2000);
    expect(await prisma.applicationCriterion.count({ where: { applicationId: booked.id } })).toBe(1);

    // The event was cancelled, which is what notifies both parties — the product sends
    // no mail of its own (07 §12.56).
    expect(calendar.cancelled).toEqual([application.graphEventId]);

    const board = await request(app.getHttpServer())
      .get(`/api/organizations/${admin.organizationId}/hiring/vacancies/${vacancy.id}/board`)
      .set('Cookie', admin.cookies);
    const maybe = board.body.columns.find(
      (entry: { status: string }) => entry.status === 'maybe',
    );
    expect(maybe.cards).toHaveLength(1);
    expect(maybe.cards[0]).toMatchObject({
      applicationId: booked.id,
      isCancelled: true,
      cancellation: { actor: 'candidate', byName: 'Jane Doe', reason: null },
    });

    const events = await prisma.applicationScheduleEvent.findMany({
      where: { applicationId: booked.id, type: 'cancelled' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor: 'candidate', actorAccountId: null, reason: null });
  });

  it('shows the blurred screen when the manage URL is reloaded after cancelling', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);

    expect((await cancel(vacancy.slug, booked.token)).status).toBe(200);

    // The confirmation is a receipt for an action, not a state of the record (07 §04.19).
    expect((await view(vacancy.slug, booked.token)).body.booking).toBeNull();
    // And cancelling twice is not an error the visitor can tell from a bad token.
    expect((await cancel(vacancy.slug, booked.token)).status).toBe(404);
  });

  /** The cancel half of TC-H07-INT-05. */
  it('renders as live and still cancels on a closed vacancy', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);

    await request(app.getHttpServer())
      .patch(`/api/organizations/${admin.organizationId}/hiring/vacancies/${vacancy.id}`)
      .set('Cookie', admin.cookies)
      .send({ status: 'closed' })
      .expect(200);

    // Closing means "stop accepting new applicants", not "renege on the interviews
    // already granted" (07 §13.60).
    const live = await view(vacancy.slug, booked.token);
    expect(live.body.booking).not.toBeNull();
    expect(live.body.vacancy.status).toBe('closed');

    expect((await cancel(vacancy.slug, booked.token)).status).toBe(200);

    // "New booking" from the cancelled screen lands on the closed-vacancy page — the
    // correct dead end, and an honest one.
    const publicVacancy = await request(app.getHttpServer()).get(`/api/book/${vacancy.slug}`);
    expect(publicVacancy.body.vacancy.status).toBe('closed');
  });

  it('leaves the booking untouched when the calendar refuses the cancellation', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);
    calendar.failOnCancel = true;

    const response = await cancel(vacancy.slug, booked.token);

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('cancel_failed');

    const application = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    expect(application.isCancelled).toBe(false);
    expect(
      await prisma.applicationScheduleEvent.count({
        where: { applicationId: booked.id, type: 'cancelled' },
      }),
    ).toBe(0);
    // Still live, so the candidate can simply try again.
    expect((await view(vacancy.slug, booked.token)).body.booking).not.toBeNull();
  });

  /* ---------------------------------------------------------------- *
   * TC-H07-INT-03
   * ---------------------------------------------------------------- */

  /** TC-H07-INT-03 */
  it('lets a cancelled candidate book the same vacancy again', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const criterion = await createCriterion(app, admin, { name: 'English' });
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);

    const booked = await book(vacancy.slug, { startUtc: firstStart });
    await prisma.application.update({ where: { id: booked.id }, data: { status: 'maybe' } });
    await assess(admin, booked.id, criterion.id, { valueId: criterion.values[0].id });

    expect((await cancel(vacancy.slug, booked.token)).status).toBe(200);

    // No `already_booked`: a cancelled candidate remains a live applicant (07 §01.2).
    const rebooked = await bookInterview(app, vacancy.slug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      startUtc: secondStart,
    });
    expect(rebooked.status).toBe(201);

    const applications = await prisma.application.findMany({ orderBy: { start: 'asc' } });
    expect(applications).toHaveLength(2);
    // A rebooking is fresh intent and produces a new row; a reschedule is continuous
    // intent and updates this one. The two behave differently on purpose (07 §02.9).
    expect(applications[0]).toMatchObject({ id: booked.id, isCancelled: true, status: 'maybe' });
    expect(applications[1]).toMatchObject({ isCancelled: false, status: 'scheduled' });
    expect(applications[0].manageToken).not.toBe(applications[1].manageToken);
    expect(await prisma.applicationCriterion.count({ where: { applicationId: booked.id } })).toBe(1);
  });

  /* ---------------------------------------------------------------- *
   * Rescheduling — TC-H07-INT-04 §05 §06 §10 §12 §15
   * ---------------------------------------------------------------- */

  /** TC-H07-INT-04 */
  it('moves the event rather than replacing it', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);
    const booked = await book(vacancy.slug, { startUtc: firstStart });

    const before = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    const attachment = calendar.events.get(before.graphEventId!)!.draft.attachment;

    const response = await reschedule(vacancy.slug, booked.token, { startUtc: secondStart });

    expect(response.status).toBe(200);
    // The same body as `GET`, carrying the new time — and naming nobody, as `GET` does
    // not (07 §04.21).
    expect(response.body.booking).toEqual({
      startUtc: secondStart,
      durationMinutes: 60,
      timeZone: TIME_ZONE,
      hasCv: true,
    });

    // One `updateEvent`, and neither of the two calls that would have told the
    // candidate their interview was cancelled as the first half of moving it (07 §12.57).
    expect(calendar.updated).toHaveLength(1);
    expect(calendar.updated[0].id).toBe(before.graphEventId);
    expect(calendar.updated[0].change).toEqual({
      startUtc: new Date(secondStart),
      endUtc: new Date(new Date(secondStart).getTime() + 60 * 60_000),
      timeZone: TIME_ZONE,
    });
    expect(calendar.cancelled).toHaveLength(0);
    expect(calendar.events.size).toBe(1);

    const after = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    expect(after.graphEventId).toBe(before.graphEventId);
    expect(after.start.toISOString()).toBe(secondStart);
    expect(after.end.toISOString()).toBe(
      new Date(new Date(secondStart).getTime() + 60 * 60_000).toISOString(),
    );

    // The CV was not re-uploaded: it is the same attachment on the same event, which is
    // the second thing a cancel-and-recreate would have got wrong.
    expect(calendar.events.get(before.graphEventId!)!.draft.attachment).toBe(attachment);

    const moves = await prisma.applicationScheduleEvent.findMany({
      where: { applicationId: booked.id, type: 'rescheduled' },
    });
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ actor: 'candidate', actorAccountId: null, reason: null });
    expect(moves[0].fromStart?.toISOString()).toBe(firstStart);
    expect(moves[0].toStart?.toISOString()).toBe(secondStart);
  });

  it('changes the time and nothing else on an application the team has worked on', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const criterion = await createCriterion(app, admin, { name: 'English' });
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);
    const booked = await book(vacancy.slug, { startUtc: firstStart });

    await prisma.application.update({
      where: { id: booked.id },
      data: {
        status: 'maybe',
        position: 3000,
        interviewNotes: 'Strong on hooks.',
        conclusion: 'Worth a second round.',
      },
    });
    await assess(admin, booked.id, criterion.id, { valueId: criterion.values[0].id });

    const before = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    expect((await reschedule(vacancy.slug, booked.token, { startUtc: secondStart })).status).toBe(
      200,
    );
    const after = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });

    // Three columns moved, plus the `updatedAt` Prisma maintains. Everything else is
    // byte-identical — the board's ordering belongs to the hiring manager, not to the
    // candidate (07 §02.7).
    const { start: _s, end: _e, timeZone: _z, updatedAt: _u, ...unchanged } = after;
    const { start: __s, end: __e, timeZone: __z, updatedAt: __u, ...original } = before;
    expect(unchanged).toEqual(original);
    expect(after.start.toISOString()).toBe(secondStart);

    // And no second row: a reschedule is continuous intent, where a rebooking after a
    // cancellation is fresh intent and creates one (07 §02.9).
    expect(await prisma.application.count()).toBe(1);
    expect(await prisma.applicationCriterion.count({ where: { applicationId: booked.id } })).toBe(1);
  });

  it('accepts a move to the time it already has, and writes nothing for it', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);

    const response = await reschedule(vacancy.slug, booked.token, { startUtc: booked.startUtc });

    // Accepted — moving an interview to the time it already has is not an error, it is
    // simply not a reschedule (07 validation rule 3).
    expect(response.status).toBe(200);
    expect(response.body.booking.startUtc).toBe(booked.startUtc);
    expect(calendar.updated).toHaveLength(0);
    expect(
      await prisma.applicationScheduleEvent.count({
        where: { applicationId: booked.id, type: 'rescheduled' },
      }),
    ).toBe(0);
  });

  it('offers the interview its own slot back, and its own duration', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);

    // The vacancy is re-timed after the booking. The interview keeps the length it was
    // booked at — 01's *future bookings only* rule (07 §13.61).
    await request(app.getHttpServer())
      .patch(`/api/organizations/${admin.organizationId}/hiring/vacancies/${vacancy.id}`)
      .set('Cookie', admin.cookies)
      .send({ durationMinutes: 30 })
      .expect(200);

    const offered = await offeredSlots(vacancy.slug, booked.token, booked.startUtc);

    // Its own event does not remove its own slot; without the exclusion a candidate
    // moving thirty minutes later collides with themselves (07 §05.25).
    expect(offered).toContain(booked.startUtc);
    // Sixty-minute anchoring throughout, from `end - start` and never from the
    // vacancy's current 30.
    const sameDay = offered.filter((slot) => slot.slice(0, 10) === booked.startUtc.slice(0, 10));
    expect(sameDay.length).toBeGreaterThan(1);
    for (let index = 1; index < sameDay.length; index += 1) {
      const gap = new Date(sameDay[index]).getTime() - new Date(sameDay[index - 1]).getTime();
      expect(gap % (60 * 60_000)).toBe(0);
    }

    // The booking page, meanwhile, has moved on to the vacancy's new 30 — and does not
    // offer the taken slot at all, because that event is nobody else's to ignore.
    const publicSlots = await availabilityFor(app, vacancy.slug, {
      month: booked.startUtc.slice(0, 7),
    });
    expect(flattenSlots(publicSlots.body)).not.toContain(booked.startUtc);
  });

  /** TC-H07-INT-06 */
  it('follows the interviewer the booking was made with, not the current one', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const sam = await addMember(prisma, admin.organizationId, {
      email: 'sam@acme.com',
      role: 'manager',
    });
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart, thirdStart] = await firstSlots(app, vacancy.slug, 3);
    const booked = await book(vacancy.slug, { startUtc: firstStart });

    // The vacancy moves to Sam after the booking. Silently moving a candidate to a
    // stranger is a larger change than the one they came to make (07 §13.62).
    await prisma.vacancy.update({
      where: { id: vacancy.id },
      data: { interviewerAccountId: sam.accountId },
    });

    // A block on each mailbox, so which one was read is visible in the answer rather
    // than only in a call log.
    calendar.block('pat@acme.com', new Date(secondStart), new Date(thirdStart));
    calendar.block(
      'sam@acme.com',
      new Date(thirdStart),
      new Date(new Date(thirdStart).getTime() + 60 * 60_000),
    );

    const offered = await offeredSlots(vacancy.slug, booked.token, firstStart);
    expect(offered).not.toContain(secondStart);
    // Sam's calendar is irrelevant to an interview that is not in Sam's mailbox.
    expect(offered).toContain(thirdStart);

    expect((await reschedule(vacancy.slug, booked.token, { startUtc: thirdStart })).status).toBe(
      200,
    );

    expect(calendar.updated).toHaveLength(1);
    expect(calendar.updated[0].mailbox).toBe('pat@acme.com');
    // Nothing moves an event between mailboxes; that remains deferred (07 §12.58).
    const application = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    expect(application.interviewerAccountId).toBe(admin.accountId);
    expect(calendar.events.get(application.graphEventId!)!.mailbox).toBe('pat@acme.com');
  });

  /** The reschedule half of TC-H07-INT-05. */
  it('still reschedules on a closed vacancy', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);
    const booked = await book(vacancy.slug, { startUtc: firstStart });

    await request(app.getHttpServer())
      .patch(`/api/organizations/${admin.organizationId}/hiring/vacancies/${vacancy.id}`)
      .set('Cookie', admin.cookies)
      .send({ status: 'closed' })
      .expect(200);

    // `Vacancy.status` is not a precondition here. Closing means "stop accepting new
    // applicants", and the booking page answers with an empty month — but the interview
    // already granted can still be moved (07 §13.60).
    const offered = await offeredSlots(vacancy.slug, booked.token, firstStart);
    expect(offered).toContain(secondStart);

    expect((await reschedule(vacancy.slug, booked.token, { startUtc: secondStart })).status).toBe(
      200,
    );
    expect(
      flattenSlots(
        (await availabilityFor(app, vacancy.slug, { month: firstStart.slice(0, 7) })).body,
      ),
    ).toHaveLength(0);
  });

  /** TC-H07-INT-10 */
  it('leaves the booking wholly intact when the slot was taken in the meantime', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);
    const booked = await book(vacancy.slug, { startUtc: firstStart });
    const before = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });

    // The candidate chose it from a list that was true when it was drawn.
    expect(await offeredSlots(vacancy.slug, booked.token, firstStart)).toContain(secondStart);
    calendar.block(
      'pat@acme.com',
      new Date(secondStart),
      new Date(new Date(secondStart).getTime() + 60 * 60_000),
    );

    const response = await reschedule(vacancy.slug, booked.token, { startUtc: secondStart });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'slot_taken',
      message: 'That time was just booked. Please choose another.',
    });

    // Nothing was cancelled in order to attempt a move.
    const after = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    expect(after.start).toEqual(before.start);
    expect(after.end).toEqual(before.end);
    expect(after.graphEventId).toBe(before.graphEventId);
    expect(after.isCancelled).toBe(false);
    expect(calendar.cancelled).toHaveLength(0);
    expect(calendar.updated).toHaveLength(0);
    expect(
      await prisma.applicationScheduleEvent.count({
        where: { applicationId: booked.id, type: 'rescheduled' },
      }),
    ).toBe(0);
  });

  it('refuses a start the page never offered, as taken rather than accommodating it', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);

    // 03:17 on a working day: not on the duration anchor, and hours outside the
    // mailbox's own. A start that was never offered is `slot_taken`, never accommodated
    // (07 validation rule 2).
    const offHours = new Date(new Date(booked.startUtc).getTime());
    offHours.setUTCHours(3, 17, 0, 0);

    const response = await reschedule(vacancy.slug, booked.token, {
      startUtc: offHours.toISOString(),
    });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('slot_taken');

    // A start in the past is the same answer: it is not a slot the page could offer.
    const past = await reschedule(vacancy.slug, booked.token, {
      startUtc: new Date(Date.now() - 60 * 60_000).toISOString(),
    });
    expect(past.status).toBe(409);
    expect(calendar.updated).toHaveLength(0);
  });

  it('rejects a missing time as a field error and a bad zone as a bad request', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booked = await book(vacancy.slug);

    const missing = await reschedule(vacancy.slug, booked.token, {});
    expect(missing.status).toBe(422);
    expect(missing.body).toEqual({ error: 'validation', fields: { startUtc: 'Choose a time' } });

    // The zone is machine-supplied — the page reads it from the browser — so a bad one
    // is a malformed request, not a candidate-facing message.
    const zone = await reschedule(vacancy.slug, booked.token, {
      startUtc: booked.startUtc,
      timeZone: 'Mars/Olympus',
    });
    expect(zone.status).toBe(400);
    expect(zone.body).toEqual({ error: 'invalid_time_zone' });
    expect((await availability(vacancy.slug, booked.token, { timeZone: 'Mars/Olympus' })).status).toBe(
      400,
    );
  });

  /** TC-H07-INT-12 */
  it('changes nothing when the calendar refuses the move', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);
    const booked = await book(vacancy.slug, { startUtc: firstStart });
    const before = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });

    calendar.failOnUpdate = true;
    const response = await reschedule(vacancy.slug, booked.token, { startUtc: secondStart });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: 'reschedule_failed',
      message: "We couldn't move your interview. Please try again.",
    });

    const after = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    expect(after.start).toEqual(before.start);
    expect(after.end).toEqual(before.end);
    expect(after.graphEventId).toBe(before.graphEventId);
    expect(
      await prisma.applicationScheduleEvent.count({
        where: { applicationId: booked.id, type: 'rescheduled' },
      }),
    ).toBe(0);
    // And it is still live, so the candidate can simply try again.
    expect((await view(vacancy.slug, booked.token)).body.booking.startUtc).toBe(firstStart);
  });

  it('answers 503 when the booked mailbox no longer resolves', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);
    const booked = await book(vacancy.slug, { startUtc: firstStart });

    // Not a closed vacancy and not a missing booking: the page shows the controls'
    // error state with a retry, and the team resolves it (07 §13.64).
    calendar.withoutMailbox.add('pat@acme.com');

    expect((await availability(vacancy.slug, booked.token)).body).toEqual({
      error: 'availability_unavailable',
    });
    // The booking itself still renders — the record is intact, only the calendar is
    // unreachable.
    expect((await view(vacancy.slug, booked.token)).body.booking.startUtc).toBe(firstStart);

    const move = await reschedule(vacancy.slug, booked.token, { startUtc: secondStart });
    expect(move.status).toBe(503);
    expect(move.body.error).toBe('reschedule_failed');
    expect(calendar.updated).toHaveLength(0);
  });

  it('answers 503 when the calendar cannot be read at all', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);
    const booked = await book(vacancy.slug, { startUtc: firstStart });

    calendar.failOnBusy = true;

    // "We could not load times" is never flattened into "there are no times" — that is
    // the one distinction a candidate cannot recover from (00 §05.21).
    const times = await availability(vacancy.slug, booked.token);
    expect(times.status).toBe(503);
    expect(times.body).toEqual({ error: 'availability_unavailable' });

    const move = await reschedule(vacancy.slug, booked.token, { startUtc: secondStart });
    expect(move.status).toBe(503);
    expect(move.body.error).toBe('reschedule_failed');
  });

  it('re-issues the same move after a database failure, and creates nothing new', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);
    const booked = await book(vacancy.slug, { startUtc: firstStart });
    const before = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });

    // The calendar succeeds and the write does not. There is no compensating move back,
    // because the meeting-updated notice has already gone out and cannot be recalled.
    const transaction = jest
      .spyOn(prisma, '$transaction')
      .mockRejectedValueOnce(new Error('connection lost'));

    const failed = await reschedule(vacancy.slug, booked.token, { startUtc: secondStart });
    expect(failed.status).toBe(503);
    expect(failed.body.error).toBe('reschedule_failed');
    expect(
      (await prisma.application.findUniqueOrThrow({ where: { id: booked.id } })).start,
    ).toEqual(before.start);

    transaction.mockRestore();

    // The retry completes the write. It does not re-issue the move: the event is
    // already on the target, and a second `PATCH` would send both parties a second
    // meeting-updated notice for a move they were already told about.
    expect((await reschedule(vacancy.slug, booked.token, { startUtc: secondStart })).status).toBe(
      200,
    );

    expect(calendar.updated).toHaveLength(1);
    // One event, the same event, at the new time. Nothing was created and nothing was
    // cancelled by either attempt.
    expect(calendar.events.size).toBe(1);
    expect(calendar.cancelled).toHaveLength(0);
    expect(calendar.events.get(before.graphEventId!)!.draft.startUtc).toEqual(
      new Date(secondStart),
    );
    expect(
      await prisma.applicationScheduleEvent.count({
        where: { applicationId: booked.id, type: 'rescheduled' },
      }),
    ).toBe(1);
  });

  it('lets a candidate move as many times as they like, and never moves their card', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const starts = await firstSlots(app, vacancy.slug, 4);
    const booked = await book(vacancy.slug, { startUtc: starts[0] });

    await prisma.application.update({
      where: { id: booked.id },
      data: { status: 'maybe', position: 2500 },
    });

    // No counter, no quota, no cooling-off period (07 §02.8).
    for (const start of starts.slice(1)) {
      expect((await reschedule(vacancy.slug, booked.token, { startUtc: start })).status).toBe(200);
    }

    const application = await prisma.application.findUniqueOrThrow({ where: { id: booked.id } });
    expect(application.start.toISOString()).toBe(starts[3]);
    expect(application.status).toBe('maybe');
    expect(application.position).toBe(2500);

    const moves = await prisma.applicationScheduleEvent.findMany({
      where: { applicationId: booked.id, type: 'rescheduled' },
      orderBy: { createdAt: 'asc' },
    });
    expect(moves).toHaveLength(3);
    // Each entry names both ends, so the log reads as a chain rather than a tally.
    expect(moves.map((move) => move.fromStart?.toISOString())).toEqual(starts.slice(0, 3));
    expect(moves.map((move) => move.toStart?.toISOString())).toEqual(starts.slice(1));
  });

  it('offers no reschedule once the interview has started', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);
    const booked = await book(vacancy.slug, { startUtc: firstStart });
    await prisma.application.update({
      where: { id: booked.id },
      data: { start: new Date(Date.now() - 60_000) },
    });

    // Not reachable by calling the API directly, and not distinguishable from a token
    // that never named anything.
    expect((await availability(vacancy.slug, booked.token)).status).toBe(404);
    expect((await reschedule(vacancy.slug, booked.token, { startUtc: secondStart })).status).toBe(
      404,
    );
    expect(calendar.updated).toHaveLength(0);
  });

  it('offers no reschedule once the interview is cancelled', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);
    const booked = await book(vacancy.slug, { startUtc: firstStart });

    expect((await cancel(vacancy.slug, booked.token)).status).toBe(200);

    expect((await availability(vacancy.slug, booked.token)).status).toBe(404);
    expect((await reschedule(vacancy.slug, booked.token, { startUtc: secondStart })).status).toBe(
      404,
    );
  });

  /* ---------------------------------------------------------------- *
   * TC-H07-INT-13
   * ---------------------------------------------------------------- */

  /**
   * TC-H07-INT-13
   *
   * The migration's own back-fill statements, run against rows stripped back to what
   * they looked like before this release. Reading them out of `migration.sql` rather
   * than restating them here is the point: a test that reimplemented the SQL would pass
   * while the shipped migration was wrong.
   */
  it('back-fills every application that predates it, and adds nothing on a re-run', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const sam = await prisma.account.create({
      data: {
        email: 'sam@acme.com',
        passwordHash: 'x',
        firstName: 'Sam',
        lastName: 'Member',
      },
    });
    await prisma.membership.create({
      data: {
        accountId: sam.id,
        organizationId: admin.organizationId,
        role: 'manager',
        status: 'active',
      },
    });

    const shared = await createVacancy(app, admin, { title: 'Senior React Engineer' });
    const reassigned = await createVacancy(app, admin, { title: 'Backend Engineer' });

    const [firstStart, secondStart] = await firstSlots(app, shared.slug, 2);
    const one = await book(shared.slug, { email: 'one@example.com', startUtc: firstStart });
    const two = await book(shared.slug, { email: 'two@example.com', startUtc: secondStart });
    const three = await book(reassigned.slug, { email: 'three@example.com' });

    // The vacancy moves to Sam *after* all three were booked, which is the case the
    // back-fill cannot get right and the spec says so (07 §13.63).
    await prisma.vacancy.update({
      where: { id: reassigned.id },
      data: { interviewerAccountId: sam.id },
    });

    // Wind the three rows back to their pre-release shape.
    await prisma.applicationScheduleEvent.deleteMany();
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "Application" ALTER COLUMN "manageToken" DROP NOT NULL',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "Application" ALTER COLUMN "interviewerAccountId" DROP NOT NULL',
    );
    await prisma.$executeRawUnsafe(
      'UPDATE "Application" SET "manageToken" = NULL, "interviewerAccountId" = NULL',
    );

    try {
      await runBackfill(prisma);
      // Twice, because the spec asks for a migration that adds nothing on a re-run.
      await runBackfill(prisma);
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Application" ALTER COLUMN "manageToken" SET NOT NULL',
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Application" ALTER COLUMN "interviewerAccountId" SET NOT NULL',
      );
    }

    const applications = await prisma.application.findMany({ orderBy: { createdAt: 'asc' } });
    expect(applications).toHaveLength(3);

    const tokens = applications.map((application) => application.manageToken);
    expect(tokens.every((token) => /^[A-Za-z0-9_-]{22}$/.test(token))).toBe(true);
    expect(new Set(tokens).size).toBe(3);

    // Each resolves its own application and no other.
    for (const application of applications) {
      const slug = application.vacancyId === reassigned.id ? reassigned.slug : shared.slug;
      const response = await view(slug, application.manageToken);
      expect(response.body.booking.startUtc).toBe(application.start.toISOString());
    }

    // Every application names its vacancy's **current** interviewer — including the
    // reassigned one, whose original is unrecoverable and documented as such.
    const byId = new Map(applications.map((application) => [application.id, application]));
    expect(byId.get(one.id)!.interviewerAccountId).toBe(admin.accountId);
    expect(byId.get(two.id)!.interviewerAccountId).toBe(admin.accountId);
    expect(byId.get(three.id)!.interviewerAccountId).toBe(sam.id);

    // Exactly one manufactured `booked` entry each, and the re-run added none.
    const events = await prisma.applicationScheduleEvent.findMany();
    expect(events).toHaveLength(3);
    for (const event of events) {
      const application = byId.get(event.applicationId)!;
      expect(event).toMatchObject({
        type: 'booked',
        actor: 'candidate',
        actorAccountId: null,
        fromStart: null,
      });
      expect(event.toStart?.toISOString()).toBe(application.start.toISOString());
      expect(event.timeZone).toBe(application.timeZone);
    }
  });

  /* ---------------------------------------------------------------- *
   * TC-H07-INT-15
   * ---------------------------------------------------------------- */

  /**
   * TC-H07-INT-15
   *
   * A booking that predates this release, managed the whole way through with nothing
   * but what the migration could give it: a token it never minted and an interviewer it
   * never recorded.
   */
  it('fully manages an application booked before this release', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);
    const booked = await book(vacancy.slug, { startUtc: firstStart });

    // Wind the row back to its pre-release shape and let the shipped migration's own
    // statements fill it in again.
    await prisma.applicationScheduleEvent.deleteMany();
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "Application" ALTER COLUMN "manageToken" DROP NOT NULL',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "Application" ALTER COLUMN "interviewerAccountId" DROP NOT NULL',
    );
    await prisma.$executeRawUnsafe(
      'UPDATE "Application" SET "manageToken" = NULL, "interviewerAccountId" = NULL',
    );
    try {
      await runBackfill(prisma);
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Application" ALTER COLUMN "manageToken" SET NOT NULL',
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Application" ALTER COLUMN "interviewerAccountId" SET NOT NULL',
      );
    }

    const token = await manageTokenFor(prisma, booked.id);
    expect(token).not.toBe(booked.token);

    const live = await view(vacancy.slug, token);
    expect(live.body.booking).toEqual({
      startUtc: firstStart,
      durationMinutes: 60,
      timeZone: TIME_ZONE,
      hasCv: true,
    });

    // Availability comes from the back-filled interviewer's mailbox, which is the only
    // thing that knows where the event actually is.
    calendar.block(
      'pat@acme.com',
      new Date(secondStart),
      new Date(new Date(secondStart).getTime() + 60 * 60_000),
    );
    expect(await offeredSlots(vacancy.slug, token, firstStart)).not.toContain(secondStart);
    calendar.busyBlocks.clear();

    expect((await reschedule(vacancy.slug, token, { startUtc: secondStart })).status).toBe(200);
    expect(calendar.updated[0].mailbox).toBe('pat@acme.com');
    expect((await cancel(vacancy.slug, token)).status).toBe(200);

    // Ordered, and whole, despite the first entry having been manufactured.
    const log = await prisma.applicationScheduleEvent.findMany({
      where: { applicationId: booked.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(log.map((entry) => entry.type)).toEqual(['booked', 'rescheduled', 'cancelled']);
  });
});

/**
 * The three back-fill statements, lifted verbatim out of the shipped migration.
 *
 * Split on `;` at the end of a line, so the multi-line `UPDATE` that builds a token
 * survives intact. Only the statements that back-fill are run — the DDL either side of
 * them has already been applied to this database by `prisma migrate deploy`.
 */
async function runBackfill(prisma: PrismaService): Promise<void> {
  const sql = readFileSync(
    join(__dirname, '..', 'prisma', 'migrations', '20260828120000_manage_booking', 'migration.sql'),
    'utf8',
  );

  const statements = sql
    .split(/;\s*\n/)
    // The migration is heavily commented, and a comment block belongs to the statement
    // that follows it — so the leading `--` lines come off before anything is matched.
    .map((statement) =>
      statement
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(
      (statement) =>
        statement.startsWith('UPDATE "Application"') ||
        statement.startsWith('INSERT INTO "ApplicationScheduleEvent"'),
    );
  if (statements.length !== 3) {
    throw new Error(`Expected three back-fill statements, found ${statements.length}`);
  }

  for (const statement of statements) await prisma.$executeRawUnsafe(statement);
}
