import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { StubCalendarProvider } from './stub-calendar.provider';
import {
  addMember,
  bootHiringApp,
  createVacancy,
  resetDatabase,
  setRole,
  signup,
  type Signed,
} from './hiring.helpers';

/**
 * The cross-spec guard of 01 §06.17: a member who is the assigned interviewer on an
 * open vacancy cannot be removed.
 *
 * Without it, soft-deleting a member silently breaks every public booking link pointing
 * at their calendar — the candidate sees a page that looks fine and an availability
 * failure nobody is watching. A **closed** vacancy does not block: its link already
 * explains itself.
 */
describe('Hiring — removing an assigned interviewer', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let calendar: StubCalendarProvider;

  const removeMember = (session: Signed, membershipId: string) =>
    request(app.getHttpServer())
      .delete(`/api/organizations/${session.organizationId}/members/${membershipId}`)
      .set('Cookie', session.cookies);

  const membershipOf = (accountId: string) =>
    prisma.membership.findUniqueOrThrow({ where: { accountId } });

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

  /** TC-H01-INT-06 */
  it('blocks removal while an open vacancy is assigned, and allows it once closed', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const pat = await addMember(prisma, admin.organizationId, {
      email: 'interviewer@acme.com',
      role: 'user',
    });

    const open = await createVacancy(app, admin, {
      title: 'React Engineer',
      interviewerAccountId: pat.accountId,
    });
    const closed = await createVacancy(app, admin, {
      title: 'DotNet Engineer',
      interviewerAccountId: pat.accountId,
    });
    await prisma.vacancy.update({ where: { id: closed.id }, data: { status: 'closed' } });

    const membership = await membershipOf(pat.accountId);

    const blocked = await removeMember(admin, membership.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('interviewer_on_open_vacancies');
    expect(blocked.body.message).toBe("Reassign or close this member's open vacancies first");
    // The count travels with the refusal so the screen can name it.
    expect(blocked.body.openVacancies).toBe(1);
    expect((await membershipOf(pat.accountId)).status).toBe('active');

    // Closing the last open vacancy is all it takes — the closed one never counted.
    await prisma.vacancy.update({ where: { id: open.id }, data: { status: 'closed' } });

    const allowed = await removeMember(admin, membership.id);
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({ success: true });
    expect((await membershipOf(pat.accountId)).status).toBe('removed');
  });

  it('counts only this member, and only in this organization', async () => {
    const acme = await signup(app, 'pat@acme.com', 'Acme Inc');
    const globex = await signup(app, 'sam@globex.com', 'Globex');

    const bystander = await addMember(prisma, acme.organizationId, {
      email: 'bystander@acme.com',
      role: 'user',
    });

    // Open vacancies exist — assigned to somebody else, and in another organization.
    await createVacancy(app, acme, { title: 'React Engineer' });
    await createVacancy(app, globex, { title: 'React Engineer' });

    const membership = await membershipOf(bystander.accountId);
    const response = await removeMember(acme, membership.id);

    expect(response.status).toBe(200);
    expect((await membershipOf(bystander.accountId)).status).toBe('removed');
  });

  it('reassigning the vacancy unblocks the removal', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const interviewer = await addMember(prisma, admin.organizationId, {
      email: 'interviewer@acme.com',
      role: 'user',
    });
    const vacancy = await createVacancy(app, admin, {
      interviewerAccountId: interviewer.accountId,
    });
    const membership = await membershipOf(interviewer.accountId);

    expect((await removeMember(admin, membership.id)).status).toBe(409);

    const reassigned = await request(app.getHttpServer())
      .patch(`/api/organizations/${admin.organizationId}/hiring/vacancies/${vacancy.id}`)
      .set('Cookie', admin.cookies)
      .send({ interviewerAccountId: admin.accountId });
    expect(reassigned.status).toBe(200);

    expect((await removeMember(admin, membership.id)).status).toBe(200);
  });

  /**
   * The guards user-management spec 04 already owns. They are asserted here because
   * this endpoint arrives with hiring's guard and they run alongside it.
   */
  it('keeps spec 04 own refusals: self, the last admin, a stranger, and a stale role', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const other = await addMember(prisma, admin.organizationId, {
      email: 'sam@acme.com',
      role: 'user',
    });
    const own = await membershipOf(admin.accountId);
    const theirs = await membershipOf(other.accountId);

    const self = await removeMember(admin, own.id);
    expect(self.status).toBe(409);
    // Self-delete is refused before the last-admin count is even reached.
    expect(self.body.error).toBe('cannot_remove_self');

    const stranger = await signup(app, 'sam@globex.com', 'Globex');
    const strangerMembership = await membershipOf(stranger.accountId);
    expect((await removeMember(admin, strangerMembership.id)).status).toBe(404);

    // Promote the target, then try again: an organization must keep an admin, and
    // there are now two, so this one succeeds.
    await setRole(prisma, other.accountId, 'admin');
    expect((await removeMember(admin, theirs.id)).status).toBe(200);
    // Removing the same membership twice is a conflict, not a second success.
    expect((await removeMember(admin, theirs.id)).body.error).toBe('already_removed');
  });

  it('refuses user and viewer', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const other = await addMember(prisma, admin.organizationId, {
      email: 'sam@acme.com',
      role: 'user',
    });
    const theirs = await membershipOf(other.accountId);

    for (const role of ['user', 'viewer']) {
      await setRole(prisma, admin.accountId, role);
      const response = await removeMember(admin, theirs.id);
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('forbidden');
    }

    expect((await membershipOf(other.accountId)).status).toBe('active');
  });

  it('revokes the removed member sessions', async () => {
    const admin = await signup(app, 'pat@acme.com');
    const other = await addMember(prisma, admin.organizationId, {
      email: 'sam@acme.com',
      role: 'user',
    });
    const before = await prisma.account.findUniqueOrThrow({ where: { id: other.accountId } });
    const theirs = await membershipOf(other.accountId);

    expect((await removeMember(admin, theirs.id)).status).toBe(200);

    const after = await prisma.account.findUniqueOrThrow({ where: { id: other.accountId } });
    // One column write invalidates every outstanding cookie at once.
    expect(after.securityStamp).not.toBe(before.securityStamp);
  });
});
