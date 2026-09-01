import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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
  setRole,
  signInAs,
  signup,
  type SeededVacancy,
  type Signed,
} from './hiring.helpers';

/**
 * Deleting a candidate (spec 03 §11) — the one action in hiring that removes a person
 * from a screen, and the only one that is a **flag**.
 *
 * Two claims carry this file, and they are the two halves of the same decision. A deleted
 * candidate is gone from every read the team has: the list and both its scope counts, the
 * card, the board, the vacancy's `Candidates` column, my interviews. And **nothing is
 * erased** — their applications keep their board position and every assessment on them,
 * so re-booking with the same address brings the whole record back rather than producing
 * a stranger wearing a familiar name.
 *
 * The third claim is the permission: the menu item is `admin`/`manager` only, and the
 * endpoint refuses an assigned interviewer regardless of what any screen drew.
 */
describe('Hiring — deleting a candidate', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let calendar: StubCalendarProvider;

  const remove = (session: Signed, candidateId: string) =>
    request(app.getHttpServer())
      .delete(`/api/organizations/${session.organizationId}/hiring/candidates/${candidateId}`)
      .set('Cookie', session.cookies);

  const list = (session: Signed, query: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/candidates`)
      .query(query)
      .set('Cookie', session.cookies);

  const card = (session: Signed, candidateId: string) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/candidates/${candidateId}`)
      .set('Cookie', session.cookies);

  const board = (session: Signed, vacancyId: string) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/vacancies/${vacancyId}/board`)
      .set('Cookie', session.cookies);

  const vacancies = (session: Signed) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/vacancies`)
      .set('Cookie', session.cookies);

  const myInterviews = (session: Signed) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/my-interviews`)
      .set('Cookie', session.cookies);

  /** Books one interview and hands back the ids the rest of the file is addressed by. */
  async function book(
    vacancy: SeededVacancy,
    values: { email: string; firstName?: string; lastName?: string; startUtc: string },
  ): Promise<{ candidateId: string; applicationId: string }> {
    const response = await bookInterview(app, vacancy.slug, {
      firstName: values.firstName ?? 'Jane',
      lastName: values.lastName ?? 'Doe',
      email: values.email,
      startUtc: values.startUtc,
    });
    if (response.status !== 201) {
      throw new Error(`Precondition failed: booking answered ${response.status}`);
    }
    const application = await bookedApplication(prisma, {
      startUtc: values.startUtc,
      email: values.email,
      vacancyId: vacancy.id,
    });
    return { candidateId: application.candidateId, applicationId: application.id };
  }

  const emails = (response: { body: { candidates: Array<{ email: string }> } }): string[] =>
    response.body.candidates.map((candidate) => candidate.email).sort();

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

  /**
   * TC-H03-INT-16 — deleting is `admin`/`manager` only.
   *
   * The interviewer here is assigned the vacancy the candidate booked, so they reach the
   * card and the list perfectly well. That is exactly the point: an assignment is
   * authority over an *interview*, never over somebody's record, and the endpoint says so
   * without consulting what any menu happened to draw.
   */
  it('refuses an assigned interviewer and a viewer, and accepts a manager', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const interviewer = await addMember(prisma, admin.organizationId, {
      email: 'dev@acme.com',
      role: 'user',
    });
    const vacancy = await createVacancy(app, admin, {
      interviewerAccountId: interviewer.accountId,
    });
    const [slot] = await firstSlots(app, vacancy.slug, 1);
    const { candidateId } = await book(vacancy, { email: 'jane@example.com', startUtc: slot });

    const theirs = await signInAs(app, {
      email: 'dev@acme.com',
      accountId: interviewer.accountId,
      organizationId: admin.organizationId,
    });
    // They can open the card, and they cannot delete the person on it. 403 rather than
    // 404: the caller is a member reaching a record they are already entitled to read,
    // so there is nothing to conceal and every reason to say plainly that they may not.
    expect((await card(theirs, candidateId)).status).toBe(200);
    expect((await remove(theirs, candidateId)).status).toBe(403);

    const spectator = await addMember(prisma, admin.organizationId, {
      email: 'obs@acme.com',
      role: 'viewer',
    });
    const watching = await signInAs(app, {
      email: 'obs@acme.com',
      accountId: spectator.accountId,
      organizationId: admin.organizationId,
    });
    expect((await remove(watching, candidateId)).status).toBe(403);

    await setRole(prisma, admin.accountId, 'manager');
    expect((await remove(admin, candidateId)).status).toBe(200);

    // A second delete is a 404, not a second success: the record it names is not there,
    // which is the same answer the card gives.
    expect((await remove(admin, candidateId)).status).toBe(404);
    // And the first deletion's instant is what stands.
    const deleted = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId } });
    expect(deleted.deletedAt).not.toBeNull();
  });

  /**
   * TC-H03-INT-17 — one flag, every screen.
   *
   * The list, both scope counts, the org-wide total, the card, the board, the vacancy's
   * `Candidates` column and my interviews all read the same predicate, and this is the
   * case that says so — a soft delete's characteristic failure is a screen somebody
   * forgot.
   */
  it('removes the candidate from every hiring read at once', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin, { title: 'Senior React Engineer' });
    const slots = await firstSlots(app, vacancy.slug, 2);
    const doomed = await book(vacancy, { email: 'jane@example.com', startUtc: slots[0] });
    await book(vacancy, { email: 'ivan@example.com', lastName: 'Petrov', startUtc: slots[1] });

    const before = await list(admin);
    expect(before.body.total).toBe(2);
    expect(emails(before)).toEqual(['ivan@example.com', 'jane@example.com']);

    expect((await remove(admin, doomed.candidateId)).status).toBe(200);

    const after = await list(admin);
    expect(emails(after)).toEqual(['ivan@example.com']);
    // `total` is the organization's own count and moves too — otherwise the empty state
    // would stay hidden behind people nobody can open.
    expect(after.body.total).toBe(1);
    expect(after.body.matched).toBe(1);
    expect(after.body.scopeCounts.all).toBe(1);
    expect(after.body.scopeCounts.mine).toBe(1);

    expect((await card(admin, doomed.candidateId)).status).toBe(404);

    const columns = (await board(admin, vacancy.id)).body.columns;
    const scheduled = columns.find((column: { status: string }) => column.status === 'scheduled');
    expect(scheduled.count).toBe(1);
    expect(scheduled.cards.map((entry: { candidateId: string }) => entry.candidateId)).toEqual([
      (await prisma.candidate.findFirstOrThrow({ where: { email: 'ivan@example.com' } })).id,
    ]);

    const listed = (await vacancies(admin)).body.vacancies[0];
    expect(listed.applicationCount).toBe(1);
    expect(listed.scheduledCount).toBe(1);

    // The admin is the interviewer on the vacancy, so the same person leaves their
    // interview list as well.
    const interviews = await myInterviews(admin);
    const named = [...interviews.body.upcoming, ...interviews.body.past].map(
      (row: { candidateId: string }) => row.candidateId,
    );
    expect(named).not.toContain(doomed.candidateId);
  });

  /**
   * TC-H03-INT-18 — nothing is erased, and re-booking brings all of it back.
   *
   * This is the whole reason the delete is a flag. The candidate's applications, their
   * board position and every assessment on them survive untouched, and the upsert on
   * `(organizationId, email)` revives the person rather than colliding with them.
   */
  it('keeps the record, and revives the candidate when they book again', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin, { title: 'Senior React Engineer' });
    const other = await createVacancy(app, admin, { title: 'DotNet Engineer' });
    const english = await createCriterion(app, admin, { name: 'English' });
    const slots = await firstSlots(app, vacancy.slug, 3);

    const first = await book(vacancy, { email: 'jane@example.com', startUtc: slots[0] });
    await request(app.getHttpServer())
      .put(
        `/api/organizations/${admin.organizationId}/hiring/applications/${first.applicationId}/criteria/${english.id}`,
      )
      .set('Cookie', admin.cookies)
      .send({ valueId: english.values.find((value) => value.label === 'B1')!.id })
      .expect(200);

    const positionBefore = await prisma.application.findUniqueOrThrow({
      where: { id: first.applicationId },
      select: { position: true, status: true },
    });

    expect((await remove(admin, first.candidateId)).status).toBe(200);

    // The application is still there, in the column and at the position it held.
    const survived = await prisma.application.findUniqueOrThrow({
      where: { id: first.applicationId },
      select: { position: true, status: true },
    });
    expect(survived).toEqual(positionBefore);
    expect(
      await prisma.applicationCriterion.count({ where: { applicationId: first.applicationId } }),
    ).toBe(1);

    // The same address books a different vacancy. The upsert finds the deleted row and
    // clears the flag — one person, not two — and the new booking's name overwrites the
    // old one exactly as it always does (02 §27).
    const otherSlots = await firstSlots(app, other.slug, 1);
    const second = await book(other, {
      email: 'jane@example.com',
      firstName: 'Janet',
      lastName: 'Doherty',
      startUtc: otherSlots[0],
    });
    expect(second.candidateId).toBe(first.candidateId);

    const revived = await card(admin, first.candidateId);
    expect(revived.status).toBe(200);
    expect(revived.body.candidate.firstName).toBe('Janet');
    // Both applications, and the assessment recorded before the delete.
    expect(revived.body.applications).toHaveLength(2);
    const restored = revived.body.applications.find(
      (application: { id: string }) => application.id === first.applicationId,
    );
    expect(restored.criteria).toHaveLength(1);
    expect(restored.criteria[0].valueLabel).toBe('B1');

    const back = await list(admin);
    expect(emails(back)).toEqual(['jane@example.com']);
    expect(back.body.total).toBe(1);
  });

  /**
   * TC-H03-INT-19 — the vacancy's two numbers, which say different things.
   *
   * `Candidates` counts the people a member can still open; deletion is blocked by every
   * application that exists, deleted candidates included. They disagree exactly here, and
   * the disagreement is the point: removing a person hides their record and does not
   * destroy it, so a cascade that took their notes and assessments away because nobody
   * could see them any more would be a hard delete arrived at sideways.
   */
  it('stops counting a deleted candidate, and still refuses to delete their vacancy', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin, { title: 'Senior React Engineer' });
    const [slot] = await firstSlots(app, vacancy.slug, 1);
    const { candidateId } = await book(vacancy, { email: 'jane@example.com', startUtc: slot });

    expect((await remove(admin, candidateId)).status).toBe(200);

    const listed = (await vacancies(admin)).body.vacancies[0];
    expect(listed.applicationCount).toBe(0);
    // The screen is told the rule rather than inferring it from the count beside it.
    expect(listed.deletable).toBe(false);

    const refused = await request(app.getHttpServer())
      .delete(`/api/organizations/${admin.organizationId}/hiring/vacancies/${vacancy.id}`)
      .set('Cookie', admin.cookies);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('has_applications');
  });

  /**
   * TC-H03-INT-20 — the row carries what the confirmation has to state.
   *
   * Two numbers, and they are deliberately different: the chips are the rollup — one per
   * criterion, latest interview wins — and the count is every assessment ever recorded,
   * which is what actually goes with the person.
   */
  it('reports every assessment on a row, not the one-per-criterion rollup', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const first = await createVacancy(app, admin, { title: 'Senior React Engineer' });
    const second = await createVacancy(app, admin, { title: 'DotNet Engineer' });
    const english = await createCriterion(app, admin, { name: 'English' });
    const slots = await firstSlots(app, first.slug, 2);

    const one = await book(first, { email: 'jane@example.com', startUtc: slots[0] });
    const two = await book(second, { email: 'jane@example.com', startUtc: slots[1] });

    const assess = (applicationId: string, label: string) =>
      request(app.getHttpServer())
        .put(
          `/api/organizations/${admin.organizationId}/hiring/applications/${applicationId}/criteria/${english.id}`,
        )
        .set('Cookie', admin.cookies)
        .send({ valueId: english.values.find((value) => value.label === label)!.id })
        .expect(200);

    await assess(one.applicationId, 'A2');
    await assess(two.applicationId, 'B1');

    const row = (await list(admin)).body.candidates[0];
    expect(row.applicationCount).toBe(2);
    // One chip, because the rollup answers "what is their English"…
    expect(row.criteria).toHaveLength(1);
    // …and two assessments, because that is how much record goes with them.
    expect(row.assessmentCount).toBe(2);
  });
});
