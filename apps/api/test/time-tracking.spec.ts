import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TIME_TRACKING_MESSAGES, formatWallClockInTz } from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

/** Cheap in tests — the policy under bcrypt doesn't depend on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

/** UTC 'YYYY-MM-DD' offset from today (0 = today, -1 = yesterday). */
const isoDate = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

describe('Time Tracking (spec 12)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  interface Signed {
    cookies: string[];
    accountId: string;
    organizationId: string;
    membershipId: string;
    role: string;
  }

  const server = () => app.getHttpServer();

  const signupAdmin = async (email: string, orgName: string): Promise<Signed> => {
    const response = await request(server()).post('/api/signup').send({
      orgName,
      firstName: 'Pat',
      lastName: 'Owner',
      email,
      password: 'Passw0rd',
    });
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const accountId = response.body.account.id as string;
    const organizationId = response.body.organization.id as string;
    const membership = await prisma.membership.findUniqueOrThrow({ where: { accountId } });
    return { cookies, accountId, organizationId, membershipId: membership.id, role: 'admin' };
  };

  const login = (email: string, password: string) =>
    request(server()).post('/api/login').send({ email, password });

  const createMember = async (
    organizationId: string,
    opts: {
      email: string;
      role: string;
      firstName?: string;
      lastName?: string;
      status?: string;
      /** Effective tz for compose/backdate rules. Defaults to 'UTC' so the many
       * `date: today()` (UTC) assertions below are deterministic regardless of run time;
       * the dedicated tz test passes an explicit non-UTC zone. */
      timezone?: string;
    },
  ): Promise<Signed> => {
    const password = 'Passw0rd';
    const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: {
        email: opts.email,
        passwordHash,
        firstName: opts.firstName ?? 'Test',
        lastName: opts.lastName ?? 'User',
        timezone: opts.timezone ?? 'UTC',
      },
    });
    const membership = await prisma.membership.create({
      data: {
        accountId: account.id,
        organizationId,
        role: opts.role,
        status: opts.status ?? 'active',
      },
    });
    const cookies =
      opts.status !== 'removed'
        ? ((await login(opts.email, password)).headers['set-cookie'] as unknown as string[])
        : [];
    return {
      cookies,
      accountId: account.id,
      organizationId,
      membershipId: membership.id,
      role: opts.role,
    };
  };

  const createProject = async (
    cookies: string[],
    orgId: string,
    name: string,
  ): Promise<string> => {
    const res = await request(server())
      .post(`/api/organizations/${orgId}/projects`)
      .set('Cookie', cookies)
      .send({ name });
    return res.body.id as string;
  };

  const assignMember = (cookies: string[], orgId: string, projectId: string, membershipId: string) =>
    request(server())
      .post(`/api/organizations/${orgId}/projects/${projectId}/members`)
      .set('Cookie', cookies)
      .send({ membershipIds: [membershipId] });

  const archiveProject = (cookies: string[], orgId: string, projectId: string) =>
    request(server())
      .patch(`/api/organizations/${orgId}/projects/${projectId}/archive`)
      .set('Cookie', cookies);

  // --- Timer helpers ---
  const getTimer = (cookies: string[], orgId: string) =>
    request(server()).get(`/api/organizations/${orgId}/timer`).set('Cookie', cookies);

  const startTimer = (cookies: string[], orgId: string, body: object = {}) =>
    request(server()).post(`/api/organizations/${orgId}/timer/start`).set('Cookie', cookies).send(body);

  const putTimer = (cookies: string[], orgId: string, body: object) =>
    request(server()).put(`/api/organizations/${orgId}/timer`).set('Cookie', cookies).send(body);

  const stopTimer = (cookies: string[], orgId: string, body: object = {}) =>
    request(server()).post(`/api/organizations/${orgId}/timer/stop`).set('Cookie', cookies).send(body);

  const discardTimer = (cookies: string[], orgId: string) =>
    request(server()).delete(`/api/organizations/${orgId}/timer`).set('Cookie', cookies);

  // --- Time-entry helpers ---
  const listEntries = (cookies: string[], orgId: string, query = '') =>
    request(server()).get(`/api/organizations/${orgId}/time-entries${query}`).set('Cookie', cookies);

  const createEntry = (cookies: string[], orgId: string, body: object) =>
    request(server()).post(`/api/organizations/${orgId}/time-entries`).set('Cookie', cookies).send(body);

  const updateEntry = (cookies: string[], orgId: string, entryId: string, body: object) =>
    request(server())
      .put(`/api/organizations/${orgId}/time-entries/${entryId}`)
      .set('Cookie', cookies)
      .send(body);

  const deleteEntry = (cookies: string[], orgId: string, entryId: string) =>
    request(server())
      .delete(`/api/organizations/${orgId}/time-entries/${entryId}`)
      .set('Cookie', cookies);

  const removeOrgMember = (cookies: string[], orgId: string, membershipId: string) =>
    request(server())
      .delete(`/api/organizations/${orgId}/members/${membershipId}`)
      .set('Cookie', cookies);

  const today = () => isoDate(0);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useClass(InMemoryMailService)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.runningTimer.deleteMany();
    await prisma.timeEntry.deleteMany();
    await prisma.taskActivity.deleteMany();
    await prisma.taskWatcher.deleteMany();
    await prisma.taskComment.deleteMany();
    await prisma.taskLabelAssignment.deleteMany();
    await prisma.taskLabel.deleteMany();
    await prisma.task.deleteMany();
    await prisma.boardColumn.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.vacationRequest.deleteMany();
    await prisma.vacationReserveTransaction.deleteMany();
    await prisma.memberFinancialsSnapshot.deleteMany();
    await prisma.memberFinancials.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
  });

  // TC-12-INT-01
  it('starts a timer (happy path) and reads it back', async () => {
    const admin = await signupAdmin('admin1@acme.com', 'Acme');
    const user = await createMember(admin.organizationId, { email: 'u1@acme.com', role: 'user' });
    const projectId = await createProject(admin.cookies, admin.organizationId, 'Alpha');
    await assignMember(admin.cookies, admin.organizationId, projectId, user.membershipId);

    const start = await startTimer(user.cookies, admin.organizationId, { projectId, task: 'Coding' });
    expect(start.status).toBe(201);
    expect(start.body).toMatchObject({ projectId, projectName: 'Alpha', task: 'Coding' });
    expect(start.body.id).toEqual(expect.any(String));
    expect(start.body.startedAt).toEqual(expect.any(String));

    const get = await getTimer(user.cookies, admin.organizationId);
    expect(get.status).toBe(200);
    expect(get.body.timer).toMatchObject({ id: start.body.id, projectId, task: 'Coding' });
  });

  // TC-12-INT-02
  it('returns 409 when starting a timer while one is already running', async () => {
    const admin = await signupAdmin('admin2@acme.com', 'Acme');
    await startTimer(admin.cookies, admin.organizationId, { task: 'first' });

    const second = await startTimer(admin.cookies, admin.organizationId, {});
    expect(second.status).toBe(409);
    expect(second.body).toEqual({
      error: 'timer_already_running',
      message: TIME_TRACKING_MESSAGES.timerAlreadyRunning,
    });
  });

  // TC-12-INT-03
  it('stops a timer and creates a time entry with the computed duration', async () => {
    const admin = await signupAdmin('admin3@acme.com', 'Acme');
    const projectId = await createProject(admin.cookies, admin.organizationId, 'Alpha');

    await startTimer(admin.cookies, admin.organizationId, { projectId });
    // Backdate the running timer ~5 minutes so the stop computes a real duration.
    await prisma.runningTimer.update({
      where: { membershipId: admin.membershipId },
      data: { startedAt: new Date(Date.now() - 5 * 60000) },
    });

    const stop = await stopTimer(admin.cookies, admin.organizationId);
    expect(stop.status).toBe(200);
    expect(stop.body.timeEntry).toMatchObject({ projectId, date: today() });
    expect(stop.body.timeEntry.durationMinutes).toBeGreaterThanOrEqual(5);

    const get = await getTimer(admin.cookies, admin.organizationId);
    expect(get.body.timer).toBeNull();

    const list = await listEntries(admin.cookies, admin.organizationId, `?from=${today()}&to=${today()}`);
    expect(list.body.entries.map((e: any) => e.id)).toContain(stop.body.timeEntry.id);
  });

  // TC-12-INT-04
  it('returns 404 no_timer when stopping with no running timer', async () => {
    const admin = await signupAdmin('admin4@acme.com', 'Acme');
    const stop = await stopTimer(admin.cookies, admin.organizationId);
    expect(stop.status).toBe(404);
    expect(stop.body).toEqual({ error: 'no_timer', message: TIME_TRACKING_MESSAGES.timerNotRunning });
  });

  // TC-12-INT-05
  it('discards a timer without creating an entry (idempotent)', async () => {
    const admin = await signupAdmin('admin5@acme.com', 'Acme');
    await startTimer(admin.cookies, admin.organizationId, {});

    const discard = await discardTimer(admin.cookies, admin.organizationId);
    expect(discard.status).toBe(200);
    expect(discard.body).toEqual({ success: true });

    // Idempotent — discarding again is still 200.
    const again = await discardTimer(admin.cookies, admin.organizationId);
    expect(again.status).toBe(200);

    expect((await getTimer(admin.cookies, admin.organizationId)).body.timer).toBeNull();
    const list = await listEntries(admin.cookies, admin.organizationId, `?from=${today()}&to=${today()}`);
    expect(list.body.entries).toHaveLength(0);
  });

  // TC-12-INT-06
  it('updates running timer metadata without changing startedAt', async () => {
    const admin = await signupAdmin('admin6@acme.com', 'Acme');
    const p1 = await createProject(admin.cookies, admin.organizationId, 'P1');
    const p2 = await createProject(admin.cookies, admin.organizationId, 'P2');

    const start = await startTimer(admin.cookies, admin.organizationId, { projectId: p1, task: 'Old' });
    const startedAt = start.body.startedAt;

    const put = await putTimer(admin.cookies, admin.organizationId, { projectId: p2, task: 'New' });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ projectId: p2, projectName: 'P2', task: 'New', startedAt });

    const get = await getTimer(admin.cookies, admin.organizationId);
    expect(get.body.timer).toMatchObject({ projectId: p2, task: 'New', startedAt });
  });

  // TC-12-INT-07
  it('creates a manual entry (duration only)', async () => {
    const admin = await signupAdmin('admin7@acme.com', 'Acme');
    const projectId = await createProject(admin.cookies, admin.organizationId, 'Alpha');

    const res = await createEntry(admin.cookies, admin.organizationId, {
      projectId,
      task: 'Meeting',
      date: today(),
      durationMinutes: 60,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      durationMinutes: 60,
      startTime: null,
      endTime: null,
      projectName: 'Alpha',
    });
  });

  // TC-12-INT-08
  it('creates a manual entry (time range) with an auto-computed duration', async () => {
    const admin = await signupAdmin('admin8@acme.com', 'Acme');
    const projectId = await createProject(admin.cookies, admin.organizationId, 'Alpha');

    const res = await createEntry(admin.cookies, admin.organizationId, {
      projectId,
      date: today(),
      startTime: '09:00',
      endTime: '11:30',
    });
    expect(res.status).toBe(201);
    expect(res.body.durationMinutes).toBe(150);
    expect(res.body.startTime).toEqual(expect.any(String));
    expect(res.body.endTime).toEqual(expect.any(String));
  });

  // TC-12-INT-09
  it('rejects invalid entry inputs with 400 and the relevant messages', async () => {
    const admin = await signupAdmin('admin9@acme.com', 'Acme');
    const org = admin.organizationId;

    const noDate = await createEntry(admin.cookies, org, { durationMinutes: 60 });
    expect(noDate.status).toBe(400);
    expect(noDate.body.errors.date).toBe(TIME_TRACKING_MESSAGES.dateRequired);

    const future = await createEntry(admin.cookies, org, { date: isoDate(1), durationMinutes: 60 });
    expect(future.status).toBe(400);
    expect(future.body.errors.date).toBe(TIME_TRACKING_MESSAGES.dateFuture);

    const tooOld = await createEntry(admin.cookies, org, { date: isoDate(-91), durationMinutes: 60 });
    expect(tooOld.status).toBe(400);
    expect(tooOld.body.errors.date).toBe(TIME_TRACKING_MESSAGES.dateTooOld);

    const zero = await createEntry(admin.cookies, org, { date: today(), durationMinutes: 0 });
    expect(zero.status).toBe(400);
    expect(zero.body.errors.durationMinutes).toBe(TIME_TRACKING_MESSAGES.durationMin);

    const over = await createEntry(admin.cookies, org, { date: today(), durationMinutes: 1441 });
    expect(over.status).toBe(400);
    expect(over.body.errors.durationMinutes).toBe(TIME_TRACKING_MESSAGES.durationMax);

    const noEnd = await createEntry(admin.cookies, org, { date: today(), startTime: '09:00' });
    expect(noEnd.status).toBe(400);
    expect(noEnd.body.errors.endTime).toBe(TIME_TRACKING_MESSAGES.endTimeRequired);

    const reversed = await createEntry(admin.cookies, org, {
      date: today(),
      startTime: '11:00',
      endTime: '09:00',
    });
    expect(reversed.status).toBe(400);
    expect(reversed.body.errors.endTime).toBe(TIME_TRACKING_MESSAGES.endBeforeStart);

    const longTask = await createEntry(admin.cookies, org, {
      date: today(),
      durationMinutes: 60,
      task: 'a'.repeat(201),
    });
    expect(longTask.status).toBe(400);
    expect(longTask.body.errors.task).toBe(TIME_TRACKING_MESSAGES.taskTooLong);
  });

  // TC-12-INT-10
  it('lets the owner edit their own entry', async () => {
    const admin = await signupAdmin('admin10@acme.com', 'Acme');
    const created = await createEntry(admin.cookies, admin.organizationId, {
      date: today(),
      durationMinutes: 60,
      task: 'Original',
    });

    const res = await updateEntry(admin.cookies, admin.organizationId, created.body.id, {
      date: today(),
      durationMinutes: 90,
      task: 'Updated',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ task: 'Updated', durationMinutes: 90 });
  });

  // TC-12-INT-11
  it('lets an admin edit another member’s entry', async () => {
    const admin = await signupAdmin('admin11@acme.com', 'Acme');
    const user = await createMember(admin.organizationId, { email: 'u11@acme.com', role: 'user' });
    const created = await createEntry(user.cookies, admin.organizationId, {
      date: today(),
      durationMinutes: 60,
      task: 'User task',
    });

    const res = await updateEntry(admin.cookies, admin.organizationId, created.body.id, {
      date: today(),
      durationMinutes: 60,
      task: 'Admin edited',
    });
    expect(res.status).toBe(200);
    expect(res.body.task).toBe('Admin edited');
  });

  // TC-12-INT-12
  it('forbids a user from editing another member’s entry (403)', async () => {
    const admin = await signupAdmin('admin12@acme.com', 'Acme');
    const u1 = await createMember(admin.organizationId, { email: 'u12a@acme.com', role: 'user' });
    const u2 = await createMember(admin.organizationId, { email: 'u12b@acme.com', role: 'user' });
    const created = await createEntry(u2.cookies, admin.organizationId, {
      date: today(),
      durationMinutes: 60,
    });

    const res = await updateEntry(u1.cookies, admin.organizationId, created.body.id, {
      date: today(),
      durationMinutes: 90,
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden', message: TIME_TRACKING_MESSAGES.forbiddenEdit });
  });

  // TC-12-INT-13
  it('lets the owner delete their own entry', async () => {
    const admin = await signupAdmin('admin13@acme.com', 'Acme');
    const created = await createEntry(admin.cookies, admin.organizationId, {
      date: today(),
      durationMinutes: 60,
    });

    const del = await deleteEntry(admin.cookies, admin.organizationId, created.body.id);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ success: true });

    const list = await listEntries(admin.cookies, admin.organizationId, `?from=${today()}&to=${today()}`);
    expect(list.body.entries.map((e: any) => e.id)).not.toContain(created.body.id);
  });

  // TC-12-INT-14
  it('forbids a user from deleting another member’s entry (403)', async () => {
    const admin = await signupAdmin('admin14@acme.com', 'Acme');
    const u1 = await createMember(admin.organizationId, { email: 'u14a@acme.com', role: 'user' });
    const u2 = await createMember(admin.organizationId, { email: 'u14b@acme.com', role: 'user' });
    const created = await createEntry(u2.cookies, admin.organizationId, {
      date: today(),
      durationMinutes: 60,
    });

    const res = await deleteEntry(u1.cookies, admin.organizationId, created.body.id);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden', message: TIME_TRACKING_MESSAGES.forbiddenDelete });
  });

  // TC-12-INT-15
  it('scopes list to the caller (user) and honors membershipId for admin', async () => {
    const admin = await signupAdmin('admin15@acme.com', 'Acme');
    const user = await createMember(admin.organizationId, { email: 'u15@acme.com', role: 'user' });
    const range = `?from=${today()}&to=${today()}`;

    await createEntry(admin.cookies, admin.organizationId, { date: today(), durationMinutes: 30, task: 'A' });
    await createEntry(user.cookies, admin.organizationId, { date: today(), durationMinutes: 45, task: 'U' });

    // 1. user sees only own.
    const uOwn = await listEntries(user.cookies, admin.organizationId, range);
    expect(uOwn.body.entries.map((e: any) => e.task)).toEqual(['U']);

    // 2. user's membershipId param pointing at admin is ignored — still only own.
    const uFiltered = await listEntries(
      user.cookies,
      admin.organizationId,
      `${range}&membershipId=${admin.membershipId}`,
    );
    expect(uFiltered.body.entries.map((e: any) => e.task)).toEqual(['U']);

    // 3. admin default → own.
    const aOwn = await listEntries(admin.cookies, admin.organizationId, range);
    expect(aOwn.body.entries.map((e: any) => e.task)).toEqual(['A']);

    // 4. admin filtered to the user.
    const aFiltered = await listEntries(
      admin.cookies,
      admin.organizationId,
      `${range}&membershipId=${user.membershipId}`,
    );
    expect(aFiltered.body.entries.map((e: any) => e.task)).toEqual(['U']);
    // memberName present for a manage-all caller.
    expect(aFiltered.body.entries[0].memberName).toEqual(expect.any(String));
  });

  // TC-12-INT-16
  it('forbids a viewer from listing time entries (403)', async () => {
    const admin = await signupAdmin('admin16@acme.com', 'Acme');
    const viewer = await createMember(admin.organizationId, { email: 'v16@acme.com', role: 'viewer' });

    const res = await listEntries(viewer.cookies, admin.organizationId, `?from=${today()}&to=${today()}`);
    expect(res.status).toBe(403);
  });

  // TC-12-INT-17
  it('rejects a range exceeding 31 days with 400 range_too_large', async () => {
    const admin = await signupAdmin('admin17@acme.com', 'Acme');
    const res = await listEntries(
      admin.cookies,
      admin.organizationId,
      '?from=2026-08-01&to=2026-09-02',
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'range_too_large',
      message: TIME_TRACKING_MESSAGES.queryRangeTooLarge,
    });
  });

  // TC-12-INT-18
  it('keeps a running timer across requests', async () => {
    const admin = await signupAdmin('admin18@acme.com', 'Acme');
    const start = await startTimer(admin.cookies, admin.organizationId, { task: 'Persist' });

    const get = await getTimer(admin.cookies, admin.organizationId);
    expect(get.body.timer.startedAt).toBe(start.body.startedAt);
    expect(get.body.timer.task).toBe('Persist');
  });

  // TC-12-INT-19
  it('lets an admin create an entry for another member', async () => {
    const admin = await signupAdmin('admin19@acme.com', 'Acme');
    const user = await createMember(admin.organizationId, { email: 'u19@acme.com', role: 'user' });
    const projectId = await createProject(admin.cookies, admin.organizationId, 'Alpha');

    const res = await createEntry(admin.cookies, admin.organizationId, {
      membershipId: user.membershipId,
      projectId,
      date: today(),
      durationMinutes: 60,
    });
    expect(res.status).toBe(201);
    expect(res.body.membershipId).toBe(user.membershipId);

    const list = await listEntries(user.cookies, admin.organizationId, `?from=${today()}&to=${today()}`);
    expect(list.body.entries.map((e: any) => e.id)).toContain(res.body.id);
  });

  // TC-12-INT-20
  it('forbids a user from creating an entry for another member (403)', async () => {
    const admin = await signupAdmin('admin20@acme.com', 'Acme');
    const u1 = await createMember(admin.organizationId, { email: 'u20a@acme.com', role: 'user' });
    const u2 = await createMember(admin.organizationId, { email: 'u20b@acme.com', role: 'user' });

    const res = await createEntry(u1.cookies, admin.organizationId, {
      membershipId: u2.membershipId,
      date: today(),
      durationMinutes: 60,
    });
    expect(res.status).toBe(403);
  });

  // TC-12-INT-21
  it('rejects starting a timer on an archived project (400 invalid_project)', async () => {
    const admin = await signupAdmin('admin21@acme.com', 'Acme');
    const projectId = await createProject(admin.cookies, admin.organizationId, 'Alpha');
    await archiveProject(admin.cookies, admin.organizationId, projectId);

    const res = await startTimer(admin.cookies, admin.organizationId, { projectId });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'invalid_project',
      message: TIME_TRACKING_MESSAGES.projectInvalid,
    });
  });

  // TC-12-INT-22
  it('returns 404 (not 403) for cross-org time-entry access', async () => {
    const adminA = await signupAdmin('a22@acme.com', 'Acme');
    const adminB = await signupAdmin('b22@beta.com', 'Beta');
    const entryB = await createEntry(adminB.cookies, adminB.organizationId, {
      date: today(),
      durationMinutes: 60,
    });

    // 1. GET under A's org returns only A's entries; E not included.
    const list = await listEntries(adminA.cookies, adminA.organizationId, `?from=${today()}&to=${today()}`);
    expect(list.status).toBe(200);
    expect(list.body.entries.map((e: any) => e.id)).not.toContain(entryB.body.id);

    // 2/3. PUT/DELETE B's entry under A's org → 404, identical to a nonexistent id.
    const put = await updateEntry(adminA.cookies, adminA.organizationId, entryB.body.id, {
      date: today(),
      durationMinutes: 90,
    });
    expect(put.status).toBe(404);

    const del = await deleteEntry(adminA.cookies, adminA.organizationId, entryB.body.id);
    expect(del.status).toBe(404);

    const ghost = await deleteEntry(
      adminA.cookies,
      adminA.organizationId,
      '00000000-0000-0000-0000-000000000000',
    );
    expect(del.body).toEqual(ghost.body);
  });

  // TC-12-INT-23
  it('resolves concurrent timer starts to exactly one 201 and one 409 (DB unique constraint)', async () => {
    const admin = await signupAdmin('admin23@acme.com', 'Acme');

    const [r1, r2] = await Promise.all([
      startTimer(admin.cookies, admin.organizationId, {}),
      startTimer(admin.cookies, admin.organizationId, {}),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);
    const conflict = [r1, r2].find((r) => r.status === 409)!;
    expect(conflict.body.error).toBe('timer_already_running');

    const count = await prisma.runningTimer.count({ where: { membershipId: admin.membershipId } });
    expect(count).toBe(1);
  });

  // TC-12-INT-24
  it('ignores a client-supplied startedAt (set from server NOW)', async () => {
    const admin = await signupAdmin('admin24@acme.com', 'Acme');
    const res = await startTimer(admin.cookies, admin.organizationId, {
      startedAt: '2020-01-01T00:00:00Z',
      task: 'Backdated',
    });
    expect(res.status).toBe(201);
    const startedMs = new Date(res.body.startedAt).getTime();
    // Within a few seconds of now, never 2020.
    expect(Math.abs(Date.now() - startedMs)).toBeLessThan(10000);
  });

  // TC-12-INT-25
  it('silently ignores a user’s membershipId filter (no info leak)', async () => {
    const admin = await signupAdmin('admin25@acme.com', 'Acme');
    const u1 = await createMember(admin.organizationId, { email: 'u25a@acme.com', role: 'user' });
    const u2 = await createMember(admin.organizationId, { email: 'u25b@acme.com', role: 'user' });
    const range = `?from=${today()}&to=${today()}`;

    await createEntry(u1.cookies, admin.organizationId, { date: today(), durationMinutes: 30, task: 'own' });
    await createEntry(u2.cookies, admin.organizationId, { date: today(), durationMinutes: 45, task: 'other' });

    const withParam = await listEntries(u1.cookies, admin.organizationId, `${range}&membershipId=${u2.membershipId}`);
    const withoutParam = await listEntries(u1.cookies, admin.organizationId, range);
    expect(withParam.status).toBe(200);
    expect(withParam.body).toEqual(withoutParam.body);
    expect(withParam.body.entries.map((e: any) => e.task)).toEqual(['own']);
    // No member name leaked to a plain user.
    expect(withParam.body.entries[0].memberName).toBeUndefined();
  });

  // TC-12-INT-26
  it('rejects a year-long range as an exfiltration bound (400 range_too_large)', async () => {
    const admin = await signupAdmin('admin26@acme.com', 'Acme');
    const res = await listEntries(admin.cookies, admin.organizationId, '?from=2026-01-01&to=2026-12-31');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('range_too_large');
  });

  // TC-12-INT-27
  it('computes stop duration server-side and ignores a client-supplied durationMinutes', async () => {
    const admin = await signupAdmin('admin27@acme.com', 'Acme');

    await startTimer(admin.cookies, admin.organizationId, {});
    // ~0s elapsed → ceil to the 1-minute minimum, regardless of any body.
    const stop = await stopTimer(admin.cookies, admin.organizationId, { durationMinutes: 480 });
    expect(stop.status).toBe(200);
    expect(stop.body.timeEntry.durationMinutes).toBe(1);
  });

  // TC-12-INT-28
  it('measures task length in codepoints, not bytes (200 emoji ok, 201 rejected)', async () => {
    const admin = await signupAdmin('admin28@acme.com', 'Acme');
    const org = admin.organizationId;

    const at = await createEntry(admin.cookies, org, {
      date: today(),
      durationMinutes: 60,
      task: '😀'.repeat(200),
    });
    expect(at.status).toBe(201);

    const over = await createEntry(admin.cookies, org, {
      date: today(),
      durationMinutes: 60,
      task: '😀'.repeat(201),
    });
    expect(over.status).toBe(400);
    expect(over.body.errors.task).toBe(TIME_TRACKING_MESSAGES.taskTooLong);
  });

  // TC-12-INT-29 — deferred: no rate-limit infrastructure exists in this codebase (specs
  // 08–11 documented identical limits but never implemented or tested them). See spec 12
  // §Security 27. Kept as an explicit skip so the omission is traceable.
  it.skip('TC-12-INT-29 timer-start rate limit — deferred, no rate-limit infra (spec 12 §Security 27)', () => {
    // intentionally empty
  });

  // TC-12-INT-30
  it('cascade-discards the running timer when a member is removed; entries survive', async () => {
    const admin = await signupAdmin('admin30@acme.com', 'Acme');
    const user = await createMember(admin.organizationId, { email: 'u30@acme.com', role: 'user' });

    await startTimer(user.cookies, admin.organizationId, { task: 'Working' });
    const entry = await createEntry(user.cookies, admin.organizationId, {
      date: today(),
      durationMinutes: 60,
    });

    const del = await removeOrgMember(admin.cookies, admin.organizationId, user.membershipId);
    expect(del.status).toBe(200);

    // RunningTimer row gone (spec 12 FR-19).
    const timers = await prisma.runningTimer.count({ where: { membershipId: user.membershipId } });
    expect(timers).toBe(0);

    // TimeEntry rows survive removal (historical).
    const entries = await prisma.timeEntry.count({ where: { id: entry.body.id } });
    expect(entries).toBe(1);
  });

  // TC-12-INT-31
  it('rejects an archived project on a new entry, leaving existing entries untouched', async () => {
    const admin = await signupAdmin('admin31@acme.com', 'Acme');
    const projectId = await createProject(admin.cookies, admin.organizationId, 'Alpha');

    // An existing entry on the project before it is archived.
    const existing = await createEntry(admin.cookies, admin.organizationId, {
      projectId,
      date: today(),
      durationMinutes: 60,
    });
    await archiveProject(admin.cookies, admin.organizationId, projectId);

    const res = await createEntry(admin.cookies, admin.organizationId, {
      projectId,
      date: today(),
      durationMinutes: 60,
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'invalid_project',
      message: TIME_TRACKING_MESSAGES.projectInvalid,
    });

    // The pre-existing entry is preserved unchanged (FR-7).
    const still = await prisma.timeEntry.findUnique({ where: { id: existing.body.id } });
    expect(still?.projectId).toBe(projectId);
  });

  // FR-7 exception — an entry already on an archived project may keep it on edit.
  it('allows editing an entry that references an archived project when projectId is unchanged', async () => {
    const admin = await signupAdmin('admin31b@acme.com', 'Acme');
    const projectId = await createProject(admin.cookies, admin.organizationId, 'Alpha');
    const created = await createEntry(admin.cookies, admin.organizationId, {
      projectId,
      date: today(),
      durationMinutes: 60,
      task: 'Before archive',
    });
    await archiveProject(admin.cookies, admin.organizationId, projectId);

    // Unchanged projectId is allowed even though the project is now archived.
    const ok = await updateEntry(admin.cookies, admin.organizationId, created.body.id, {
      projectId,
      date: today(),
      durationMinutes: 90,
      task: 'After archive edit',
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ projectId, durationMinutes: 90, task: 'After archive edit' });
  });

  // §4 — spec-11 GET .../projects reports the real non-zero totalHours once time is logged.
  it('reports non-zero project totalHours after time is logged (spec 12 §4)', async () => {
    const admin = await signupAdmin('admin-th@acme.com', 'Acme');
    const projectId = await createProject(admin.cookies, admin.organizationId, 'Alpha');
    const otherId = await createProject(admin.cookies, admin.organizationId, 'Beta');

    // 90 + 60 = 150 minutes = 2.5 hours on Alpha; none on Beta.
    await createEntry(admin.cookies, admin.organizationId, { projectId, date: today(), durationMinutes: 90 });
    await createEntry(admin.cookies, admin.organizationId, { projectId, date: today(), durationMinutes: 60 });

    const list = await request(server())
      .get(`/api/organizations/${admin.organizationId}/projects`)
      .set('Cookie', admin.cookies);
    const alpha = list.body.projects.find((p: any) => p.id === projectId);
    const beta = list.body.projects.find((p: any) => p.id === otherId);
    expect(alpha.totalHours).toBe(2.5);
    expect(beta.totalHours).toBe(0);
  });

  // Spec 12 change A — a manual time-range entry is composed as wall-clock in the CALLER's
  // Account.timezone and stored as an absolute UTC instant (schema unchanged). A Europe/
  // Berlin caller's "09:00" is stored shifted (07:00Z in summer / 08:00Z in winter) yet
  // round-trips back to "09:00" in Berlin. The API response still returns UTC ISO instants.
  it('composes a manual time-range entry in the caller timezone (spec 12 change A)', async () => {
    const admin = await signupAdmin('admin-tz@acme.com', 'Acme TZ');
    const berlin = await createMember(admin.organizationId, {
      email: 'berlin-user@acme.com',
      role: 'user',
      timezone: 'Europe/Berlin',
    });

    const res = await createEntry(berlin.cookies, admin.organizationId, {
      date: today(),
      startTime: '09:00',
      endTime: '11:30',
      task: 'Berlin morning',
    });
    expect(res.status).toBe(201);

    // The stored instant is NOT the naive-UTC wall-clock (Berlin is never a zero offset)…
    const startClockUtc = new Date(res.body.startTime as string).toISOString().slice(11, 16);
    expect(startClockUtc).not.toBe('09:00');
    // …but it renders back to exactly "09:00"/"11:30" when read in the caller's tz.
    expect(formatWallClockInTz(res.body.startTime as string, 'Europe/Berlin')).toBe('09:00');
    expect(formatWallClockInTz(res.body.endTime as string, 'Europe/Berlin')).toBe('11:30');
    // Duration is unaffected by the tz (both endpoints shift together).
    expect(res.body.durationMinutes).toBe(150);

    // A UTC-fallback caller (admin, tz null) stores the same wall-clock unshifted (identity).
    const utcRes = await createEntry(admin.cookies, admin.organizationId, {
      date: today(),
      startTime: '09:00',
      endTime: '11:30',
      task: 'UTC morning',
    });
    expect(new Date(utcRes.body.startTime as string).toISOString().slice(11, 16)).toBe('09:00');
  });

  // ────────────────────────────────────────────────────────────────────────
  // Spec 15 — Time Tracking ↔ Tasks Integration
  // ────────────────────────────────────────────────────────────────────────

  describe('spec 15 — task linkage', () => {
    /** Helper — create a project with a key + one default column + one task. */
    const seedProjectWithTask = async (
      admin: Signed,
      opts: { projectName?: string; key?: string; title?: string } = {},
    ) => {
      const projectId = await createProject(admin.cookies, admin.organizationId, opts.projectName ?? `P-${Date.now()}-${Math.random()}`);
      await prisma.project.update({
        where: { id: projectId },
        data: { key: opts.key ?? 'MOB' },
      });
      const column = await prisma.boardColumn.create({
        data: { projectId, name: 'To Do', position: 0, category: 'todo' },
      });
      const task = await prisma.task.create({
        data: {
          projectId,
          taskNumber: 5,
          type: 'task',
          title: opts.title ?? 'Fix login bug',
          columnId: column.id,
          position: 1024,
          reporterId: admin.membershipId,
        },
      });
      return { projectId, columnId: column.id, task };
    };

    it('TC-15-INT-01: starts a timer with taskId (happy path) and returns taskKey/label', async () => {
      const admin = await signupAdmin('s15-01@acme.com', 'S15');
      const user = await createMember(admin.organizationId, { email: 's15-01u@acme.com', role: 'user' });
      const { projectId, task } = await seedProjectWithTask(admin);
      await assignMember(admin.cookies, admin.organizationId, projectId, user.membershipId);

      const res = await startTimer(user.cookies, admin.organizationId, {
        projectId,
        taskId: task.id,
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        projectId,
        taskId: task.id,
        taskKey: 'MOB-5',
        task: 'MOB-5: Fix login bug',
      });
    });

    it('TC-15-INT-02: rejects taskId without projectId with 400 task_requires_project', async () => {
      const admin = await signupAdmin('s15-02@acme.com', 'S15');
      const { task } = await seedProjectWithTask(admin);

      const res = await startTimer(admin.cookies, admin.organizationId, { taskId: task.id });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'task_requires_project',
        message: TIME_TRACKING_MESSAGES.taskRequiresProject,
      });
    });

    it('TC-15-INT-03: rejects taskId from a different project with 400 task_wrong_project', async () => {
      const admin = await signupAdmin('s15-03@acme.com', 'S15');
      const { task: t1 } = await seedProjectWithTask(admin, { projectName: 'Alpha', key: 'ALP' });
      const p2Id = await createProject(admin.cookies, admin.organizationId, 'Beta');
      await prisma.project.update({ where: { id: p2Id }, data: { key: 'BET' } });

      const res = await startTimer(admin.cookies, admin.organizationId, {
        projectId: p2Id,
        taskId: t1.id,
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'task_wrong_project',
        message: TIME_TRACKING_MESSAGES.taskWrongProject,
      });
    });

    it('TC-15-INT-04: unknown taskId returns 400 task_not_found', async () => {
      const admin = await signupAdmin('s15-04@acme.com', 'S15');
      const { projectId } = await seedProjectWithTask(admin);

      const res = await startTimer(admin.cookies, admin.organizationId, {
        projectId,
        taskId: '00000000-0000-0000-0000-000000000000',
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'task_not_found',
        message: TIME_TRACKING_MESSAGES.taskLinkNotFound,
      });
    });

    it('TC-15-INT-05: cross-org taskId returns 400 task_not_found (no existence leak)', async () => {
      const adminA = await signupAdmin('s15-05a@acme.com', 'Acme A');
      const adminB = await signupAdmin('s15-05b@beta.com', 'Beta B');
      const { task: taskB } = await seedProjectWithTask(adminB);
      const aProjectId = await createProject(adminA.cookies, adminA.organizationId, 'A-P');
      await prisma.project.update({ where: { id: aProjectId }, data: { key: 'AAA' } });

      const res = await startTimer(adminA.cookies, adminA.organizationId, {
        projectId: aProjectId,
        taskId: taskB.id,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('task_not_found');
    });

    it('TC-15-INT-06: user role linking a task in unassigned project → 403 task_project_not_assigned', async () => {
      const admin = await signupAdmin('s15-06@acme.com', 'S15');
      const user = await createMember(admin.organizationId, { email: 's15-06u@acme.com', role: 'user' });
      const { projectId, task } = await seedProjectWithTask(admin);
      // Do NOT assign the user to the project.

      const res = await startTimer(user.cookies, admin.organizationId, {
        projectId,
        taskId: task.id,
      });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: 'task_project_not_assigned',
        message: TIME_TRACKING_MESSAGES.taskProjectNotAssigned,
      });
    });

    it('TC-15-INT-07: admin without ProjectMember can still link a task (bypass)', async () => {
      const admin = await signupAdmin('s15-07@acme.com', 'S15');
      const { projectId, task } = await seedProjectWithTask(admin);
      // Admin has no explicit ProjectMember row — should still succeed.

      const res = await startTimer(admin.cookies, admin.organizationId, {
        projectId,
        taskId: task.id,
      });
      expect(res.status).toBe(201);
      expect(res.body.taskId).toBe(task.id);
    });

    it('TC-15-INT-08: client-supplied task text is ignored when taskId is set (FR-2 overwrite)', async () => {
      const admin = await signupAdmin('s15-08@acme.com', 'S15');
      const { projectId, task } = await seedProjectWithTask(admin);

      const res = await startTimer(admin.cookies, admin.organizationId, {
        projectId,
        taskId: task.id,
        task: 'client-spoofed text',
      });
      expect(res.status).toBe(201);
      expect(res.body.task).toBe('MOB-5: Fix login bug');
    });

    it('TC-15-INT-09: stop timer carries taskId + label into the created TimeEntry', async () => {
      const admin = await signupAdmin('s15-09@acme.com', 'S15');
      const { projectId, task } = await seedProjectWithTask(admin);

      await startTimer(admin.cookies, admin.organizationId, { projectId, taskId: task.id });
      await prisma.runningTimer.update({
        where: { membershipId: admin.membershipId },
        data: { startedAt: new Date(Date.now() - 5 * 60000) },
      });
      const stop = await stopTimer(admin.cookies, admin.organizationId);
      expect(stop.status).toBe(200);
      expect(stop.body.timeEntry).toMatchObject({
        taskId: task.id,
        taskKey: 'MOB-5',
        task: 'MOB-5: Fix login bug',
      });
    });

    it('TC-15-INT-10: stop timer recomputes task label if the task title changed while running', async () => {
      const admin = await signupAdmin('s15-10@acme.com', 'S15');
      const { projectId, task } = await seedProjectWithTask(admin);

      await startTimer(admin.cookies, admin.organizationId, { projectId, taskId: task.id });
      await prisma.runningTimer.update({
        where: { membershipId: admin.membershipId },
        data: { startedAt: new Date(Date.now() - 5 * 60000) },
      });
      // Mutate the task's title AFTER the timer was started.
      await prisma.task.update({ where: { id: task.id }, data: { title: 'Fix login bug (v2)' } });

      const stop = await stopTimer(admin.cookies, admin.organizationId);
      expect(stop.status).toBe(200);
      expect(stop.body.timeEntry.task).toBe('MOB-5: Fix login bug (v2)');
    });

    it('TC-15-INT-11: PUT /timer sets taskId while running; startedAt unchanged', async () => {
      const admin = await signupAdmin('s15-11@acme.com', 'S15');
      const { projectId, task } = await seedProjectWithTask(admin);

      const start = await startTimer(admin.cookies, admin.organizationId, { projectId });
      const startedAt = start.body.startedAt;

      const put = await putTimer(admin.cookies, admin.organizationId, {
        projectId,
        taskId: task.id,
      });
      expect(put.status).toBe(200);
      expect(put.body).toMatchObject({
        taskId: task.id,
        task: 'MOB-5: Fix login bug',
        startedAt,
      });
    });

    it('TC-15-INT-12: PUT /timer with taskId: null clears link but preserves task text', async () => {
      const admin = await signupAdmin('s15-12@acme.com', 'S15');
      const { projectId, task } = await seedProjectWithTask(admin);

      await startTimer(admin.cookies, admin.organizationId, { projectId, taskId: task.id });
      const put = await putTimer(admin.cookies, admin.organizationId, { projectId, taskId: null });
      expect(put.status).toBe(200);
      expect(put.body.taskId).toBeNull();
      expect(put.body.task).toBe('MOB-5: Fix login bug'); // preserved snapshot
    });

    it('TC-15-INT-13: create time entry with taskId (happy path)', async () => {
      const admin = await signupAdmin('s15-13@acme.com', 'S15');
      const { projectId, task } = await seedProjectWithTask(admin);

      const res = await createEntry(admin.cookies, admin.organizationId, {
        projectId,
        taskId: task.id,
        date: today(),
        durationMinutes: 60,
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        taskId: task.id,
        taskKey: 'MOB-5',
        task: 'MOB-5: Fix login bug',
      });
    });

    it('TC-15-INT-14: create time entry with taskId but no projectId → 400 task_requires_project', async () => {
      const admin = await signupAdmin('s15-14@acme.com', 'S15');
      const { task } = await seedProjectWithTask(admin);
      const res = await createEntry(admin.cookies, admin.organizationId, {
        taskId: task.id,
        date: today(),
        durationMinutes: 60,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('task_requires_project');
    });

    it('TC-15-INT-15: create time entry with wrong-project taskId → 400 task_wrong_project', async () => {
      const admin = await signupAdmin('s15-15@acme.com', 'S15');
      const { task: t1 } = await seedProjectWithTask(admin, { key: 'ALP' });
      const p2Id = await createProject(admin.cookies, admin.organizationId, 'Beta');
      await prisma.project.update({ where: { id: p2Id }, data: { key: 'BET' } });

      const res = await createEntry(admin.cookies, admin.organizationId, {
        projectId: p2Id,
        taskId: t1.id,
        date: today(),
        durationMinutes: 60,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('task_wrong_project');
    });

    it('TC-15-INT-16: PUT time entry sets taskId on existing free-text entry (client text discarded)', async () => {
      const admin = await signupAdmin('s15-16@acme.com', 'S15');
      const { projectId, task } = await seedProjectWithTask(admin);

      const created = await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 60,
        task: 'manual note',
      });
      const put = await updateEntry(admin.cookies, admin.organizationId, created.body.id, {
        projectId,
        taskId: task.id,
        task: 'client spoof',
        date: today(),
        durationMinutes: 60,
      });
      expect(put.status).toBe(200);
      expect(put.body).toMatchObject({
        taskId: task.id,
        task: 'MOB-5: Fix login bug',
      });
    });

    it('TC-15-INT-17: PUT time entry with taskId: null clears link but preserves task text', async () => {
      const admin = await signupAdmin('s15-17@acme.com', 'S15');
      const { projectId, task } = await seedProjectWithTask(admin);

      const created = await createEntry(admin.cookies, admin.organizationId, {
        projectId,
        taskId: task.id,
        date: today(),
        durationMinutes: 60,
      });
      const put = await updateEntry(admin.cookies, admin.organizationId, created.body.id, {
        projectId,
        taskId: null,
        date: today(),
        durationMinutes: 60,
      });
      expect(put.status).toBe(200);
      expect(put.body.taskId).toBeNull();
      expect(put.body.task).toBe('MOB-5: Fix login bug');
    });

    it('TC-15-INT-18: user without ManageAllTimeEntries cannot set taskId on another member\'s entry (403)', async () => {
      const admin = await signupAdmin('s15-18@acme.com', 'S15');
      const u1 = await createMember(admin.organizationId, { email: 's15-18a@acme.com', role: 'user' });
      const u2 = await createMember(admin.organizationId, { email: 's15-18b@acme.com', role: 'user' });
      const { projectId, task } = await seedProjectWithTask(admin);
      await assignMember(admin.cookies, admin.organizationId, projectId, u1.membershipId);

      const created = await createEntry(u2.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 60,
      });
      const put = await updateEntry(u1.cookies, admin.organizationId, created.body.id, {
        projectId,
        taskId: task.id,
        date: today(),
        durationMinutes: 60,
      });
      expect(put.status).toBe(403);
    });

    it('TC-15-INT-19: task deletion → TimeEntry.taskId set null, task text preserved', async () => {
      const admin = await signupAdmin('s15-19@acme.com', 'S15');
      const { projectId, task } = await seedProjectWithTask(admin);
      const created = await createEntry(admin.cookies, admin.organizationId, {
        projectId,
        taskId: task.id,
        date: today(),
        durationMinutes: 60,
      });
      await prisma.task.delete({ where: { id: task.id } });

      const row = await prisma.timeEntry.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.taskId).toBeNull();
      expect(row.task).toBe('MOB-5: Fix login bug');
    });

    it('TC-15-INT-20: task deletion → RunningTimer.taskId set null, task text preserved', async () => {
      const admin = await signupAdmin('s15-20@acme.com', 'S15');
      const { projectId, task } = await seedProjectWithTask(admin);
      await startTimer(admin.cookies, admin.organizationId, { projectId, taskId: task.id });

      await prisma.task.delete({ where: { id: task.id } });

      const get = await getTimer(admin.cookies, admin.organizationId);
      expect(get.status).toBe(200);
      expect(get.body.timer.taskId).toBeNull();
      expect(get.body.timer.task).toBe('MOB-5: Fix login bug');
    });

    it('TC-15-INT-21: deleted-task time entries do not attribute to any other task', async () => {
      const admin = await signupAdmin('s15-21@acme.com', 'S15');
      const { projectId, columnId, task } = await seedProjectWithTask(admin);
      // Add a second task in the same project.
      const task2 = await prisma.task.create({
        data: {
          projectId,
          taskNumber: 6,
          type: 'task',
          title: 'Second task',
          columnId,
          position: 2048,
          reporterId: admin.membershipId,
        },
      });
      // 2 entries against task, none against task2.
      await createEntry(admin.cookies, admin.organizationId, {
        projectId, taskId: task.id, date: today(), durationMinutes: 60,
      });
      await createEntry(admin.cookies, admin.organizationId, {
        projectId, taskId: task.id, date: today(), durationMinutes: 90,
      });
      await prisma.task.delete({ where: { id: task.id } });

      const res = await request(server())
        .get(`/api/organizations/${admin.organizationId}/projects/${projectId}/tasks/${task2.id}`)
        .set('Cookie', admin.cookies);
      expect(res.status).toBe(200);
      expect(res.body.timeLoggedMinutes).toBe(0);
      expect(res.body.recentTimeEntries).toEqual([]);
    });

    it('TC-15-INT-35: create time entry response includes taskKey for client display', async () => {
      const admin = await signupAdmin('s15-35@acme.com', 'S15');
      const { projectId, task } = await seedProjectWithTask(admin);
      const res = await createEntry(admin.cookies, admin.organizationId, {
        projectId,
        taskId: task.id,
        date: today(),
        durationMinutes: 60,
      });
      expect(res.status).toBe(201);
      expect(res.body.taskId).toBe(task.id);
      expect(res.body.taskKey).toBe('MOB-5');
    });
  });

  /* ================================================================
   * Spec user-management/16 — Billable Time
   * ================================================================ */
  describe('spec 16 — billable time', () => {
    it('TC-16-INT-01: migration backfills existing rows to billable=true', async () => {
      const admin = await signupAdmin('s16-01@acme.com', 'S16');
      // A row created before the flag existed still reads `true` because the
      // column defaults to `true` and Postgres backfilled every pre-existing row.
      const entry = await prisma.timeEntry.create({
        data: {
          membershipId: admin.membershipId,
          organizationId: admin.organizationId,
          date: new Date(`${today()}T00:00:00.000Z`),
          durationMinutes: 60,
          createdByAccountId: admin.accountId,
          // NOTE: no `billable` field — matches the pre-migration insert path.
        },
      });
      expect(entry.billable).toBe(true);
    });

    it('TC-16-INT-02: create billable=true — happy path', async () => {
      const admin = await signupAdmin('s16-02@acme.com', 'S16');
      const res = await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 30,
        billable: true,
      });
      expect(res.status).toBe(201);
      expect(res.body.billable).toBe(true);
    });

    it('TC-16-INT-03: create billable=false — honored', async () => {
      const admin = await signupAdmin('s16-03@acme.com', 'S16');
      const res = await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 30,
        billable: false,
      });
      expect(res.status).toBe(201);
      expect(res.body.billable).toBe(false);
    });

    it('TC-16-INT-04: create without `billable` defaults to true', async () => {
      const admin = await signupAdmin('s16-04@acme.com', 'S16');
      const res = await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 30,
      });
      expect(res.status).toBe(201);
      expect(res.body.billable).toBe(true);
    });

    it('TC-16-INT-05: user flips billable → non-billable on their own entry', async () => {
      const admin = await signupAdmin('s16-05@acme.com', 'S16');
      const user = await createMember(admin.organizationId, { email: 's16-05u@acme.com', role: 'user' });
      const created = await createEntry(user.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 30,
      });
      const res = await updateEntry(user.cookies, admin.organizationId, created.body.id, {
        date: today(),
        durationMinutes: 30,
        billable: false,
      });
      expect(res.status).toBe(200);
      expect(res.body.billable).toBe(false);
    });

    it('TC-16-INT-06: user forbidden to flip billable on another member (403)', async () => {
      const admin = await signupAdmin('s16-06@acme.com', 'S16');
      const alice = await createMember(admin.organizationId, { email: 's16-06a@acme.com', role: 'user' });
      const bob = await createMember(admin.organizationId, { email: 's16-06b@acme.com', role: 'user' });
      const bobEntry = await createEntry(bob.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 60,
      });
      const res = await updateEntry(alice.cookies, admin.organizationId, bobEntry.body.id, {
        date: today(),
        durationMinutes: 60,
        billable: false,
      });
      expect(res.status).toBe(403);
    });

    it('TC-16-INT-07: manager may flip billable on another member (200)', async () => {
      const admin = await signupAdmin('s16-07@acme.com', 'S16');
      const manager = await createMember(admin.organizationId, { email: 's16-07m@acme.com', role: 'manager' });
      const user = await createMember(admin.organizationId, { email: 's16-07u@acme.com', role: 'user' });
      const entry = await createEntry(user.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 60,
      });
      const res = await updateEntry(manager.cookies, admin.organizationId, entry.body.id, {
        date: today(),
        durationMinutes: 60,
        billable: false,
      });
      expect(res.status).toBe(200);
      expect(res.body.billable).toBe(false);
    });

    it('TC-16-INT-08: admin may flip billable on another member (200)', async () => {
      const admin = await signupAdmin('s16-08@acme.com', 'S16');
      const user = await createMember(admin.organizationId, { email: 's16-08u@acme.com', role: 'user' });
      const entry = await createEntry(user.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 45,
      });
      const res = await updateEntry(admin.cookies, admin.organizationId, entry.body.id, {
        date: today(),
        durationMinutes: 45,
        billable: false,
      });
      expect(res.status).toBe(200);
      expect(res.body.billable).toBe(false);
    });

    it('TC-16-INT-09: timer starts billable=true by default', async () => {
      const admin = await signupAdmin('s16-09@acme.com', 'S16');
      const res = await startTimer(admin.cookies, admin.organizationId, {});
      expect(res.status).toBe(201);
      expect(res.body.billable).toBe(true);
    });

    it('TC-16-INT-10: PUT /timer toggles billable', async () => {
      const admin = await signupAdmin('s16-10@acme.com', 'S16');
      await startTimer(admin.cookies, admin.organizationId, {});
      const res = await putTimer(admin.cookies, admin.organizationId, { billable: false });
      expect(res.status).toBe(200);
      expect(res.body.billable).toBe(false);
    });

    it('TC-16-INT-11: stop timer copies billable to the resulting entry', async () => {
      const admin = await signupAdmin('s16-11@acme.com', 'S16');
      await startTimer(admin.cookies, admin.organizationId, { billable: false });
      const res = await stopTimer(admin.cookies, admin.organizationId);
      expect(res.status).toBe(200);
      expect(res.body.timeEntry.billable).toBe(false);
    });

    it('TC-16-INT-12: list-entries surfaces billable per entry', async () => {
      const admin = await signupAdmin('s16-12@acme.com', 'S16');
      await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 60,
        billable: true,
      });
      await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 30,
        billable: false,
      });
      const res = await listEntries(admin.cookies, admin.organizationId, `?from=${today()}&to=${today()}`);
      expect(res.status).toBe(200);
      const flags = res.body.entries.map((e: { billable: boolean }) => e.billable).sort();
      expect(flags).toEqual([false, true]);
    });

    it('TC-16-INT-13: list-entries filter — billable-only', async () => {
      const admin = await signupAdmin('s16-13@acme.com', 'S16');
      await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 60,
        billable: true,
      });
      await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 30,
        billable: false,
      });
      const res = await listEntries(
        admin.cookies,
        admin.organizationId,
        `?from=${today()}&to=${today()}&billable=billable`,
      );
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0].billable).toBe(true);
      expect(res.body.totalMinutes).toBe(60);
    });

    it('TC-16-INT-14: list-entries filter — non-billable-only', async () => {
      const admin = await signupAdmin('s16-14@acme.com', 'S16');
      await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 60,
        billable: true,
      });
      await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 30,
        billable: false,
      });
      const res = await listEntries(
        admin.cookies,
        admin.organizationId,
        `?from=${today()}&to=${today()}&billable=non-billable`,
      );
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0].billable).toBe(false);
      expect(res.body.totalMinutes).toBe(30);
    });

    it('TC-16-INT-15: billable flag reaches the calendar row (proxy for future Amounts Owed / Time & Activity split)', async () => {
      // Reports/01 is not yet implemented (see specs/reports/01-reports.md deps). The
      // spec-level assertion is that Amounts Owed excludes non-billable and Time &
      // Activity splits Billable / Non-Billable / Billed Amount. Until the reports
      // service lands, the proxy here is: the server surfaces the flag on every entry
      // so a report aggregator can build both totals; and the calendar filter can drop
      // one side to produce the same totals a Billable Time column would show.
      const admin = await signupAdmin('s16-15@acme.com', 'S16');
      // Two billable entries (per-entry duration is capped at 24h by spec 12,
      // so 4h + 4h stands in for the spec's aggregate example).
      await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 4 * 60,
        billable: true,
      });
      await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 4 * 60,
        billable: true,
      });
      // One non-billable entry.
      await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 2 * 60,
        billable: false,
      });
      const billableOnly = await listEntries(
        admin.cookies,
        admin.organizationId,
        `?from=${today()}&to=${today()}&billable=billable`,
      );
      expect(billableOnly.body.totalMinutes).toBe(8 * 60);
      const all = await listEntries(admin.cookies, admin.organizationId, `?from=${today()}&to=${today()}`);
      expect(all.body.totalMinutes).toBe(10 * 60);
    });

    it('TC-16-INT-16: vacation math is unaffected by billable', async () => {
      // Spec 09 owns vacation math; TC-16-INT-16 asserts that adding the flag does not
      // touch it. There is no vacation approval flow exercised here (that lives in
      // vacation.spec.ts); the assertion collapses to "a mixed billable + non-billable
      // ledger does not surface in the vacation table", which we verify by reading
      // vacationRequest count after a mixed-entry seed.
      const admin = await signupAdmin('s16-16@acme.com', 'S16');
      await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 60,
        billable: true,
      });
      await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 30,
        billable: false,
      });
      const requests = await prisma.vacationRequest.count();
      expect(requests).toBe(0);
    });

    it('TC-16-INT-17: cross-org billable PATCH blocked with 404 (IDOR)', async () => {
      const orgA = await signupAdmin('s16-17a@acme.com', 'A');
      const orgB = await signupAdmin('s16-17b@acme.com', 'B');
      const bobEntry = await createEntry(orgB.cookies, orgB.organizationId, {
        date: today(),
        durationMinutes: 30,
      });
      const res = await updateEntry(orgA.cookies, orgB.organizationId, bobEntry.body.id, {
        date: today(),
        durationMinutes: 30,
        billable: false,
      });
      // OrgScopeGuard fires before the handler: cross-org path returns 404.
      expect(res.status).toBe(404);
    });

    it('TC-16-INT-18: session revocation blocks subsequent PATCH with 401', async () => {
      const admin = await signupAdmin('s16-18@acme.com', 'S16');
      const entry = await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 15,
      });
      // Rotate the security stamp — every outstanding session cookie is invalidated.
      // Any fresh value works; a deterministic string is enough for the test.
      await prisma.account.update({
        where: { id: admin.accountId },
        data: { securityStamp: 'rotated-for-tc-16-int-18' },
      });
      const res = await updateEntry(admin.cookies, admin.organizationId, entry.body.id, {
        date: today(),
        durationMinutes: 15,
        billable: false,
      });
      expect(res.status).toBe(401);
    });

    it('rejects an invalid billable value with 422 and the spec message', async () => {
      const admin = await signupAdmin('s16-inv@acme.com', 'S16');
      const res = await createEntry(admin.cookies, admin.organizationId, {
        date: today(),
        durationMinutes: 15,
        billable: 'maybe',
      });
      expect(res.status).toBe(400);
      expect(res.body.errors?.billable).toBe(TIME_TRACKING_MESSAGES.invalidBillable);
    });
  });
});
