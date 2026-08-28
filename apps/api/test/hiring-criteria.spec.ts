import { INestApplication } from '@nestjs/common';
import { CRITERION_MESSAGES, LIBRARY_MESSAGES } from '@devscribed/validation';
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
  signInAs,
  signup,
  type Signed,
} from './hiring.helpers';

/**
 * The criteria library (hiring 06 §01 §03) — the second of the two, and the one with
 * structure.
 *
 * Three rules carry the whole suite. A criterion's **type** is fixed at creation, because
 * every assessment lives in the column that type names. A scale's values are compared by
 * **position**, so renaming one is free and reordering one is retroactive. And a criterion
 * that has been assessed is **archived, never deleted** — deleting it would destroy
 * exactly the judgements the candidate database exists to filter on.
 */
describe('Hiring — criteria', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let calendar: StubCalendarProvider;

  const list = (session: Signed, query: Record<string, string> = {}) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/criteria`)
      .query(query)
      .set('Cookie', session.cookies);

  const create = (session: Signed, body: object) =>
    request(app.getHttpServer())
      .post(`/api/organizations/${session.organizationId}/hiring/criteria`)
      .set('Cookie', session.cookies)
      .send(body);

  const patch = (session: Signed, criterionId: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/api/organizations/${session.organizationId}/hiring/criteria/${criterionId}`)
      .set('Cookie', session.cookies)
      .send(body);

  const remove = (session: Signed, criterionId: string) =>
    request(app.getHttpServer())
      .delete(`/api/organizations/${session.organizationId}/hiring/criteria/${criterionId}`)
      .set('Cookie', session.cookies);

  const assess = (session: Signed, applicationId: string, criterionId: string, body: object) =>
    request(app.getHttpServer())
      .put(
        `/api/organizations/${session.organizationId}/hiring/applications/${applicationId}/criteria/${criterionId}`,
      )
      .set('Cookie', session.cookies)
      .send(body);

  const card = (session: Signed, candidateId: string) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/candidates/${candidateId}`)
      .set('Cookie', session.cookies);

  /** Books `count` interviews on one vacancy and hands back what the card is addressed by. */
  async function book(
    slug: string,
    count = 1,
  ): Promise<Array<{ candidateId: string; applicationId: string }>> {
    const slots = await firstSlots(app, slug, count);
    const booked: Array<{ candidateId: string; applicationId: string }> = [];

    for (const [index, startUtc] of slots.entries()) {
      const response = await bookInterview(app, slug, {
        firstName: 'Jane',
        lastName: `Doe ${index}`,
        email: `jane+${index}@example.com`,
        startUtc,
      });
      if (response.status !== 201) {
        throw new Error(`Precondition failed: booking answered ${response.status}`);
      }
      const application = await bookedApplication(prisma, {
        startUtc,
        email: `jane+${index}@example.com`,
      });
      booked.push({ candidateId: application.candidateId, applicationId: application.id });
    }

    return booked;
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
   * Creating
   * ---------------------------------------------------------------- */

  it('creates a scale, numbering its values from zero in the order they were given', async () => {
    const admin = await signup(app, 'pat@acme.com');

    const response = await create(admin, {
      name: 'English',
      type: 'scale',
      values: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: 'English',
      type: 'scale',
      isArchived: false,
      assessmentCount: 0,
    });
    expect(response.body.values.map((value: { label: string }) => value.label)).toEqual([
      'A1',
      'A2',
      'B1',
      'B2',
      'C1',
      'C2',
    ]);
    // Contiguous from zero, because comparison reads positions and a gap would make
    // "the next one up" mean something different in two scales.
    expect(response.body.values.map((value: { position: number }) => value.position)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(response.body.values.every((value: { assessmentCount: number }) => value.assessmentCount === 0)).toBe(
      true,
    );
  });

  it('creates the three types that have no values', async () => {
    const admin = await signup(app, 'pat@acme.com');

    for (const type of ['boolean', 'number', 'text']) {
      const response = await create(admin, { name: `${type} thing`, type });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ type, values: [] });
    }
  });

  /** TC-H06-UNIT-02, seen through the endpoint that has to refuse the same four things. */
  it('refuses a scale with no values, and values on a type that has none', async () => {
    const admin = await signup(app, 'pat@acme.com');

    const noValues = await create(admin, { name: 'English', type: 'scale' });
    expect(noValues.status).toBe(422);
    expect(noValues.body).toEqual({
      error: 'values_required',
      message: CRITERION_MESSAGES.values.required,
    });

    const extraValues = await create(admin, {
      name: 'Late hours',
      type: 'boolean',
      values: ['Yes', 'No'],
    });
    expect(extraValues.status).toBe(422);
    expect(extraValues.body.error).toBe('values_not_allowed');

    // Nothing half-written survives a refusal.
    expect((await list(admin)).body.criteria).toEqual([]);
  });

  it('refuses repeated labels and an over-long scale', async () => {
    const admin = await signup(app, 'pat@acme.com');

    const repeated = await create(admin, { name: 'Skill', type: 'scale', values: ['Good', 'good'] });
    expect(repeated.status).toBe(422);
    expect(repeated.body).toEqual({
      error: 'duplicate_value',
      message: CRITERION_MESSAGES.values.duplicate,
    });

    const tooMany = await create(admin, {
      name: 'Skill',
      type: 'scale',
      values: Array.from({ length: 21 }, (_, index) => `V${index}`),
    });
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.error).toBe('too_many_values');
  });

  it('refuses a missing or unknown type, and a blank name', async () => {
    const admin = await signup(app, 'pat@acme.com');

    const noType = await create(admin, { name: 'English' });
    expect(noType.status).toBe(422);
    expect(noType.body).toEqual({
      error: 'validation',
      fields: { type: CRITERION_MESSAGES.type.required },
    });

    expect((await create(admin, { name: 'English', type: 'rating' })).status).toBe(422);

    const blank = await create(admin, { name: '  ', type: 'boolean' });
    expect(blank.status).toBe(422);
    expect(blank.body.fields.name).toBe(LIBRARY_MESSAGES.name.required);
  });

  /** The same case-insensitive uniqueness as categories, and the same recovery from it. */
  it('refuses a case variant and hands back the criterion the member meant', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const english = await createCriterion(app, admin, { name: 'English' });

    const response = await create(admin, { name: 'english', type: 'boolean' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('duplicate_name');
    expect(response.body.message).toBe('"english" already exists');
    // So the card's Add-criteria control can select it rather than showing an error the
    // member cannot act on, mid-interview (06 §01.3).
    expect(response.body.existing).toEqual({ id: english.id, name: 'English' });
    expect((await list(admin)).body.criteria).toHaveLength(1);
  });

  it('scopes uniqueness to the organization, and stores the name as typed', async () => {
    const acme = await signup(app, 'pat@acme.com');
    const other = await signup(app, 'sam@other.com', 'Other Ltd');

    expect((await create(acme, { name: '  AI Skills ', type: 'text' })).body.name).toBe('AI Skills');
    expect((await create(other, { name: 'AI Skills', type: 'text' })).status).toBe(201);
  });

  /* ---------------------------------------------------------------- *
   * Type immutability — TC-H06-INT-06
   * ---------------------------------------------------------------- */

  /** TC-H06-INT-06 — the type is fixed at creation, and every assessment depends on it. */
  it('refuses to change a type, leaving the criterion and its assessments untouched', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [{ applicationId, candidateId }] = await book(vacancy.slug);
    const english = await createCriterion(app, admin, { name: 'English' });
    expect((await assess(admin, applicationId, english.id, { valueId: english.values[2].id })).status).toBe(200);

    const response = await patch(admin, english.id, { type: 'text' });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: 'type_immutable',
      message: CRITERION_MESSAGES.type.immutable,
    });

    // Everything is exactly as it was — including the assessment that would have been
    // stranded in a column the new type does not read.
    const [criterion] = (await list(admin)).body.criteria;
    expect(criterion.type).toBe('scale');
    expect(criterion.values).toHaveLength(6);
    expect((await card(admin, candidateId)).body.applications[0].criteria).toEqual([
      expect.objectContaining({ criterionId: english.id, valueLabel: 'B1' }),
    ]);
  });

  it('accepts a patch that names the type it already has, since nothing is being changed', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const criterion = await createCriterion(app, admin, { name: 'Late hours', type: 'boolean' });

    const response = await patch(admin, criterion.id, {
      type: 'boolean',
      name: 'Late hours availability',
    });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Late hours availability');
  });

  /* ---------------------------------------------------------------- *
   * Renaming and archiving
   * ---------------------------------------------------------------- */

  it('renames a criterion and its values without touching a single assessment', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [{ applicationId, candidateId }] = await book(vacancy.slug);
    const english = await createCriterion(app, admin, {
      name: 'Englsh',
      values: ['A1', 'A2', 'B1'],
    });
    await assess(admin, applicationId, english.id, { valueId: english.values[2].id });

    const response = await patch(admin, english.id, {
      name: 'English',
      values: english.values.map((value) =>
        value.label === 'B1' ? { id: value.id, label: 'B1 (intermediate)' } : value,
      ),
    });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('English');
    // The assessment references the row, so it now reads the new label and has not moved.
    const [assessment] = (await card(admin, candidateId)).body.applications[0].criteria;
    expect(assessment).toMatchObject({
      criterionId: english.id,
      name: 'English',
      valueId: english.values[2].id,
      valueLabel: 'B1 (intermediate)',
    });
  });

  it('refuses a rename onto an existing name, and says what to do instead', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const english = await createCriterion(app, admin, { name: 'English', type: 'text' });
    const other = await createCriterion(app, admin, { name: 'Englsh', type: 'text' });

    const response = await patch(admin, other.id, { name: 'english' });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      '"english" already exists. Reassign and delete one instead.',
    );
    expect(response.body.existing.id).toBe(english.id);
  });

  /* ---------------------------------------------------------------- *
   * Scale values — TC-H06-INT-07
   * ---------------------------------------------------------------- */

  /** TC-H06-INT-07 — a value in use cannot be removed; an unused one can. */
  it('removes an unused value and refuses one with assessments, naming the count', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const applications = await book(vacancy.slug, 2);
    const english = await createCriterion(app, admin, { name: 'English', values: ['A1', 'A2', 'B1'] });
    const [a1, a2] = english.values;

    for (const { applicationId } of applications) {
      expect((await assess(admin, applicationId, english.id, { valueId: a2.id })).status).toBe(200);
    }

    // `B1` is used by nobody.
    const dropped = await patch(admin, english.id, { values: [a1, a2] });
    expect(dropped.status).toBe(200);
    expect(dropped.body.values.map((value: { label: string }) => value.label)).toEqual(['A1', 'A2']);

    // `A2` is used by two, and the message says which and how many.
    const refused = await patch(admin, english.id, { values: [a1] });
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({
      error: 'value_in_use',
      message: '"A2" is used by 2 assessments',
    });

    // Both assessments survive, and so does the value.
    expect(await prisma.applicationCriterion.count({ where: { valueId: a2.id } })).toBe(2);
    expect((await list(admin)).body.criteria[0].values).toEqual([
      { id: a1.id, label: 'A1', position: 0, assessmentCount: 0 },
      { id: a2.id, label: 'A2', position: 1, assessmentCount: 2 },
    ]);
  });

  /** TC-H06-UNIT-03 through the endpoint: a reorder renumbers the whole list. */
  it('renumbers every value on a reorder, with no gaps and no duplicates', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const english = await createCriterion(app, admin, { name: 'English', values: ['A1', 'A2', 'B1'] });
    const [a1, a2, b1] = english.values;

    const response = await patch(admin, english.id, { values: [b1, a1, a2] });

    expect(response.status).toBe(200);
    expect(response.body.values).toEqual([
      { id: b1.id, label: 'B1', position: 0, assessmentCount: 0 },
      { id: a1.id, label: 'A1', position: 1, assessmentCount: 0 },
      { id: a2.id, label: 'A2', position: 2, assessmentCount: 0 },
    ]);
  });

  it('adds a value at any position in the same write', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const english = await createCriterion(app, admin, { name: 'English', values: ['A1', 'B1'] });
    const [a1, b1] = english.values;

    const response = await patch(admin, english.id, {
      values: [a1, { label: 'A2' }, b1],
    });

    expect(response.status).toBe(200);
    expect(response.body.values.map((value: { label: string; position: number }) => [value.label, value.position])).toEqual([
      ['A1', 0],
      ['A2', 1],
      ['B1', 2],
    ]);
  });

  it("refuses a value id belonging to another criterion rather than dropping it", async () => {
    const admin = await signup(app, 'pat@acme.com');
    const english = await createCriterion(app, admin, { name: 'English', values: ['A1'] });
    const skills = await createCriterion(app, admin, { name: 'AI Skills', values: ['None'] });

    const response = await patch(admin, english.id, { values: [skills.values[0]] });

    // Saving a scale with one fewer value than was asked for is the worse answer.
    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: 'unknown_value',
      message: CRITERION_MESSAGES.values.unknown,
    });
    expect((await list(admin)).body.criteria.find((c: { id: string }) => c.id === english.id).values).toHaveLength(1);
  });

  it('refuses values on a criterion that has none, whatever its edit says', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const criterion = await createCriterion(app, admin, { name: 'Late hours', type: 'boolean' });

    expect((await patch(admin, criterion.id, { values: [{ label: 'Yes' }] })).status).toBe(422);
  });

  /* ---------------------------------------------------------------- *
   * Archive rather than delete — TC-H06-INT-04, TC-H06-INT-05
   * ---------------------------------------------------------------- */

  /** TC-H06-INT-04 — a criterion with assessments is archived, never deleted. */
  it('refuses to delete an assessed criterion, archives it instead, and deletes an unused one', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [{ applicationId, candidateId }] = await book(vacancy.slug);
    const english = await createCriterion(app, admin, { name: 'English' });
    const unused = await createCriterion(app, admin, { name: 'Unused', type: 'number' });
    await assess(admin, applicationId, english.id, { valueId: english.values[3].id });

    const refused = await remove(admin, english.id);
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({
      error: 'has_assessments',
      message: 'Archive this instead — it has 1 assessment',
      assessmentCount: 1,
    });
    expect(await prisma.applicationCriterion.count()).toBe(1);

    const archived = await patch(admin, english.id, { isArchived: true });
    expect(archived.status).toBe(200);
    expect(archived.body.isArchived).toBe(true);
    // The assessment is still there, and still readable.
    expect((await card(admin, candidateId)).body.applications[0].criteria).toEqual([
      expect.objectContaining({ criterionId: english.id, valueLabel: 'B2', isArchived: true }),
    ]);

    // One with no assessments is deleted outright, taking its values with it.
    expect((await remove(admin, unused.id)).status).toBe(200);
    expect((await list(admin, { includeArchived: 'true' })).body.criteria.map((c: { id: string }) => c.id)).toEqual([
      english.id,
    ]);
  });

  /** TC-H06-INT-05 — archived leaves the autocomplete and stays everywhere else. */
  it('hides an archived criterion from the default list and keeps it on request', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const english = await createCriterion(app, admin, { name: 'English' });
    const legacy = await createCriterion(app, admin, { name: 'Legacy skill', type: 'text' });
    await patch(admin, legacy.id, { isArchived: true });

    // Absent by default — which is what removes it from the card's Add-criteria control,
    // so it cannot be newly assessed.
    const active = await list(admin);
    expect(active.body.criteria.map((c: { id: string }) => c.id)).toEqual([english.id]);

    // Present on request, marked, and sorted below the active ones.
    const all = await list(admin, { includeArchived: 'true' });
    expect(all.body.criteria.map((c: { name: string; isArchived: boolean }) => [c.name, c.isArchived])).toEqual([
      ['English', false],
      ['Legacy skill', true],
    ]);
  });

  it('restores an archived criterion, which is the whole point of archiving', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const legacy = await createCriterion(app, admin, { name: 'Legacy skill', type: 'text' });

    await patch(admin, legacy.id, { isArchived: true });
    expect((await patch(admin, legacy.id, { isArchived: false })).body.isArchived).toBe(false);
    expect((await list(admin)).body.criteria).toHaveLength(1);
  });

  /* ---------------------------------------------------------------- *
   * Listing
   * ---------------------------------------------------------------- */

  it('lists the library with the counts both decisions need', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const applications = await book(vacancy.slug, 2);
    const english = await createCriterion(app, admin, { name: 'English', values: ['A1', 'B2'] });
    await createCriterion(app, admin, { name: 'ai skills', type: 'text' });

    for (const { applicationId } of applications) {
      await assess(admin, applicationId, english.id, { valueId: english.values[1].id });
    }

    const response = await list(admin);

    // Alphabetical regardless of case — Postgres's collation would put `English` ahead of
    // `ai skills`, which is not how anyone scans a list.
    expect(response.body.criteria.map((c: { name: string }) => c.name)).toEqual([
      'ai skills',
      'English',
    ]);
    const criterion = response.body.criteria[1];
    expect(criterion.assessmentCount).toBe(2);
    expect(criterion.values).toEqual([
      { id: english.values[0].id, label: 'A1', position: 0, assessmentCount: 0 },
      { id: english.values[1].id, label: 'B2', position: 1, assessmentCount: 2 },
    ]);
  });

  /* ---------------------------------------------------------------- *
   * Scoping and permissions — TC-H06-INT-08
   * ---------------------------------------------------------------- */

  it("answers 404 for a criterion belonging to another organization", async () => {
    const acme = await signup(app, 'pat@acme.com');
    const other = await signup(app, 'sam@other.com', 'Other Ltd');
    const theirs = await createCriterion(app, other, { name: 'English' });

    expect((await patch(acme, theirs.id, { name: 'Renamed' })).status).toBe(404);
    expect((await remove(acme, theirs.id)).status).toBe(404);
    expect((await list(other)).body.criteria[0].name).toBe('English');
  });

  it('takes the organization from the session, ignoring one in the body', async () => {
    const acme = await signup(app, 'pat@acme.com');
    const other = await signup(app, 'sam@other.com', 'Other Ltd');

    const response = await create(acme, {
      name: 'English',
      type: 'text',
      organizationId: other.organizationId,
    });

    expect(response.status).toBe(201);
    expect((await list(other)).body.criteria).toHaveLength(0);
  });

  /** TC-H06-INT-08 — `user` and `viewer` cannot reach the library, inline path included. */
  it.each(['user', 'viewer'])('refuses every criteria endpoint to a %s', async (role) => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const english = await createCriterion(app, admin, { name: 'English' });

    // The `user` is the assigned interviewer, which is the closest anyone gets to needing
    // the library without being allowed it.
    const member = await addMember(prisma, admin.organizationId, {
      email: `${role}@acme.com`,
      role,
    });
    await prisma.vacancy.update({
      where: { id: vacancy.id },
      data: { interviewerAccountId: member.accountId },
    });
    const session = await signInAs(app, {
      email: `${role}@acme.com`,
      accountId: member.accountId,
      organizationId: admin.organizationId,
    });

    const responses = [
      await list(session),
      // The inline creation path is this endpoint, reached from a candidate card.
      await create(session, { name: 'Sneaky', type: 'text' }),
      await patch(session, english.id, { name: 'Renamed' }),
      await remove(session, english.id),
    ];

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(JSON.stringify(response.body)).not.toMatch(/English/);
    }

    expect((await list(admin)).body.criteria.map((c: { name: string }) => c.name)).toEqual([
      'English',
    ]);
  });
});
