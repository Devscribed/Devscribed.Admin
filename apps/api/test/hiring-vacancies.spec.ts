import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { StubCalendarProvider } from './stub-calendar.provider';
import { addMember, bootHiringApp, resetDatabase, setRole, signup } from './hiring.helpers';

/**
 * The vacancy endpoints, and the two boundaries they sit behind: the organization comes
 * from the session rather than from the request, and the role decides whether the
 * caller reaches them at all.
 */
describe('Hiring — vacancies', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let calendar: StubCalendarProvider;

  const post = (orgId: string, cookies: string[], body: object) =>
    request(app.getHttpServer())
      .post(`/api/organizations/${orgId}/hiring/vacancies`)
      .set('Cookie', cookies)
      .send(body);

  const valid = (interviewerAccountId: string) => ({
    title: 'Senior React Engineer',
    interviewerAccountId,
    durationMinutes: 60,
  });

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

  /** TC-H01-INT-01 */
  it('stores the organization from the session, not from the body', async () => {
    const mine = await signup(app, 'pat@acme.com', 'Acme Inc');
    const theirs = await signup(app, 'sam@globex.com', 'Globex');

    const response = await post(mine.organizationId, mine.cookies, {
      ...valid(mine.accountId),
      organizationId: theirs.organizationId,
    });

    expect(response.status).toBe(201);

    const created = await prisma.vacancy.findMany();
    expect(created).toHaveLength(1);
    expect(created[0].organizationId).toBe(mine.organizationId);
    // The other organization learns nothing and gains nothing.
    expect(JSON.stringify(response.body)).not.toContain(theirs.organizationId);
  });

  /** TC-H01-INT-02, create half — the edit half arrives with PATCH. */
  it('rejects an interviewer whose mailbox does not resolve', async () => {
    const mine = await signup(app, 'pat@acme.com');
    const other = await addMember(prisma, mine.organizationId, {
      email: 'nomailbox@acme.com',
      role: 'user',
    });
    calendar.withoutMailbox.add('nomailbox@acme.com');

    const response = await post(mine.organizationId, mine.cookies, valid(other.accountId));

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('interviewer_ineligible');
    expect(await prisma.vacancy.count()).toBe(0);
  });

  it('lists a member with no mailbox as ineligible rather than hiding them', async () => {
    const mine = await signup(app, 'pat@acme.com');
    await addMember(prisma, mine.organizationId, { email: 'nomailbox@acme.com', role: 'user' });
    await addMember(prisma, mine.organizationId, { email: 'watcher@acme.com', role: 'viewer' });
    calendar.withoutMailbox.add('nomailbox@acme.com');

    const response = await request(app.getHttpServer())
      .get(`/api/organizations/${mine.organizationId}/hiring/interviewers`)
      .set('Cookie', mine.cookies);

    expect(response.status).toBe(200);
    const byEmail = new Map<string, { eligible: boolean; reason: string | null }>(
      response.body.interviewers.map((i: { email: string }) => [i.email, i as never]),
    );
    expect(byEmail.get('pat@acme.com')).toMatchObject({ eligible: true, reason: null });
    expect(byEmail.get('nomailbox@acme.com')).toMatchObject({
      eligible: false,
      reason: 'no_mailbox',
    });
    // A viewer may not be assigned an interview, so they are not offered at all.
    expect(byEmail.has('watcher@acme.com')).toBe(false);
  });

  /** TC-H01-INT-07 */
  it('refuses user and viewer on every vacancy endpoint, leaking no vacancy data', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const created = await post(admin.organizationId, admin.cookies, valid(admin.accountId));
    const vacancyId = created.body.id as string;
    const title = created.body.title as string;

    for (const role of ['user', 'viewer']) {
      await setRole(prisma, admin.accountId, role);

      const list = await request(app.getHttpServer())
        .get(`/api/organizations/${admin.organizationId}/hiring/vacancies`)
        .set('Cookie', admin.cookies);
      const detail = await request(app.getHttpServer())
        .get(`/api/organizations/${admin.organizationId}/hiring/vacancies/${vacancyId}`)
        .set('Cookie', admin.cookies);
      const create = await post(admin.organizationId, admin.cookies, valid(admin.accountId));

      for (const response of [list, detail, create]) {
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('forbidden');
        expect(JSON.stringify(response.body)).not.toContain(title);
      }
    }
  });

  /** TC-H01-INT-08 */
  it('gives identical titles distinct slugs, in one organization and across two', async () => {
    const mine = await signup(app, 'pat@acme.com', 'Acme Inc');
    const theirs = await signup(app, 'sam@globex.com', 'Globex');

    const first = await post(mine.organizationId, mine.cookies, valid(mine.accountId));
    const second = await post(mine.organizationId, mine.cookies, valid(mine.accountId));
    const third = await post(theirs.organizationId, theirs.cookies, valid(theirs.accountId));

    const slugs = [first, second, third].map((r) => r.body.publicSlug as string);
    expect(new Set(slugs).size).toBe(3);
    for (const slug of slugs) expect(slug.startsWith('senior-react-engineer-')).toBe(true);
  });

  it('rejects a duration the UI cannot produce', async () => {
    const mine = await signup(app, 'pat@acme.com');

    const response = await post(mine.organizationId, mine.cookies, {
      ...valid(mine.accountId),
      durationMinutes: '60',
    });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('validation');
    expect(response.body.fields.durationMinutes).toBe('Choose an interview length');
  });

  it('lists open vacancies before closed ones, newest first within each', async () => {
    const mine = await signup(app, 'pat@acme.com');
    const first = await post(mine.organizationId, mine.cookies, {
      ...valid(mine.accountId),
      title: 'First',
    });
    const second = await post(mine.organizationId, mine.cookies, {
      ...valid(mine.accountId),
      title: 'Second',
    });
    // Closing is the lifecycle spec's job; the ordering rule can still be pinned now.
    await prisma.vacancy.update({ where: { id: second.body.id }, data: { status: 'closed' } });

    const response = await request(app.getHttpServer())
      .get(`/api/organizations/${mine.organizationId}/hiring/vacancies`)
      .set('Cookie', mine.cookies);

    expect(response.body.vacancies.map((v: { title: string }) => v.title)).toEqual([
      'First',
      'Second',
    ]);
    expect(first.body.id).not.toBe(second.body.id);
  });

  it('answers 404 for a vacancy in another organization', async () => {
    const mine = await signup(app, 'pat@acme.com', 'Acme Inc');
    const theirs = await signup(app, 'sam@globex.com', 'Globex');
    const created = await post(theirs.organizationId, theirs.cookies, valid(theirs.accountId));

    const response = await request(app.getHttpServer())
      .get(`/api/organizations/${mine.organizationId}/hiring/vacancies/${created.body.id}`)
      .set('Cookie', mine.cookies);

    expect(response.status).toBe(404);
  });
});
