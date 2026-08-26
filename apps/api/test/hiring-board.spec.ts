import { INestApplication } from '@nestjs/common';
import {
  APPLICATION_STATUSES,
  BOARD_COLUMNS,
  HIRING_MESSAGES,
  POSITION_STEP,
  type ApplicationStatus,
} from '@devscribed/validation';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { StubCalendarProvider } from './stub-calendar.provider';
import {
  addMember,
  bookInterview,
  bootHiringApp,
  createVacancy,
  firstSlots,
  resetDatabase,
  setRole,
  signInAs,
  signup,
  type SeededVacancy,
  type Signed,
} from './hiring.helpers';

/**
 * The board (spec 05): five columns of one vacancy's applications, and the one write
 * that moves a card between or within them.
 *
 * Every assertion about where a card ended up reads `position` out of the database
 * rather than off the response, because the requirement is about what was written —
 * "a move writes one row" is a claim about the other rows as much as the moved one.
 */
describe('Hiring — the board', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let calendar: StubCalendarProvider;

  const board = (session: Signed, vacancyId: string) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/vacancies/${vacancyId}/board`)
      .set('Cookie', session.cookies);

  const place = (session: Signed, applicationId: string, body: object) =>
    request(app.getHttpServer())
      .patch(
        `/api/organizations/${session.organizationId}/hiring/applications/${applicationId}/placement`,
      )
      .set('Cookie', session.cookies)
      .send(body);

  /** Books `count` interviews on one vacancy, newest first — which is board order. */
  async function seedApplications(
    vacancy: SeededVacancy,
    count: number,
  ): Promise<Array<{ applicationId: string; candidateId: string; name: string }>> {
    const slots = await firstSlots(app, vacancy.slug, count);
    const booked: Array<{ applicationId: string; candidateId: string; name: string }> = [];

    for (const [index, startUtc] of slots.entries()) {
      const firstName = `Cand${index}`;
      const response = await bookInterview(app, vacancy.slug, {
        firstName,
        lastName: 'Doe',
        email: `cand${index}@example.com`,
        startUtc,
      });
      if (response.status !== 201) {
        throw new Error(`Precondition failed: booking answered ${response.status}`);
      }
      const application = await prisma.application.findFirstOrThrow({
        orderBy: { createdAt: 'desc' },
        select: { id: true, candidateId: true },
      });
      booked.push({
        applicationId: application.id,
        candidateId: application.candidateId,
        name: `${firstName} Doe`,
      });
    }
    return booked;
  }

  /** Every application on the vacancy, as `{ id: [status, position] }`. */
  async function placements(vacancyId: string): Promise<Record<string, [string, number]>> {
    const rows = await prisma.application.findMany({
      where: { vacancyId },
      select: { id: true, status: true, position: true },
    });
    return Object.fromEntries(rows.map((row) => [row.id, [row.status, row.position]]));
  }

  /** The response is untyped JSON; this is the shape the contract promises. */
  interface BoardCard {
    applicationId: string;
    candidateId: string;
    name: string;
    startUtc: string;
    position: number;
    hasCv: boolean;
    isCancelled: boolean;
    hasConclusion: boolean;
  }
  interface BoardColumn {
    status: ApplicationStatus;
    count: number;
    cards: BoardCard[];
  }

  const column = (body: { columns: BoardColumn[] }, status: ApplicationStatus): BoardColumn =>
    body.columns.find((entry) => entry.status === status)!;

  const idsIn = (entry: BoardColumn): string[] => entry.cards.map((card) => card.applicationId);

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
   * Reading the board
   * ---------------------------------------------------------------- */

  it('answers with every column in order, even the empty ones', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [first] = await seedApplications(vacancy, 1);

    const response = await board(admin, vacancy.id);

    expect(response.status).toBe(200);
    expect(response.body.vacancy).toEqual({
      id: vacancy.id,
      title: 'Senior React Engineer',
      durationMinutes: 60,
    });
    expect(typeof response.body.viewerTimeZone).toBe('string');
    // An absent column would be indistinguishable from one that failed to load.
    expect(response.body.columns.map((entry: BoardColumn) => entry.status)).toEqual([
      ...BOARD_COLUMNS,
    ]);
    expect(column(response.body, 'didnt_pass')).toMatchObject({ count: 0, cards: [] });

    const scheduled = column(response.body, 'scheduled');
    expect(scheduled.count).toBe(1);
    expect(scheduled.cards[0]).toMatchObject({
      applicationId: first.applicationId,
      candidateId: first.candidateId,
      name: 'Cand0 Doe',
      hasCv: true,
      isCancelled: false,
      hasConclusion: false,
    });
    expect(typeof scheduled.cards[0].startUtc).toBe('string');
  });

  it('sends whether a conclusion exists, never the conclusion itself', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [first] = await seedApplications(vacancy, 1);

    await prisma.application.update({
      where: { id: first.applicationId },
      data: { conclusion: 'Strong on hooks, weak on SQL.', interviewNotes: 'Long notes.' },
    });

    const response = await board(admin, vacancy.id);

    expect(column(response.body, 'scheduled').cards[0].hasConclusion).toBe(true);
    // The board is the wrong grain for an assessment; the card is where it is read.
    expect(JSON.stringify(response.body)).not.toContain('hooks');
    expect(JSON.stringify(response.body)).not.toContain('Long notes');
  });

  it('reads whitespace as no conclusion, so the marker means what it says', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [first] = await seedApplications(vacancy, 1);

    await prisma.application.update({
      where: { id: first.applicationId },
      data: { conclusion: '   \n ' },
    });

    expect(column((await board(admin, vacancy.id)).body, 'scheduled').cards[0].hasConclusion).toBe(
      false,
    );
  });

  it('marks a cancelled card without moving it out of its column', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [first] = await seedApplications(vacancy, 1);

    // Nothing in this release sets the flag (05 §07.24); the board still has to render
    // it, so the reschedule flow that eventually writes it needs no board change.
    await prisma.application.update({
      where: { id: first.applicationId },
      data: { isCancelled: true },
    });

    const scheduled = column((await board(admin, vacancy.id)).body, 'scheduled');
    expect(scheduled.count).toBe(1);
    expect(scheduled.cards[0].isCancelled).toBe(true);
  });

  it('answers 404 for a vacancy in another organization', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const other = await signup(app, 'other@other.com', 'Other Inc');
    const theirs = await createVacancy(app, other);

    expect((await board(admin, theirs.id)).status).toBe(404);
    expect((await board(admin, '00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });

  /* ---------------------------------------------------------------- *
   * TC-H05-INT-01 — every transition
   * ---------------------------------------------------------------- */

  it('permits every transition between the five columns, including backwards', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [only] = await seedApplications(vacancy, 1);

    for (const from of APPLICATION_STATUSES) {
      for (const to of APPLICATION_STATUSES) {
        if (from === to) continue;
        // Park it in `from` first, so each pair is genuinely exercised in that direction.
        await place(admin, only.applicationId, { status: from });

        const response = await place(admin, only.applicationId, { status: to });

        expect([from, to, response.status]).toEqual([from, to, 200]);
        expect(response.body).toMatchObject({ applicationId: only.applicationId, status: to });
        const stored = await prisma.application.findUniqueOrThrow({
          where: { id: only.applicationId },
          select: { status: true },
        });
        expect([from, to, stored.status]).toEqual([from, to, to]);
      }
    }
  });

  /* ---------------------------------------------------------------- *
   * TC-H05-INT-02 — one row
   * ---------------------------------------------------------------- */

  it('writes one row and leaves every other card where it was', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [a, b, c, d, e] = await seedApplications(vacancy, 5);

    // Two of them into `maybe`, spread by the top-insert the card's status control uses.
    await place(admin, d.applicationId, { status: 'maybe' });
    await place(admin, e.applicationId, { status: 'maybe', beforeApplicationId: d.applicationId });

    const before = await placements(vacancy.id);
    const maybe = column((await board(admin, vacancy.id)).body, 'maybe');
    const [above, below] = idsIn(maybe);

    const response = await place(admin, b.applicationId, {
      status: 'maybe',
      afterApplicationId: above,
      beforeApplicationId: below,
    });

    expect(response.status).toBe(200);
    expect(response.body.position).toBe(
      Math.floor((before[above][1] + before[below][1]) / 2),
    );

    const after = await placements(vacancy.id);
    // Only the moved application changed. No rebalance, no other row rewritten.
    expect(after[a.applicationId]).toEqual(before[a.applicationId]);
    expect(after[c.applicationId]).toEqual(before[c.applicationId]);
    expect(after[d.applicationId]).toEqual(before[d.applicationId]);
    expect(after[e.applicationId]).toEqual(before[e.applicationId]);
    expect(after[b.applicationId]).toEqual(['maybe', response.body.position]);
  });

  it('reorders within a column by the same write', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [a, b, c] = await seedApplications(vacancy, 3);

    // Booked newest-first, so the column reads c, b, a.
    const before = column((await board(admin, vacancy.id)).body, 'scheduled');
    expect(idsIn(before)).toEqual([c.applicationId, b.applicationId, a.applicationId]);

    // The bottom card to the very top.
    const response = await place(admin, a.applicationId, {
      status: 'scheduled',
      beforeApplicationId: c.applicationId,
    });

    expect(response.status).toBe(200);
    const after = column((await board(admin, vacancy.id)).body, 'scheduled');
    // The moved card is first; the two it left behind keep their order relative to
    // each other, because nothing but its own row was written.
    expect(idsIn(after)).toEqual([a.applicationId, c.applicationId, b.applicationId]);
  });

  it('rebalances one column when the gap between two neighbours has closed', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [a, b, c] = await seedApplications(vacancy, 3);

    // Two adjacent cards one apart — the state repeated midpoints eventually produce.
    await prisma.application.update({ where: { id: c.applicationId }, data: { position: 1000 } });
    await prisma.application.update({ where: { id: b.applicationId }, data: { position: 1001 } });
    await prisma.application.update({ where: { id: a.applicationId }, data: { position: 5000 } });
    const untouched = await createVacancy(app, admin, { title: 'Backend Engineer' });
    const [elsewhere] = await seedApplications(untouched, 1);

    const response = await place(admin, a.applicationId, {
      status: 'scheduled',
      afterApplicationId: c.applicationId,
      beforeApplicationId: b.applicationId,
    });

    expect(response.status).toBe(200);
    const after = await placements(vacancy.id);
    // Clean multiples again, in the order the drop asked for.
    expect(after[c.applicationId]).toEqual(['scheduled', 1000]);
    expect(after[a.applicationId]).toEqual(['scheduled', 2000]);
    expect(after[b.applicationId]).toEqual(['scheduled', 3000]);
    expect(response.body.position).toBe(2000);

    // The rebalance is one column of one vacancy and nothing else.
    const other = await placements(untouched.id);
    expect(other[elsewhere.applicationId][1]).toBe(POSITION_STEP);
  });

  /* ---------------------------------------------------------------- *
   * TC-H05-INT-03 — position is never accepted from the client
   * ---------------------------------------------------------------- */

  it('ignores a position supplied by the client', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [a, b, c] = await seedApplications(vacancy, 3);

    const before = await placements(vacancy.id);
    // The column reads c, b, a — so this drop is between b and a, at the bottom half.
    const response = await place(admin, c.applicationId, {
      status: 'scheduled',
      afterApplicationId: b.applicationId,
      beforeApplicationId: a.applicationId,
      // What a hostile client would send to jump the card to the top.
      position: -999_999,
    });

    expect(response.status).toBe(200);
    expect(response.body.position).toBe(
      Math.floor((before[b.applicationId][1] + before[a.applicationId][1]) / 2),
    );
    const after = await placements(vacancy.id);
    expect(after[c.applicationId][1]).toBeGreaterThan(before[b.applicationId][1]);
  });

  it('refuses a status outside the five', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [only] = await seedApplications(vacancy, 1);

    const response = await place(admin, only.applicationId, { status: 'hired' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('invalid_status');
    const after = await placements(vacancy.id);
    expect(after[only.applicationId][0]).toBe('scheduled');
  });

  /* ---------------------------------------------------------------- *
   * TC-H05-INT-04 — a stale neighbour
   * ---------------------------------------------------------------- */

  it('rejects a move naming a neighbour that has left the column', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [a, b] = await seedApplications(vacancy, 2);

    // X sits in `maybe`, and another session moves it on to `passed`.
    await place(admin, b.applicationId, { status: 'maybe' });
    const before = await placements(vacancy.id);
    await place(admin, b.applicationId, { status: 'passed' });

    const response = await place(admin, a.applicationId, {
      status: 'maybe',
      afterApplicationId: b.applicationId,
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('stale_neighbours');
    // No position is written — the card stays exactly where it was.
    const after = await placements(vacancy.id);
    expect(after[a.applicationId]).toEqual(before[a.applicationId]);
  });

  it('rejects an empty-column drop into a column that has since gained a card', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [a, b] = await seedApplications(vacancy, 2);

    await place(admin, b.applicationId, { status: 'offer' });

    const response = await place(admin, a.applicationId, {
      status: 'offer',
      afterApplicationId: null,
      beforeApplicationId: null,
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('stale_neighbours');
  });

  it('rejects a neighbour from another vacancy', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const other = await createVacancy(app, admin, { title: 'Backend Engineer' });
    const [mine] = await seedApplications(vacancy, 1);
    const [theirs] = await seedApplications(other, 1);

    const response = await place(admin, mine.applicationId, {
      status: 'scheduled',
      beforeApplicationId: theirs.applicationId,
    });

    expect(response.status).toBe(409);
  });

  it('answers 404 for an application in another organization', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const other = await signup(app, 'other@other.com', 'Other Inc');
    const theirs = await createVacancy(app, other);
    const [card] = await seedApplications(theirs, 1);

    const response = await place(admin, card.applicationId, { status: 'maybe' });

    expect(response.status).toBe(404);
  });

  /* ---------------------------------------------------------------- *
   * TC-H05-INT-05 — a new booking lands at the top
   * ---------------------------------------------------------------- */

  it('puts a new booking first in Scheduled without disturbing the order below it', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [a, b] = await seedApplications(vacancy, 2);

    const before = await placements(vacancy.id);
    const slots = await firstSlots(app, vacancy.slug, 3);
    const booked = await bookInterview(app, vacancy.slug, {
      firstName: 'Late',
      lastName: 'Arrival',
      email: 'late@example.com',
      startUtc: slots[2],
    });
    expect(booked.status).toBe(201);

    const scheduled = column((await board(admin, vacancy.id)).body, 'scheduled');
    const order = scheduled.cards.map((card) => card.name);

    expect(order[0]).toBe('Late Arrival');
    // The existing two keep their relative order and their positions.
    expect(order.slice(1)).toEqual(['Cand1 Doe', 'Cand0 Doe']);
    const after = await placements(vacancy.id);
    expect(after[a.applicationId]).toEqual(before[a.applicationId]);
    expect(after[b.applicationId]).toEqual(before[b.applicationId]);
  });

  /* ---------------------------------------------------------------- *
   * TC-H05-INT-06 — who may reach the board
   * ---------------------------------------------------------------- */

  it('is closed to user and viewer, and answers the interviewer 404 rather than 403', async () => {
    const admin = await signup(app, 'pat@acme.com');

    const interviewer = await addMember(prisma, admin.organizationId, {
      email: 'ines@acme.com',
      role: 'user',
      firstName: 'Ines',
      lastName: 'Reyes',
    });
    const vacancy = await createVacancy(app, admin, {
      interviewerAccountId: interviewer.accountId,
    });
    const [card] = await seedApplications(vacancy, 1);

    const interviewerSession = await signInAs(app, {
      email: 'ines@acme.com',
      accountId: interviewer.accountId,
      organizationId: admin.organizationId,
    });
    // The assigned interviewer: refused, and refused in a way that does not confirm the
    // board is there to be asked for (TC-H05-INT-06).
    expect((await board(interviewerSession, vacancy.id)).status).toBe(404);
    expect((await place(interviewerSession, card.applicationId, { status: 'maybe' })).status).toBe(
      404,
    );

    const unassigned = await addMember(prisma, admin.organizationId, {
      email: 'sam@acme.com',
      role: 'user',
    });
    const unassignedSession = await signInAs(app, {
      email: 'sam@acme.com',
      accountId: unassigned.accountId,
      organizationId: admin.organizationId,
    });
    expect((await board(unassignedSession, vacancy.id)).status).toBe(403);
    expect((await place(unassignedSession, card.applicationId, { status: 'maybe' })).status).toBe(
      403,
    );

    const viewer = await addMember(prisma, admin.organizationId, {
      email: 'vic@acme.com',
      role: 'viewer',
    });
    const viewerSession = await signInAs(app, {
      email: 'vic@acme.com',
      accountId: viewer.accountId,
      organizationId: admin.organizationId,
    });
    const refused = await board(viewerSession, vacancy.id);
    expect(refused.status).toBe(403);
    expect(refused.body.message).toBe(HIRING_MESSAGES.board.forbidden);
    expect((await place(viewerSession, card.applicationId, { status: 'maybe' })).status).toBe(403);

    // Nothing any of them sent moved anything.
    const after = await placements(vacancy.id);
    expect(after[card.applicationId][0]).toBe('scheduled');
  });

  it('lets a manager run the board, like an admin', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [card] = await seedApplications(vacancy, 1);

    await setRole(prisma, admin.accountId, 'manager');

    expect((await board(admin, vacancy.id)).status).toBe(200);
    expect((await place(admin, card.applicationId, { status: 'passed' })).status).toBe(200);
  });

  it('refuses an unauthenticated caller before it looks anything up', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);

    const response = await request(app.getHttpServer()).get(
      `/api/organizations/${admin.organizationId}/hiring/vacancies/${vacancy.id}/board`,
    );

    expect(response.status).toBe(401);
  });
});
