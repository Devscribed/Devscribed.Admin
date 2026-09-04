import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Test } from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { StubCalendarProvider } from './stub-calendar.provider';
import {
  addMember,
  bookInterview,
  bookedApplication,
  bootHiringApp,
  createCriterion,
  createVacancy,
  firstSlots,
  resetDatabase,
  signInAs,
  signup,
  type Signed,
} from './hiring.helpers';

/**
 * The permission matrix in `specs/hiring/README.md`, asserted whole.
 *
 * Every phase shipped its own gating rather than leaving it to a permissions phase,
 * which is right — but it means the matrix has only ever been checked one endpoint at a
 * time, and the interesting question is the one no single suite can ask: does the *set*
 * hold? An endpoint that quietly kept `HiringManageGuard` when it should have moved to
 * `InterviewerScopeGuard` passes its own suite and fails here.
 *
 * The four callers are the four roles, plus the fifth caller the matrix's last row is
 * really about — a `user` who has been assigned an interview, whose permissions are
 * decided by that assignment and not by their role.
 *
 * Two refusal codes, and which one is deliberate everywhere:
 *
 * - **403** where the caller already knows the thing exists. A `user` looking at the
 *   Vacancies URL knows their organization has vacancies; refusing loudly is honest.
 * - **404** on every candidate-shaped surface — the card, its writes, its CV, the
 *   database, My interviews, and the board when the caller is its interviewer. There, a
 *   permission error would confirm a record exists, or would read as "ask to be
 *   promoted" to somebody whose access is real but narrow.
 */
describe('Hiring — the permission matrix', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let calendar: StubCalendarProvider;

  interface Fixture {
    admin: Signed;
    manager: Signed;
    /** A `user` with no assignment anywhere. */
    plain: Signed;
    viewer: Signed;
    /** A `user` who is the interviewer on `theirVacancyId` and nothing else. */
    interviewer: Signed;
    vacancyId: string;
    candidateId: string;
    applicationId: string;
    criterionId: string;
    /** The interviewer's own vacancy, and the one application on it. */
    theirVacancyId: string;
    theirCandidateId: string;
    theirApplicationId: string;
  }

  let fixture: Fixture;

  const url = (session: Signed, path: string): string =>
    `/api/organizations/${session.organizationId}/hiring/${path}`;

  /** Every status a set of callers gets for one request, in caller order. */
  const statuses = async (
    sessions: Signed[],
    send: (session: Signed) => Test,
  ): Promise<number[]> =>
    Promise.all(sessions.map(async (session) => (await send(session)).status));

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

    const admin = await signup(app, 'pat@acme.com');
    const seat = async (email: string, role: string): Promise<Signed> => {
      const member = await addMember(prisma, admin.organizationId, { email, role });
      return signInAs(app, {
        email,
        accountId: member.accountId,
        organizationId: admin.organizationId,
      });
    };

    const manager = await seat('manager@acme.com', 'manager');
    const plain = await seat('plain@acme.com', 'user');
    const viewer = await seat('viewer@acme.com', 'viewer');
    const interviewer = await seat('interviewer@acme.com', 'user');

    // The organization's vacancy, interviewed by the admin.
    const vacancy = await createVacancy(app, admin, { title: 'React Engineer' });
    const [first, second] = await firstSlots(app, vacancy.slug, 2);
    await bookInterview(app, vacancy.slug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      startUtc: first,
    });
    const application = await bookedApplication(prisma, {
      startUtc: first,
      email: 'jane@example.com',
    });

    // And one the `user` interviews for, so their own narrow access is real.
    const theirs = await createVacancy(app, admin, {
      title: 'Node Engineer',
      interviewerAccountId: interviewer.accountId,
    });
    await bookInterview(app, theirs.slug, {
      firstName: 'Ann',
      lastName: 'Lee',
      email: 'ann@example.com',
      startUtc: second,
    });
    const theirApplication = await bookedApplication(prisma, {
      startUtc: second,
      email: 'ann@example.com',
    });

    const english = await createCriterion(app, admin, { name: 'English', type: 'text' });

    fixture = {
      admin,
      manager,
      plain,
      viewer,
      interviewer,
      vacancyId: vacancy.id,
      candidateId: application.candidateId,
      applicationId: application.id,
      criterionId: english.id,
      theirVacancyId: theirs.id,
      theirCandidateId: theirApplication.candidateId,
      theirApplicationId: theirApplication.id,
    };
  });

  /**
   * "See the Hiring section" and "Create / edit / close vacancies" — one row in the
   * matrix each, one guard between them.
   */
  it('lets admin and manager manage vacancies, and refuses everyone else 403', async () => {
    const { admin, manager, plain, viewer, interviewer, vacancyId } = fixture;
    const allowed = [admin, manager];
    const refused = [plain, viewer, interviewer];

    const reads: Array<(session: Signed) => Test> = [
      (session) => request(app.getHttpServer()).get(url(session, 'vacancies')).set('Cookie', session.cookies),
      (session) => request(app.getHttpServer()).get(url(session, `vacancies/${vacancyId}`)).set('Cookie', session.cookies),
      (session) => request(app.getHttpServer()).get(url(session, 'interviewers')).set('Cookie', session.cookies),
    ];

    for (const read of reads) {
      expect(await statuses(allowed, read)).toEqual([200, 200]);
      expect(await statuses(refused, read)).toEqual([403, 403, 403]);
    }

    // The assigned interviewer included: interviewing is not editing (01 §02).
    expect(
      await statuses(refused, (session) =>
        request(app.getHttpServer())
          .patch(url(session, `vacancies/${vacancyId}`))
          .set('Cookie', session.cookies)
          .send({ title: 'Renamed' }),
      ),
    ).toEqual([403, 403, 403]);
    expect(
      await statuses(refused, (session) =>
        request(app.getHttpServer())
          .post(url(session, 'vacancies'))
          .set('Cookie', session.cookies)
          .send({ title: 'Theirs', interviewerAccountId: session.accountId, durationMinutes: 60 }),
      ),
    ).toEqual([403, 403, 403]);

    expect(await prisma.vacancy.count({ where: { title: 'Renamed' } })).toBe(0);
    expect(await prisma.vacancy.count({ where: { title: 'Theirs' } })).toBe(0);
  });

  /**
   * "Manage category / criteria libraries" — and the tension the interviewer phase was
   * left to settle (06 §Actors, TC-H06-INT-08).
   *
   * It is settled by the matrix rather than by convenience: both libraries stay
   * `admin`/`manager`, `GET` included, and an assigned interviewer is refused like any
   * other `user`. Which is why the card renders criteria read-only for them — a page
   * cannot offer a library it may not read, and the alternative was opening the whole
   * library to make one autocomplete work.
   */
  it('keeps both libraries to admin and manager, the assigned interviewer included', async () => {
    const { admin, manager, plain, viewer, interviewer, criterionId } = fixture;

    for (const path of ['categories', 'criteria']) {
      expect(
        await statuses([admin, manager], (session) =>
          request(app.getHttpServer()).get(url(session, path)).set('Cookie', session.cookies),
        ),
      ).toEqual([200, 200]);

      const refusals = await Promise.all(
        [plain, viewer, interviewer].map((session) =>
          request(app.getHttpServer()).get(url(session, path)).set('Cookie', session.cookies),
        ),
      );
      for (const refusal of refusals) {
        expect(refusal.status).toBe(403);
        // No library data leaks through the refusal body.
        expect(JSON.stringify(refusal.body)).not.toContain('English');
      }
    }

    // Including the inline creation path an interviewer would reach mid-interview.
    expect(
      await statuses([plain, viewer, interviewer], (session) =>
        request(app.getHttpServer())
          .post(url(session, 'criteria'))
          .set('Cookie', session.cookies)
          .send({ name: 'Improvised', type: 'text' }),
      ),
    ).toEqual([403, 403, 403]);
    expect(
      await statuses([plain, viewer, interviewer], (session) =>
        request(app.getHttpServer())
          .patch(url(session, `criteria/${criterionId}`))
          .set('Cookie', session.cookies)
          .send({ name: 'Renamed' }),
      ),
    ).toEqual([403, 403, 403]);
    expect(await prisma.criterion.count({ where: { name: 'Improvised' } })).toBe(0);
  });

  /**
   * "Candidate database" — 404 to everyone refused, never 403 (03 §API), and the row the
   * assignment rule moved into.
   *
   * The database opens to an assigned interviewer, narrowed to their own candidates. It
   * is the same access they always had — My interviews was this list with one scope
   * fixed — reached through one screen instead of two. What did not move is the refusal:
   * a `viewer` and a `user` nobody has assigned anything still get nothing, and still
   * get it as a 404.
   */
  it('opens the candidate database to the assigned interviewer, and 404s the rest', async () => {
    const { admin, manager, plain, viewer, interviewer } = fixture;

    const database = (session: Signed) =>
      request(app.getHttpServer()).get(url(session, 'candidates')).set('Cookie', session.cookies);

    expect(await statuses([admin, manager], database)).toEqual([200, 200]);

    // Theirs, and only theirs — the scope is the server's, not the query string's.
    const theirs = await database(interviewer);
    expect(theirs.status).toBe(200);
    expect(theirs.body.canSeeAll).toBe(false);
    expect(theirs.body.scope).toBe('mine');
    expect(JSON.stringify(theirs.body)).not.toContain('jane@example.com');
    expect(JSON.stringify(theirs.body)).toContain('ann@example.com');

    // Asking for the whole database does not produce it.
    const widened = await request(app.getHttpServer())
      .get(url(interviewer, 'candidates'))
      .query({ scope: 'all' })
      .set('Cookie', interviewer.cookies);
    expect(widened.body.scope).toBe('mine');
    expect(JSON.stringify(widened.body)).not.toContain('jane@example.com');

    const refusals = await Promise.all([plain, viewer].map(database));
    for (const refusal of refusals) {
      expect(refusal.status).toBe(404);
      expect(JSON.stringify(refusal.body)).not.toContain('jane@example.com');
    }
  });

  /** "Candidate boards, move cards" — 403, except for this board's own interviewer. */
  it('keeps the board to admin and manager, and answers its interviewer 404', async () => {
    const { admin, manager, plain, viewer, interviewer, vacancyId, theirVacancyId } = fixture;

    const board = (session: Signed, id: string) =>
      request(app.getHttpServer()).get(url(session, `vacancies/${id}/board`)).set('Cookie', session.cookies);

    expect(await statuses([admin, manager], (session) => board(session, vacancyId))).toEqual([200, 200]);
    // Somebody else's board: they already know it exists, so the refusal is honest.
    expect(await statuses([plain, viewer, interviewer], (session) => board(session, vacancyId))).toEqual([
      403, 403, 403,
    ]);
    // Their own board, which they must not be told is there at all.
    expect((await board(interviewer, theirVacancyId)).status).toBe(404);
  });

  /**
   * "My interviews, and cards for own vacancies" — the one row scoped by assignment.
   */
  it('gives the card to admin, manager and the assigned interviewer, and 404 to the rest', async () => {
    const {
      admin,
      manager,
      plain,
      viewer,
      interviewer,
      candidateId,
      applicationId,
      theirCandidateId,
      theirApplicationId,
    } = fixture;

    const card = (session: Signed, id: string) =>
      request(app.getHttpServer()).get(url(session, `candidates/${id}`)).set('Cookie', session.cookies);
    const cv = (session: Signed, id: string) =>
      request(app.getHttpServer()).get(url(session, `applications/${id}/cv`)).set('Cookie', session.cookies);
    const patch = (session: Signed, id: string) =>
      request(app.getHttpServer())
        .patch(url(session, `applications/${id}`))
        .set('Cookie', session.cookies)
        .send({ interviewNotes: 'written' });

    // Every candidate, for the two roles that manage hiring.
    expect(await statuses([admin, manager], (session) => card(session, candidateId))).toEqual([200, 200]);
    expect(await statuses([admin, manager], (session) => card(session, theirCandidateId))).toEqual([200, 200]);

    // Their own candidate, for the interviewer — and nobody else's.
    expect((await card(interviewer, theirCandidateId)).status).toBe(200);
    expect((await cv(interviewer, theirApplicationId)).status).toBe(200);
    expect((await patch(interviewer, theirApplicationId)).status).toBe(200);

    expect((await card(interviewer, candidateId)).status).toBe(404);
    expect((await cv(interviewer, applicationId)).status).toBe(404);
    expect((await patch(interviewer, applicationId)).status).toBe(404);

    // A `user` with no assignment and a `viewer` reach no card at all.
    for (const id of [candidateId, theirCandidateId]) {
      expect(await statuses([plain, viewer], (session) => card(session, id))).toEqual([404, 404]);
    }
    expect(await statuses([plain, viewer], (session) => patch(session, applicationId))).toEqual([404, 404]);
    expect(await statuses([plain, viewer], (session) => cv(session, applicationId))).toEqual([404, 404]);

    const untouched = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: { interviewNotes: true },
    });
    expect(untouched.interviewNotes).toBeNull();
  });

  it('gives My interviews to whoever holds an assignment, whatever their role', async () => {
    const { admin, manager, plain, viewer, interviewer } = fixture;

    const screen = (session: Signed) =>
      request(app.getHttpServer()).get(url(session, 'my-interviews')).set('Cookie', session.cookies);

    // The admin interviews for the organization's first vacancy; the interviewer for
    // their own. Neither the manager, the unassigned `user`, nor the `viewer` holds one.
    expect(await statuses([admin, interviewer], screen)).toEqual([200, 200]);
    expect(await statuses([manager, plain, viewer], screen)).toEqual([404, 404, 404]);
  });
});
