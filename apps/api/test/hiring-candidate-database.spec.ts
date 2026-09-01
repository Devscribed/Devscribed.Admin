import { INestApplication } from '@nestjs/common';
import { CANDIDATE_MESSAGES, CANDIDATE_PAGE_SIZE_MAX } from '@devscribed/validation';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { StubCalendarProvider } from './stub-calendar.provider';
import {
  addMember,
  bookInterview,
  bookedApplication,
  bootHiringApp,
  createCategory,
  createCriterion,
  createVacancy,
  firstSlots,
  resetDatabase,
  setRole,
  signInAs,
  signup,
  type SeededCriterion,
  type SeededVacancy,
  type Signed,
} from './hiring.helpers';

/**
 * The candidate database (spec 03): one row per **person**, filtered by the two
 * libraries the previous phases built.
 *
 * Its headline query is what everything else here serves — *everyone who applied to a
 * React position whose English is at least B1* — and the three rules that make it work
 * are what these cases pin down: filters AND across kinds and OR within one, a
 * criterion's value is the assessment from the candidate's **latest** interview
 * whichever vacancy it was recorded against, and absence is never a value.
 */
describe('Hiring — candidate database', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let calendar: StubCalendarProvider;

  /** Repeatable parameters are sent as arrays, exactly as the browser serialises them. */
  const list = (session: Signed, query: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/candidates`)
      .query(query)
      .set('Cookie', session.cookies);

  const assess = (session: Signed, applicationId: string, criterionId: string, body: object) =>
    request(app.getHttpServer())
      .put(
        `/api/organizations/${session.organizationId}/hiring/applications/${applicationId}/criteria/${criterionId}`,
      )
      .set('Cookie', session.cookies)
      .send(body);

  /** Books one interview and hands back the ids the assessments are addressed by. */
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
    });
    return { candidateId: application.candidateId, applicationId: application.id };
  }

  /** The value row of a scale, by label — filters name the id, tests name the level. */
  const valueId = (criterion: SeededCriterion, label: string): string =>
    criterion.values.find((value) => value.label === label)!.id;

  const emails = (response: { body: { candidates: Array<{ email: string }> } }): string[] =>
    response.body.candidates.map((candidate) => candidate.email).sort();

  /** The same addresses **as listed** — the only way to assert about an order. */
  const listed = (response: { body: { candidates: Array<{ email: string }> } }): string[] =>
    response.body.candidates.map((candidate) => candidate.email);

  /** As much of a row as the ordering cases read. */
  interface ListedRow {
    email: string;
    applicationCount: number;
    latestApplication: { id: string; vacancyTitle: string };
  }

  /**
   * Moves an interview to a fixed instant, which is the only way to test the `mine`
   * order: every slot the fake calendar offers is in the future by construction, and a
   * past interview is not something the booking endpoint will create.
   */
  async function moveTo(applicationId: string, start: Date, durationMinutes = 60): Promise<void> {
    await prisma.application.update({
      where: { id: applicationId },
      data: { start, end: new Date(start.getTime() + durationMinutes * 60_000) },
    });
  }

  /**
   * Fixes when a candidate was added, because `all`'s order reads it.
   *
   * Two bookings in a seeding loop are milliseconds apart and could land inside the same
   * tick, where the `id` tiebreak decides — correctly, and at random. A suite asserting
   * about the order has to state it rather than rely on how long an upload took.
   */
  async function addedAt(candidateId: string, createdAt: Date): Promise<void> {
    await prisma.candidate.update({ where: { id: candidateId }, data: { createdAt } });
  }

  const daysFromNow = (days: number): Date => new Date(Date.now() + days * 24 * 60 * 60_000);

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
   * One organization, two categorised vacancies, one scale, and a spread of English —
   * the fixture every filter case below narrows.
   *
   * Slots are taken **before** the first booking: the stub treats the interviews it has
   * created as busy, exactly as a real mailbox would, so a suite that asked for the next
   * free slot after each booking would be handed a moving target.
   */
  async function seedDatabase() {
    const admin = await signup(app, 'pat@acme.com');
    const react = await createCategory(app, admin, 'React');
    const dotnet = await createCategory(app, admin, 'DotNet');

    const reactVacancy = await createVacancy(app, admin, {
      title: 'Senior React Engineer',
      categoryIds: [react.id],
    });
    const dotnetVacancy = await createVacancy(app, admin, {
      title: 'DotNet Engineer',
      categoryIds: [dotnet.id],
    });
    const english = await createCriterion(app, admin, { name: 'English' });

    const slots = await firstSlots(app, reactVacancy.slug, 8);

    return { admin, react, dotnet, reactVacancy, dotnetVacancy, english, slots };
  }

  /**
   * TC-H03-INT-01 — the headline query.
   *
   * Both clauses must hold, and each is evaluated across all of the candidate's
   * applications. The candidate nobody assessed is the case that matters most: they are
   * absent under `at least B1` and would be absent under `at most B1` too.
   */
  it('returns only the candidates satisfying both the category and the criterion clause', async () => {
    const { admin, react, reactVacancy, dotnetVacancy, english, slots } = await seedDatabase();

    const jane = await book(reactVacancy, { email: 'jane@example.com', startUtc: slots[0] });
    const ivan = await book(reactVacancy, { email: 'ivan@example.com', startUtc: slots[1] });
    const tom = await book(dotnetVacancy, { email: 'tom@example.com', startUtc: slots[2] });
    // Applied to React, never assessed — absence is not a value (03 §04.18).
    await book(reactVacancy, { email: 'ann@example.com', startUtc: slots[3] });

    await assess(admin, jane.applicationId, english.id, { valueId: valueId(english, 'B2') });
    await assess(admin, ivan.applicationId, english.id, { valueId: valueId(english, 'A2') });
    await assess(admin, tom.applicationId, english.id, { valueId: valueId(english, 'C1') });

    const response = await list(admin, {
      categoryId: [react.id],
      criterion: [`${english.id}:gte:${valueId(english, 'B1')}`],
    });

    expect(response.status).toBe(200);
    // Jane alone: Ivan's English is below B1, Tom's vacancy is not React, Ann has no
    // assessment at all.
    expect(emails(response)).toEqual(['jane@example.com']);
    expect(response.body.matched).toBe(1);
    expect(response.body.total).toBe(4);
  });

  it('excludes an unassessed candidate under every operator, including the negative ones', async () => {
    const { admin, reactVacancy, english, slots } = await seedDatabase();
    await book(reactVacancy, { email: 'ann@example.com', startUtc: slots[0] });

    const b1 = valueId(english, 'B1');
    for (const operator of ['is', 'not', 'gte', 'lte']) {
      const response = await list(admin, { criterion: [`${english.id}:${operator}:${b1}`] });
      expect(response.status).toBe(200);
      expect(response.body.matched).toBe(0);
    }
  });

  /**
   * TC-H03-INT-02 — a cross-vacancy assessment still counts.
   *
   * This is the rollup's whole reason for existing: English assessed during a .NET
   * interview is still English when filtering React applicants (03 §04.17).
   */
  it('counts an assessment recorded on another vacancy’s application', async () => {
    const { admin, react, reactVacancy, dotnetVacancy, english, slots } = await seedDatabase();

    // One person, two applications. The English assessment lives only on the .NET one.
    const dotnetApplication = await book(dotnetVacancy, {
      email: 'sam@example.com',
      startUtc: slots[0],
    });
    await book(reactVacancy, { email: 'sam@example.com', startUtc: slots[1] });
    await assess(admin, dotnetApplication.applicationId, english.id, {
      valueId: valueId(english, 'B2'),
    });

    const response = await list(admin, {
      categoryId: [react.id],
      criterion: [`${english.id}:gte:${valueId(english, 'B1')}`],
    });

    expect(response.status).toBe(200);
    expect(emails(response)).toEqual(['sam@example.com']);
  });

  it('takes the assessment from the most recent interview when two disagree', async () => {
    const { admin, reactVacancy, dotnetVacancy, english, slots } = await seedDatabase();

    // `slots` is ascending, so the .NET interview is the later of the two.
    const earlier = await book(reactVacancy, { email: 'sam@example.com', startUtc: slots[0] });
    const later = await book(dotnetVacancy, { email: 'sam@example.com', startUtc: slots[1] });
    await assess(admin, earlier.applicationId, english.id, { valueId: valueId(english, 'A2') });
    await assess(admin, later.applicationId, english.id, { valueId: valueId(english, 'B2') });

    const atLeastB1 = { criterion: [`${english.id}:gte:${valueId(english, 'B1')}`] };
    expect((await list(admin, atLeastB1)).body.matched).toBe(1);

    // Correcting the later interview downwards moves the candidate out of the result —
    // it is the later assessment that speaks for them, not the better one.
    await assess(admin, later.applicationId, english.id, { valueId: valueId(english, 'A1') });
    expect((await list(admin, atLeastB1)).body.matched).toBe(0);
  });

  /**
   * TC-H03-INT-03 — one row per candidate, regardless of how many times they applied.
   */
  it('returns a candidate once, with their application count and latest application', async () => {
    const { admin, reactVacancy, dotnetVacancy, slots } = await seedDatabase();
    const third = await createVacancy(app, admin, { title: 'Platform Engineer' });

    await book(reactVacancy, { email: 'sam@example.com', startUtc: slots[0] });
    await book(dotnetVacancy, { email: 'sam@example.com', startUtc: slots[1] });
    // The most recent interview, and to a vacancy neither filter names.
    await book(third, { email: 'sam@example.com', startUtc: slots[2] });

    const response = await list(admin, { vacancyId: [reactVacancy.id, dotnetVacancy.id] });

    expect(response.status).toBe(200);
    expect(response.body.candidates).toHaveLength(1);

    const [candidate] = response.body.candidates;
    expect(candidate.applicationCount).toBe(3);
    // The latest of **all** their applications, not the latest of the matching ones: the
    // row answers "where are they up to", which the filter does not narrow (03 §01.2).
    expect(candidate.latestApplication).toMatchObject({
      vacancyTitle: 'Platform Engineer',
      startUtc: slots[2],
      status: 'scheduled',
    });
  });

  it('deduplicates the categories of every vacancy the candidate applied to', async () => {
    const { admin, react, reactVacancy, slots } = await seedDatabase();
    const second = await createVacancy(app, admin, {
      title: 'React Native Engineer',
      categoryIds: [react.id],
    });

    await book(reactVacancy, { email: 'sam@example.com', startUtc: slots[0] });
    await book(second, { email: 'sam@example.com', startUtc: slots[1] });

    const response = await list(admin);

    expect(response.body.candidates[0].categories).toEqual([{ id: react.id, name: 'React' }]);
  });

  it('ORs the ids within one multi-select and ANDs across two kinds', async () => {
    const { admin, react, dotnet, reactVacancy, dotnetVacancy, slots } = await seedDatabase();
    const senior = await createCategory(app, admin, 'Senior');
    const seniorReact = await createVacancy(app, admin, {
      title: 'Staff React Engineer',
      categoryIds: [react.id, senior.id],
    });

    await book(reactVacancy, { email: 'jane@example.com', startUtc: slots[0] });
    await book(dotnetVacancy, { email: 'ivan@example.com', startUtc: slots[1] });
    await book(seniorReact, { email: 'tom@example.com', startUtc: slots[2] });

    // OR within: either vacancy will do.
    const either = await list(admin, { vacancyId: [reactVacancy.id, dotnetVacancy.id] });
    expect(emails(either)).toEqual(['ivan@example.com', 'jane@example.com']);

    // OR within, again: `React` matches Jane and Tom, `Senior` matches Tom — two ids in
    // one multi-select widen the result, they never narrow it.
    const eitherCategory = await list(admin, { categoryId: [react.id, senior.id] });
    expect(emails(eitherCategory)).toEqual(['jane@example.com', 'tom@example.com']);
    expect(eitherCategory.body.total).toBe(3);

    // AND across kinds: the Senior category **and** that one position, which is Tom.
    const both = await list(admin, {
      categoryId: [senior.id],
      vacancyId: [seniorReact.id],
    });
    expect(emails(both)).toEqual(['tom@example.com']);
    expect((await list(admin, { categoryId: [dotnet.id] })).body.matched).toBe(1);
  });

  it('matches a category clause and a position clause satisfied by two different applications', async () => {
    const { admin, react, reactVacancy, dotnetVacancy, slots } = await seedDatabase();

    // The React application is to one vacancy, the named position is another: the row is
    // the person, so both clauses hold across the two (03 §03.12).
    await book(reactVacancy, { email: 'sam@example.com', startUtc: slots[0] });
    await book(dotnetVacancy, { email: 'sam@example.com', startUtc: slots[1] });

    const response = await list(admin, {
      vacancyId: [dotnetVacancy.id],
      categoryId: [react.id],
    });

    expect(emails(response)).toEqual(['sam@example.com']);
  });

  /**
   * TC-H03-INT-04 — renaming a scale value does not change what a filter matches.
   *
   * Comparison is by position, never by label (06 §03.15), and this is the case that
   * would notice if a query were ever written against the label instead.
   */
  it('returns the same candidates after a scale value is renamed', async () => {
    const { admin, reactVacancy, english, slots } = await seedDatabase();

    const jane = await book(reactVacancy, { email: 'jane@example.com', startUtc: slots[0] });
    const ivan = await book(reactVacancy, { email: 'ivan@example.com', startUtc: slots[1] });
    await assess(admin, jane.applicationId, english.id, { valueId: valueId(english, 'B2') });
    await assess(admin, ivan.applicationId, english.id, { valueId: valueId(english, 'A2') });

    const atLeastB1 = { criterion: [`${english.id}:gte:${valueId(english, 'B1')}`] };
    const before = await list(admin, atLeastB1);
    expect(emails(before)).toEqual(['jane@example.com']);

    const renamed = await request(app.getHttpServer())
      .patch(`/api/organizations/${admin.organizationId}/hiring/criteria/${english.id}`)
      .set('Cookie', admin.cookies)
      .send({
        values: english.values.map((value) => ({
          id: value.id,
          label: value.label === 'B1' ? 'B1 (intermediate)' : value.label,
        })),
      });
    expect(renamed.status).toBe(200);

    // The same request, by the same value id, answering the same people.
    expect(emails(await list(admin, atLeastB1))).toEqual(emails(before));
  });

  /**
   * TC-H03-INT-05 — an invalid filter is rejected, not ignored.
   *
   * Both halves matter for the same reason: a query that dropped what it could not
   * evaluate would return more people than the chips on screen claim to allow.
   */
  it('refuses an operator the criterion’s type does not support', async () => {
    const { admin } = await seedDatabase();
    const late = await createCriterion(app, admin, {
      name: 'Late hours availability',
      type: 'boolean',
    });

    const response = await list(admin, { criterion: [`${late.id}:gte:true`] });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: 'invalid_filter',
      message: CANDIDATE_MESSAGES.invalidFilter,
    });
  });

  it('refuses an id from another organization rather than dropping it', async () => {
    const { admin } = await seedDatabase();

    const other = await signup(app, 'sam@other.com', 'Other Ltd');
    const theirCategory = await createCategory(app, other, 'Their Category');
    const theirVacancy = await createVacancy(app, other, { title: 'Their Vacancy' });
    const theirCriterion = await createCriterion(app, other, { name: 'Their Criterion' });

    for (const query of [
      { vacancyId: [theirVacancy.id] },
      { categoryId: [theirCategory.id] },
      { criterion: [`${theirCriterion.id}:is:${theirCriterion.values[0].id}`] },
    ]) {
      const response = await list(admin, query);
      expect(response.status).toBe(422);
      expect(response.body.error).toBe('invalid_filter');
    }
  });

  it('refuses a malformed triple and a scale value from another scale', async () => {
    const { admin, english } = await seedDatabase();
    const other = await createCriterion(app, admin, { name: 'German' });

    for (const criterion of [
      english.id,
      `${english.id}:between:${valueId(english, 'B1')}`,
      // A real value id, and a real criterion, but not one of *its* values.
      `${english.id}:is:${other.values[0].id}`,
    ]) {
      expect((await list(admin, { criterion: [criterion] })).status).toBe(422);
    }
  });

  /**
   * TC-H03-INT-06 — a `viewer` and an unassigned `user` receive 404.
   *
   * 403 is never returned here (03 §API). The assigned interviewer is **no longer**
   * among the refused: their own candidates are what the `mine` scope is, and the case
   * below this one is where that access is pinned down. What survives unchanged is the
   * refusal for everyone with no route to the screen at all.
   */
  it('answers 404 to a viewer and to a user nobody has assigned anything', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const unassigned = await addMember(prisma, admin.organizationId, {
      email: 'quinn@acme.com',
      role: 'user',
    });
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    await book(vacancy, { email: 'jane@example.com', startUtc });

    const quinn = await signInAs(app, {
      email: 'quinn@acme.com',
      accountId: unassigned.accountId,
      organizationId: admin.organizationId,
    });
    const refused = await list(quinn);
    expect(refused.status).toBe(404);
    expect(JSON.stringify(refused.body)).not.toContain('jane@example.com');

    // A `viewer` may not even hold an assignment, so no arrangement of rows earns it.
    await setRole(prisma, admin.accountId, 'viewer');
    expect((await list(admin)).status).toBe(404);
  });

  /* ---------------------------------------------------------------- *
   * Scope — the former My interviews, as a tab
   * ---------------------------------------------------------------- */

  /**
   * One admin, one interviewer, and a candidate each — plus a candidate who has sat with
   * both, who is the only row that can tell a scope clause from a candidate filter.
   */
  async function seedScopes() {
    const admin = await signup(app, 'pat@acme.com');
    const member = await addMember(prisma, admin.organizationId, {
      email: 'ines@acme.com',
      role: 'user',
      firstName: 'Ines',
      lastName: 'Interviewer',
    });

    const theirs = await createVacancy(app, admin, {
      title: 'Node Engineer',
      interviewerAccountId: member.accountId,
    });
    const ours = await createVacancy(app, admin, { title: 'React Engineer' });

    const [theirFirst, theirSecond] = await firstSlots(app, theirs.slug, 2);
    const [ourFirst, ourSecond] = await firstSlots(app, ours.slug, 2);

    await book(theirs, { email: 'ann@example.com', lastName: 'Lee', startUtc: theirFirst });
    await book(ours, { email: 'jane@example.com', lastName: 'Doe', startUtc: ourFirst });
    // Seen by both, which is what makes `mine` a filter on people rather than on rows.
    await book(theirs, { email: 'both@example.com', lastName: 'Both', startUtc: theirSecond });
    await book(ours, { email: 'both@example.com', lastName: 'Both', startUtc: ourSecond });

    const interviewer = await signInAs(app, {
      email: 'ines@acme.com',
      accountId: member.accountId,
      organizationId: admin.organizationId,
    });

    return { admin, interviewer, theirs, ours };
  }

  it('gives an assigned interviewer the screen, narrowed to their own candidates', async () => {
    const { interviewer } = await seedScopes();

    const response = await list(interviewer);

    expect(response.status).toBe(200);
    expect(emails(response)).toEqual(['ann@example.com', 'both@example.com']);
    // The vacancy they do not interview for is absent, not merely unlisted.
    expect(JSON.stringify(response.body)).not.toContain('jane@example.com');
    expect(response.body.canSeeAll).toBe(false);
    expect(response.body.scope).toBe('mine');
  });

  it('narrows a caller who may not see everything, however they ask', async () => {
    const { interviewer } = await seedScopes();

    // The one rule the client never enforces: hand-crafting the query widens nothing,
    // and the response reports what was **applied** rather than what was requested.
    const response = await list(interviewer, { scope: 'all' });

    expect(response.status).toBe(200);
    expect(response.body.scope).toBe('mine');
    expect(emails(response)).toEqual(['ann@example.com', 'both@example.com']);
  });

  it('never tells an interviewer how large the database is under their filters', async () => {
    const { interviewer } = await seedScopes();

    const response = await list(interviewer);

    // `all` is not computed for them at all — the leak is closed by not asking the
    // question, rather than by dropping the answer on the way out.
    expect(response.body.scopeCounts).toEqual({ mine: 2 });
    expect(response.body.scopeCounts.all).toBeUndefined();
  });

  it('keeps the empty-database state a fact about the organization, not about a scope', async () => {
    const { admin, interviewer } = await seedScopes();

    // An interviewer with two candidates and a database of three still reads "3" for
    // total: a scoped total would tell somebody with no interviews to go and share a
    // booking link while the list they cannot see is full.
    expect((await list(interviewer)).body.total).toBe(3);
    expect((await list(admin, { scope: 'mine' })).body.total).toBe(3);
  });

  it('answers a manager with both scopes, each counted under the filters applied', async () => {
    const { admin, ours } = await seedScopes();

    const all = await list(admin);
    expect(all.body.canSeeAll).toBe(true);
    expect(all.body.scope).toBe('all');
    expect(emails(all)).toEqual(['ann@example.com', 'both@example.com', 'jane@example.com']);
    // The admin interviews for `ours`, which two of the three candidates booked.
    expect(all.body.scopeCounts).toEqual({ all: 3, mine: 2 });
    expect(all.body.matched).toBe(3);

    // A filter narrows both counts, so the tab labels answer "and how many would the
    // other tab show under this filter?" before it is pressed.
    const filtered = await list(admin, { vacancyId: [ours.id] });
    expect(filtered.body.scopeCounts).toEqual({ all: 2, mine: 2 });

    const mine = await list(admin, { scope: 'mine' });
    expect(mine.body.scope).toBe('mine');
    expect(emails(mine)).toEqual(['both@example.com', 'jane@example.com']);
    // `matched` is the applied scope's own count, so the number and the lit tab agree.
    expect(mine.body.matched).toBe(2);
  });

  it('composes the scope with the filters rather than replacing them', async () => {
    const { interviewer, ours } = await seedScopes();

    // `both@example.com` applied to `ours` too, so the position filter finds them — and
    // the scope still keeps `jane`, who never sat with this interviewer, out.
    const response = await list(interviewer, { vacancyId: [ours.id] });

    expect(emails(response)).toEqual(['both@example.com']);
    expect(response.body.matched).toBe(1);
  });

  it('treats an unrecognised scope as the whole list rather than refusing it', async () => {
    const { admin } = await seedScopes();

    // Navigation, not a filter: nothing is looked up to satisfy it, so a stale bookmark
    // lands on the list rather than on the 422 an unknown id would earn.
    const response = await list(admin, { scope: 'theirs' });

    expect(response.status).toBe(200);
    expect(response.body.scope).toBe('all');
  });

  it('reads the mine scope in the viewer’s own mailbox zone', async () => {
    const { interviewer } = await seedScopes();

    // What My interviews did, kept: an interviewer with no `Account.timezone` must not
    // be handed some other interviewer's zone by the move onto this screen.
    expect((await list(interviewer)).body.viewerTimeZone).toBe('UTC');

    await prisma.account.update({
      where: { id: interviewer.accountId },
      data: { timezone: 'Europe/Minsk' },
    });
    expect((await list(interviewer)).body.viewerTimeZone).toBe('Europe/Minsk');
  });

  /* ---------------------------------------------------------------- *
   * Ordering — two questions, two orders
   * ---------------------------------------------------------------- */

  /**
   * TC-H03-INT-10 — `All` puts the people still in play on top.
   *
   * *Who do I know?* is answered by the pipeline first and the archive second, so a
   * `scheduled` application floats a candidate above everyone whose interviews have all
   * been dispositioned — newest added first inside each group, which is the order the
   * whole list used to read in (03 §08.42).
   */
  it('lists everyone with a scheduled application first, newest added first within each group', async () => {
    const { admin, reactVacancy, slots } = await seedDatabase();

    const first = await book(reactVacancy, { email: 'first@example.com', startUtc: slots[0] });
    const second = await book(reactVacancy, { email: 'second@example.com', startUtc: slots[1] });
    const third = await book(reactVacancy, { email: 'third@example.com', startUtc: slots[2] });
    const fourth = await book(reactVacancy, { email: 'fourth@example.com', startUtc: slots[3] });

    for (const [index, candidate] of [first, second, third, fourth].entries()) {
      await addedAt(candidate.candidateId, daysFromNow(-10 + index));
    }

    // Two of them have been moved off the board's first column, so their interview is no
    // longer ahead of anybody — whichever way it went.
    await prisma.application.update({
      where: { id: second.applicationId },
      data: { status: 'passed' },
    });
    await prisma.application.update({
      where: { id: fourth.applicationId },
      data: { status: 'didnt_pass' },
    });

    const response = await list(admin);

    expect(listed(response)).toEqual([
      // Still scheduled, newest added of the two first.
      'third@example.com',
      'first@example.com',
      // Dispositioned, and in the same order among themselves.
      'fourth@example.com',
      'second@example.com',
    ]);
  });

  /**
   * A cancelled interview is still scheduled, because `isCancelled` says the interview
   * did not take place and deliberately nothing about the candidate's standing
   * (07 §01.1). An order that read it would make exactly the claim the flag refuses to.
   */
  it('keeps a candidate whose interview was cancelled in the scheduled group', async () => {
    const { admin, reactVacancy, slots } = await seedDatabase();

    const cancelled = await book(reactVacancy, { email: 'cancelled@example.com', startUtc: slots[0] });
    const passed = await book(reactVacancy, { email: 'passed@example.com', startUtc: slots[1] });

    await addedAt(cancelled.candidateId, daysFromNow(-10));
    // Added later, so only the grouping can put them second.
    await addedAt(passed.candidateId, daysFromNow(-1));

    await prisma.application.update({
      where: { id: cancelled.applicationId },
      data: { isCancelled: true },
    });
    await prisma.application.update({
      where: { id: passed.applicationId },
      data: { status: 'passed' },
    });

    expect(listed(await list(admin))).toEqual(['cancelled@example.com', 'passed@example.com']);
  });

  it('cuts a page across the boundary between the two groups without repeating a row', async () => {
    const { admin, reactVacancy, slots } = await seedDatabase();

    const booked: Array<{ candidateId: string; applicationId: string }> = [];
    for (const [index, name] of ['a', 'b', 'c', 'd'].entries()) {
      booked.push(await book(reactVacancy, { email: `${name}@example.com`, startUtc: slots[index] }));
      await addedAt(booked[index].candidateId, daysFromNow(-10 + index));
    }

    // Only `d`, the newest, is still scheduled — so the boundary between the two groups
    // falls one row into a page, which is the arrangement a single query never had to get
    // right and this one is cut across.
    for (const candidate of booked.slice(0, 3)) {
      await prisma.application.update({
        where: { id: candidate.applicationId },
        data: { status: 'maybe' },
      });
    }

    const first = await list(admin, { page: 1, pageSize: 3 });
    const second = await list(admin, { page: 2, pageSize: 3 });

    expect(listed(first)).toEqual(['d@example.com', 'c@example.com', 'b@example.com']);
    expect(listed(second)).toEqual(['a@example.com']);
  });

  /**
   * TC-H03-INT-11 — `Assigned to me` answers *what is next for me?*
   *
   * The order the standalone My interviews screen had (03 §06.28), folded onto people:
   * the nearest interview ahead on top, then everyone else by their most recent one
   * behind. It is the whole of what the two groups carried, and the reason they did not
   * need to survive as groups.
   */
  it('orders the mine scope by the nearest interview ahead, then by the most recent behind', async () => {
    const { admin, reactVacancy, slots } = await seedDatabase();

    const soon = await book(reactVacancy, { email: 'soon@example.com', startUtc: slots[0] });
    const later = await book(reactVacancy, { email: 'later@example.com', startUtc: slots[1] });
    const yesterday = await book(reactVacancy, { email: 'yesterday@example.com', startUtc: slots[2] });
    const lastMonth = await book(reactVacancy, { email: 'lastmonth@example.com', startUtc: slots[3] });

    // Added in the order they are named, so `all` would read them backwards.
    for (const [index, candidate] of [soon, later, yesterday, lastMonth].entries()) {
      await addedAt(candidate.candidateId, daysFromNow(-10 + index));
    }

    await moveTo(soon.applicationId, daysFromNow(1));
    await moveTo(later.applicationId, daysFromNow(5));
    await moveTo(yesterday.applicationId, daysFromNow(-1));
    await moveTo(lastMonth.applicationId, daysFromNow(-30));

    // The admin interviews for this vacancy, so `mine` is available to them too and shows
    // their own assigned interviews (03 §06.30).
    expect(listed(await list(admin, { scope: 'mine' }))).toEqual([
      'soon@example.com',
      'later@example.com',
      'yesterday@example.com',
      'lastmonth@example.com',
    ]);

    // The same four on the other tab, in the other order — two questions, two answers,
    // not one order with a filter in front of it.
    expect(listed(await list(admin))).toEqual([
      'lastmonth@example.com',
      'yesterday@example.com',
      'later@example.com',
      'soon@example.com',
    ]);

    // And cut in two: the boundary falls in one place, so nothing is repeated across it
    // and nothing is dropped through it.
    const first = await list(admin, { scope: 'mine', page: 1, pageSize: 2 });
    const second = await list(admin, { scope: 'mine', page: 2, pageSize: 2 });
    expect(listed(first)).toEqual(['soon@example.com', 'later@example.com']);
    expect(listed(second)).toEqual(['yesterday@example.com', 'lastmonth@example.com']);
  });

  /**
   * 03 §08.44 — the row speaks about the interview that placed it.
   *
   * Which is a different application from `all`'s, twice over: it is the viewer's own,
   * and among those it is the *nearest ahead* rather than the latest. A row sorted by
   * Tuesday and printed with next month's date is the one way this screen could
   * contradict itself.
   */
  it('speaks about the viewer’s own next interview rather than the candidate’s latest', async () => {
    const { admin, interviewer, theirs, ours } = await seedScopes();

    // One person, two interviewers. The one the viewer holds is the sooner of the two,
    // which is what makes the other one the candidate's *latest* application.
    const withThem = await book(theirs, {
      email: 'sam@example.com',
      startUtc: (await firstSlots(app, theirs.slug, 1))[0],
    });
    const withUs = await book(ours, {
      email: 'sam@example.com',
      startUtc: (await firstSlots(app, ours.slug, 1))[0],
    });
    await moveTo(withThem.applicationId, daysFromNow(2));
    await moveTo(withUs.applicationId, daysFromNow(30));

    const sam = (rows: ListedRow[]): ListedRow =>
      rows.find((candidate) => candidate.email === 'sam@example.com')!;

    const mine = sam((await list(interviewer)).body.candidates);
    expect(mine.latestApplication).toMatchObject({
      id: withThem.applicationId,
      vacancyTitle: theirs.title,
    });
    // Their whole history is still read: the scope narrows who is listed, not what the
    // row says about them.
    expect(mine.applicationCount).toBe(2);

    // The same person on the other tab, spoken about by their most recent application —
    // whoever is interviewing it.
    const all = sam((await list(admin)).body.candidates);
    expect(all.latestApplication).toMatchObject({
      id: withUs.applicationId,
      vacancyTitle: ours.title,
    });
  });

  it('places a candidate by their past interview when the viewer has none ahead of them', async () => {
    const { interviewer, theirs, ours } = await seedScopes();

    const withThem = await book(theirs, {
      email: 'sam@example.com',
      startUtc: (await firstSlots(app, theirs.slug, 1))[0],
    });
    const withUs = await book(ours, {
      email: 'sam@example.com',
      startUtc: (await firstSlots(app, ours.slug, 1))[0],
    });

    await moveTo(withThem.applicationId, daysFromNow(-3));
    // Ahead, but not the viewer's — an interview they have nothing to do with must not
    // lift the row into the group of people they are about to see.
    await moveTo(withUs.applicationId, daysFromNow(10));

    const rows: Array<{ email: string; latestApplication: { id: string } }> = (
      await list(interviewer)
    ).body.candidates;

    // `ann` and `both` still hold interviews ahead with this interviewer, so Sam is last.
    expect(rows[rows.length - 1].email).toBe('sam@example.com');
    expect(rows[rows.length - 1].latestApplication.id).toBe(withThem.applicationId);
  });

  /* ---------------------------------------------------------------- *
   * Search, counts and paging
   * ---------------------------------------------------------------- */

  it('searches name and email, and nothing else', async () => {
    const { admin, reactVacancy, slots } = await seedDatabase();
    await book(reactVacancy, {
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      startUtc: slots[0],
    });
    await book(reactVacancy, {
      email: 'ivan@elsewhere.com',
      firstName: 'Ivan',
      lastName: 'Petrov',
      startUtc: slots[1],
    });

    expect(emails(await list(admin, { search: 'jane' }))).toEqual(['jane@example.com']);
    expect(emails(await list(admin, { search: 'petrov' }))).toEqual(['ivan@elsewhere.com']);
    expect(emails(await list(admin, { search: 'elsewhere.com' }))).toEqual(['ivan@elsewhere.com']);
    // A full name spans two columns, and both terms have to land somewhere.
    expect(emails(await list(admin, { search: 'jane doe' }))).toEqual(['jane@example.com']);
    // The vacancy title is not searched — that is what the position filter is for.
    expect((await list(admin, { search: 'Senior React' })).body.matched).toBe(0);
  });

  it('composes search with the filters, and reports both counts', async () => {
    const { admin, react, reactVacancy, dotnetVacancy, slots } = await seedDatabase();
    await book(reactVacancy, { email: 'jane@example.com', firstName: 'Jane', startUtc: slots[0] });
    await book(dotnetVacancy, { email: 'jane.two@example.com', firstName: 'Jane', startUtc: slots[1] });
    await book(reactVacancy, { email: 'ivan@example.com', firstName: 'Ivan', startUtc: slots[2] });

    const response = await list(admin, { search: 'jane', categoryId: [react.id] });

    expect(emails(response)).toEqual(['jane@example.com']);
    expect(response.body.matched).toBe(1);
    // The unfiltered count is unaffected by either — it is what "of 128" means.
    expect(response.body.total).toBe(3);
  });

  it('pages the result while preserving the search and the filters', async () => {
    const { admin, react, reactVacancy, slots } = await seedDatabase();
    for (const [index, email] of ['a@example.com', 'b@example.com', 'c@example.com'].entries()) {
      await book(reactVacancy, { email, firstName: 'Jane', startUtc: slots[index] });
    }

    const first = await list(admin, {
      search: 'jane',
      categoryId: [react.id],
      page: 1,
      pageSize: 2,
    });
    const second = await list(admin, {
      search: 'jane',
      categoryId: [react.id],
      page: 2,
      pageSize: 2,
    });

    expect(first.body.candidates).toHaveLength(2);
    expect(second.body.candidates).toHaveLength(1);
    // The count is of everything that matched, not of what this page holds.
    expect([first.body.matched, second.body.matched]).toEqual([3, 3]);
    // And no candidate appears on both pages.
    expect(new Set([...emails(first), ...emails(second)]).size).toBe(3);
  });

  it('orders most recently added first within a group, and clamps an oversized page size', async () => {
    const { admin, reactVacancy, slots } = await seedDatabase();
    await book(reactVacancy, { email: 'first@example.com', startUtc: slots[0] });
    await book(reactVacancy, { email: 'second@example.com', startUtc: slots[1] });

    const response = await list(admin, { pageSize: 500 });

    // Both are still scheduled, so the split above them decides nothing and what is left
    // is the order the whole list used to read in.
    expect(listed(response)).toEqual(['second@example.com', 'first@example.com']);
    expect(response.body.pageSize).toBe(CANDIDATE_PAGE_SIZE_MAX);
  });

  it('answers an empty database with a count of zero rather than an error', async () => {
    const admin = await signup(app, 'pat@acme.com');

    const response = await list(admin);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 0, matched: 0, candidates: [] });
  });

  it('names the viewing member’s zone, falling back to the first interviewer’s mailbox', async () => {
    const { admin, reactVacancy, slots } = await seedDatabase();
    await book(reactVacancy, { email: 'jane@example.com', startUtc: slots[0] });

    // These accounts are created without a zone; the stub mailbox reports UTC.
    expect((await list(admin)).body.viewerTimeZone).toBe('UTC');

    await prisma.account.update({
      where: { id: admin.accountId },
      data: { timezone: 'Europe/Minsk' },
    });
    expect((await list(admin)).body.viewerTimeZone).toBe('Europe/Minsk');
  });

  it('never returns a candidate from another organization', async () => {
    const { admin, reactVacancy, slots } = await seedDatabase();
    await book(reactVacancy, { email: 'jane@example.com', startUtc: slots[0] });

    const other = await signup(app, 'sam@other.com', 'Other Ltd');
    const theirVacancy = await createVacancy(app, other, { title: 'Their Vacancy' });
    const theirSlots = await firstSlots(app, theirVacancy.slug, 1);
    await book(theirVacancy, { email: 'theirs@example.com', startUtc: theirSlots[0] });

    expect(emails(await list(admin))).toEqual(['jane@example.com']);
    expect(emails(await list(other))).toEqual(['theirs@example.com']);
    expect((await list(admin)).body.total).toBe(1);
  });
});
