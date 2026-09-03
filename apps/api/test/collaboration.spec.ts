import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { COLLAB_MESSAGES, KANBAN_MESSAGES } from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

const TEST_BCRYPT_ROUNDS = 4;

/**
 * Spec 14 — Task Collaboration (integration tests). Every it() corresponds to one
 * TC-14-INT-XX in specs/user-management/14-task-collaboration.md. The test IDs appear
 * in each name so a failure trace points straight at the spec paragraph.
 *
 * Boots the whole AppModule and drives the API through supertest with a shared cookie
 * jar. Uses randomUUID() emails and org names so no two tests collide on unique indexes.
 */
describe('Task collaboration (spec 14)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  interface Signed {
    cookies: string[];
    accountId: string;
    organizationId: string;
    membershipId: string;
    role: string;
    email: string;
  }

  const server = () => app.getHttpServer();

  const signupAdmin = async (): Promise<Signed> => {
    const email = `admin-${randomUUID()}@example.com`;
    const orgName = `Org ${randomUUID()}`;
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
    return {
      cookies,
      accountId,
      organizationId,
      membershipId: membership.id,
      role: 'admin',
      email,
    };
  };

  const login = (email: string, password: string) =>
    request(server()).post('/api/login').send({ email, password });

  const createMember = async (
    organizationId: string,
    opts: { role: string; firstName?: string; lastName?: string; status?: string },
  ): Promise<Signed> => {
    const email = `m-${randomUUID()}@example.com`;
    const password = 'Passw0rd';
    const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: {
        email,
        passwordHash,
        firstName: opts.firstName ?? 'Alex',
        lastName: opts.lastName ?? 'K',
        timezone: 'America/New_York',
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
        ? ((await login(email, password)).headers['set-cookie'] as unknown as string[])
        : [];
    return {
      cookies,
      accountId: account.id,
      organizationId,
      membershipId: membership.id,
      role: opts.role,
      email,
    };
  };

  const createProject = async (
    admin: Signed,
    opts: { name?: string; key?: string | null; status?: 'active' | 'archived' } = {},
  ) => {
    const name = opts.name ?? `Proj ${randomUUID()}`;
    const key = opts.key === undefined ? randomKey() : opts.key;
    return prisma.project.create({
      data: {
        organizationId: admin.organizationId,
        name,
        status: opts.status ?? 'active',
        key: key ?? undefined,
        createdByAccountId: admin.accountId,
      },
    });
  };

  const randomKey = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let s = '';
    for (let i = 0; i < 4; i++) s += letters[Math.floor(Math.random() * letters.length)];
    return s;
  };

  const assignToProject = (projectId: string, membershipId: string, byAccountId: string) =>
    prisma.projectMember.create({
      data: { projectId, membershipId, assignedByAccountId: byAccountId },
    });

  // ─── endpoints ──────────────────────────────────────────────────────
  const url = (s: Signed, path: string) =>
    `/api/organizations/${s.organizationId}${path}`;

  const getBoard = (s: Signed, projectId: string) =>
    request(server())
      .get(url(s, `/projects/${projectId}/board`))
      .set('Cookie', s.cookies);

  const createTask = (s: Signed, projectId: string, body: unknown) =>
    request(server())
      .post(url(s, `/projects/${projectId}/tasks`))
      .set('Cookie', s.cookies)
      .send(body as object);

  const getTask = (s: Signed, projectId: string, taskId: string) =>
    request(server())
      .get(url(s, `/projects/${projectId}/tasks/${taskId}`))
      .set('Cookie', s.cookies);

  const updateTask = (s: Signed, projectId: string, taskId: string, body: unknown) =>
    request(server())
      .put(url(s, `/projects/${projectId}/tasks/${taskId}`))
      .set('Cookie', s.cookies)
      .send(body as object);

  const moveTask = (s: Signed, projectId: string, taskId: string, body: unknown) =>
    request(server())
      .patch(url(s, `/projects/${projectId}/tasks/${taskId}/move`))
      .set('Cookie', s.cookies)
      .send(body as object);

  const createLabel = (s: Signed, projectId: string, body: unknown) =>
    request(server())
      .post(url(s, `/projects/${projectId}/labels`))
      .set('Cookie', s.cookies)
      .send(body as object);

  const listLabels = (s: Signed, projectId: string) =>
    request(server())
      .get(url(s, `/projects/${projectId}/labels`))
      .set('Cookie', s.cookies);

  const updateLabel = (s: Signed, projectId: string, labelId: string, body: unknown) =>
    request(server())
      .put(url(s, `/projects/${projectId}/labels/${labelId}`))
      .set('Cookie', s.cookies)
      .send(body as object);

  const deleteLabel = (s: Signed, projectId: string, labelId: string) =>
    request(server())
      .delete(url(s, `/projects/${projectId}/labels/${labelId}`))
      .set('Cookie', s.cookies);

  const assignLabel = (s: Signed, projectId: string, taskId: string, body: unknown) =>
    request(server())
      .post(url(s, `/projects/${projectId}/tasks/${taskId}/labels`))
      .set('Cookie', s.cookies)
      .send(body as object);

  const removeLabelFromTask = (
    s: Signed,
    projectId: string,
    taskId: string,
    labelId: string,
  ) =>
    request(server())
      .delete(url(s, `/projects/${projectId}/tasks/${taskId}/labels/${labelId}`))
      .set('Cookie', s.cookies);

  const listComments = (s: Signed, projectId: string, taskId: string) =>
    request(server())
      .get(url(s, `/projects/${projectId}/tasks/${taskId}/comments`))
      .set('Cookie', s.cookies);

  const createComment = (s: Signed, projectId: string, taskId: string, body: unknown) =>
    request(server())
      .post(url(s, `/projects/${projectId}/tasks/${taskId}/comments`))
      .set('Cookie', s.cookies)
      .send(body as object);

  const updateComment = (
    s: Signed,
    projectId: string,
    taskId: string,
    commentId: string,
    body: unknown,
  ) =>
    request(server())
      .put(url(s, `/projects/${projectId}/tasks/${taskId}/comments/${commentId}`))
      .set('Cookie', s.cookies)
      .send(body as object);

  const deleteComment = (
    s: Signed,
    projectId: string,
    taskId: string,
    commentId: string,
  ) =>
    request(server())
      .delete(url(s, `/projects/${projectId}/tasks/${taskId}/comments/${commentId}`))
      .set('Cookie', s.cookies);

  const listWatchers = (s: Signed, projectId: string, taskId: string) =>
    request(server())
      .get(url(s, `/projects/${projectId}/tasks/${taskId}/watchers`))
      .set('Cookie', s.cookies);

  const watchTask = (s: Signed, projectId: string, taskId: string) =>
    request(server())
      .post(url(s, `/projects/${projectId}/tasks/${taskId}/watchers`))
      .set('Cookie', s.cookies);

  const unwatchTask = (s: Signed, projectId: string, taskId: string) =>
    request(server())
      .delete(url(s, `/projects/${projectId}/tasks/${taskId}/watchers`))
      .set('Cookie', s.cookies);

  const listActivity = (s: Signed, projectId: string, taskId: string) =>
    request(server())
      .get(url(s, `/projects/${projectId}/tasks/${taskId}/activity`))
      .set('Cookie', s.cookies);

  // ─── boot / cleanup ─────────────────────────────────────────────────

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
    // Cascade removes spec-14 tables when Task/Project/Membership go, but drop the
    // parents so runs stay independent.
    await prisma.task.deleteMany();
    await prisma.taskLabel.deleteMany();
    await prisma.boardColumn.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.account.deleteMany();
  });

  // Convenience — a project + board + a task belonging to admin.
  const seedTask = async (admin: Signed, opts: { key?: string } = {}) => {
    const project = await createProject(admin, { key: opts.key ?? 'MOB' });
    await getBoard(admin, project.id); // lazy-init columns
    const task = await createTask(admin, project.id, { type: 'task', title: 'T' });
    return { project, task: task.body as { id: string; key: string } };
  };

  // ────────────────────────────────────────────────────────────────────
  // Labels — definition
  // ────────────────────────────────────────────────────────────────────

  it('TC-14-INT-01 create label — happy path', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const res = await createLabel(admin, project.id, { name: 'Bug', color: '#E11D48' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Bug', color: '#E11D48', projectId: project.id });
  });

  it('TC-14-INT-02 create label — duplicate name (case-insensitive)', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await createLabel(admin, project.id, { name: 'Bug', color: '#E11D48' });
    const res = await createLabel(admin, project.id, { name: 'bug', color: '#000000' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'label_name_duplicate',
      message: COLLAB_MESSAGES.labelNameDuplicate,
    });
  });

  it('TC-14-INT-03 create label — invalid color', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const res = await createLabel(admin, project.id, { name: 'X', color: 'red' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('label_color_invalid');
  });

  it('TC-14-INT-04 create label — user role forbidden', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const user = await createMember(admin.organizationId, { role: 'user' });
    await assignToProject(project.id, user.membershipId, admin.accountId);
    const res = await createLabel(user, project.id, { name: 'Bug', color: '#E11D48' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'forbidden',
      message: COLLAB_MESSAGES.labelsPermissionDenied,
    });
  });

  it('TC-14-INT-05 create label — manager allowed', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const manager = await createMember(admin.organizationId, { role: 'manager' });
    const res = await createLabel(manager, project.id, { name: 'Bug', color: '#E11D48' });
    expect(res.status).toBe(201);
  });

  it('TC-14-INT-06 update label — rename', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const created = await createLabel(admin, project.id, { name: 'Bug', color: '#E11D48' });
    const res = await updateLabel(admin, project.id, created.body.id, { name: 'Critical Bug' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Critical Bug', color: '#E11D48' });
  });

  it('TC-14-INT-07 update label — change color only', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const created = await createLabel(admin, project.id, { name: 'Bug', color: '#E11D48' });
    const res = await updateLabel(admin, project.id, created.body.id, { color: '#000000' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Bug', color: '#000000' });
  });

  it('TC-14-INT-08 update label — duplicate name', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await createLabel(admin, project.id, { name: 'Bug', color: '#E11D48' });
    const other = await createLabel(admin, project.id, { name: 'Feature', color: '#3B82F6' });
    const res = await updateLabel(admin, project.id, other.body.id, { name: 'bug' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('label_name_duplicate');
  });

  it('TC-14-INT-09 update label — not found', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const res = await updateLabel(admin, project.id, randomUUID(), { name: 'X' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'label_not_found',
      message: COLLAB_MESSAGES.labelNotFound,
    });
  });

  it('TC-14-INT-10 delete label — cascades assignments', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const label = await createLabel(admin, project.id, { name: 'Bug', color: '#E11D48' });
    // Assign to 3 tasks.
    const t2 = await createTask(admin, project.id, { type: 'task', title: 'T2' });
    const t3 = await createTask(admin, project.id, { type: 'task', title: 'T3' });
    await assignLabel(admin, project.id, task.id, { labelId: label.body.id });
    await assignLabel(admin, project.id, t2.body.id, { labelId: label.body.id });
    await assignLabel(admin, project.id, t3.body.id, { labelId: label.body.id });

    const del = await deleteLabel(admin, project.id, label.body.id);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ success: true, unassignedFromTaskCount: 3 });

    const detail = await getTask(admin, project.id, task.id);
    expect(detail.body.labels).toEqual([]);
  });

  it('TC-14-INT-11 delete label — no assignments', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const label = await createLabel(admin, project.id, { name: 'Bug', color: '#E11D48' });
    const res = await deleteLabel(admin, project.id, label.body.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, unassignedFromTaskCount: 0 });
  });

  it('TC-14-INT-12 delete label — not found', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const res = await deleteLabel(admin, project.id, randomUUID());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('label_not_found');
  });

  it('TC-14-INT-13 list labels — happy path', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await createLabel(admin, project.id, { name: 'Bug', color: '#E11D48' });
    await createLabel(admin, project.id, { name: 'Feature', color: '#3B82F6' });
    await createLabel(admin, project.id, { name: 'Backend', color: '#A855F7' });
    const res = await listLabels(admin, project.id);
    expect(res.status).toBe(200);
    expect(res.body.labels).toHaveLength(3);
    expect(res.body.labels.map((l: any) => l.name).sort()).toEqual(['Backend', 'Bug', 'Feature']);
  });

  it('TC-14-INT-14 list labels — user role, project member', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await createLabel(admin, project.id, { name: 'Bug', color: '#E11D48' });
    const user = await createMember(admin.organizationId, { role: 'user' });
    await assignToProject(project.id, user.membershipId, admin.accountId);
    const res = await listLabels(user, project.id);
    expect(res.status).toBe(200);
    expect(res.body.labels).toHaveLength(1);
  });

  it('TC-14-INT-15 list labels — user role, not project member', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const user = await createMember(admin.organizationId, { role: 'user' });
    const res = await listLabels(user, project.id);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });

  // ────────────────────────────────────────────────────────────────────
  // Label assignment
  // ────────────────────────────────────────────────────────────────────

  it('TC-14-INT-16 assign label — happy path', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const label = await createLabel(admin, project.id, { name: 'Bug', color: '#E11D48' });
    const res = await assignLabel(admin, project.id, task.id, { labelId: label.body.id });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ taskId: task.id, labelId: label.body.id });
    const detail = await getTask(admin, project.id, task.id);
    expect(detail.body.labels).toHaveLength(1);
    expect(detail.body.labels[0]).toMatchObject({ id: label.body.id, name: 'Bug' });
  });

  it('TC-14-INT-17 assign label — idempotent (already assigned)', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const label = await createLabel(admin, project.id, { name: 'Bug', color: '#E11D48' });
    await assignLabel(admin, project.id, task.id, { labelId: label.body.id });
    const res = await assignLabel(admin, project.id, task.id, { labelId: label.body.id });
    expect(res.status).toBe(201);
    const activity = await listActivity(admin, project.id, task.id);
    const added = activity.body.activity.filter((a: any) => a.action === 'label_added');
    expect(added).toHaveLength(1);
  });

  it('TC-14-INT-18 assign label — wrong project', async () => {
    const admin = await signupAdmin();
    const { project: pA, task } = await seedTask(admin);
    const projectB = await createProject(admin, { key: 'WEB' });
    const label = await createLabel(admin, projectB.id, { name: 'Bug', color: '#E11D48' });
    const res = await assignLabel(admin, pA.id, task.id, { labelId: label.body.id });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'label_wrong_project',
      message: COLLAB_MESSAGES.labelWrongProject,
    });
  });

  it('TC-14-INT-19 assign label — label not found', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const res = await assignLabel(admin, project.id, task.id, { labelId: randomUUID() });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('label_not_found');
  });

  it('TC-14-INT-20 assign label — records activity', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const label = await createLabel(admin, project.id, { name: 'Bug', color: '#E11D48' });
    await assignLabel(admin, project.id, task.id, { labelId: label.body.id });
    const activity = await listActivity(admin, project.id, task.id);
    const added = activity.body.activity.find((a: any) => a.action === 'label_added');
    expect(added).toBeDefined();
    expect(added.newValue).toBe(label.body.id);
    expect(added.actor.membershipId).toBe(admin.membershipId);
  });

  it('TC-14-INT-21 remove label from task — happy path', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const label = await createLabel(admin, project.id, { name: 'Bug', color: '#E11D48' });
    await assignLabel(admin, project.id, task.id, { labelId: label.body.id });
    const res = await removeLabelFromTask(admin, project.id, task.id, label.body.id);
    expect(res.status).toBe(200);
    const detail = await getTask(admin, project.id, task.id);
    expect(detail.body.labels).toEqual([]);
  });

  it('TC-14-INT-22 remove label — idempotent (not assigned)', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const label = await createLabel(admin, project.id, { name: 'Bug', color: '#E11D48' });
    const res = await removeLabelFromTask(admin, project.id, task.id, label.body.id);
    expect(res.status).toBe(200);
    const activity = await listActivity(admin, project.id, task.id);
    const removed = activity.body.activity.filter((a: any) => a.action === 'label_removed');
    expect(removed).toHaveLength(0);
  });

  it('TC-14-INT-23 remove label — records activity', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const label = await createLabel(admin, project.id, { name: 'Bug', color: '#E11D48' });
    await assignLabel(admin, project.id, task.id, { labelId: label.body.id });
    await removeLabelFromTask(admin, project.id, task.id, label.body.id);
    const activity = await listActivity(admin, project.id, task.id);
    const removed = activity.body.activity.find((a: any) => a.action === 'label_removed');
    expect(removed).toBeDefined();
    expect(removed.oldValue).toBe(label.body.id);
  });

  // ────────────────────────────────────────────────────────────────────
  // Comments
  // ────────────────────────────────────────────────────────────────────

  it('TC-14-INT-24 create comment — happy path', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const res = await createComment(admin, project.id, task.id, { content: '  Looks good  ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      taskId: task.id,
      content: 'Looks good',
    });
    expect(res.body.author.membershipId).toBe(admin.membershipId);
  });

  it('TC-14-INT-25 create comment — empty content', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const res = await createComment(admin, project.id, task.id, { content: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('content_required');
  });

  it('TC-14-INT-26 create comment — too long', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const res = await createComment(admin, project.id, task.id, {
      content: 'a'.repeat(10001),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('content_too_long');
  });

  it('TC-14-INT-27 create comment — user role, not project member', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const user = await createMember(admin.organizationId, { role: 'user' });
    const res = await createComment(user, project.id, task.id, { content: 'x' });
    expect(res.status).toBe(403);
  });

  it('TC-14-INT-28 create comment — auto-watches author', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    // Create a task with a different member as reporter — pick admin so we can then
    // test that a *third* member's comment auto-watches THAT third member.
    const user = await createMember(admin.organizationId, { role: 'manager' });
    const task = await createTask(admin, project.id, { type: 'task', title: 'T' });
    const w0 = await listWatchers(admin, project.id, task.body.id);
    expect(w0.body.watchers.find((x: any) => x.membershipId === user.membershipId)).toBeUndefined();
    await createComment(user, project.id, task.body.id, { content: 'hi' });
    const w1 = await listWatchers(admin, project.id, task.body.id);
    expect(w1.body.watchers.find((x: any) => x.membershipId === user.membershipId)).toBeDefined();
  });

  it('TC-14-INT-29 create comment — records activity', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    await createComment(admin, project.id, task.id, { content: 'x' });
    const activity = await listActivity(admin, project.id, task.id);
    const added = activity.body.activity.find((a: any) => a.action === 'comment_added');
    expect(added).toBeDefined();
    expect(added.actor.membershipId).toBe(admin.membershipId);
  });

  it('TC-14-INT-30 edit comment — author succeeds', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const created = await createComment(admin, project.id, task.id, { content: 'original' });
    const res = await updateComment(admin, project.id, task.id, created.body.id, {
      content: 'updated text',
    });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('updated text');
    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(res.body.createdAt).getTime(),
    );
  });

  it('TC-14-INT-31 edit comment — non-author forbidden', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const created = await createComment(admin, project.id, task.id, { content: 'a' });
    const other = await createMember(admin.organizationId, { role: 'manager' });
    const res = await updateComment(other, project.id, task.id, created.body.id, {
      content: 'edited by other',
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'forbidden',
      message: COLLAB_MESSAGES.commentEditForbidden,
    });
  });

  it('TC-14-INT-32 edit comment — admin cannot edit another\'s (edit is author-only)', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    // manager writes the comment, admin tries to edit.
    const manager = await createMember(admin.organizationId, { role: 'manager' });
    const task = await createTask(admin, project.id, { type: 'task', title: 'T' });
    const created = await createComment(manager, project.id, task.body.id, { content: 'from manager' });
    const res = await updateComment(admin, project.id, task.body.id, created.body.id, {
      content: 'admin tries',
    });
    expect(res.status).toBe(403);
  });

  it('TC-14-INT-33 edit comment — not found', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const res = await updateComment(admin, project.id, task.id, randomUUID(), { content: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('comment_not_found');
  });

  it('TC-14-INT-34 delete comment — author succeeds', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const created = await createComment(admin, project.id, task.id, { content: 'x' });
    const res = await deleteComment(admin, project.id, task.id, created.body.id);
    expect(res.status).toBe(200);
    const list = await listComments(admin, project.id, task.id);
    expect(list.body.comments.find((c: any) => c.id === created.body.id)).toBeUndefined();
  });

  it('TC-14-INT-35 delete comment — admin can delete any', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const user = await createMember(admin.organizationId, { role: 'user' });
    await assignToProject(project.id, user.membershipId, admin.accountId);
    const created = await createComment(user, project.id, task.id, { content: 'x' });
    const res = await deleteComment(admin, project.id, task.id, created.body.id);
    expect(res.status).toBe(200);
  });

  it('TC-14-INT-36 delete comment — manager can delete any', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const user = await createMember(admin.organizationId, { role: 'user' });
    await assignToProject(project.id, user.membershipId, admin.accountId);
    const manager = await createMember(admin.organizationId, { role: 'manager' });
    const created = await createComment(user, project.id, task.id, { content: 'x' });
    const res = await deleteComment(manager, project.id, task.id, created.body.id);
    expect(res.status).toBe(200);
  });

  it('TC-14-INT-37 delete comment — non-author, non-admin forbidden', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const userA = await createMember(admin.organizationId, { role: 'user' });
    const userB = await createMember(admin.organizationId, { role: 'user' });
    await assignToProject(project.id, userA.membershipId, admin.accountId);
    await assignToProject(project.id, userB.membershipId, admin.accountId);
    const created = await createComment(userA, project.id, task.id, { content: 'x' });
    const res = await deleteComment(userB, project.id, task.id, created.body.id);
    expect(res.status).toBe(403);
  });

  it('TC-14-INT-38 delete comment — records activity, preserves comment_added entry', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const created = await createComment(admin, project.id, task.id, { content: 'x' });
    await deleteComment(admin, project.id, task.id, created.body.id);
    const activity = await listActivity(admin, project.id, task.id);
    const actions = activity.body.activity.map((a: any) => a.action);
    expect(actions).toContain('comment_added');
    expect(actions).toContain('comment_deleted');
  });

  it('TC-14-INT-39 list comments — chronological order', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const a = await createComment(admin, project.id, task.id, { content: 'first' });
    // Slight delay so createdAt strictly increases even if the clock is low-resolution.
    await new Promise((r) => setTimeout(r, 5));
    const b = await createComment(admin, project.id, task.id, { content: 'second' });
    await new Promise((r) => setTimeout(r, 5));
    const c = await createComment(admin, project.id, task.id, { content: 'third' });
    const list = await listComments(admin, project.id, task.id);
    expect(list.status).toBe(200);
    expect(list.body.comments.map((x: any) => x.id)).toEqual([a.body.id, b.body.id, c.body.id]);
  });

  it('TC-14-INT-40 list comments — viewer forbidden', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const viewer = await createMember(admin.organizationId, { role: 'viewer' });
    const res = await listComments(viewer, project.id, task.id);
    expect(res.status).toBe(403);
  });

  // ────────────────────────────────────────────────────────────────────
  // Watchers
  // ────────────────────────────────────────────────────────────────────

  it('TC-14-INT-41 watch task — happy path', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const manager = await createMember(admin.organizationId, { role: 'manager' });
    const task = await createTask(admin, project.id, { type: 'task', title: 'T' });
    const res = await watchTask(manager, project.id, task.body.id);
    expect(res.status).toBe(201);
    const list = await listWatchers(manager, project.id, task.body.id);
    expect(list.body.isWatching).toBe(true);
    expect(list.body.watchers.some((w: any) => w.membershipId === manager.membershipId)).toBe(true);
  });

  it('TC-14-INT-42 watch task — idempotent', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const manager = await createMember(admin.organizationId, { role: 'manager' });
    const task = await createTask(admin, project.id, { type: 'task', title: 'T' });
    await watchTask(manager, project.id, task.body.id);
    const res = await watchTask(manager, project.id, task.body.id);
    expect(res.status).toBe(201);
    const rows = await prisma.taskWatcher.findMany({
      where: { taskId: task.body.id, membershipId: manager.membershipId },
    });
    expect(rows).toHaveLength(1);
  });

  it('TC-14-INT-43 unwatch task — happy path', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const manager = await createMember(admin.organizationId, { role: 'manager' });
    const task = await createTask(admin, project.id, { type: 'task', title: 'T' });
    await watchTask(manager, project.id, task.body.id);
    const res = await unwatchTask(manager, project.id, task.body.id);
    expect(res.status).toBe(200);
    const list = await listWatchers(manager, project.id, task.body.id);
    expect(list.body.isWatching).toBe(false);
  });

  it('TC-14-INT-44 unwatch task — idempotent (not watching)', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const manager = await createMember(admin.organizationId, { role: 'manager' });
    const task = await createTask(admin, project.id, { type: 'task', title: 'T' });
    const res = await unwatchTask(manager, project.id, task.body.id);
    expect(res.status).toBe(200);
  });

  it('TC-14-INT-45 auto-watch on task creation — reporter', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const list = await listWatchers(admin, project.id, task.id);
    expect(list.body.watchers.some((w: any) => w.membershipId === admin.membershipId)).toBe(true);
    expect(list.body.isWatching).toBe(true);
  });

  it('TC-14-INT-46 auto-watch on assignment', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const other = await createMember(admin.organizationId, { role: 'user' });
    const task = await createTask(admin, project.id, { type: 'task', title: 'T' });
    await updateTask(admin, project.id, task.body.id, { assigneeId: other.membershipId });
    const list = await listWatchers(admin, project.id, task.body.id);
    expect(list.body.watchers.some((w: any) => w.membershipId === other.membershipId)).toBe(true);
  });

  it('TC-14-INT-47 auto-watch does not duplicate on repeated triggers', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const other = await createMember(admin.organizationId, { role: 'user' });
    const task = await createTask(admin, project.id, {
      type: 'task',
      title: 'T',
      assigneeId: other.membershipId,
    });
    // Re-set the same assignee — the update handler diffs and, because the value did
    // not change, should not emit a new field_changed or a watcher_added row.
    await updateTask(admin, project.id, task.body.id, { assigneeId: other.membershipId });
    const rows = await prisma.taskWatcher.findMany({
      where: { taskId: task.body.id, membershipId: other.membershipId },
    });
    expect(rows).toHaveLength(1);
  });

  it('TC-14-INT-48 manual unwatch persists after auto-watch trigger already fired', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const other = await createMember(admin.organizationId, { role: 'user' });
    await assignToProject(project.id, other.membershipId, admin.accountId);
    const task = await createTask(admin, project.id, {
      type: 'task',
      title: 'T',
      assigneeId: other.membershipId,
    });
    // Alex manually unwatches.
    await unwatchTask(other, project.id, task.body.id);
    // Now admin changes an unrelated field (title). Alex stays the assignee.
    await updateTask(admin, project.id, task.body.id, { title: 'New Title' });
    const list = await listWatchers(admin, project.id, task.body.id);
    expect(list.body.watchers.some((w: any) => w.membershipId === other.membershipId)).toBe(false);
  });

  it('TC-14-INT-49 watchers list — view access matches task view access', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const user = await createMember(admin.organizationId, { role: 'user' });
    const res = await listWatchers(user, project.id, task.id);
    expect(res.status).toBe(403);
  });

  // ────────────────────────────────────────────────────────────────────
  // Activity log
  // ────────────────────────────────────────────────────────────────────

  it('TC-14-INT-50 activity log — task creation entry', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const activity = await listActivity(admin, project.id, task.id);
    const first = activity.body.activity[0];
    expect(first.action).toBe('created');
    expect(first.actor.membershipId).toBe(admin.membershipId);
  });

  it('TC-14-INT-51 activity log — single field change', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    await updateTask(admin, project.id, task.id, { priority: 'high' });
    const activity = await listActivity(admin, project.id, task.id);
    const change = activity.body.activity.find(
      (a: any) => a.action === 'field_changed' && a.field === 'priority',
    );
    expect(change).toBeDefined();
    expect(change.oldValue).toBeNull();
    expect(change.newValue).toBe('high');
  });

  it('TC-14-INT-52 activity log — multiple field changes in one request', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    await updateTask(admin, project.id, task.id, { priority: 'high', title: 'New title' });
    const activity = await listActivity(admin, project.id, task.id);
    const changes = activity.body.activity.filter((a: any) => a.action === 'field_changed');
    expect(changes.length).toBeGreaterThanOrEqual(2);
    const ts = new Set(changes.map((c: any) => c.createdAt));
    expect(ts.size).toBe(1);
  });

  it('TC-14-INT-53 activity log — column move via drag', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const board = await getBoard(admin, project.id);
    const [, inProg] = board.body.columns;
    const task = await createTask(admin, project.id, { type: 'task', title: 'T' });
    await moveTask(admin, project.id, task.body.id, { columnId: inProg.id });
    const activity = await listActivity(admin, project.id, task.body.id);
    const change = activity.body.activity.find(
      (a: any) => a.action === 'field_changed' && a.field === 'columnId',
    );
    expect(change).toBeDefined();
    expect(change.newValue).toBe(inProg.id);
  });

  it('TC-14-INT-54 activity log — position-only move does not log', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const before = await listActivity(admin, project.id, task.id);
    await moveTask(admin, project.id, task.id, { position: 2.5 });
    const after = await listActivity(admin, project.id, task.id);
    expect(after.body.activity.length).toBe(before.body.activity.length);
  });

  it('TC-14-INT-55 activity log — ordering is oldest-first', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    await updateTask(admin, project.id, task.id, { priority: 'low' });
    await new Promise((r) => setTimeout(r, 5));
    await updateTask(admin, project.id, task.id, { priority: 'medium' });
    await new Promise((r) => setTimeout(r, 5));
    await updateTask(admin, project.id, task.id, { priority: 'high' });
    const activity = await listActivity(admin, project.id, task.id);
    const times = activity.body.activity.map((a: any) => a.createdAt);
    const sorted = [...times].sort();
    expect(times).toEqual(sorted);
  });

  it('TC-14-INT-56 activity log — unpaginated, returns full history', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    for (let i = 0; i < 30; i++) {
      await updateTask(admin, project.id, task.id, { title: `Title ${i}` });
    }
    const activity = await listActivity(admin, project.id, task.id);
    expect(activity.body.activity.length).toBeGreaterThanOrEqual(30);
  });

  it('TC-14-INT-57 activity log — viewer forbidden', async () => {
    const admin = await signupAdmin();
    const { project, task } = await seedTask(admin);
    const viewer = await createMember(admin.organizationId, { role: 'viewer' });
    const res = await listActivity(viewer, project.id, task.id);
    expect(res.status).toBe(403);
  });

  // ────────────────────────────────────────────────────────────────────
  // Cross-org (IDOR)
  // ────────────────────────────────────────────────────────────────────

  it('TC-14-INT-58 cross-org label access (IDOR)', async () => {
    const adminA = await signupAdmin();
    const adminB = await signupAdmin();
    const projectA = await createProject(adminA, { key: 'AAA' });
    const projectB = await createProject(adminB, { key: 'BBB' });
    const label = await createLabel(adminA, projectA.id, { name: 'Bug', color: '#E11D48' });

    // GET: adminB cannot see adminA's project at all (404 from OrgScope / not-found).
    const list = await request(server())
      .get(url(adminB, `/projects/${projectA.id}/labels`))
      .set('Cookie', adminB.cookies);
    expect([403, 404]).toContain(list.status);

    // PUT / DELETE against a label under adminB's own project id, using adminA's labelId.
    const put = await updateLabel(adminB, projectB.id, label.body.id, { name: 'X' });
    expect(put.status).toBe(404);
    const del = await deleteLabel(adminB, projectB.id, label.body.id);
    expect(del.status).toBe(404);
  });

  it('TC-14-INT-59 cross-org comment access (IDOR)', async () => {
    const adminA = await signupAdmin();
    const adminB = await signupAdmin();
    const projA = await createProject(adminA, { key: 'AAA' });
    const projB = await createProject(adminB, { key: 'BBB' });
    await getBoard(adminA, projA.id);
    await getBoard(adminB, projB.id);
    const taskA = await createTask(adminA, projA.id, { type: 'task', title: 'A' });
    const taskB = await createTask(adminB, projB.id, { type: 'task', title: 'B' });
    const commentA = await createComment(adminA, projA.id, taskA.body.id, { content: 'x' });

    // adminB tries to PUT/DELETE adminA's comment through their own project/task.
    const put = await updateComment(adminB, projB.id, taskB.body.id, commentA.body.id, {
      content: 'y',
    });
    expect(put.status).toBe(404);
    const del = await deleteComment(adminB, projB.id, taskB.body.id, commentA.body.id);
    expect(del.status).toBe(404);
  });
});
