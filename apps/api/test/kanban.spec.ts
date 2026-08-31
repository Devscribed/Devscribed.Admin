import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { KANBAN_MESSAGES, TIME_TRACKING_MESSAGES } from '@devscribed/validation';
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
 * Spec 13 — Kanban Board & Tasks (integration tests). Every it() corresponds to one
 * TC-13-INT-XX in specs/user-management/13-kanban-board.md. Test IDs appear in each
 * name so a failure trace points straight at the spec paragraph.
 *
 * The test file boots the whole AppModule and drives the API through supertest with
 * a shared cookie jar. Uses randomUUID() emails and org names so no two tests collide
 * on unique indexes.
 */
describe('Kanban board & tasks (spec 13)', () => {
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
    opts: { role: string; email?: string; firstName?: string; lastName?: string; status?: string },
  ): Promise<Signed> => {
    const email = opts.email ?? `m-${randomUUID()}@example.com`;
    const password = 'Passw0rd';
    const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: {
        email,
        passwordHash,
        firstName: opts.firstName ?? 'Test',
        lastName: opts.lastName ?? 'User',
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
    const project = await prisma.project.create({
      data: {
        organizationId: admin.organizationId,
        name,
        status: opts.status ?? 'active',
        key: key ?? undefined,
        createdByAccountId: admin.accountId,
      },
    });
    return project;
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
  const getBoard = (s: Signed, projectId: string) =>
    request(server())
      .get(`/api/organizations/${s.organizationId}/projects/${projectId}/board`)
      .set('Cookie', s.cookies);

  const createColumn = (s: Signed, projectId: string, body: unknown) =>
    request(server())
      .post(`/api/organizations/${s.organizationId}/projects/${projectId}/board/columns`)
      .set('Cookie', s.cookies)
      .send(body as object);

  const renameColumn = (s: Signed, projectId: string, columnId: string, body: unknown) =>
    request(server())
      .put(`/api/organizations/${s.organizationId}/projects/${projectId}/board/columns/${columnId}`)
      .set('Cookie', s.cookies)
      .send(body as object);

  const reorderColumns = (s: Signed, projectId: string, body: unknown) =>
    request(server())
      .put(`/api/organizations/${s.organizationId}/projects/${projectId}/board/columns/reorder`)
      .set('Cookie', s.cookies)
      .send(body as object);

  const deleteColumn = (s: Signed, projectId: string, columnId: string) =>
    request(server())
      .delete(`/api/organizations/${s.organizationId}/projects/${projectId}/board/columns/${columnId}`)
      .set('Cookie', s.cookies);

  const createTask = (s: Signed, projectId: string, body: unknown) =>
    request(server())
      .post(`/api/organizations/${s.organizationId}/projects/${projectId}/tasks`)
      .set('Cookie', s.cookies)
      .send(body as object);

  const listTasks = (s: Signed, projectId: string, query = '') =>
    request(server())
      .get(`/api/organizations/${s.organizationId}/projects/${projectId}/tasks${query}`)
      .set('Cookie', s.cookies);

  const getTask = (s: Signed, projectId: string, taskId: string) =>
    request(server())
      .get(`/api/organizations/${s.organizationId}/projects/${projectId}/tasks/${taskId}`)
      .set('Cookie', s.cookies);

  const updateTask = (s: Signed, projectId: string, taskId: string, body: unknown) =>
    request(server())
      .put(`/api/organizations/${s.organizationId}/projects/${projectId}/tasks/${taskId}`)
      .set('Cookie', s.cookies)
      .send(body as object);

  const moveTask = (s: Signed, projectId: string, taskId: string, body: unknown) =>
    request(server())
      .patch(`/api/organizations/${s.organizationId}/projects/${projectId}/tasks/${taskId}/move`)
      .set('Cookie', s.cookies)
      .send(body as object);

  const deleteTask = (s: Signed, projectId: string, taskId: string) =>
    request(server())
      .delete(`/api/organizations/${s.organizationId}/projects/${projectId}/tasks/${taskId}`)
      .set('Cookie', s.cookies);

  const putProject = (s: Signed, projectId: string, body: unknown) =>
    request(server())
      .put(`/api/organizations/${s.organizationId}/projects/${projectId}`)
      .set('Cookie', s.cookies)
      .send(body as object);

  const postProject = (s: Signed, body: unknown) =>
    request(server())
      .post(`/api/organizations/${s.organizationId}/projects`)
      .set('Cookie', s.cookies)
      .send(body as object);

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
    // Cascade takes care of most; explicit deletes for the spec-13 tables + everything the
    // account/org cleanup would otherwise dangle.
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
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
  });

  // ────────────────────────────────────────────────────────────────────
  // Board access & lazy init
  // ────────────────────────────────────────────────────────────────────

  it('TC-13-INT-01 lazy-creates default columns on first board access', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });

    const res = await getBoard(admin, project.id);
    expect(res.status).toBe(200);
    expect(res.body.columns).toHaveLength(3);
    expect(res.body.columns.map((c: any) => c.name)).toEqual(['To Do', 'In Progress', 'Done']);
    expect(res.body.columns.map((c: any) => c.position)).toEqual([0, 1, 2]);
    expect(res.body.columns.map((c: any) => c.category)).toEqual(['todo', 'in_progress', 'done']);
    expect(res.body.tasks).toEqual([]);
  });

  it('TC-13-INT-02 board lazy-init is idempotent', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });

    const first = await getBoard(admin, project.id);
    const second = await getBoard(admin, project.id);
    expect(first.body.columns.map((c: any) => c.id)).toEqual(second.body.columns.map((c: any) => c.id));
    expect(second.body.columns).toHaveLength(3);
  });

  it('TC-13-INT-03 board access without project key returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: null });
    const res = await getBoard(admin, project.id);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'project_key_required',
      message: KANBAN_MESSAGES.projectKeyRequired,
    });
  });

  it('TC-13-INT-04 admin without ProjectMember can view board', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const res = await getBoard(admin, project.id);
    expect(res.status).toBe(200);
  });

  it('TC-13-INT-05 user role as project member can view board', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const user = await createMember(admin.organizationId, { role: 'user' });
    await assignToProject(project.id, user.membershipId, admin.accountId);

    const res = await getBoard(user, project.id);
    expect(res.status).toBe(200);
  });

  it('TC-13-INT-06 user NOT project member returns 403', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const user = await createMember(admin.organizationId, { role: 'user' });

    const res = await getBoard(user, project.id);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'forbidden',
      message: KANBAN_MESSAGES.boardPermissionDenied,
    });
  });

  it('TC-13-INT-07 viewer role gets 403 on board', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const viewer = await createMember(admin.organizationId, { role: 'viewer' });

    const res = await getBoard(viewer, project.id);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });

  // ────────────────────────────────────────────────────────────────────
  // Columns — create / rename / reorder / delete
  // ────────────────────────────────────────────────────────────────────

  it('TC-13-INT-08 create column appends at end with category=custom', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    const res = await createColumn(admin, project.id, { name: 'Code Review' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Code Review', position: 3, category: 'custom' });
  });

  it('TC-13-INT-09 create column at explicit position shifts existing ones', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    const res = await createColumn(admin, project.id, { name: 'QA', position: 1 });
    expect(res.status).toBe(201);
    expect(res.body.position).toBe(1);

    const board = await getBoard(admin, project.id);
    expect(board.body.columns.map((c: any) => c.name)).toEqual(['To Do', 'QA', 'In Progress', 'Done']);
  });

  it('TC-13-INT-10 create column duplicate name (case-insensitive) returns 409', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const res = await createColumn(admin, project.id, { name: 'to do' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'column_name_duplicate',
      message: KANBAN_MESSAGES.columnNameDuplicate,
    });
  });

  it('TC-13-INT-11 user role forbidden from creating columns', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const user = await createMember(admin.organizationId, { role: 'user' });
    await assignToProject(project.id, user.membershipId, admin.accountId);
    await getBoard(admin, project.id);

    const res = await createColumn(user, project.id, { name: 'Extra' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'forbidden',
      message: KANBAN_MESSAGES.columnsPermissionDenied,
    });
  });

  it('TC-13-INT-12 rename column happy path', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const board = await getBoard(admin, project.id);
    const target = board.body.columns[1];

    const res = await renameColumn(admin, project.id, target.id, { name: 'In Review' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: target.id, name: 'In Review', position: 1 });
  });

  it('TC-13-INT-13 rename column duplicate name returns 409', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const board = await getBoard(admin, project.id);
    const target = board.body.columns[1];

    const res = await renameColumn(admin, project.id, target.id, { name: 'To Do' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('column_name_duplicate');
  });

  it('TC-13-INT-14 rename column not found returns 404', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    const res = await renameColumn(admin, project.id, randomUUID(), { name: 'X' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'column_not_found',
      message: KANBAN_MESSAGES.columnNotFound,
    });
  });

  it('TC-13-INT-15 reorder columns updates positions', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const board = await getBoard(admin, project.id);
    const [a, b, c] = board.body.columns;

    const res = await reorderColumns(admin, project.id, { columnIds: [c.id, a.id, b.id] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const after = await getBoard(admin, project.id);
    expect(after.body.columns.map((x: any) => x.id)).toEqual([c.id, a.id, b.id]);
    expect(after.body.columns.map((x: any) => x.position)).toEqual([0, 1, 2]);
  });

  it('TC-13-INT-16 reorder columns missing IDs returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const board = await getBoard(admin, project.id);
    const [a, b] = board.body.columns;

    const res = await reorderColumns(admin, project.id, { columnIds: [a.id, b.id] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'column_ids_mismatch',
      message: KANBAN_MESSAGES.columnIdsMismatch,
    });
  });

  it('TC-13-INT-17 reorder columns with unknown ID returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const board = await getBoard(admin, project.id);
    const [a, b, c] = board.body.columns;

    const res = await reorderColumns(admin, project.id, {
      columnIds: [a.id, b.id, c.id, randomUUID()],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('column_ids_mismatch');
  });

  it('TC-13-INT-18 delete empty column succeeds', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const board = await getBoard(admin, project.id);
    const target = board.body.columns[2]; // "Done"

    const res = await deleteColumn(admin, project.id, target.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('TC-13-INT-19 delete non-empty column returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const board = await getBoard(admin, project.id);
    const target = board.body.columns[0];
    await createTask(admin, project.id, { type: 'task', title: 'T', columnId: target.id });

    const res = await deleteColumn(admin, project.id, target.id);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'column_not_empty',
      message: KANBAN_MESSAGES.columnNotEmpty,
    });
  });

  it('TC-13-INT-20 delete last column returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const board = await getBoard(admin, project.id);
    const [a, b, c] = board.body.columns;
    await deleteColumn(admin, project.id, b.id);
    await deleteColumn(admin, project.id, c.id);

    const res = await deleteColumn(admin, project.id, a.id);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'column_delete_last',
      message: KANBAN_MESSAGES.columnDeleteLast,
    });
  });

  it('TC-13-INT-21 delete non-existent column returns 404', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    const res = await deleteColumn(admin, project.id, randomUUID());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('column_not_found');
  });

  // ────────────────────────────────────────────────────────────────────
  // Task create — fields / validation / hierarchy
  // ────────────────────────────────────────────────────────────────────

  it('TC-13-INT-22 create task with minimal fields', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    const res = await createTask(admin, project.id, { type: 'task', title: 'Test task' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      key: 'MOB-1',
      taskNumber: 1,
      title: 'Test task',
      priority: null,
      storyPoints: null,
      dueDate: null,
      assignee: null,
    });
    expect(res.body.reporter.membershipId).toBe(admin.membershipId);
  });

  it('TC-13-INT-23 create task with all fields', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const board = await getBoard(admin, project.id);
    const secondColumn = board.body.columns[1];
    const otherMember = await createMember(admin.organizationId, { role: 'user' });

    const res = await createTask(admin, project.id, {
      type: 'bug',
      title: 'Login broken',
      description: '# Steps\n- Enter email\n- Click submit',
      priority: 'high',
      columnId: secondColumn.id,
      storyPoints: 5,
      assigneeId: otherMember.membershipId,
      dueDate: '2026-09-15',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      key: 'MOB-1',
      type: 'bug',
      title: 'Login broken',
      priority: 'high',
      columnId: secondColumn.id,
      storyPoints: 5,
      dueDate: '2026-09-15',
    });
    expect(res.body.assignee.membershipId).toBe(otherMember.membershipId);
    expect(res.body.description).toContain('# Steps');
  });

  it('TC-13-INT-24 sequential task numbers increment', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    const a = await createTask(admin, project.id, { type: 'task', title: 'A' });
    const b = await createTask(admin, project.id, { type: 'task', title: 'B' });
    const c = await createTask(admin, project.id, { type: 'task', title: 'C' });
    expect([a.body.key, b.body.key, c.body.key]).toEqual(['MOB-1', 'MOB-2', 'MOB-3']);
  });

  it('TC-13-INT-25 concurrent task creates allocate unique numbers', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        createTask(admin, project.id, { type: 'task', title: `T${i}` }),
      ),
    );
    const numbers = results.map((r) => r.body.taskNumber).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5]);
  });

  it('TC-13-INT-26 task default column is first by position', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const board = await getBoard(admin, project.id);
    const [a, b, c] = board.body.columns;
    await reorderColumns(admin, project.id, { columnIds: [b.id, a.id, c.id] });

    const res = await createTask(admin, project.id, { type: 'task', title: 'X' });
    expect(res.status).toBe(201);
    expect(res.body.columnId).toBe(b.id);
    expect(res.body.columnName).toBe('In Progress');
  });

  it('TC-13-INT-27 task with explicit column lands there', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const board = await getBoard(admin, project.id);
    const done = board.body.columns[2];
    const res = await createTask(admin, project.id, { type: 'task', title: 'X', columnId: done.id });
    expect(res.status).toBe(201);
    expect(res.body.columnId).toBe(done.id);
  });

  it('TC-13-INT-28 task with column from another project returns 400', async () => {
    const admin = await signupAdmin();
    const projectA = await createProject(admin, { key: 'AAA' });
    const projectB = await createProject(admin, { key: 'BBB' });
    const boardB = await getBoard(admin, projectB.id);
    const bColumn = boardB.body.columns[0];

    const res = await createTask(admin, projectA.id, {
      type: 'task',
      title: 'X',
      columnId: bColumn.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('column_not_found');
  });

  it('TC-13-INT-29 create task empty title returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    const res = await createTask(admin, project.id, { type: 'task', title: '' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'title_required', message: KANBAN_MESSAGES.taskTitleRequired });
  });

  it('TC-13-INT-30 create task overlong title returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    const res = await createTask(admin, project.id, { type: 'task', title: 'A'.repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('title_too_long');
  });

  it('TC-13-INT-31 create task invalid type returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    const res = await createTask(admin, project.id, { type: 'feature', title: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('type_invalid');
  });

  it('TC-13-INT-32 create task invalid priority returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    const res = await createTask(admin, project.id, {
      type: 'task',
      title: 'X',
      priority: 'urgent',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('priority_invalid');
  });

  it('TC-13-INT-33 create task invalid story points returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    for (const bad of [-1, 1000, 3.5]) {
      const res = await createTask(admin, project.id, {
        type: 'task',
        title: 'X',
        storyPoints: bad,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('story_points_invalid');
    }
  });

  it('TC-13-INT-34 create task with active assignee succeeds', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const other = await createMember(admin.organizationId, { role: 'user' });

    const res = await createTask(admin, project.id, {
      type: 'task',
      title: 'X',
      assigneeId: other.membershipId,
    });
    expect(res.status).toBe(201);
    expect(res.body.assignee.membershipId).toBe(other.membershipId);
  });

  it('TC-13-INT-35 create task with removed assignee returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const removed = await createMember(admin.organizationId, {
      role: 'user',
      status: 'removed',
    });

    const res = await createTask(admin, project.id, {
      type: 'task',
      title: 'X',
      assigneeId: removed.membershipId,
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'assignee_invalid',
      message: KANBAN_MESSAGES.assigneeInvalid,
    });
  });

  it('TC-13-INT-36 create task assignee from another org returns 400', async () => {
    const admin = await signupAdmin();
    const otherAdmin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    const res = await createTask(admin, project.id, {
      type: 'task',
      title: 'X',
      assigneeId: otherAdmin.membershipId,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('assignee_invalid');
  });

  it('TC-13-INT-37 create task in archived project returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await prisma.boardColumn.createMany({
      data: [
        { projectId: project.id, name: 'To Do', position: 0, category: 'todo' },
        { projectId: project.id, name: 'In Progress', position: 1, category: 'in_progress' },
        { projectId: project.id, name: 'Done', position: 2, category: 'done' },
      ],
    });
    await prisma.project.update({ where: { id: project.id }, data: { status: 'archived' } });

    const res = await createTask(admin, project.id, { type: 'task', title: 'X' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'project_archived',
      message: KANBAN_MESSAGES.projectArchived,
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Hierarchy
  // ────────────────────────────────────────────────────────────────────

  it('TC-13-INT-38 epic cannot have a parent', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const parent = await createTask(admin, project.id, { type: 'task', title: 'P' });

    const res = await createTask(admin, project.id, {
      type: 'epic',
      title: 'E',
      parentId: parent.body.id,
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'epic_cannot_have_parent',
      message: KANBAN_MESSAGES.epicCannotHaveParent,
    });
  });

  it('TC-13-INT-39 task with epic parent succeeds', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const epic = await createTask(admin, project.id, { type: 'epic', title: 'Auth' });

    const res = await createTask(admin, project.id, {
      type: 'task',
      title: 'Login',
      parentId: epic.body.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.parentId).toBe(epic.body.id);
  });

  it('TC-13-INT-40 task with non-epic parent returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const parent = await createTask(admin, project.id, { type: 'task', title: 'P' });

    const res = await createTask(admin, project.id, {
      type: 'task',
      title: 'Child',
      parentId: parent.body.id,
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'task_parent_must_be_epic',
      message: KANBAN_MESSAGES.taskParentMustBeEpic,
    });
  });

  it('TC-13-INT-41 subtask requires a parent', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    const res = await createTask(admin, project.id, { type: 'subtask', title: 'S' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'subtask_requires_parent',
      message: KANBAN_MESSAGES.subtaskRequiresParent,
    });
  });

  it('TC-13-INT-42 subtask under task parent succeeds', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const parent = await createTask(admin, project.id, { type: 'task', title: 'T' });
    const res = await createTask(admin, project.id, {
      type: 'subtask',
      title: 'S',
      parentId: parent.body.id,
    });
    expect(res.status).toBe(201);
  });

  it('TC-13-INT-43 subtask under bug parent succeeds', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const parent = await createTask(admin, project.id, { type: 'bug', title: 'B' });
    const res = await createTask(admin, project.id, {
      type: 'subtask',
      title: 'S',
      parentId: parent.body.id,
    });
    expect(res.status).toBe(201);
  });

  it('TC-13-INT-44 subtask under story parent succeeds', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const parent = await createTask(admin, project.id, { type: 'story', title: 'St' });
    const res = await createTask(admin, project.id, {
      type: 'subtask',
      title: 'S',
      parentId: parent.body.id,
    });
    expect(res.status).toBe(201);
  });

  it('TC-13-INT-45 subtask under epic returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const epic = await createTask(admin, project.id, { type: 'epic', title: 'E' });

    const res = await createTask(admin, project.id, {
      type: 'subtask',
      title: 'S',
      parentId: epic.body.id,
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'subtask_parent_invalid',
      message: KANBAN_MESSAGES.subtaskParentInvalid,
    });
  });

  it('TC-13-INT-46 subtask under subtask returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const task = await createTask(admin, project.id, { type: 'task', title: 'T' });
    const sub = await createTask(admin, project.id, {
      type: 'subtask',
      title: 'S1',
      parentId: task.body.id,
    });
    const res = await createTask(admin, project.id, {
      type: 'subtask',
      title: 'S2',
      parentId: sub.body.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('subtask_parent_invalid');
  });

  it('TC-13-INT-47 parent from different project returns 400', async () => {
    const admin = await signupAdmin();
    const a = await createProject(admin, { key: 'AAA' });
    const b = await createProject(admin, { key: 'BBB' });
    await getBoard(admin, a.id);
    await getBoard(admin, b.id);
    const epicA = await createTask(admin, a.id, { type: 'epic', title: 'E' });

    const res = await createTask(admin, b.id, {
      type: 'task',
      title: 'X',
      parentId: epicA.body.id,
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'parent_wrong_project',
      message: KANBAN_MESSAGES.parentWrongProject,
    });
  });

  it('TC-13-INT-48 parent not found returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    const res = await createTask(admin, project.id, {
      type: 'task',
      title: 'X',
      parentId: randomUUID(),
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'parent_not_found',
      message: KANBAN_MESSAGES.parentNotFound,
    });
  });

  it('TC-13-INT-49 circular reference on epic is caught', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const epic = await createTask(admin, project.id, { type: 'epic', title: 'E' });
    const task = await createTask(admin, project.id, {
      type: 'task',
      title: 'T',
      parentId: epic.body.id,
    });
    // Epic cannot have a parent — this fails with epic_cannot_have_parent (the spec's
    // explicit note on this TC).
    const res = await updateTask(admin, project.id, epic.body.id, { parentId: task.body.id });
    expect(res.status).toBe(400);
    expect(['epic_cannot_have_parent', 'circular_reference']).toContain(res.body.error);
  });

  // ────────────────────────────────────────────────────────────────────
  // Task read / list / detail
  // ────────────────────────────────────────────────────────────────────

  it('TC-13-INT-50 get task detail with all fields', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const other = await createMember(admin.organizationId, { role: 'user' });
    const epic = await createTask(admin, project.id, { type: 'epic', title: 'E' });
    const created = await createTask(admin, project.id, {
      type: 'task',
      title: 'T',
      description: 'desc',
      priority: 'high',
      assigneeId: other.membershipId,
      dueDate: '2026-12-01',
      parentId: epic.body.id,
    });

    const res = await getTask(admin, project.id, created.body.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      key: 'MOB-2',
      title: 'T',
      description: 'desc',
      priority: 'high',
      dueDate: '2026-12-01',
    });
    expect(res.body.parent).toMatchObject({ id: epic.body.id, key: 'MOB-1' });
    expect(Array.isArray(res.body.children)).toBe(true);
  });

  it('TC-13-INT-51 get task not found returns 404', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    const res = await getTask(admin, project.id, randomUUID());
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'task_not_found', message: KANBAN_MESSAGES.taskNotFound });
  });

  it('TC-13-INT-52 cross-org task returns 404', async () => {
    const adminA = await signupAdmin();
    const adminB = await signupAdmin();
    const projectA = await createProject(adminA, { key: 'AAA' });
    const projectB = await createProject(adminB, { key: 'BBB' });
    await getBoard(adminA, projectA.id);
    await getBoard(adminB, projectB.id);
    const taskA = await createTask(adminA, projectA.id, { type: 'task', title: 'A' });

    const res = await getTask(adminB, projectB.id, taskA.body.id);
    expect(res.status).toBe(404);
  });

  // ────────────────────────────────────────────────────────────────────
  // Update / move / delete
  // ────────────────────────────────────────────────────────────────────

  it('TC-13-INT-53 partial update changes only title', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const t = await createTask(admin, project.id, {
      type: 'task',
      title: 'Old',
      priority: 'low',
    });
    const res = await updateTask(admin, project.id, t.body.id, { title: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New');
    expect(res.body.priority).toBe('low');
  });

  it('TC-13-INT-54 partial update changes only priority', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const t = await createTask(admin, project.id, {
      type: 'task',
      title: 'Keep',
      priority: 'low',
    });
    const res = await updateTask(admin, project.id, t.body.id, { priority: 'critical' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Keep');
    expect(res.body.priority).toBe('critical');
  });

  it('TC-13-INT-55 change assignee', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const other = await createMember(admin.organizationId, { role: 'user' });
    const t = await createTask(admin, project.id, { type: 'task', title: 'T' });

    const res = await updateTask(admin, project.id, t.body.id, { assigneeId: other.membershipId });
    expect(res.status).toBe(200);
    expect(res.body.assignee.membershipId).toBe(other.membershipId);
  });

  it('TC-13-INT-56 clear assignee (null)', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const other = await createMember(admin.organizationId, { role: 'user' });
    const t = await createTask(admin, project.id, {
      type: 'task',
      title: 'T',
      assigneeId: other.membershipId,
    });
    const res = await updateTask(admin, project.id, t.body.id, { assigneeId: null });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBeNull();
  });

  it('TC-13-INT-57 change type', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const t = await createTask(admin, project.id, { type: 'task', title: 'T' });
    const res = await updateTask(admin, project.id, t.body.id, { type: 'bug' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('bug');
  });

  it('TC-13-INT-58 change type to epic when it has subtasks fails', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const parent = await createTask(admin, project.id, { type: 'task', title: 'P' });
    await createTask(admin, project.id, { type: 'subtask', title: 'S', parentId: parent.body.id });

    const res = await updateTask(admin, project.id, parent.body.id, { type: 'epic' });
    expect(res.status).toBe(400);
    // The child hierarchy check surfaces subtask_parent_invalid — parent may not be an epic.
    expect(res.body.error).toBe('subtask_parent_invalid');
  });

  it('TC-13-INT-59 change type to subtask with no parent fails', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const t = await createTask(admin, project.id, { type: 'task', title: 'T' });

    const res = await updateTask(admin, project.id, t.body.id, { type: 'subtask' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('subtask_requires_parent');
  });

  it('TC-13-INT-60 update task in archived project returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const t = await createTask(admin, project.id, { type: 'task', title: 'T' });
    await prisma.project.update({ where: { id: project.id }, data: { status: 'archived' } });

    const res = await updateTask(admin, project.id, t.body.id, { title: 'N' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('project_archived');
  });

  it('TC-13-INT-61 immutable fields ignored on update', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const other = await createMember(admin.organizationId, { role: 'user' });
    const t = await createTask(admin, project.id, { type: 'task', title: 'T' });

    // taskNumber / reporterId / projectId are not part of the update input; a client
    // that includes them should still get a 200 and no field change.
    const res = await updateTask(admin, project.id, t.body.id, {
      title: 'T2',
      taskNumber: 999,
      reporterId: other.membershipId,
      projectId: randomUUID(),
    });
    expect(res.status).toBe(200);
    expect(res.body.taskNumber).toBe(1);
    expect(res.body.reporter.membershipId).toBe(admin.membershipId);
    expect(res.body.key).toBe('MOB-1');
  });

  it('TC-13-INT-62 move task to different column', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const board = await getBoard(admin, project.id);
    const [, inProg] = board.body.columns;
    const t = await createTask(admin, project.id, { type: 'task', title: 'T' });

    const res = await moveTask(admin, project.id, t.body.id, { columnId: inProg.id });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ columnId: inProg.id, columnName: 'In Progress' });
  });

  it('TC-13-INT-63 move task position only', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const t = await createTask(admin, project.id, { type: 'task', title: 'T' });
    const originalColumn = t.body.columnId;

    const res = await moveTask(admin, project.id, t.body.id, { position: 2.5 });
    expect(res.status).toBe(200);
    expect(res.body.position).toBe(2.5);
    expect(res.body.columnId).toBe(originalColumn);
  });

  it('TC-13-INT-64 move task with column and position', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const board = await getBoard(admin, project.id);
    const [, inProg] = board.body.columns;
    const t = await createTask(admin, project.id, { type: 'task', title: 'T' });

    const res = await moveTask(admin, project.id, t.body.id, {
      columnId: inProg.id,
      position: 7.5,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ columnId: inProg.id, position: 7.5 });
  });

  it('TC-13-INT-65 move task in archived project returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const t = await createTask(admin, project.id, { type: 'task', title: 'T' });
    await prisma.project.update({ where: { id: project.id }, data: { status: 'archived' } });

    const res = await moveTask(admin, project.id, t.body.id, { position: 1.0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('project_archived');
  });

  it('TC-13-INT-66 move task to column in another project returns 400', async () => {
    const admin = await signupAdmin();
    const a = await createProject(admin, { key: 'AAA' });
    const b = await createProject(admin, { key: 'BBB' });
    const boardA = await getBoard(admin, a.id);
    const boardB = await getBoard(admin, b.id);
    const t = await createTask(admin, a.id, { type: 'task', title: 'X' });
    const foreign = boardB.body.columns[0];

    const res = await moveTask(admin, a.id, t.body.id, { columnId: foreign.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('column_not_found');
  });

  it('TC-13-INT-67 delete task removes it from board', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const t = await createTask(admin, project.id, { type: 'task', title: 'T' });

    const del = await deleteTask(admin, project.id, t.body.id);
    expect(del.status).toBe(200);

    const board = await getBoard(admin, project.id);
    expect(board.body.tasks.find((x: any) => x.id === t.body.id)).toBeUndefined();
  });

  it('TC-13-INT-68 delete parent orphans its children', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const parent = await createTask(admin, project.id, { type: 'task', title: 'P' });
    const s1 = await createTask(admin, project.id, {
      type: 'subtask',
      title: 'S1',
      parentId: parent.body.id,
    });
    const s2 = await createTask(admin, project.id, {
      type: 'subtask',
      title: 'S2',
      parentId: parent.body.id,
    });
    await deleteTask(admin, project.id, parent.body.id);

    const orphan1 = await prisma.task.findUnique({ where: { id: s1.body.id } });
    const orphan2 = await prisma.task.findUnique({ where: { id: s2.body.id } });
    expect(orphan1?.parentId).toBeNull();
    expect(orphan2?.parentId).toBeNull();
  });

  it('TC-13-INT-69 delete non-existent task returns 404', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);

    const res = await deleteTask(admin, project.id, randomUUID());
    expect(res.status).toBe(404);
  });

  it('TC-13-INT-70 delete task in archived project returns 400', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const t = await createTask(admin, project.id, { type: 'task', title: 'T' });
    await prisma.project.update({ where: { id: project.id }, data: { status: 'archived' } });

    const res = await deleteTask(admin, project.id, t.body.id);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('project_archived');
  });

  // ────────────────────────────────────────────────────────────────────
  // List / filter / search / sort
  // ────────────────────────────────────────────────────────────────────

  const seedListTasks = async (admin: Signed, projectId: string) => {
    const board = await getBoard(admin, projectId);
    const columns = board.body.columns as { id: string; name: string }[];
    const other = await createMember(admin.organizationId, { role: 'user' });
    const tasks: any[] = [];
    tasks.push((await createTask(admin, projectId, { type: 'bug', title: 'Login bug', priority: 'critical' })).body);
    tasks.push((await createTask(admin, projectId, { type: 'task', title: 'Refactor login', priority: 'high', assigneeId: other.membershipId, dueDate: '2026-09-15' })).body);
    tasks.push((await createTask(admin, projectId, { type: 'story', title: 'Landing page', priority: 'medium', storyPoints: 8 })).body);
    tasks.push((await createTask(admin, projectId, { type: 'bug', title: 'API 500', priority: 'high' })).body);
    tasks.push((await createTask(admin, projectId, { type: 'task', title: 'Cleanup', priority: 'low', dueDate: '2027-01-01' })).body);
    return { tasks, columns, other };
  };

  it('TC-13-INT-71 list tasks default sort created_desc', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await seedListTasks(admin, project.id);

    const res = await listTasks(admin, project.id);
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(5);
    const created = res.body.tasks.map((t: any) => t.createdAt);
    const sorted = [...created].sort().reverse();
    expect(created).toEqual(sorted);
  });

  it('TC-13-INT-72 filter by single type', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await seedListTasks(admin, project.id);

    const res = await listTasks(admin, project.id, '?type=bug');
    expect(res.status).toBe(200);
    expect(res.body.tasks.every((t: any) => t.type === 'bug')).toBe(true);
    expect(res.body.tasks).toHaveLength(2);
  });

  it('TC-13-INT-73 filter by multiple types (comma-separated)', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await seedListTasks(admin, project.id);

    const res = await listTasks(admin, project.id, '?type=bug,story');
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t: any) => t.type).sort()).toEqual(['bug', 'bug', 'story']);
  });

  it('TC-13-INT-74 filter by multiple priorities', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await seedListTasks(admin, project.id);

    const res = await listTasks(admin, project.id, '?priority=high,critical');
    expect(res.body.tasks.every((t: any) => ['high', 'critical'].includes(t.priority))).toBe(true);
    expect(res.body.tasks).toHaveLength(3);
  });

  it('TC-13-INT-75 filter by assignee', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const { other } = await seedListTasks(admin, project.id);

    const res = await listTasks(admin, project.id, `?assigneeId=${other.membershipId}`);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].assignee.membershipId).toBe(other.membershipId);
  });

  it('TC-13-INT-76 filter by column', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const { columns } = await seedListTasks(admin, project.id);

    const res = await listTasks(admin, project.id, `?columnId=${columns[0].id}`);
    expect(res.body.tasks.length).toBeGreaterThan(0);
    expect(res.body.tasks.every((t: any) => t.columnId === columns[0].id)).toBe(true);
  });

  it('TC-13-INT-77 search by title (case-insensitive)', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await seedListTasks(admin, project.id);

    const res = await listTasks(admin, project.id, '?search=login');
    expect(res.body.tasks).toHaveLength(2);
    expect(res.body.tasks.every((t: any) => t.title.toLowerCase().includes('login'))).toBe(true);
  });

  it('TC-13-INT-78 sort by priority desc', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await seedListTasks(admin, project.id);

    const res = await listTasks(admin, project.id, '?sort=priority_desc');
    const priorities = res.body.tasks.map((t: any) => t.priority);
    // critical > high > medium > low
    expect(priorities[0]).toBe('critical');
    expect(priorities[priorities.length - 1]).toBe('low');
  });

  it('TC-13-INT-79 sort by due date asc, nulls last', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await seedListTasks(admin, project.id);

    const res = await listTasks(admin, project.id, '?sort=due_date_asc');
    const withDates = res.body.tasks.filter((t: any) => t.dueDate !== null);
    const nulls = res.body.tasks.filter((t: any) => t.dueDate === null);
    expect(withDates.map((t: any) => t.dueDate)).toEqual(['2026-09-15', '2027-01-01']);
    // Nulls come after all non-null values.
    const firstNullIdx = res.body.tasks.findIndex((t: any) => t.dueDate === null);
    expect(firstNullIdx).toBe(withDates.length);
    expect(nulls.length).toBeGreaterThan(0);
  });

  it('TC-13-INT-80 combined filters and sort', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await seedListTasks(admin, project.id);

    const res = await listTasks(admin, project.id, '?type=task&priority=high&sort=created_asc');
    expect(res.body.tasks.every((t: any) => t.type === 'task' && t.priority === 'high')).toBe(true);
    const created = res.body.tasks.map((t: any) => t.createdAt);
    expect(created).toEqual([...created].sort());
  });

  // ────────────────────────────────────────────────────────────────────
  // Project key (spec 11 modifications by spec 13)
  // ────────────────────────────────────────────────────────────────────

  it('TC-13-INT-81 set project key on an existing project (PUT)', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: null });
    const res = await putProject(admin, project.id, { name: project.name, key: 'MOB' });
    expect(res.status).toBe(200);
    expect(res.body.key).toBe('MOB');
  });

  it('TC-13-INT-82 duplicate key within org returns 409', async () => {
    const admin = await signupAdmin();
    const projectA = await createProject(admin, { key: 'MOB' });
    const projectB = await createProject(admin, { key: null });
    const res = await putProject(admin, projectB.id, { name: projectB.name, key: 'MOB' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'key_duplicate',
      message: KANBAN_MESSAGES.projectKeyDuplicate,
    });
    expect(projectA.key).toBe('MOB'); // sanity
  });

  it('TC-13-INT-83 changing an already-set key returns 400 key_immutable', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const res = await putProject(admin, project.id, { name: project.name, key: 'WEB' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'key_immutable',
      message: KANBAN_MESSAGES.projectKeyImmutable,
    });
  });

  it('TC-13-INT-84 setting the same value is idempotent', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const res = await putProject(admin, project.id, { name: project.name, key: 'MOB' });
    expect(res.status).toBe(200);
    expect(res.body.key).toBe('MOB');
  });

  it('TC-13-INT-85 set key at project creation (POST)', async () => {
    const admin = await signupAdmin();
    const res = await postProject(admin, { name: `Mobile ${randomUUID()}`, key: 'MOB' });
    expect(res.status).toBe(201);
    expect(res.body.key).toBe('MOB');
    expect(res.body.nextTaskNumber).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────────
  // Cross-cutting
  // ────────────────────────────────────────────────────────────────────

  it('TC-13-INT-86 removing a member cascades their project membership + revokes board access', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const user = await createMember(admin.organizationId, { role: 'user' });
    await assignToProject(project.id, user.membershipId, admin.accountId);

    // Before removal — user has access.
    const before = await getBoard(user, project.id);
    expect(before.status).toBe(200);

    // Cascade the assignment away and mark member removed.
    await prisma.projectMember.deleteMany({ where: { membershipId: user.membershipId } });
    await prisma.membership.update({
      where: { id: user.membershipId },
      data: { status: 'removed' },
    });

    // Old session cookie belongs to a removed member — SessionGuard's caller resolution
    // returns 403 (the caller is no longer active). Either 403 or 401 is spec-legal.
    const res = await getBoard(user, project.id);
    expect([401, 403]).toContain(res.status);
  });

  it('TC-13-INT-87 task with children lists them in the detail response', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    await getBoard(admin, project.id);
    const epic = await createTask(admin, project.id, { type: 'epic', title: 'Auth Epic' });
    const t1 = await createTask(admin, project.id, {
      type: 'task',
      title: 'Login',
      parentId: epic.body.id,
    });
    const t2 = await createTask(admin, project.id, {
      type: 'task',
      title: 'Logout',
      parentId: epic.body.id,
    });
    await createTask(admin, project.id, {
      type: 'subtask',
      title: 'Write test',
      parentId: t1.body.id,
    });

    const epicDetail = await getTask(admin, project.id, epic.body.id);
    expect(epicDetail.body.children).toHaveLength(2);
    expect(epicDetail.body.children.map((c: any) => c.id).sort()).toEqual([t1.body.id, t2.body.id].sort());

    const t1Detail = await getTask(admin, project.id, t1.body.id);
    expect(t1Detail.body.children).toHaveLength(1);
    expect(t1Detail.body.children[0].title).toBe('Write test');
  });

  it('TC-13-INT-88 board taskCount per column reflects actual tasks', async () => {
    const admin = await signupAdmin();
    const project = await createProject(admin, { key: 'MOB' });
    const board = await getBoard(admin, project.id);
    const [todo, inProg] = board.body.columns;

    await createTask(admin, project.id, { type: 'task', title: 'A', columnId: todo.id });
    await createTask(admin, project.id, { type: 'task', title: 'B', columnId: todo.id });
    await createTask(admin, project.id, { type: 'task', title: 'C', columnId: todo.id });
    await createTask(admin, project.id, { type: 'task', title: 'D', columnId: inProg.id });

    const res = await getBoard(admin, project.id);
    expect(res.body.columns[0].taskCount).toBe(3);
    expect(res.body.columns[1].taskCount).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────────
  // Spec 15 — Task Detail (timeLogged*) + Task Search endpoint
  // ────────────────────────────────────────────────────────────────────

  describe('spec 15 — task detail time logged', () => {
    const seedEntry = async (
      admin: Signed,
      opts: {
        projectId: string;
        membershipId: string;
        taskId?: string | null;
        durationMinutes: number;
        date?: Date;
      },
    ) =>
      prisma.timeEntry.create({
        data: {
          organizationId: admin.organizationId,
          membershipId: opts.membershipId,
          projectId: opts.projectId,
          taskId: opts.taskId ?? null,
          durationMinutes: opts.durationMinutes,
          date: opts.date ?? new Date('2026-08-27T00:00:00Z'),
          createdByAccountId: admin.accountId,
        },
      });

    it('TC-15-INT-22: timeLoggedMinutes aggregates across visible entries', async () => {
      const admin = await signupAdmin();
      const project = await createProject(admin, { key: 'MOB' });
      await getBoard(admin, project.id);
      const t = await createTask(admin, project.id, { type: 'task', title: 'Aggregation' });
      await seedEntry(admin, { projectId: project.id, membershipId: admin.membershipId, taskId: t.body.id, durationMinutes: 60 });
      await seedEntry(admin, { projectId: project.id, membershipId: admin.membershipId, taskId: t.body.id, durationMinutes: 90 });
      await seedEntry(admin, { projectId: project.id, membershipId: admin.membershipId, taskId: t.body.id, durationMinutes: 45 });

      const res = await getTask(admin, project.id, t.body.id);
      expect(res.status).toBe(200);
      expect(res.body.timeLoggedMinutes).toBe(195);
    });

    it('TC-15-INT-23: recentTimeEntries is capped at 10, sorted date desc', async () => {
      const admin = await signupAdmin();
      const project = await createProject(admin, { key: 'MOB' });
      await getBoard(admin, project.id);
      const t = await createTask(admin, project.id, { type: 'task', title: 'Cap' });
      for (let i = 1; i <= 15; i++) {
        await seedEntry(admin, {
          projectId: project.id,
          membershipId: admin.membershipId,
          taskId: t.body.id,
          durationMinutes: 30,
          date: new Date(`2026-08-${String(i).padStart(2, '0')}T00:00:00Z`),
        });
      }
      const res = await getTask(admin, project.id, t.body.id);
      expect(res.body.recentTimeEntries).toHaveLength(10);
      const dates = res.body.recentTimeEntries.map((e: any) => e.date);
      const sorted = [...dates].sort().reverse();
      expect(dates).toEqual(sorted);
    });

    it('TC-15-INT-24: user role sees only own entries in aggregate', async () => {
      const admin = await signupAdmin();
      const project = await createProject(admin, { key: 'MOB' });
      await getBoard(admin, project.id);
      const t = await createTask(admin, project.id, { type: 'task', title: 'Own only' });
      const u1 = await createMember(admin.organizationId, { role: 'user' });
      const u2 = await createMember(admin.organizationId, { role: 'user' });
      await assignToProject(project.id, u1.membershipId, admin.accountId);
      await assignToProject(project.id, u2.membershipId, admin.accountId);
      await seedEntry(admin, { projectId: project.id, membershipId: u1.membershipId, taskId: t.body.id, durationMinutes: 60 });
      await seedEntry(admin, { projectId: project.id, membershipId: u2.membershipId, taskId: t.body.id, durationMinutes: 90 });

      const res = await getTask(u1, project.id, t.body.id);
      expect(res.status).toBe(200);
      expect(res.body.timeLoggedMinutes).toBe(60);
      expect(res.body.recentTimeEntries).toHaveLength(1);
      expect(res.body.recentTimeEntries[0].membershipId).toBe(u1.membershipId);
    });

    it('TC-15-INT-25: admin sees all members\' entries in aggregate', async () => {
      const admin = await signupAdmin();
      const project = await createProject(admin, { key: 'MOB' });
      await getBoard(admin, project.id);
      const t = await createTask(admin, project.id, { type: 'task', title: 'Admin view' });
      const u1 = await createMember(admin.organizationId, { role: 'user', firstName: 'Alex', lastName: 'K' });
      const u2 = await createMember(admin.organizationId, { role: 'user', firstName: 'Jane', lastName: 'D' });
      await seedEntry(admin, { projectId: project.id, membershipId: u1.membershipId, taskId: t.body.id, durationMinutes: 60 });
      await seedEntry(admin, { projectId: project.id, membershipId: u2.membershipId, taskId: t.body.id, durationMinutes: 90 });

      const res = await getTask(admin, project.id, t.body.id);
      expect(res.status).toBe(200);
      expect(res.body.timeLoggedMinutes).toBe(150);
      expect(res.body.recentTimeEntries).toHaveLength(2);
      const names = new Set(res.body.recentTimeEntries.map((e: any) => e.memberName));
      expect(names).toEqual(new Set(['Alex K', 'Jane D']));
    });

    it('TC-15-INT-26: empty state — no entries', async () => {
      const admin = await signupAdmin();
      const project = await createProject(admin, { key: 'MOB' });
      await getBoard(admin, project.id);
      const t = await createTask(admin, project.id, { type: 'task', title: 'Empty' });

      const res = await getTask(admin, project.id, t.body.id);
      expect(res.body.timeLoggedMinutes).toBe(0);
      expect(res.body.recentTimeEntries).toEqual([]);
    });
  });

  describe('spec 15 — task search', () => {
    const searchTasks = (s: Signed, projectId: string, q?: string) =>
      request(server())
        .get(
          `/api/organizations/${s.organizationId}/projects/${projectId}/tasks/search${q === undefined ? '' : `?q=${encodeURIComponent(q)}`}`,
        )
        .set('Cookie', s.cookies);

    it('TC-15-INT-27: matches by key prefix (MOB-1 → MOB-1, MOB-15)', async () => {
      const admin = await signupAdmin();
      const project = await createProject(admin, { key: 'MOB' });
      await getBoard(admin, project.id);
      await createTask(admin, project.id, { type: 'task', title: 'One' });
      await createTask(admin, project.id, { type: 'task', title: 'Two' });
      // Bump next task number to 15 for the third task.
      await prisma.project.update({ where: { id: project.id }, data: { nextTaskNumber: 15 } });
      await createTask(admin, project.id, { type: 'task', title: 'Fifteen' });

      const res = await searchTasks(admin, project.id, 'MOB-1');
      expect(res.status).toBe(200);
      const keys = res.body.tasks.map((t: any) => t.key);
      expect(keys).toContain('MOB-1');
      expect(keys).toContain('MOB-15');
      expect(keys).not.toContain('MOB-2');
      // Exact match ranks first.
      expect(keys[0]).toBe('MOB-1');
    });

    it('TC-15-INT-28: matches by title substring, case-insensitive', async () => {
      const admin = await signupAdmin();
      const project = await createProject(admin, { key: 'MOB' });
      await getBoard(admin, project.id);
      await createTask(admin, project.id, { type: 'task', title: 'Fix login bug' });

      const res = await searchTasks(admin, project.id, 'LOGIN');
      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].title).toBe('Fix login bug');
    });

    it('TC-15-INT-29: empty query returns up to 20 most-recent tasks', async () => {
      const admin = await signupAdmin();
      const project = await createProject(admin, { key: 'MOB' });
      await getBoard(admin, project.id);
      for (let i = 0; i < 5; i++) {
        await createTask(admin, project.id, { type: 'task', title: `T${i}` });
      }

      const res = await searchTasks(admin, project.id);
      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(5);
    });

    it('TC-15-INT-30: caps results at 20', async () => {
      const admin = await signupAdmin();
      const project = await createProject(admin, { key: 'MOB' });
      await getBoard(admin, project.id);
      for (let i = 0; i < 30; i++) {
        await createTask(admin, project.id, { type: 'task', title: `Task number ${i}` });
      }
      const res = await searchTasks(admin, project.id, 'task');
      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(20);
    });

    it('TC-15-INT-31: project without key returns 400 project_key_required', async () => {
      const admin = await signupAdmin();
      const project = await createProject(admin, { key: null });
      const res = await searchTasks(admin, project.id, 'x');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'project_key_required',
        message: TIME_TRACKING_MESSAGES.searchProjectKeyRequired,
      });
    });

    it('TC-15-INT-32: user role not a project member returns 403', async () => {
      const admin = await signupAdmin();
      const project = await createProject(admin, { key: 'MOB' });
      const u = await createMember(admin.organizationId, { role: 'user' });
      const res = await searchTasks(u, project.id, 'x');
      expect(res.status).toBe(403);
    });

    it('TC-15-INT-33: viewer role returns 403', async () => {
      const admin = await signupAdmin();
      const project = await createProject(admin, { key: 'MOB' });
      const v = await createMember(admin.organizationId, { role: 'viewer' });
      const res = await searchTasks(v, project.id, 'x');
      expect(res.status).toBe(403);
    });

    it('TC-15-INT-34: cross-org project returns 404', async () => {
      const adminA = await signupAdmin();
      const adminB = await signupAdmin();
      const projectB = await createProject(adminB, { key: 'MOB' });

      const res = await searchTasks(adminA, projectB.id, 'x');
      expect(res.status).toBe(404);
    });
  });
});
