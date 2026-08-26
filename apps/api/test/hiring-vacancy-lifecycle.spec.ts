import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { StubCalendarProvider } from './stub-calendar.provider';
import {
  addMember,
  availabilityFor,
  bookInterview,
  bootHiringApp,
  createVacancy,
  firstSlot,
  firstSlots,
  flattenSlots,
  resetDatabase,
  setRole,
  signup,
  type Signed,
} from './hiring.helpers';

/**
 * Everything that makes a vacancy manageable once real bookings exist: the list's
 * filters, editing, closing and reopening, and deletion.
 *
 * The rule under almost all of it is 01 §04.13 — **future bookings only**. An edit
 * moves what the booking page offers from the next request onward and touches nothing
 * that is already scheduled.
 */
describe('Hiring — vacancy lifecycle', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let calendar: StubCalendarProvider;

  const patch = (session: Signed, vacancyId: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/api/organizations/${session.organizationId}/hiring/vacancies/${vacancyId}`)
      .set('Cookie', session.cookies)
      .send(body);

  const remove = (session: Signed, vacancyId: string) =>
    request(app.getHttpServer())
      .delete(`/api/organizations/${session.organizationId}/hiring/vacancies/${vacancyId}`)
      .set('Cookie', session.cookies);

  const list = (session: Signed, query: Record<string, string> = {}) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${session.organizationId}/hiring/vacancies`)
      .query(query)
      .set('Cookie', session.cookies);

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

  /** TC-H01-INT-02, the edit half — the create half lives in the vacancies suite. */
  it('refuses to reassign to an interviewer whose mailbox no longer resolves', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const other = await addMember(prisma, admin.organizationId, {
      email: 'nomailbox@acme.com',
      role: 'user',
    });
    const vacancy = await createVacancy(app, admin);
    calendar.withoutMailbox.add('nomailbox@acme.com');

    const response = await patch(admin, vacancy.id, { interviewerAccountId: other.accountId });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('interviewer_ineligible');

    const stored = await prisma.vacancy.findUniqueOrThrow({ where: { id: vacancy.id } });
    expect(stored.interviewerAccountId).toBe(admin.accountId);
  });

  /** TC-H01-INT-03 */
  it('reassigns the interviewer without disturbing a single scheduled interview', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const sam = await addMember(prisma, admin.organizationId, {
      email: 'sam@acme.com',
      role: 'manager',
    });
    const vacancy = await createVacancy(app, admin);

    const [firstStart, secondStart] = await firstSlots(app, vacancy.slug, 2);
    for (const [index, startUtc] of [firstStart, secondStart].entries()) {
      const booked = await bookInterview(app, vacancy.slug, {
        firstName: 'Jane',
        lastName: `Doe${index}`,
        email: `jane${index}@example.com`,
        startUtc,
      });
      expect(booked.status).toBe(201);
    }

    const before = await prisma.application.findMany({ orderBy: { start: 'asc' } });
    expect(before).toHaveLength(2);
    expect(before.every((application) => application.graphEventId)).toBe(true);

    const response = await patch(admin, vacancy.id, { interviewerAccountId: sam.accountId });
    expect(response.status).toBe(200);
    expect(response.body.interviewer.accountId).toBe(sam.accountId);

    // Same event, same time, same length — the interview keeps the mailbox it was
    // created in, because a Graph event cannot be moved between mailboxes.
    const after = await prisma.application.findMany({ orderBy: { start: 'asc' } });
    expect(after.map((a) => a.graphEventId)).toEqual(before.map((a) => a.graphEventId));
    expect(after.map((a) => a.start.toISOString())).toEqual(
      before.map((a) => a.start.toISOString()),
    );
    expect(after.map((a) => a.end.toISOString())).toEqual(before.map((a) => a.end.toISOString()));
    expect(calendar.cancelled).toHaveLength(0);

    // Availability now reads Sam's calendar, which has none of these interviews in it,
    // so both of the times booked against Pat are on offer again.
    const availability = await availabilityFor(app, vacancy.slug);
    expect(flattenSlots(availability.body)).toEqual(
      expect.arrayContaining([firstStart, secondStart]),
    );
  });

  /** TC-H01-INT-04 */
  it('changes the duration for future bookings and leaves the booked one at its length', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin, { durationMinutes: 30 });

    const startUtc = await firstSlot(app, vacancy.slug);
    expect(
      (
        await bookInterview(app, vacancy.slug, {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          startUtc,
        })
      ).status,
    ).toBe(201);

    expect((await patch(admin, vacancy.id, { durationMinutes: 60 })).status).toBe(200);

    const application = await prisma.application.findFirstOrThrow();
    expect(application.end.getTime() - application.start.getTime()).toBe(30 * 60_000);

    // New slots are anchored to the new length, so consecutive starts sit an hour apart.
    const availability = await availabilityFor(app, vacancy.slug);
    for (const date of Object.keys(availability.body.dates)) {
      const starts = availability.body.dates[date].map((iso) => new Date(iso).getTime());
      for (let i = 1; i < starts.length; i += 1) {
        expect(starts[i] - starts[i - 1]).toBe(60 * 60_000);
      }
    }
  });

  /** TC-H01-INT-05 */
  it('refuses to delete a vacancy with applications and allows one without', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const withCandidates = await createVacancy(app, admin, { title: 'React Engineer' });
    const empty = await createVacancy(app, admin, { title: 'DotNet Engineer' });

    const startUtc = await firstSlot(app, withCandidates.slug);
    expect(
      (
        await bookInterview(app, withCandidates.slug, {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          startUtc,
        })
      ).status,
    ).toBe(201);

    const blocked = await remove(admin, withCandidates.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('has_applications');
    expect(blocked.body.message).toBe('Close this vacancy instead — it has candidates');

    // The vacancy and its application both survive: 04 treats that record as permanent.
    expect(await prisma.vacancy.count({ where: { id: withCandidates.id } })).toBe(1);
    expect(await prisma.application.count()).toBe(1);

    expect((await remove(admin, empty.id)).status).toBe(200);
    expect(await prisma.vacancy.count({ where: { id: empty.id } })).toBe(0);
  });

  it('closes and reopens freely, changing nothing but whether bookings are taken', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);

    // Both slots are taken while the vacancy is still open: a closed one offers none,
    // which is exactly what the refusal below has to be tested against.
    const [startUtc, laterStart] = await firstSlots(app, vacancy.slug, 2);
    expect(
      (
        await bookInterview(app, vacancy.slug, {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          startUtc,
        })
      ).status,
    ).toBe(201);

    const closed = await patch(admin, vacancy.id, { status: 'closed' });
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe('closed');
    // Existing applications and their events stand (01 §03.9).
    expect(closed.body.applicationCount).toBe(1);
    expect(closed.body.scheduledCount).toBe(1);
    expect(calendar.cancelled).toHaveLength(0);

    // The public page still answers, and it names no interviewer (02 §02.6).
    const publicView = await request(app.getHttpServer()).get(`/api/book/${vacancy.slug}`);
    expect(publicView.status).toBe(200);
    expect(publicView.body.vacancy.status).toBe('closed');
    expect(JSON.stringify(publicView.body)).not.toContain('pat@acme.com');
    expect(JSON.stringify(publicView.body)).not.toContain('Pat Owner');

    // A booking against a closed vacancy is refused before anything is written.
    const later = await bookInterview(app, vacancy.slug, {
      firstName: 'Sam',
      lastName: 'Late',
      email: 'sam@example.com',
      startUtc: laterStart,
    });
    expect(later.status).toBe(409);
    expect(later.body.error).toBe('vacancy_closed');
    expect(await prisma.application.count()).toBe(1);

    // A closed vacancy answers availability with its window and nothing in it — never
    // an error, which is what an unreachable calendar means.
    const whileClosed = await availabilityFor(app, vacancy.slug);
    expect(whileClosed.status).toBe(200);
    expect(flattenSlots(whileClosed.body)).toEqual([]);

    const reopened = await patch(admin, vacancy.id, { status: 'open' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe('open');
  });

  it('leaves the slug alone when the vacancy is renamed', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);

    const renamed = await patch(admin, vacancy.id, { title: 'Staff React Engineer' });

    expect(renamed.status).toBe(200);
    expect(renamed.body.title).toBe('Staff React Engineer');
    // A link already sent keeps working (01 §01.2).
    expect(renamed.body.publicSlug).toBe(vacancy.slug);
  });

  it('searches titles case-insensitively and filters by status, server-side', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const react = await createVacancy(app, admin, { title: 'Senior React Engineer' });
    await createVacancy(app, admin, { title: 'DotNet Engineer' });
    const closedReact = await createVacancy(app, admin, { title: 'React Native Engineer' });
    expect((await patch(admin, closedReact.id, { status: 'closed' })).status).toBe(200);

    const titles = async (query: Record<string, string>) =>
      (await list(admin, query)).body.vacancies.map((v: { title: string }) => v.title);

    // Both React titles match, and the closed one sorts last — open first, whatever the
    // search was (01 §05.16).
    expect(await titles({ search: 'react' })).toEqual([
      'Senior React Engineer',
      'React Native Engineer',
    ]);
    expect(await titles({ search: 'REACT' })).toHaveLength(2);
    expect(await titles({ status: 'closed' })).toEqual(['React Native Engineer']);
    // Sorted, because which of these two was created first is the ordering rule's
    // business and not this test's.
    expect((await titles({ status: 'open' })).sort()).toEqual([
      'DotNet Engineer',
      'Senior React Engineer',
    ]);
    // The two compose, and an unmatched search empties the list rather than ignoring itself.
    expect(await titles({ search: 'react', status: 'open' })).toEqual(['Senior React Engineer']);
    expect(await titles({ search: 'nothing here' })).toEqual([]);

    expect(react.id).not.toBe(closedReact.id);
  });

  it('answers 404 when the vacancy belongs to another organization', async () => {
    const mine = await signup(app, 'pat@acme.com', 'Acme Inc');
    const theirs = await signup(app, 'sam@globex.com', 'Globex');
    const vacancy = await createVacancy(app, theirs);

    expect((await patch(mine, vacancy.id, { title: 'Mine now' })).status).toBe(404);
    expect((await remove(mine, vacancy.id)).status).toBe(404);

    const stored = await prisma.vacancy.findUniqueOrThrow({ where: { id: vacancy.id } });
    expect(stored.title).toBe(vacancy.title);
  });

  /** TC-H01-INT-07, extended over the two endpoints this phase adds. */
  it('refuses user and viewer on edit and delete, leaking no vacancy data', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const vacancy = await createVacancy(app, admin);

    for (const role of ['user', 'viewer']) {
      await setRole(prisma, admin.accountId, role);

      for (const response of [
        await patch(admin, vacancy.id, { status: 'closed' }),
        await remove(admin, vacancy.id),
      ]) {
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('forbidden');
        expect(JSON.stringify(response.body)).not.toContain(vacancy.title);
      }
    }

    await setRole(prisma, admin.accountId, 'admin');
    const stored = await prisma.vacancy.findUniqueOrThrow({ where: { id: vacancy.id } });
    expect(stored.status).toBe('open');
  });

  it('ignores an organizationId in the body of an edit', async () => {
    const mine = await signup(app, 'pat@acme.com', 'Acme Inc');
    const theirs = await signup(app, 'sam@globex.com', 'Globex');
    const vacancy = await createVacancy(app, mine);

    const response = await patch(mine, vacancy.id, {
      title: 'Renamed',
      organizationId: theirs.organizationId,
    });

    expect(response.status).toBe(200);
    const stored = await prisma.vacancy.findUniqueOrThrow({ where: { id: vacancy.id } });
    expect(stored.organizationId).toBe(mine.organizationId);
  });
});
