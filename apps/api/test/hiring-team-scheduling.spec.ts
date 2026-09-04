import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { StubCalendarProvider } from './stub-calendar.provider';
import {
  TIME_ZONE,
  addMember,
  bookInterview,
  bookedApplication,
  bootHiringApp,
  createVacancy,
  firstSlot,
  firstSlots,
  flattenSlots,
  manageTokenFor,
  resetDatabase,
  setRole,
  signInAs,
  signup,
  type Signed,
} from './hiring.helpers';

/**
 * The team's half of manage booking (spec 07 §08–§10): the same two actions, from
 * inside the app.
 *
 * What this suite is actually for is the *difference* between the two surfaces, because
 * everything they share is already proven against the public routes in
 * `hiring-manage.spec.ts` and must not be proven twice. There are exactly three
 * differences, and each one has a section below: **who may act**, **who is recorded as
 * having acted**, and **the reason a member may give**.
 *
 * The fourth thing it checks is that nothing else differs — that a member is bound by
 * the same window, the same duration anchor, the same mailbox and the same liveness rule
 * as the candidate, so the two pickers cannot drift apart.
 */
describe('Hiring — the team reschedules and cancels', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let calendar: StubCalendarProvider;

  const teamAvailability = (
    session: Signed,
    applicationId: string,
    query: { timeZone?: string; month?: string } = {},
  ) =>
    request(app.getHttpServer())
      .get(
        `/api/organizations/${session.organizationId}/hiring/applications/${applicationId}/availability`,
      )
      .set('Cookie', session.cookies)
      .query({
        timeZone: query.timeZone ?? TIME_ZONE,
        ...(query.month ? { month: query.month } : {}),
      });

  const teamReschedule = (
    session: Signed,
    applicationId: string,
    body: { startUtc?: string; timeZone?: string },
  ) =>
    request(app.getHttpServer())
      .post(
        `/api/organizations/${session.organizationId}/hiring/applications/${applicationId}/reschedule`,
      )
      .set('Cookie', session.cookies)
      .send({ timeZone: TIME_ZONE, ...body });

  const teamCancel = (
    session: Signed,
    applicationId: string,
    body: Record<string, unknown> = {},
  ) =>
    request(app.getHttpServer())
      .post(
        `/api/organizations/${session.organizationId}/hiring/applications/${applicationId}/cancel`,
      )
      .set('Cookie', session.cookies)
      .send(body);

  const card = (session: Signed, candidateId: string) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/candidates/${candidateId}`)
      .set('Cookie', session.cookies);

  const board = (session: Signed, vacancyId: string) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/vacancies/${vacancyId}/board`)
      .set('Cookie', session.cookies);

  /** Every start the team's picker would offer for the month an instant falls in. */
  async function offeredSlots(
    session: Signed,
    applicationId: string,
    around: string,
  ): Promise<string[]> {
    const response = await teamAvailability(session, applicationId, {
      month: around.slice(0, 7),
    });
    if (response.status !== 200) {
      throw new Error(`Precondition failed: team availability answered ${response.status}`);
    }
    return flattenSlots(response.body);
  }

  /** Books through the public endpoint and hands back the row it wrote. */
  async function book(
    slug: string,
    values: { email?: string; startUtc?: string } = {},
  ): Promise<{ id: string; candidateId: string; token: string; startUtc: string }> {
    const email = values.email ?? 'jane@example.com';
    const startUtc = values.startUtc ?? (await firstSlot(app, slug));
    const response = await bookInterview(app, slug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email,
      startUtc,
    });
    if (response.status !== 201) {
      throw new Error(`Precondition failed: booking answered ${response.status}`);
    }
    const { id, candidateId } = await bookedApplication(prisma, { startUtc, email });
    return { id, candidateId, token: await manageTokenFor(prisma, id), startUtc };
  }

  const scheduleLog = (applicationId: string) =>
    prisma.applicationScheduleEvent.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'asc' },
    });

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
   * Who may act — 07 §08.42
   * ---------------------------------------------------------------- */

  /** TC-H07-INT-11 */
  it('lets the assigned interviewer act, and answers a member with no assignment 404', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const interviewer = await addMember(prisma, admin.organizationId, {
      email: 'sam@acme.com',
      role: 'user',
      firstName: 'Sam',
      lastName: 'Interviewer',
    });
    const bystander = await addMember(prisma, admin.organizationId, {
      email: 'kim@acme.com',
      role: 'user',
      firstName: 'Kim',
      lastName: 'Nobody',
    });

    const vacancy = await createVacancy(app, admin, {
      interviewerAccountId: interviewer.accountId,
    });
    const booking = await book(vacancy.slug);

    const assigned = await signInAs(app, {
      email: 'sam@acme.com',
      accountId: interviewer.accountId,
      organizationId: admin.organizationId,
    });
    const unassigned = await signInAs(app, {
      email: 'kim@acme.com',
      accountId: bystander.accountId,
      organizationId: admin.organizationId,
    });

    const [, second] = await offeredSlots(assigned, booking.id, booking.startUtc);

    // 404, never 403: a permission error on this surface would confirm that the id names
    // a real interview in this organization, which is precisely what somebody walking
    // ids would be trying to learn (04 §01.4).
    const refused = await teamReschedule(unassigned, booking.id, { startUtc: second });
    expect(refused.status).toBe(404);
    expect(refused.body.error).toBeUndefined();

    expect((await teamCancel(unassigned, booking.id)).status).toBe(404);
    expect((await teamAvailability(unassigned, booking.id)).status).toBe(404);

    const moved = await teamReschedule(assigned, booking.id, { startUtc: second });
    expect(moved.status).toBe(200);
    expect(moved.body.startUtc).toBe(second);
  });

  it('lets an admin and a manager act on an interview they do not conduct', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const interviewer = await addMember(prisma, admin.organizationId, {
      email: 'sam@acme.com',
      role: 'user',
    });
    const managerAccount = await addMember(prisma, admin.organizationId, {
      email: 'mo@acme.com',
      role: 'manager',
      firstName: 'Mo',
      lastName: 'Manager',
    });
    const manager = await signInAs(app, {
      email: 'mo@acme.com',
      accountId: managerAccount.accountId,
      organizationId: admin.organizationId,
    });

    const vacancy = await createVacancy(app, admin, {
      interviewerAccountId: interviewer.accountId,
    });
    const first = await book(vacancy.slug, { email: 'jane@example.com' });

    // The admin moves it, then the manager calls it off. Neither conducts the interview.
    const [, second] = await offeredSlots(admin, first.id, first.startUtc);
    expect((await teamReschedule(admin, first.id, { startUtc: second })).status).toBe(200);
    expect((await teamCancel(manager, first.id, { reason: 'Role filled internally.' })).status).toBe(
      200,
    );
  });

  it('answers a viewer 404, on all three routes', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);
    const slots = await offeredSlots(admin, booking.id, booking.startUtc);

    // A viewer may not even be assigned an interview, so there is no record on this
    // surface they could ever be entitled to.
    await setRole(prisma, admin.accountId, 'viewer');

    expect((await teamAvailability(admin, booking.id)).status).toBe(404);
    expect((await teamReschedule(admin, booking.id, { startUtc: slots[1] })).status).toBe(404);
    expect((await teamCancel(admin, booking.id)).status).toBe(404);
  });

  it("answers 404 for an application in somebody else's organization", async () => {
    const acme = await signup(app, 'pat@acme.com');
    const other = await signup(app, 'lee@globex.com', 'Globex');
    const vacancy = await createVacancy(app, acme);
    const booking = await book(vacancy.slug);

    // Not a permission problem to report — from Globex's side, that id names nothing.
    expect((await teamCancel(other, booking.id)).status).toBe(404);
    expect((await teamAvailability(other, booking.id)).status).toBe(404);
  });

  /* ---------------------------------------------------------------- *
   * Who is recorded — 07 §11.55
   * ---------------------------------------------------------------- */

  /** TC-H07-INT-09 */
  it('attributes a team cancellation and carries its reason into the notice', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const managerAccount = await addMember(prisma, admin.organizationId, {
      email: 'mo@acme.com',
      role: 'manager',
      firstName: 'Mo',
      lastName: 'Manager',
    });
    const manager = await signInAs(app, {
      email: 'mo@acme.com',
      accountId: managerAccount.accountId,
      organizationId: admin.organizationId,
    });

    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);

    const cancelled = await teamCancel(manager, booking.id, {
      reason: 'Role filled internally.',
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.isCancelled).toBe(true);

    const log = await scheduleLog(booking.id);
    const entry = log.find((event) => event.type === 'cancelled');
    expect(entry).toMatchObject({
      actor: 'member',
      actorAccountId: managerAccount.accountId,
      reason: 'Role filled internally.',
    });

    // The reason **replaces** the fixed string the compensating rollback uses: "could
    // not be completed" is correct for a failed booking and poor copy for a hiring
    // manager cancelling on purpose (07 §10.47).
    expect(calendar.cancellations).toEqual([
      expect.objectContaining({ comment: 'Role filled internally.' }),
    ]);

    // Team-only. The candidate's own page answers `booking: null` for a cancelled
    // booking, so there is nowhere for it to surface — and nothing in the body says it.
    const managePage = await request(app.getHttpServer()).get(
      `/api/manage/${vacancy.slug}/${booking.token}`,
    );
    expect(managePage.body.booking).toBeNull();
    expect(JSON.stringify(managePage.body)).not.toContain('Role filled internally.');
  });

  it('names the acting member on the card and on the board badge', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const managerAccount = await addMember(prisma, admin.organizationId, {
      email: 'mo@acme.com',
      role: 'manager',
      firstName: 'Mo',
      lastName: 'Manager',
    });
    const manager = await signInAs(app, {
      email: 'mo@acme.com',
      accountId: managerAccount.accountId,
      organizationId: admin.organizationId,
    });

    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);
    await teamCancel(manager, booking.id, { reason: 'Role filled internally.' });

    // "The candidate withdrew" and "we called it off" are different facts to a hiring
    // manager scanning a column, and the data now distinguishes them (07 design).
    const cancellation = {
      actor: 'member',
      byName: 'Mo Manager',
      reason: 'Role filled internally.',
    };

    const cardBody = await card(admin, booking.candidateId);
    expect(cardBody.body.applications[0].cancellation).toMatchObject(cancellation);

    const boardBody = await board(admin, vacancy.id);
    const cards = boardBody.body.columns.flatMap(
      (column: { cards: unknown[] }) => column.cards,
    ) as Array<{ applicationId: string; cancellation: unknown }>;
    expect(cards.find((entry) => entry.applicationId === booking.id)?.cancellation).toMatchObject(
      cancellation,
    );
  });

  it("attributes a team move to the member, beside the candidate's own", async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);
    const slots = await offeredSlots(admin, booking.id, booking.startUtc);

    // The candidate moves first, then the team. Attribution runs both ways, and the log
    // makes the second as visible as the first (07 §11.55).
    await request(app.getHttpServer())
      .post(`/api/manage/${vacancy.slug}/${booking.token}/reschedule`)
      .send({ startUtc: slots[1], timeZone: TIME_ZONE })
      .expect(200);
    await teamReschedule(admin, booking.id, { startUtc: slots[2] }).expect(200);

    const log = await scheduleLog(booking.id);
    expect(log.map((event) => [event.type, event.actor])).toEqual([
      ['booked', 'candidate'],
      ['rescheduled', 'candidate'],
      ['rescheduled', 'member'],
    ]);
    expect(log[1].actorAccountId).toBeNull();
    expect(log[2].actorAccountId).toBe(admin.accountId);
  });

  /* ---------------------------------------------------------------- *
   * The reason — 07 §10.46, validation rule 6
   * ---------------------------------------------------------------- */

  it('accepts 500 characters and refuses 501', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);
    const first = await book(vacancy.slug, { email: 'jane@example.com', startUtc: firstStart });
    const second = await book(vacancy.slug, { email: 'sam@example.com', startUtc: secondStart });

    const tooLong = await teamCancel(admin, first.id, {
      reason: 'r'.repeat(501),
    });
    expect(tooLong.status).toBe(422);
    expect(tooLong.body).toMatchObject({
      error: 'validation',
      fields: { reason: 'Please keep this under 500 characters' },
    });
    // Refused before anything was written: the interview is still live and still on the
    // calendar.
    expect((await prisma.application.findUniqueOrThrow({ where: { id: first.id } })).isCancelled)
      .toBe(false);
    expect(calendar.cancelled).toHaveLength(0);

    expect((await teamCancel(admin, second.id, { reason: 'r'.repeat(500) })).status).toBe(200);
  });

  it('stores a blank reason as nothing at all, and says only that the interview is off', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);

    await teamCancel(admin, booking.id, { reason: '   ' }).expect(200);

    // Null rather than an empty string: the card and the badge tooltip both branch on
    // whether a reason exists, and "" would make both of them true.
    const entry = (await scheduleLog(booking.id)).find((event) => event.type === 'cancelled');
    expect(entry?.reason).toBeNull();
    expect(calendar.cancellations[0].comment).toBe('This interview has been cancelled.');
  });

  it('trims the reason it stores', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);

    await teamCancel(admin, booking.id, { reason: '  Role filled internally.  ' }).expect(200);

    const entry = (await scheduleLog(booking.id)).find((event) => event.type === 'cancelled');
    expect(entry?.reason).toBe('Role filled internally.');
  });

  it('cancels with no reason at all when the body omits it', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);

    await teamCancel(admin, booking.id).expect(200);

    const entry = (await scheduleLog(booking.id)).find((event) => event.type === 'cancelled');
    expect(entry).toMatchObject({ actor: 'member', reason: null });
    expect(calendar.cancellations[0].comment).toBe('This interview has been cancelled.');
  });

  /* ---------------------------------------------------------------- *
   * And nothing else differs
   * ---------------------------------------------------------------- */

  it('moves the event in place, exactly as the candidate’s route does', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);
    const before = await prisma.application.findUniqueOrThrow({ where: { id: booking.id } });
    const [, second] = await offeredSlots(admin, booking.id, booking.startUtc);

    await teamReschedule(admin, booking.id, { startUtc: second }).expect(200);

    // Never a cancellation followed by a fresh booking: that would tell the candidate
    // their interview is cancelled as the first half of moving it (07 §12.57).
    expect(calendar.updated).toHaveLength(1);
    expect(calendar.cancelled).toHaveLength(0);
    expect(calendar.events.size).toBe(1);

    const after = await prisma.application.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.graphEventId).toBe(before.graphEventId);
    expect(after.start.toISOString()).toBe(second);
  });

  it('changes the time and nothing else on an application the team has worked on', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);

    // Notes, a conclusion, a status and a position the hiring manager chose. A move must
    // touch none of them — the board's ordering is theirs, not the scheduler's.
    await request(app.getHttpServer())
      .patch(`/api/organizations/${admin.organizationId}/hiring/applications/${booking.id}`)
      .set('Cookie', admin.cookies)
      .send({ interviewNotes: 'Strong on React.', conclusion: 'Worth a second round.', status: 'maybe' })
      .expect(200);

    const before = await prisma.application.findUniqueOrThrow({ where: { id: booking.id } });
    const [, second] = await offeredSlots(admin, booking.id, booking.startUtc);
    await teamReschedule(admin, booking.id, { startUtc: second }).expect(200);
    const after = await prisma.application.findUniqueOrThrow({ where: { id: booking.id } });

    expect(after.start.toISOString()).toBe(second);
    expect(after.end.getTime() - after.start.getTime()).toBe(
      before.end.getTime() - before.start.getTime(),
    );
    const untouched = (row: typeof before) => ({
      status: row.status,
      position: row.position,
      submittedName: row.submittedName,
      interviewNotes: row.interviewNotes,
      conclusion: row.conclusion,
      cvKey: row.cvKey,
      isCancelled: row.isCancelled,
      manageToken: row.manageToken,
      interviewerAccountId: row.interviewerAccountId,
    });
    expect(untouched(after)).toEqual(untouched(before));
  });

  it('accepts a move to the time it already has, and writes nothing for it', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);

    const answer = await teamReschedule(admin, booking.id, { startUtc: booking.startUtc });
    expect(answer.status).toBe(200);
    expect(answer.body.startUtc).toBe(booking.startUtc);

    // Moving an interview to the time it already has is not a reschedule (rule 3).
    expect(calendar.updated).toHaveLength(0);
    expect((await scheduleLog(booking.id)).filter((e) => e.type === 'rescheduled')).toHaveLength(0);
  });

  it("offers the interview its own slot back, its own duration, and its own interviewer", async () => {
    const admin = await signup(app, 'pat@acme.com');
    const original = await addMember(prisma, admin.organizationId, {
      email: 'sam@acme.com',
      role: 'user',
      firstName: 'Sam',
      lastName: 'Original',
    });
    const vacancy = await createVacancy(app, admin, {
      durationMinutes: 60,
      interviewerAccountId: original.accountId,
    });
    const booking = await book(vacancy.slug);

    // The world moves on after the booking: the vacancy is re-timed and reassigned.
    // Neither changes the interview that already exists (07 §13.61, §13.62).
    await request(app.getHttpServer())
      .patch(`/api/organizations/${admin.organizationId}/hiring/vacancies/${vacancy.id}`)
      .set('Cookie', admin.cookies)
      .send({ durationMinutes: 30, interviewerAccountId: admin.accountId })
      .expect(200);

    const slots = await offeredSlots(admin, booking.id, booking.startUtc);

    // Its own event does not remove its own slot from the list — without which a member
    // nudging an interview thirty minutes later collides with it (07 §05.25).
    expect(slots).toContain(booking.startUtc);
    // Its own duration: 60-minute anchoring is on the hour, so a 30-minute grid would
    // offer half-hour starts the booked interview could never take.
    const minutes = slots.map((slot) => new Date(slot).getUTCMinutes());
    expect(new Set(minutes)).toEqual(new Set([0]));

    await teamReschedule(admin, booking.id, { startUtc: slots[1] }).expect(200);
    // Sam's mailbox, which holds the event. The vacancy names Pat now, and that is not
    // where the interview is.
    expect(calendar.updated[0].mailbox).toBe('sam@acme.com');
  });

  it('is bound by the same booking window as the candidate', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);

    const teamWindow = (await teamAvailability(admin, booking.id)).body.window;
    const candidateWindow = (
      await request(app.getHttpServer())
        .get(`/api/manage/${vacancy.slug}/${booking.token}/availability`)
        .query({ timeZone: TIME_ZONE })
    ).body.window;

    // Widening the window for internal callers is recorded as a known limit rather than
    // built here (07 §09.44): an interview that must move further out than a month is a
    // conversation the team is already having.
    expect(teamWindow).toEqual(candidateWindow);
  });

  it('offers the team exactly the slots it offers the candidate', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);

    const forTeam = await offeredSlots(admin, booking.id, booking.startUtc);
    const forCandidate = flattenSlots(
      (
        await request(app.getHttpServer())
          .get(`/api/manage/${vacancy.slug}/${booking.token}/availability`)
          .query({ timeZone: TIME_ZONE, month: booking.startUtc.slice(0, 7) })
      ).body,
    );

    // One picker, one set of rules, two hosts (07 §09.43). A difference here is a
    // difference the two screens would eventually disagree about out loud.
    expect(forTeam).toEqual(forCandidate);
  });

  it('refuses a start the page never offered, as taken rather than accommodating it', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);

    // 03:00 UTC — a real instant, inside the window, and outside working hours.
    const outside = new Date(booking.startUtc);
    outside.setUTCHours(3, 0, 0, 0);

    const refused = await teamReschedule(admin, booking.id, { startUtc: outside.toISOString() });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('slot_taken');
  });

  it('rejects a missing time as a field error and a bad zone as a bad request', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);

    const noTime = await teamReschedule(admin, booking.id, { startUtc: undefined });
    expect(noTime.status).toBe(422);
    expect(noTime.body.error).toBe('validation');

    // Machine-supplied — the page reads it from the browser — so a bad one is malformed,
    // not something to write a member-facing message about.
    const badZone = await teamReschedule(admin, booking.id, {
      startUtc: booking.startUtc,
      timeZone: 'Mars/Olympus',
    });
    expect(badZone.status).toBe(400);
    expect(badZone.body.error).toBe('invalid_time_zone');
  });

  it('changes nothing when the calendar refuses the move', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);
    const [, second] = await offeredSlots(admin, booking.id, booking.startUtc);

    calendar.failOnUpdate = true;
    const failed = await teamReschedule(admin, booking.id, { startUtc: second });
    expect(failed.status).toBe(503);
    expect(failed.body.error).toBe('reschedule_failed');

    const after = await prisma.application.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.start.toISOString()).toBe(booking.startUtc);
    expect((await scheduleLog(booking.id)).filter((e) => e.type === 'rescheduled')).toHaveLength(0);
  });

  it('leaves the booking live when the calendar refuses the cancellation', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);

    calendar.failOnCancel = true;
    const failed = await teamCancel(admin, booking.id, { reason: 'Role filled internally.' });
    expect(failed.status).toBe(503);
    expect(failed.body.error).toBe('cancel_failed');

    // The flag is not set, so the booking stays live and reachable from both sides.
    const after = await prisma.application.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.isCancelled).toBe(false);
    expect((await scheduleLog(booking.id)).some((e) => e.type === 'cancelled')).toBe(false);
  });

  it('still permits both actions on a closed vacancy', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);
    const first = await book(vacancy.slug, { email: 'jane@example.com', startUtc: firstStart });
    const second = await book(vacancy.slug, { email: 'sam@example.com', startUtc: secondStart });

    await request(app.getHttpServer())
      .patch(`/api/organizations/${admin.organizationId}/hiring/vacancies/${vacancy.id}`)
      .set('Cookie', admin.cookies)
      .send({ status: 'closed' })
      .expect(200);

    // Closing means "stop accepting new applicants", not "renege on the interviews
    // already granted" (07 §13.60).
    const slots = await offeredSlots(admin, first.id, first.startUtc);
    expect(slots.length).toBeGreaterThan(0);
    expect((await teamReschedule(admin, first.id, { startUtc: slots[2] })).status).toBe(200);
    expect((await teamCancel(admin, second.id)).status).toBe(200);
  });

  /* ---------------------------------------------------------------- *
   * Nothing is reachable once the interview is over — 07 §01.4, §14.68
   * ---------------------------------------------------------------- */

  /** TC-H07-INT-07, the authenticated third of it. */
  it('answers 404 on all three routes once the interview has started', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);
    const slots = await offeredSlots(admin, booking.id, booking.startUtc);

    // One minute into the past — a no-show is a drag to `Didn't pass`, never a
    // retroactive cancellation (07 §01.4).
    const started = new Date(Date.now() - 60_000);
    await prisma.application.update({
      where: { id: booking.id },
      data: { start: started, end: new Date(started.getTime() + 60 * 60_000) },
    });

    expect((await teamAvailability(admin, booking.id)).status).toBe(404);
    expect((await teamReschedule(admin, booking.id, { startUtc: slots[1] })).status).toBe(404);
    expect((await teamCancel(admin, booking.id, { reason: 'Too late.' })).status).toBe(404);

    // And nothing was written on the way to refusing.
    expect(calendar.cancelled).toHaveLength(0);
    expect(calendar.updated).toHaveLength(0);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: booking.id } })).isCancelled)
      .toBe(false);
  });

  it('answers 404 on all three routes once the interview is cancelled', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);
    const slots = await offeredSlots(admin, booking.id, booking.startUtc);

    await teamCancel(admin, booking.id).expect(200);

    // Cancelling is not undoable, and there is no second cancellation to write.
    expect((await teamAvailability(admin, booking.id)).status).toBe(404);
    expect((await teamReschedule(admin, booking.id, { startUtc: slots[1] })).status).toBe(404);
    expect((await teamCancel(admin, booking.id)).status).toBe(404);
    expect((await scheduleLog(booking.id)).filter((e) => e.type === 'cancelled')).toHaveLength(1);
  });

  /* ---------------------------------------------------------------- *
   * What the routes answer with
   * ---------------------------------------------------------------- */

  it('answers with the application in the shape the card already renders', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);
    const [, second] = await offeredSlots(admin, booking.id, booking.startUtc);

    const moved = await teamReschedule(admin, booking.id, { startUtc: second });
    expect(moved.status).toBe(200);

    // Byte-identical to what a reload would give, which is what lets the section be
    // replaced in place rather than the page refetched mid-interview.
    const reloaded = await card(admin, booking.candidateId);
    expect(moved.body).toEqual(reloaded.body.applications[0]);

    expect(moved.body.startUtc).toBe(second);
    expect(moved.body.scheduleEvents[0]).toMatchObject({
      type: 'rescheduled',
      actor: 'member',
      actorName: 'Pat Owner',
      fromStartUtc: booking.startUtc,
      toStartUtc: second,
    });
  });

  it('answers a cancellation with the marked application, its column intact', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const booking = await book(vacancy.slug);

    await request(app.getHttpServer())
      .patch(`/api/organizations/${admin.organizationId}/hiring/applications/${booking.id}`)
      .set('Cookie', admin.cookies)
      .send({ status: 'maybe' })
      .expect(200);

    const cancelled = await teamCancel(admin, booking.id, { reason: 'Role filled internally.' });
    expect(cancelled.status).toBe(200);

    // The card is marked, not moved: `isCancelled` says the interview did not take
    // place and nothing about the candidate's standing (07 §01.1, §01.3).
    expect(cancelled.body).toMatchObject({ isCancelled: true, status: 'maybe' });
    expect(cancelled.body.cancellation).toMatchObject({
      actor: 'member',
      byName: 'Pat Owner',
      reason: 'Role filled internally.',
    });
  });
});
