import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { StubCalendarProvider } from './stub-calendar.provider';
import {
  addMember,
  bookInterview,
  bookedApplication,
  bootHiringApp,
  createVacancy,
  firstSlots,
  resetDatabase,
  signInAs,
  signup,
  type Signed,
} from './hiring.helpers';

/**
 * My interviews (spec 03 §06) — the last actor's only screen.
 *
 * Everything here turns on one distinction: **no assignment** and **no interviews** are
 * different answers. A member nobody has made an interviewer receives the not-found
 * state, so the screen's existence is never advertised to people it will never serve;
 * a member who holds a vacancy nobody has booked yet gets the screen with an empty
 * upcoming group (03 §07.34).
 */
describe('Hiring — my interviews', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let calendar: StubCalendarProvider;

  const mine = (session: Signed) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/my-interviews`)
      .set('Cookie', session.cookies);

  /** Books one interview and hands back the ids the screen is addressed by. */
  async function book(
    slug: string,
    values: { email: string; firstName?: string; lastName?: string; startUtc: string },
  ): Promise<{ candidateId: string; applicationId: string }> {
    const response = await bookInterview(app, slug, {
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

  /**
   * Moves an application to a fixed instant, which is the only way to test the split:
   * every bookable slot the fake calendar offers is in the future by construction, and
   * a past interview is not something the booking endpoint will create.
   */
  async function moveTo(applicationId: string, start: Date, durationMinutes = 60): Promise<void> {
    await prisma.application.update({
      where: { id: applicationId },
      data: { start, end: new Date(start.getTime() + durationMinutes * 60_000) },
    });
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

  /** TC-H03-INT-07 — my interviews is scoped to assignment. */
  it('answers each interviewer with their own vacancy’s applications and nobody else’s', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const p = await addMember(prisma, admin.organizationId, { email: 'p@acme.com', role: 'user' });
    const s = await addMember(prisma, admin.organizationId, { email: 's@acme.com', role: 'user' });
    const q = await addMember(prisma, admin.organizationId, { email: 'q@acme.com', role: 'user' });

    const v = await createVacancy(app, admin, {
      title: 'React Engineer',
      interviewerAccountId: p.accountId,
    });
    const w = await createVacancy(app, admin, {
      title: 'Node Engineer',
      interviewerAccountId: s.accountId,
    });

    const [firstV, secondV] = await firstSlots(app, v.slug, 2);
    await book(v.slug, { email: 'jane@example.com', startUtc: firstV });
    await book(v.slug, { email: 'tom@example.com', firstName: 'Tom', lastName: 'Fisher', startUtc: secondV });
    const [firstW] = await firstSlots(app, w.slug, 1);
    await book(w.slug, { email: 'ann@example.com', firstName: 'Ann', lastName: 'Lee', startUtc: firstW });

    const asP = await mine(
      await signInAs(app, { email: 'p@acme.com', accountId: p.accountId, organizationId: admin.organizationId }),
    );
    expect(asP.status).toBe(200);
    expect(asP.body.upcoming.map((row: { candidateName: string }) => row.candidateName).sort()).toEqual([
      'Jane Doe',
      'Tom Fisher',
    ]);
    // W's candidate, vacancy and application are absent, not merely unlisted.
    expect(JSON.stringify(asP.body)).not.toContain('Node Engineer');
    expect(JSON.stringify(asP.body)).not.toContain('Ann Lee');

    const asS = await mine(
      await signInAs(app, { email: 's@acme.com', accountId: s.accountId, organizationId: admin.organizationId }),
    );
    expect(asS.status).toBe(200);
    expect(asS.body.upcoming).toHaveLength(1);
    expect(asS.body.upcoming[0].vacancyTitle).toBe('Node Engineer');

    // Q interviews for nothing: the not-found state, not an empty list.
    const asQ = await mine(
      await signInAs(app, { email: 'q@acme.com', accountId: q.accountId, organizationId: admin.organizationId }),
    );
    expect(asQ.status).toBe(404);
    expect(asQ.body.upcoming).toBeUndefined();
  });

  it('answers a member who holds a vacancy nobody has booked with an empty screen', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const p = await addMember(prisma, admin.organizationId, { email: 'p@acme.com', role: 'user' });
    await createVacancy(app, admin, { interviewerAccountId: p.accountId });

    const response = await mine(
      await signInAs(app, { email: 'p@acme.com', accountId: p.accountId, organizationId: admin.organizationId }),
    );

    // The assignment is what grants the screen; the bookings are what fill it.
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ upcoming: [], past: [] });
  });

  it('groups interviews into upcoming and past, each in its own order', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [a, b, c, d] = await firstSlots(app, vacancy.slug, 4);

    const soon = await book(vacancy.slug, { email: 'soon@example.com', lastName: 'Soon', startUtc: a });
    const later = await book(vacancy.slug, { email: 'later@example.com', lastName: 'Later', startUtc: b });
    const yesterday = await book(vacancy.slug, { email: 'yesterday@example.com', lastName: 'Yesterday', startUtc: c });
    const lastMonth = await book(vacancy.slug, { email: 'lastmonth@example.com', lastName: 'Month', startUtc: d });

    await moveTo(soon.applicationId, daysFromNow(1));
    await moveTo(later.applicationId, daysFromNow(5));
    await moveTo(yesterday.applicationId, daysFromNow(-1));
    await moveTo(lastMonth.applicationId, daysFromNow(-30));

    const response = await mine(admin);

    expect(response.status).toBe(200);
    // Soonest first ahead, most recent first behind (03 §06.28).
    expect(response.body.upcoming.map((row: { applicationId: string }) => row.applicationId)).toEqual([
      soon.applicationId,
      later.applicationId,
    ]);
    expect(response.body.past.map((row: { applicationId: string }) => row.applicationId)).toEqual([
      yesterday.applicationId,
      lastMonth.applicationId,
    ]);
  });

  /** 03 §06.30 — the same screen, showing their own assigned interviews. */
  it('answers an admin who is an interviewer, and 404 to one who is not', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const other = await addMember(prisma, admin.organizationId, {
      email: 'other@acme.com',
      role: 'admin',
    });
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    await book(vacancy.slug, { email: 'jane@example.com', startUtc });

    expect((await mine(admin)).status).toBe(200);

    const unassigned = await signInAs(app, {
      email: 'other@acme.com',
      accountId: other.accountId,
      organizationId: admin.organizationId,
    });
    // A role that could be assigned but has not been is still nobody's interviewer.
    expect((await mine(unassigned)).status).toBe(404);
  });

  it('answers 404 to a viewer, who can never hold an assignment', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const viewer = await addMember(prisma, admin.organizationId, {
      email: 'viewer@acme.com',
      role: 'viewer',
    });

    const session = await signInAs(app, {
      email: 'viewer@acme.com',
      accountId: viewer.accountId,
      organizationId: admin.organizationId,
    });

    expect((await mine(session)).status).toBe(404);
  });

  it('renders times in the viewing member’s own zone', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);
    const [startUtc] = await firstSlots(app, vacancy.slug, 1);
    await book(vacancy.slug, { email: 'jane@example.com', startUtc });

    await prisma.account.update({
      where: { id: admin.accountId },
      data: { timezone: 'Europe/Minsk' },
    });

    expect((await mine(admin)).body.viewerTimeZone).toBe('Europe/Minsk');
  });

  it('is refused outright without a session, and for another organization’s id', async () => {
    const admin = await signup(app, 'pat@acme.com', 'Acme Inc');
    const stranger = await signup(app, 'sam@globex.com', 'Globex');

    const anonymous = await request(app.getHttpServer()).get(
      `/api/organizations/${admin.organizationId}/hiring/my-interviews`,
    );
    expect(anonymous.status).toBe(401);

    // `OrgScopeGuard` refuses a URL that disagrees with the session, before anything reads.
    const crossed = await request(app.getHttpServer())
      .get(`/api/organizations/${admin.organizationId}/hiring/my-interviews`)
      .set('Cookie', stranger.cookies);
    expect(crossed.status).toBe(404);
  });
});
