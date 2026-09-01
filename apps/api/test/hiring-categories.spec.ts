import { INestApplication } from '@nestjs/common';
import { LIBRARY_MESSAGES } from '@devscribed/validation';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { StubCalendarProvider } from './stub-calendar.provider';
import {
  addMember,
  bookInterview,
  bootHiringApp,
  createCategory,
  createVacancy,
  firstSlot,
  resetDatabase,
  signInAs,
  signup,
  type Signed,
} from './hiring.helpers';

/**
 * The category library (hiring 06 §01 §02) and the vacancy field it feeds (01 §01).
 *
 * Everything here turns on one rule: names are unique per organization,
 * case-insensitively. It is what stops `react` joining `React` and quietly halving
 * every future filter's results — and, because there is no merge in this release, it is
 * also the rule that makes a duplicate already in the library permanent.
 */
describe('Hiring — categories', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let calendar: StubCalendarProvider;

  const list = (session: Signed) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/categories`)
      .set('Cookie', session.cookies);

  const create = (session: Signed, body: object) =>
    request(app.getHttpServer())
      .post(`/api/organizations/${session.organizationId}/hiring/categories`)
      .set('Cookie', session.cookies)
      .send(body);

  const patch = (session: Signed, categoryId: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/api/organizations/${session.organizationId}/hiring/categories/${categoryId}`)
      .set('Cookie', session.cookies)
      .send(body);

  const remove = (session: Signed, categoryId: string) =>
    request(app.getHttpServer())
      .delete(`/api/organizations/${session.organizationId}/hiring/categories/${categoryId}`)
      .set('Cookie', session.cookies);

  const vacancy = (session: Signed, vacancyId: string) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/vacancies/${vacancyId}`)
      .set('Cookie', session.cookies);

  const patchVacancy = (session: Signed, vacancyId: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/api/organizations/${session.organizationId}/hiring/vacancies/${vacancyId}`)
      .set('Cookie', session.cookies)
      .send(body);

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
   * Uniqueness
   * ---------------------------------------------------------------- */

  /** TC-H06-INT-01 — a duplicate creation returns the existing id so inline callers recover. */
  it('refuses a case variant and hands back the category the member meant', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const react = await createCategory(app, admin, 'React');

    const response = await create(admin, { name: 'react' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('duplicate_name');
    expect(response.body.message).toBe('"react" already exists');
    // The whole point of answering 409 with a body: the vacancy dialog selects this id
    // rather than showing an error the member cannot act on (06 §01.3).
    expect(response.body.existing).toEqual({ id: react.id, name: 'React' });

    // And nothing was written — one `React`, not two.
    expect((await list(admin)).body.categories).toHaveLength(1);
  });

  it('refuses every other case variant, and the whitespace-padded form too', async () => {
    const admin = await signup(app, 'pat@acme.com');
    await createCategory(app, admin, 'React');

    for (const name of ['REACT', 'ReAcT', '  React  ']) {
      expect((await create(admin, { name })).status).toBe(409);
    }

    // A different name that merely starts the same is not a case variant.
    expect((await create(admin, { name: 'React Native' })).status).toBe(201);
    expect((await list(admin)).body.categories).toHaveLength(2);
  });

  it('scopes uniqueness to the organization — two teams may both have React', async () => {
    const acme = await signup(app, 'pat@acme.com');
    const other = await signup(app, 'sam@other.com', 'Other Ltd');

    expect((await create(acme, { name: 'React' })).status).toBe(201);
    expect((await create(other, { name: 'React' })).status).toBe(201);

    expect((await list(acme)).body.categories).toHaveLength(1);
    expect((await list(other)).body.categories).toHaveLength(1);
  });

  it('stores the name exactly as typed, folding case only to compare', async () => {
    const admin = await signup(app, 'pat@acme.com');

    // `Asp.Net` rendered as `asp.net` on every screen would be a normalization leaking
    // out of the comparison it belongs to.
    const created = await create(admin, { name: '  Asp.Net  ' });
    expect(created.body.name).toBe('Asp.Net');
  });

  it('rejects a name that is blank or too long', async () => {
    const admin = await signup(app, 'pat@acme.com');

    const blank = await create(admin, { name: '   ' });
    expect(blank.status).toBe(422);
    expect(blank.body).toEqual({
      error: 'validation',
      fields: { name: LIBRARY_MESSAGES.name.required },
    });

    const long = await create(admin, { name: 'x'.repeat(51) });
    expect(long.status).toBe(422);
    expect(long.body.fields.name).toBe(LIBRARY_MESSAGES.name.tooLong);
  });

  /* ---------------------------------------------------------------- *
   * Rename
   * ---------------------------------------------------------------- */

  /** TC-H06-INT-02 — renaming propagates and never touches an assignment. */
  it('renames everywhere at once, without rewriting a single assignment row', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const category = await createCategory(app, admin, 'Reactjs');

    const vacancies = await Promise.all(
      ['One', 'Two', 'Three'].map((title) =>
        createVacancy(app, admin, { title, categoryIds: [category.id] }),
      ),
    );

    const before = await prisma.vacancyCategory.findMany({ where: { categoryId: category.id } });
    expect(before).toHaveLength(3);

    const renamed = await patch(admin, category.id, { name: 'React.js' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toEqual({
      id: category.id,
      name: 'React.js',
      vacancyCount: 3,
      vacancies: ['One', 'Three', 'Two'],
    });

    for (const seeded of vacancies) {
      const body = (await vacancy(admin, seeded.id)).body;
      expect(body.categories).toEqual([{ id: category.id, name: 'React.js' }]);
    }

    // The assignments reference the row, not the string, so the rename cost zero writes
    // here — the timestamps prove none of them was rewritten (06 §01.4).
    const after = await prisma.vacancyCategory.findMany({ where: { categoryId: category.id } });
    expect(after.map((row) => row.assignedAt.toISOString()).sort()).toEqual(
      before.map((row) => row.assignedAt.toISOString()).sort(),
    );
  });

  it('refuses a rename onto an existing name, and says what to do instead', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const react = await createCategory(app, admin, 'React');
    const reactjs = await createCategory(app, admin, 'ReactJS');

    const response = await patch(admin, reactjs.id, { name: 'react' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('duplicate_name');
    // There is no merge in this release, so the message names the only way out
    // (06 §01.5) rather than leaving the member to guess.
    expect(response.body.message).toBe('"react" already exists. Reassign and delete one instead.');
    expect(response.body.existing.id).toBe(react.id);
  });

  it('lets a category keep its own name, and change only its case', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const category = await createCategory(app, admin, 'react');

    // Correcting the case of an entry is not a collision with itself.
    const response = await patch(admin, category.id, { name: 'React' });
    expect(response.status).toBe(200);
    expect(response.body.name).toBe('React');
  });

  it('answers 404 for a category belonging to another organization', async () => {
    const acme = await signup(app, 'pat@acme.com');
    const other = await signup(app, 'sam@other.com', 'Other Ltd');
    const theirs = await createCategory(app, other, 'React');

    expect((await patch(acme, theirs.id, { name: 'Renamed' })).status).toBe(404);
    expect((await remove(acme, theirs.id)).status).toBe(404);
    // Untouched.
    expect((await list(other)).body.categories[0].name).toBe('React');
  });

  /* ---------------------------------------------------------------- *
   * Delete
   * ---------------------------------------------------------------- */

  /** TC-H06-INT-03 — deleting unassigns it and nothing else. */
  it('unassigns a deleted category from every vacancy and deletes nothing else', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const react = await createCategory(app, admin, 'React');
    const senior = await createCategory(app, admin, 'Senior');

    const withApplications = await createVacancy(app, admin, {
      title: 'Senior React Engineer',
      categoryIds: [react.id, senior.id],
    });
    const others = await Promise.all(
      ['Two', 'Three', 'Four'].map((title) =>
        createVacancy(app, admin, { title, categoryIds: [react.id] }),
      ),
    );

    const booked = await bookInterview(app, withApplications.slug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      startUtc: await firstSlot(app, withApplications.slug),
    });
    expect(booked.status).toBe(201);

    const response = await remove(admin, react.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, unassignedFrom: 4 });

    // Every vacancy survives, keeping the categories that were not deleted.
    const kept = (await vacancy(admin, withApplications.id)).body;
    expect(kept.categories).toEqual([{ id: senior.id, name: 'Senior' }]);
    expect(kept.applicationCount).toBe(1);

    for (const seeded of others) {
      expect((await vacancy(admin, seeded.id)).body.categories).toEqual([]);
    }

    // Deleting a label is not deleting a judgement: the interview record is untouched.
    expect(await prisma.application.count()).toBe(1);
    expect(await prisma.candidate.count()).toBe(1);
    expect(await prisma.vacancy.count()).toBe(4);
    expect((await list(admin)).body.categories).toEqual([
      { id: senior.id, name: 'Senior', vacancyCount: 1, vacancies: ['Senior React Engineer'] },
    ]);
  });

  it('deletes an unused category, reporting that it was assigned to nothing', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const category = await createCategory(app, admin, 'Unused');

    const response = await remove(admin, category.id);
    expect(response.body).toEqual({ success: true, unassignedFrom: 0 });
    expect((await list(admin)).body.categories).toEqual([]);
  });

  /* ---------------------------------------------------------------- *
   * Listing
   * ---------------------------------------------------------------- */

  it('lists the library with the usage count every delete decision needs', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const react = await createCategory(app, admin, 'React');
    const asp = await createCategory(app, admin, 'asp.net');
    const senior = await createCategory(app, admin, 'Senior');

    await createVacancy(app, admin, { title: 'One', categoryIds: [react.id, senior.id] });
    await createVacancy(app, admin, { title: 'Two', categoryIds: [react.id] });

    // Alphabetical regardless of case — Postgres's own collation would put every
    // capitalized name ahead of `asp.net`, which is not how anyone scans a list.
    expect((await list(admin)).body.categories).toEqual([
      { id: asp.id, name: 'asp.net', vacancyCount: 0, vacancies: [] },
      { id: react.id, name: 'React', vacancyCount: 2, vacancies: ['One', 'Two'] },
      { id: senior.id, name: 'Senior', vacancyCount: 1, vacancies: ['One'] },
    ]);
  });

  /* ---------------------------------------------------------------- *
   * The vacancy field — 01 §01
   * ---------------------------------------------------------------- */

  it('creates a category inline, in the same submit as the vacancy', async () => {
    const admin = await signup(app, 'pat@acme.com');

    const created = await request(app.getHttpServer())
      .post(`/api/organizations/${admin.organizationId}/hiring/vacancies`)
      .set('Cookie', admin.cookies)
      .send({
        title: 'Senior React Engineer',
        interviewerAccountId: admin.accountId,
        durationMinutes: 60,
        newCategoryNames: ['React', 'Full Stack'],
      });

    expect(created.status).toBe(201);
    expect(created.body.categories.map((c: { name: string }) => c.name)).toEqual([
      'Full Stack',
      'React',
    ]);
    // The library gained both — inline creation is creation, not a per-vacancy label.
    expect((await list(admin)).body.categories.map((c: { name: string }) => c.name)).toEqual([
      'Full Stack',
      'React',
    ]);
  });

  it('resolves an inline name that already exists rather than erroring on it', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const react = await createCategory(app, admin, 'React');

    const created = await request(app.getHttpServer())
      .post(`/api/organizations/${admin.organizationId}/hiring/vacancies`)
      .set('Cookie', admin.cookies)
      .send({
        title: 'Another React Role',
        interviewerAccountId: admin.accountId,
        durationMinutes: 60,
        // Typed `react`, meant `React`. A 409 here would be a dead end mid-form.
        newCategoryNames: ['react'],
      });

    expect(created.status).toBe(201);
    expect(created.body.categories).toEqual([{ id: react.id, name: 'React' }]);
    expect((await list(admin)).body.categories).toHaveLength(1);
  });

  it('collapses two spellings of one new name inside a single submit', async () => {
    const admin = await signup(app, 'pat@acme.com');

    const created = await request(app.getHttpServer())
      .post(`/api/organizations/${admin.organizationId}/hiring/vacancies`)
      .set('Cookie', admin.cookies)
      .send({
        title: 'Full Stack Engineer',
        interviewerAccountId: admin.accountId,
        durationMinutes: 60,
        newCategoryNames: ['Full Stack', 'full stack'],
      });

    expect(created.status).toBe(201);
    expect(created.body.categories).toEqual([
      { id: expect.any(String), name: 'Full Stack' },
    ]);
  });

  it('replaces the assignments on a PATCH, and leaves them alone when neither key is sent', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const react = await createCategory(app, admin, 'React');
    const senior = await createCategory(app, admin, 'Senior');
    const seeded = await createVacancy(app, admin, { categoryIds: [react.id] });

    // Absent means "leave them alone" — a rename must not clear the categories.
    const renamed = await patchVacancy(admin, seeded.id, { title: 'Renamed' });
    expect(renamed.body.categories).toEqual([{ id: react.id, name: 'React' }]);

    const replaced = await patchVacancy(admin, seeded.id, {
      categoryIds: [senior.id],
      newCategoryNames: ['Remote'],
    });
    expect(replaced.body.categories.map((c: { name: string }) => c.name)).toEqual([
      'Remote',
      'Senior',
    ]);

    // An empty array is a different instruction from an absent key: it clears them.
    const cleared = await patchVacancy(admin, seeded.id, { categoryIds: [] });
    expect(cleared.body.categories).toEqual([]);
    // …and clearing an assignment never deletes the category itself.
    expect((await list(admin)).body.categories).toHaveLength(3);
  });

  it("refuses another organization's category id rather than quietly dropping it", async () => {
    const acme = await signup(app, 'pat@acme.com');
    const other = await signup(app, 'sam@other.com', 'Other Ltd');
    const theirs = await createCategory(app, other, 'React');
    const seeded = await createVacancy(app, acme);

    const response = await patchVacancy(acme, seeded.id, { categoryIds: [theirs.id] });

    // Saving the vacancy with one fewer category than was asked for is the worse answer.
    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: 'validation',
      fields: { categoryIds: LIBRARY_MESSAGES.category.unknown },
    });
    expect((await vacancy(acme, seeded.id)).body.categories).toEqual([]);
  });

  /* ---------------------------------------------------------------- *
   * Never candidate-facing — 06 §02.12
   * ---------------------------------------------------------------- */

  it('keeps categories out of the invite the candidate receives', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const seeded = await createVacancy(app, admin, {
      title: 'Engineer',
      newCategoryNames: ['Underpaid', 'Junior'],
    });

    const booked = await bookInterview(app, seeded.slug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      startUtc: await firstSlot(app, seeded.slug),
    });
    expect(booked.status).toBe(201);

    // The event is what delivers the invite, and its body is identical for both parties
    // — so anything in it is candidate-facing (06 §02.12).
    const [event] = [...calendar.events.values()];
    expect(event.draft.body).not.toMatch(/Underpaid|Junior/);
    expect(event.draft.subject).not.toMatch(/Underpaid|Junior/);
  });

  it('keeps categories off the public booking page entirely', async () => {
    const admin = await signup(app, 'pat@acme.com');
    // Names that appear nowhere in the vacancy's own title, so finding one in the
    // response can only mean the categories leaked.
    const seeded = await createVacancy(app, admin, {
      title: 'Engineer',
      newCategoryNames: ['Underpaid', 'Junior'],
    });

    const response = await request(app.getHttpServer()).get(`/api/book/${seeded.slug}`);

    expect(response.status).toBe(200);
    // Not merely absent from a `categories` key — absent from the response, since
    // `Middle` or `Senior` on a public posting carries implications that are not ours
    // to publish on the team's behalf (06 §02.12).
    expect(JSON.stringify(response.body)).not.toMatch(/Underpaid|Junior/);
  });

  /* ---------------------------------------------------------------- *
   * Permissions — TC-H06-INT-08
   * ---------------------------------------------------------------- */

  /** TC-H06-INT-08 — `user` and `viewer` cannot reach the library, inline path included. */
  it.each(['user', 'viewer'])('refuses every library endpoint to a %s', async (role) => {
    const admin = await signup(app, 'pat@acme.com');
    const category = await createCategory(app, admin, 'React');
    // The `user` is an assigned interviewer, which is the closest anyone gets to
    // needing the library without being allowed it.
    const member = await addMember(prisma, admin.organizationId, {
      email: `${role}@acme.com`,
      role,
    });
    const session = await signInAs(app, {
      email: `${role}@acme.com`,
      accountId: member.accountId,
      organizationId: admin.organizationId,
    });

    const responses = [
      await list(session),
      await create(session, { name: 'Senior' }),
      await patch(session, category.id, { name: 'Renamed' }),
      await remove(session, category.id),
    ];

    for (const response of responses) {
      expect(response.status).toBe(403);
      // No library data leaks through the refusal.
      expect(JSON.stringify(response.body)).not.toMatch(/React/);
    }

    // The library is exactly as it was.
    expect((await list(admin)).body.categories).toEqual([
      { id: category.id, name: 'React', vacancyCount: 0, vacancies: [] },
    ]);
  });

  it('refuses the inline creation path to a user on the same grounds', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const seeded = await createVacancy(app, admin);
    const member = await addMember(prisma, admin.organizationId, {
      email: 'user@acme.com',
      role: 'user',
    });
    // Assigned as the interviewer, so this is the one `user` with a reason to be near
    // this vacancy at all.
    await prisma.vacancy.update({
      where: { id: seeded.id },
      data: { interviewerAccountId: member.accountId },
    });
    const session = await signInAs(app, {
      email: 'user@acme.com',
      accountId: member.accountId,
      organizationId: admin.organizationId,
    });

    const response = await patchVacancy(session, seeded.id, { newCategoryNames: ['Sneaky'] });

    expect(response.status).toBe(403);
    expect((await list(admin)).body.categories).toEqual([]);
  });

  it('takes the organization from the session, ignoring one in the body', async () => {
    const acme = await signup(app, 'pat@acme.com');
    const other = await signup(app, 'sam@other.com', 'Other Ltd');

    const response = await create(acme, { name: 'React', organizationId: other.organizationId });

    expect(response.status).toBe(201);
    expect((await list(acme)).body.categories).toHaveLength(1);
    expect((await list(other)).body.categories).toHaveLength(0);
  });
});
