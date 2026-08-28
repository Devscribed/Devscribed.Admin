import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { StubCalendarProvider } from './stub-calendar.provider';
import {
  TIME_ZONE,
  bookInterview,
  bookedApplication,
  bootHiringApp,
  createCriterion,
  createVacancy,
  firstSlot,
  firstSlots,
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

  it('renders the live booking, and never the interviewer', async () => {
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
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        cvFileName: 'cv.pdf',
      },
    });
    // The same public posture 02 takes: the interviewer's name and address are absent
    // from the response, not merely unrendered (07 §04.21).
    expect(JSON.stringify(response.body)).not.toContain('pat@acme.com');
    expect(JSON.stringify(response.body)).not.toContain('Pat Owner');
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
