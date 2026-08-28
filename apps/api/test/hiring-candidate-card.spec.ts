import { INestApplication } from '@nestjs/common';
import { APPLICATION_LIMITS, HIRING_MESSAGES } from '@devscribed/validation';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { StubCalendarProvider } from './stub-calendar.provider';
import {
  CV_BYTES,
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
 * The candidate card (spec 04): what the page reads, and the four things the team writes
 * during an interview — interview notes, a conclusion, the status that is also the board
 * column, and the criteria assessed against the org-wide library.
 *
 * The library's own rules live in `hiring-criteria.spec.ts`; what is here is what the
 * card does with them: one assessment per criterion per application, exactly one value
 * column populated, and removing one that touches nothing else.
 */
describe('Hiring — candidate card', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let calendar: StubCalendarProvider;

  const card = (session: Signed, candidateId: string) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/candidates/${candidateId}`)
      .set('Cookie', session.cookies);

  const patch = (session: Signed, applicationId: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/api/organizations/${session.organizationId}/hiring/applications/${applicationId}`)
      .set('Cookie', session.cookies)
      .send(body);

  const assess = (session: Signed, applicationId: string, criterionId: string, body: object) =>
    request(app.getHttpServer())
      .put(
        `/api/organizations/${session.organizationId}/hiring/applications/${applicationId}/criteria/${criterionId}`,
      )
      .set('Cookie', session.cookies)
      .send(body);

  const unassess = (session: Signed, applicationId: string, criterionId: string) =>
    request(app.getHttpServer())
      .delete(
        `/api/organizations/${session.organizationId}/hiring/applications/${applicationId}/criteria/${criterionId}`,
      )
      .set('Cookie', session.cookies);

  /** The criteria on one application, as the card reads them back. */
  const criteriaOf = async (session: Signed, candidateId: string, index = 0) =>
    (await card(session, candidateId)).body.applications[index].criteria;

  /** Books one interview and hands back the ids the card is addressed by. */
  async function book(
    vacancySlug: string,
    values: { email?: string; firstName?: string; lastName?: string; startUtc: string },
  ): Promise<{ candidateId: string; applicationId: string }> {
    const response = await bookInterview(app, vacancySlug, {
      firstName: values.firstName ?? 'Jane',
      lastName: values.lastName ?? 'Doe',
      email: values.email ?? 'jane@example.com',
      startUtc: values.startUtc,
    });
    if (response.status !== 201) {
      throw new Error(`Precondition failed: booking answered ${response.status}`);
    }
    const application = await bookedApplication(prisma, {
      startUtc: values.startUtc,
      email: values.email ?? 'jane@example.com',
    });
    return { candidateId: application.candidateId, applicationId: application.id };
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

  it('names the interviewer the interview was booked with, not the vacancy\'s current one', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const sam = await addMember(prisma, admin.organizationId, {
      email: 'sam@acme.com',
      role: 'manager',
      firstName: 'Sam',
      lastName: 'Member',
    });
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { candidateId } = await book(vacancy.slug, { startUtc });

    await request(app.getHttpServer())
      .patch(`/api/organizations/${admin.organizationId}/hiring/vacancies/${vacancy.id}`)
      .set('Cookie', admin.cookies)
      .send({ interviewerAccountId: sam.accountId })
      .expect(200);

    // The card used to resolve this live through `vacancy.interviewer`, so a
    // reassignment rewrote the interviewer shown on interviews somebody else had
    // already conducted. It now reads the column stamped at booking (07 §13.63).
    const [application] = (await card(admin, candidateId)).body.applications;
    expect(application.interviewer).toEqual({
      accountId: admin.accountId,
      fullName: 'Pat Owner',
    });
  });

  it('carries the scheduling history, opened by the booking itself', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { candidateId } = await book(vacancy.slug, { startUtc });

    const [application] = (await card(admin, candidateId)).body.applications;

    // One entry, so the log is the whole story rather than only its deviations
    // (07 §11.50). Attributed to the candidate by the name they submitted.
    expect(application.scheduleEvents).toHaveLength(1);
    expect(application.scheduleEvents[0]).toMatchObject({
      type: 'booked',
      actor: 'candidate',
      actorName: 'Jane Doe',
      fromStartUtc: null,
      toStartUtc: startUtc,
      timeZone: 'UTC',
      reason: null,
    });
    expect(application.cancellation).toBeNull();
  });

  it('answers with the candidate, their applications, and nothing the page cannot use', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { candidateId, applicationId } = await book(vacancy.slug, { startUtc });

    const response = await card(admin, candidateId);

    expect(response.status).toBe(200);
    expect(response.body.candidate).toMatchObject({
      id: candidateId,
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
    });
    expect(typeof response.body.candidate.createdAt).toBe('string');
    expect(response.body.applications).toHaveLength(1);

    const [application] = response.body.applications;
    expect(application).toMatchObject({
      id: applicationId,
      status: 'scheduled',
      isCancelled: false,
      submittedName: 'Jane Doe',
      vacancy: { id: vacancy.id, title: 'Senior React Engineer', durationMinutes: 60 },
      interviewer: { accountId: admin.accountId, fullName: 'Pat Owner' },
      startUtc,
      bookedTimeZone: 'UTC',
      interviewNotes: '',
      conclusion: '',
      criteria: [],
    });
    // The booked length, so a later change to the vacancy cannot rewrite it.
    expect(new Date(application.endUtc).getTime() - new Date(application.startUtc).getTime()).toBe(
      60 * 60_000,
    );
    // The CV is named and sized, never located: no storage key reaches the page.
    expect(application.cv).toEqual({ fileName: 'cv.pdf', sizeBytes: CV_BYTES.length });
    const stored = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(JSON.stringify(response.body)).not.toContain(stored.cvKey!);
  });

  it('orders application sections by interview date, most recent first', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const react = await createVacancy(app, admin, { title: 'Senior React Engineer' });
    const dotnet = await createVacancy(app, admin, { title: 'DotNet Engineer' });
    const [earlier, later] = await firstSlots(app, react.slug, 2);

    const first = await book(react.slug, { startUtc: earlier });
    // The same address applying to a second vacancy is one candidate, two applications.
    await book(dotnet.slug, { startUtc: later });

    const response = await card(admin, first.candidateId);

    expect(response.status).toBe(200);
    expect(response.body.applications.map((a: { startUtc: string }) => a.startUtc)).toEqual([
      later,
      earlier,
    ]);
  });

  it('renders times in the viewing member’s zone, falling back to the mailbox’s', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { candidateId } = await book(vacancy.slug, { startUtc });

    // Signup records the browser's zone; these accounts are created without one.
    const withoutZone = await card(admin, candidateId);
    expect(withoutZone.body.viewerTimeZone).toBe('UTC');

    await prisma.account.update({
      where: { id: admin.accountId },
      data: { timezone: 'Europe/Minsk' },
    });
    const withZone = await card(admin, candidateId);
    expect(withZone.body.viewerTimeZone).toBe('Europe/Minsk');
  });

  it('answers 404 for an unknown candidate and for one in another organization', async () => {
    const admin = await signup(app, 'pat@acme.com', 'Acme Inc');
    const stranger = await signup(app, 'sam@globex.com', 'Globex');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { candidateId } = await book(vacancy.slug, { startUtc });

    const unknown = await card(admin, '00000000-0000-4000-8000-000000000000');
    expect(unknown.status).toBe(404);

    // Addressed through the stranger's own organization, which is the only address
    // `OrgScopeGuard` lets them use: the candidate is simply not in it.
    const outsider = await card(stranger, candidateId);
    expect(outsider.status).toBe(404);
    expect(JSON.stringify(outsider.body)).not.toContain('jane@example.com');
  });

  /**
   * TC-H04-INT-02 — a candidate a `user` cannot see, and a `viewer` who can see none.
   *
   * 404 for both, and the same 404 the previous case gives for a candidate in another
   * organization: on this surface "you may not" and "there is no such candidate" are one
   * answer, because telling them apart is exactly what a stranger walking ids wants
   * (04 §01.4).
   */
  it('answers 404 to a viewer, and to a user who interviews for somebody else', async () => {
    const admin = await signup(app, 'pat@acme.com');
    // P interviews for their own vacancy, and for nothing to do with this candidate.
    const p = await addMember(prisma, admin.organizationId, { email: 'p@acme.com', role: 'user' });
    await createVacancy(app, admin, { title: 'Node Engineer', interviewerAccountId: p.accountId });

    const theirs = await createVacancy(app, admin, { title: 'React Engineer' });
    const [startUtc] = await firstSlots(app, theirs.slug, 1);
    const { candidateId, applicationId } = await book(theirs.slug, { startUtc });

    const viewer = await addMember(prisma, admin.organizationId, {
      email: 'viewer@acme.com',
      role: 'viewer',
    });

    for (const member of [p, viewer]) {
      const session = await signInAs(app, {
        email: member === p ? 'p@acme.com' : 'viewer@acme.com',
        accountId: member.accountId,
        organizationId: admin.organizationId,
      });

      const refused = await card(session, candidateId);
      expect(refused.status).toBe(404);
      // Not even the candidate's existence — the body is the plain not-found shape.
      expect(JSON.stringify(refused.body)).not.toContain('jane@example.com');
      expect((await patch(session, applicationId, { interviewNotes: 'x' })).status).toBe(404);
    }
  });

  /**
   * TC-H04-INT-01 — an interviewer sees their own vacancy's application and no other.
   *
   * The other vacancy's id, title, notes and criteria are **absent from the response**
   * rather than hidden by the page: a section the browser never receives is one no
   * devtools panel can open (04 §01.2).
   */
  it('answers an interviewer with only their own vacancy’s applications', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const p = await addMember(prisma, admin.organizationId, { email: 'p@acme.com', role: 'user' });
    const s = await addMember(prisma, admin.organizationId, { email: 's@acme.com', role: 'user' });

    const mine = await createVacancy(app, admin, {
      title: 'React Engineer',
      interviewerAccountId: p.accountId,
    });
    const theirs = await createVacancy(app, admin, {
      title: 'Node Engineer',
      interviewerAccountId: s.accountId,
    });

    // One candidate, one application to each vacancy.
    const [first, second] = await firstSlots(app, mine.slug, 2);
    const ours = await book(mine.slug, { startUtc: first });
    const other = await book(theirs.slug, { startUtc: second });
    expect(ours.candidateId).toBe(other.candidateId);

    // Something written on the other application, so its absence is a real absence.
    const english = await createCriterion(app, admin, { name: 'English' });
    await patch(admin, other.applicationId, { interviewNotes: 'said something private' });
    await assess(admin, other.applicationId, english.id, { valueId: english.values[0].id });

    const interviewer = await signInAs(app, {
      email: 'p@acme.com',
      accountId: p.accountId,
      organizationId: admin.organizationId,
    });

    const scoped = await card(interviewer, ours.candidateId);
    expect(scoped.status).toBe(200);
    expect(scoped.body.applications).toHaveLength(1);
    expect(scoped.body.applications[0].id).toBe(ours.applicationId);

    const body = JSON.stringify(scoped.body);
    for (const secret of [other.applicationId, theirs.id, 'Node Engineer', 'said something private', english.id]) {
      expect(body).not.toContain(secret);
    }

    // The admin, on the same candidate, still gets both.
    const full = await card(admin, ours.candidateId);
    expect(full.body.applications).toHaveLength(2);

    // And the interviewer's own write goes through on their own application.
    expect((await patch(interviewer, ours.applicationId, { interviewNotes: 'mine' })).status).toBe(200);
    // Reaching for the other one by id is 404, not 403 — the same answer a stranger gets.
    expect((await patch(interviewer, other.applicationId, { conclusion: 'x' })).status).toBe(404);
    expect(
      (await assess(interviewer, other.applicationId, english.id, { valueId: english.values[1].id }))
        .status,
    ).toBe(404);
    expect((await unassess(interviewer, other.applicationId, english.id)).status).toBe(404);
    // Nothing the interviewer sent touched the application they may not see.
    const untouched = await prisma.application.findUniqueOrThrow({
      where: { id: other.applicationId },
      select: { interviewNotes: true, conclusion: true },
    });
    expect(untouched).toEqual({ interviewNotes: 'said something private', conclusion: null });
  });

  /** TC-H04-INT-03 — notes and conclusion are shared, last write wins. */
  it('shares notes and conclusion between members, last write wins', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const sam = await addMember(prisma, admin.organizationId, {
      email: 'sam@acme.com',
      role: 'manager',
      firstName: 'Sam',
      lastName: 'Manager',
    });
    const vacancy = await createVacancy(app, admin, { interviewerAccountId: sam.accountId });
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { candidateId, applicationId } = await book(vacancy.slug, { startUtc });

    const interviewer = await signInAs(app, {
      email: 'sam@acme.com',
      accountId: sam.accountId,
      organizationId: admin.organizationId,
    });
    const firstWrite = await patch(interviewer, applicationId, { interviewNotes: 'first' });
    expect(firstWrite.status).toBe(200);
    expect(typeof firstWrite.body.savedAt).toBe('string');

    const secondWrite = await patch(admin, applicationId, { interviewNotes: 'second' });
    expect(secondWrite.status).toBe(200);

    // One field, no per-author copies: both callers read the later write.
    for (const session of [admin, interviewer]) {
      const body = (await card(session, candidateId)).body;
      expect(body.applications[0].interviewNotes).toBe('second');
    }
  });

  /** TC-H04-INT-06 — status changed from the card moves the board card to the top. */
  it('places an application at the top of the column its new status names', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [first, second, third] = await firstSlots(app, vacancy.slug, 3);

    const alreadyPassed = [
      await book(vacancy.slug, { startUtc: first, email: 'a@example.com', lastName: 'A' }),
      await book(vacancy.slug, { startUtc: second, email: 'b@example.com', lastName: 'B' }),
    ];
    for (const application of alreadyPassed) {
      expect((await patch(admin, application.applicationId, { status: 'passed' })).status).toBe(200);
    }
    const before = await passedOrder(vacancy.id);

    const moved = await book(vacancy.slug, {
      startUtc: third,
      email: 'c@example.com',
      lastName: 'C',
    });
    const response = await patch(admin, moved.applicationId, { status: 'passed' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('passed');

    const after = await passedOrder(vacancy.id);
    expect(after[0]).toBe(moved.applicationId);
    // The cards already in the column keep their relative order.
    expect(after.slice(1)).toEqual(before);
  });

  it('leaves position alone when the status does not actually change', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [first, second] = await firstSlots(app, vacancy.slug, 2);
    const older = await book(vacancy.slug, { startUtc: first, email: 'a@example.com' });
    await book(vacancy.slug, { startUtc: second, email: 'b@example.com' });

    const positionBefore = (
      await prisma.application.findUniqueOrThrow({ where: { id: older.applicationId } })
    ).position;

    // Re-selecting the status a card already has is not a move, and must not jump it to
    // the top of the column it is already in.
    const response = await patch(admin, older.applicationId, { status: 'scheduled' });

    expect(response.status).toBe(200);
    expect(response.body.position).toBe(positionBefore);
  });

  it('refuses a status outside the five board columns', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { applicationId } = await book(vacancy.slug, { startUtc });

    const response = await patch(admin, applicationId, { status: 'shortlisted' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('invalid_status');
  });

  it('refuses notes past their limit, naming the field, and writes nothing', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { applicationId } = await book(vacancy.slug, { startUtc });
    await patch(admin, applicationId, { interviewNotes: 'kept' });

    const response = await patch(admin, applicationId, {
      interviewNotes: 'x'.repeat(APPLICATION_LIMITS.interviewNotesMax + 1),
    });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: 'too_long',
      fields: { interviewNotes: HIRING_MESSAGES.card.notesTooLong },
    });
    const stored = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(stored.interviewNotes).toBe('kept');
  });

  it('cannot be used to write a candidate-provided field', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { applicationId } = await book(vacancy.slug, { startUtc });

    const response = await patch(admin, applicationId, {
      interviewNotes: 'ordinary notes',
      // Everything a candidate told us, offered to an endpoint that must ignore it.
      submittedName: 'Someone Else',
      note: 'rewritten',
      cvFileName: 'other.pdf',
      start: '2020-01-01T00:00:00.000Z',
      position: 0,
    });

    expect(response.status).toBe(200);
    const stored = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(stored.submittedName).toBe('Jane Doe');
    expect(stored.note).toBeNull();
    expect(stored.cvFileName).toBe('cv.pdf');
    expect(stored.start.toISOString()).toBe(startUtc);
    expect(stored.interviewNotes).toBe('ordinary notes');
  });

  it('answers 404 when patching an application in another organization', async () => {
    const admin = await signup(app, 'pat@acme.com', 'Acme Inc');
    const stranger = await signup(app, 'sam@globex.com', 'Globex');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { applicationId } = await book(vacancy.slug, { startUtc });

    const response = await patch(stranger, applicationId, { interviewNotes: 'not yours' });

    expect(response.status).toBe(404);
  });

  it('serves the CV inline only for a type a browser can be trusted to render', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { applicationId } = await book(vacancy.slug, { startUtc });
    const path = `/api/organizations/${admin.organizationId}/hiring/applications/${applicationId}/cv`;

    const download = await request(app.getHttpServer()).get(path).set('Cookie', admin.cookies);
    expect(download.headers['content-disposition']).toContain('attachment');

    const view = await request(app.getHttpServer())
      .get(`${path}?disposition=inline`)
      .set('Cookie', admin.cookies);
    expect(view.headers['content-disposition']).toContain('inline');
    expect(view.headers['content-type']).toContain('application/pdf');
    expect(view.headers['x-content-type-options']).toBe('nosniff');

    // The stored content type is the candidate's to choose, so it is never what an
    // inline response is rendered as.
    await prisma.application.update({
      where: { id: applicationId },
      data: { cvContentType: 'text/html' },
    });
    const spoofed = await request(app.getHttpServer())
      .get(`${path}?disposition=inline`)
      .set('Cookie', admin.cookies);
    expect(spoofed.headers['content-type']).toContain('application/pdf');
  });

  /** The `passed` column, in board order. */
  async function passedOrder(vacancyId: string): Promise<string[]> {
    const rows = await prisma.application.findMany({
      where: { vacancyId, status: 'passed' },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /* ---------------------------------------------------------------- *
   * Criteria — 04 §05
   * ---------------------------------------------------------------- */

  /** TC-H04-INT-04 — a criterion is assessed at most once per application. */
  it('edits the assessment already there rather than adding a second', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { candidateId, applicationId } = await book(vacancy.slug, { startUtc });
    const english = await createCriterion(app, admin, { name: 'English' });
    const [, , b1, b2] = english.values;

    const created = await assess(admin, applicationId, english.id, { valueId: b1.id });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      criterionId: english.id,
      name: 'English',
      type: 'scale',
      valueId: b1.id,
      valueLabel: 'B1',
    });

    const updated = await assess(admin, applicationId, english.id, { valueId: b2.id });
    expect(updated.status).toBe(200);
    expect(updated.body.valueLabel).toBe('B2');

    // One row, valued B2 — the pair is the row's identity (04 §05.24).
    expect(await criteriaOf(admin, candidateId)).toEqual([
      expect.objectContaining({ criterionId: english.id, valueId: b2.id, valueLabel: 'B2' }),
    ]);
    expect(await prisma.applicationCriterion.count()).toBe(1);
  });

  it('stores each type in its own column and refuses a value in the wrong one', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { candidateId, applicationId } = await book(vacancy.slug, { startUtc });

    const late = await createCriterion(app, admin, { name: 'Late hours', type: 'boolean' });
    const years = await createCriterion(app, admin, { name: 'Years', type: 'number' });
    const notes = await createCriterion(app, admin, { name: 'Stack', type: 'text' });

    expect((await assess(admin, applicationId, late.id, { valueBool: true })).status).toBe(200);
    expect((await assess(admin, applicationId, years.id, { valueNumber: 7 })).status).toBe(200);
    expect((await assess(admin, applicationId, notes.id, { valueText: 'Ships on Fridays' })).status).toBe(200);

    expect(await criteriaOf(admin, candidateId)).toEqual([
      expect.objectContaining({ criterionId: late.id, valueBool: true, valueNumber: null, valueText: null }),
      expect.objectContaining({ criterionId: years.id, valueNumber: 7, valueBool: null }),
      expect.objectContaining({ criterionId: notes.id, valueText: 'Ships on Fridays' }),
    ]);

    // The wrong column for the type, and two at once, are the same answer.
    const mismatched = await assess(admin, applicationId, late.id, { valueText: 'yes' });
    expect(mismatched.status).toBe(422);
    expect(mismatched.body).toEqual({
      error: 'type_mismatch',
      message: HIRING_MESSAGES.card.criterionTypeMismatch,
    });
    expect((await assess(admin, applicationId, years.id, { valueNumber: 7, valueText: '7' })).status).toBe(422);

    // And nothing was overwritten by either refusal.
    expect((await criteriaOf(admin, candidateId))[0].valueBool).toBe(true);
  });

  it("refuses a scale value belonging to another criterion's scale", async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { applicationId } = await book(vacancy.slug, { startUtc });
    const english = await createCriterion(app, admin, { name: 'English' });
    const skills = await createCriterion(app, admin, { name: 'AI Skills', values: ['None', 'Good'] });

    const response = await assess(admin, applicationId, english.id, {
      valueId: skills.values[1].id,
    });

    // From the member's side, a value from another scale is exactly a value that does not
    // match this criterion (04 §Validation.5).
    expect(response.status).toBe(422);
    expect(response.body.error).toBe('type_mismatch');
    expect(await prisma.applicationCriterion.count()).toBe(0);
  });

  it('caps a text assessment at 500 characters without truncating it', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { candidateId, applicationId } = await book(vacancy.slug, { startUtc });
    const stack = await createCriterion(app, admin, { name: 'Stack', type: 'text' });

    const longest = 'x'.repeat(500);
    expect((await assess(admin, applicationId, stack.id, { valueText: longest })).status).toBe(200);

    const tooLong = await assess(admin, applicationId, stack.id, { valueText: `${longest}x` });
    expect(tooLong.status).toBe(422);
    expect(tooLong.body.error).toBe('too_long');
    // The refusal left the accepted value alone rather than storing a shortened one.
    expect((await criteriaOf(admin, candidateId))[0].valueText).toBe(longest);
  });

  /** TC-H04-INT-05 — removing an assessment leaves the library and every other one alone. */
  it('removes one assessment and nothing else', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const slots = await firstSlots(app, vacancy.slug, 2);
    const first = await book(vacancy.slug, { startUtc: slots[0], email: 'jane@example.com' });
    const second = await book(vacancy.slug, { startUtc: slots[1], email: 'sam@example.com' });
    const english = await createCriterion(app, admin, { name: 'English' });

    await assess(admin, first.applicationId, english.id, { valueId: english.values[2].id });
    await assess(admin, second.applicationId, english.id, { valueId: english.values[4].id });

    const removed = await unassess(admin, first.applicationId, english.id);
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ success: true });

    expect(await criteriaOf(admin, first.candidateId)).toEqual([]);
    // The library keeps the criterion and its whole scale…
    const library = await request(app.getHttpServer())
      .get(`/api/organizations/${admin.organizationId}/hiring/criteria`)
      .set('Cookie', admin.cookies);
    expect(library.body.criteria[0].values).toHaveLength(6);
    // …and the other application's assessment is untouched.
    expect(await criteriaOf(admin, second.candidateId)).toEqual([
      expect.objectContaining({ criterionId: english.id, valueLabel: 'C1' }),
    ]);
  });

  it('answers 404 for an assessment that is not there to remove', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { applicationId } = await book(vacancy.slug, { startUtc });
    const english = await createCriterion(app, admin, { name: 'English' });

    expect((await unassess(admin, applicationId, english.id)).status).toBe(404);
  });

  /** TC-H04-INT-07 — an archived criterion stays readable and editable, and takes no new ones. */
  it('keeps an archived criterion editable where it is, and refuses it anywhere else', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const slots = await firstSlots(app, vacancy.slug, 2);
    const assessed = await book(vacancy.slug, { startUtc: slots[0], email: 'jane@example.com' });
    const untouched = await book(vacancy.slug, { startUtc: slots[1], email: 'sam@example.com' });
    const legacy = await createCriterion(app, admin, { name: 'Legacy skill', type: 'text' });

    await assess(admin, assessed.applicationId, legacy.id, { valueText: 'Delphi' });
    await request(app.getHttpServer())
      .patch(`/api/organizations/${admin.organizationId}/hiring/criteria/${legacy.id}`)
      .set('Cookie', admin.cookies)
      .send({ isArchived: true });

    // Readable, and marked so the card can say why it is no longer in the autocomplete.
    expect(await criteriaOf(admin, assessed.candidateId)).toEqual([
      expect.objectContaining({ criterionId: legacy.id, valueText: 'Delphi', isArchived: true }),
    ]);

    // Editable where it already is — that is the whole difference from deleting it.
    const edited = await assess(admin, assessed.applicationId, legacy.id, { valueText: 'Delphi 7' });
    expect(edited.status).toBe(200);
    expect(edited.body.valueText).toBe('Delphi 7');

    // And refused anywhere it is not.
    const refused = await assess(admin, untouched.applicationId, legacy.id, { valueText: 'COBOL' });
    expect(refused.status).toBe(422);
    expect(refused.body).toEqual({
      error: 'archived_criterion',
      message: HIRING_MESSAGES.card.criterionArchived,
    });
    expect(await criteriaOf(admin, untouched.candidateId)).toEqual([]);
  });

  it('answers 404 for an application or a criterion from another organization', async () => {
    const acme = await signup(app, 'pat@acme.com');
    const other = await signup(app, 'sam@other.com', 'Other Ltd');
    const vacancy = await createVacancy(app, acme);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { applicationId } = await book(vacancy.slug, { startUtc });
    const theirs = await createCriterion(app, other, { name: 'English', type: 'text' });
    const ours = await createCriterion(app, acme, { name: 'English', type: 'text' });

    // Their criterion, our application.
    expect((await assess(acme, applicationId, theirs.id, { valueText: 'x' })).status).toBe(404);
    // Our criterion, their application — which they do not have, so any id will do.
    expect((await assess(other, applicationId, theirs.id, { valueText: 'x' })).status).toBe(404);
    expect((await unassess(other, applicationId, ours.id)).status).toBe(404);
    expect(await prisma.applicationCriterion.count()).toBe(0);
  });

  /**
   * Neither is the interviewer on this vacancy, so neither may reach the application at
   * all — and the refusal is the surface's uniform 404 rather than a 403 that would
   * confirm the application is there.
   */
  it.each(['user', 'viewer'])('refuses both assessment endpoints to a %s', async (role) => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { applicationId } = await book(vacancy.slug, { startUtc });
    const english = await createCriterion(app, admin, { name: 'English' });

    const member = await addMember(prisma, admin.organizationId, {
      email: `${role}@acme.com`,
      role,
    });
    const session = await signInAs(app, {
      email: `${role}@acme.com`,
      accountId: member.accountId,
      organizationId: admin.organizationId,
    });

    expect((await assess(session, applicationId, english.id, { valueId: english.values[0].id })).status).toBe(404);
    expect((await unassess(session, applicationId, english.id)).status).toBe(404);
    expect(await prisma.applicationCriterion.count()).toBe(0);
  });
});
