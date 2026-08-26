import { INestApplication } from '@nestjs/common';
import { APPLICATION_LIMITS, HIRING_MESSAGES } from '@devscribed/validation';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { StubCalendarProvider } from './stub-calendar.provider';
import {
  CV_BYTES,
  addMember,
  bookInterview,
  bootHiringApp,
  createVacancy,
  firstSlots,
  resetDatabase,
  setRole,
  signInAs,
  signup,
  type Signed,
} from './hiring.helpers';

/**
 * The candidate card (spec 04): what the page reads, and the three fields the team
 * writes during an interview.
 *
 * Criteria assessments (04 §05) belong to the criteria library and are absent here by
 * design — the card serves `criteria: []` until that phase lands.
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
    const application = await prisma.application.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
      select: { id: true, candidateId: true },
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

  it('refuses a user and a viewer, and refuses their writes too', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    const { candidateId, applicationId } = await book(vacancy.slug, { startUtc });

    for (const role of ['user', 'viewer']) {
      await setRole(prisma, admin.accountId, role);
      expect((await card(admin, candidateId)).status).toBe(403);
      expect((await patch(admin, applicationId, { interviewNotes: 'x' })).status).toBe(403);
    }
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
});
