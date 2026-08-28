import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PROJECT_MESSAGES } from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

/** Cheap in tests — the policy under bcrypt doesn't depend on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

describe('Projects (spec 11)', () => {
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
    opts: { email: string; role: string; firstName?: string; lastName?: string; status?: string },
  ): Promise<Signed> => {
    const password = 'Passw0rd';
    const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: {
        email: opts.email,
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

  const listProjects = (cookies: string[], orgId: string, query = '') =>
    request(server()).get(`/api/organizations/${orgId}/projects${query}`).set('Cookie', cookies);

  const createProject = (cookies: string[], orgId: string, name: unknown) =>
    request(server()).post(`/api/organizations/${orgId}/projects`).set('Cookie', cookies).send({ name });

  const renameProject = (cookies: string[], orgId: string, projectId: string, name: unknown) =>
    request(server())
      .put(`/api/organizations/${orgId}/projects/${projectId}`)
      .set('Cookie', cookies)
      .send({ name });

  const archiveProject = (cookies: string[], orgId: string, projectId: string) =>
    request(server())
      .patch(`/api/organizations/${orgId}/projects/${projectId}/archive`)
      .set('Cookie', cookies);

  const restoreProject = (cookies: string[], orgId: string, projectId: string) =>
    request(server())
      .patch(`/api/organizations/${orgId}/projects/${projectId}/restore`)
      .set('Cookie', cookies);

  const listMembers = (cookies: string[], orgId: string, projectId: string) =>
    request(server())
      .get(`/api/organizations/${orgId}/projects/${projectId}/members`)
      .set('Cookie', cookies);

  const addMembers = (cookies: string[], orgId: string, projectId: string, membershipIds: unknown) =>
    request(server())
      .post(`/api/organizations/${orgId}/projects/${projectId}/members`)
      .set('Cookie', cookies)
      .send({ membershipIds });

  const removeMember = (cookies: string[], orgId: string, projectId: string, membershipId: string) =>
    request(server())
      .delete(`/api/organizations/${orgId}/projects/${projectId}/members/${membershipId}`)
      .set('Cookie', cookies);

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

  // TC-11-INT-01
  it('creates a project (happy path) and lists it with counts', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const created = await createProject(admin.cookies, admin.organizationId, 'Project Alpha');
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Project Alpha', status: 'active' });
    expect(created.body.id).toEqual(expect.any(String));
    expect(created.body.createdAt).toEqual(expect.any(String));

    const list = await listProjects(admin.cookies, admin.organizationId);
    expect(list.status).toBe(200);
    const alpha = list.body.projects.find((p: any) => p.name === 'Project Alpha');
    expect(alpha).toMatchObject({ memberCount: 0, totalHours: 0, status: 'active' });
  });

  // TC-11-INT-02
  it('rejects a duplicate name case-insensitively with 409', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createProject(admin.cookies, admin.organizationId, 'Project Alpha');

    const dup = await createProject(admin.cookies, admin.organizationId, 'project alpha');
    expect(dup.status).toBe(409);
    expect(dup.body).toEqual({
      error: 'duplicate_name',
      message: PROJECT_MESSAGES.nameDuplicate,
    });
  });

  // TC-11-INT-03
  it('forbids user and viewer from creating a project', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const user = await createMember(admin.organizationId, { email: 'u@acme.com', role: 'user' });
    const viewer = await createMember(admin.organizationId, { email: 'v@acme.com', role: 'viewer' });

    const uRes = await createProject(user.cookies, admin.organizationId, 'Nope');
    expect(uRes.status).toBe(403);
    expect(uRes.body).toEqual({ error: 'forbidden', message: PROJECT_MESSAGES.forbidden });

    const vRes = await createProject(viewer.cookies, admin.organizationId, 'Nope');
    expect(vRes.status).toBe(403);
    expect(vRes.body.error).toBe('forbidden');
  });

  // TC-11-INT-04
  it('renames a project (happy path)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const created = await createProject(admin.cookies, admin.organizationId, 'Alpha');

    const res = await renameProject(admin.cookies, admin.organizationId, created.body.id, 'Beta');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: created.body.id, name: 'Beta', status: 'active' });
  });

  // TC-11-INT-05
  it('archives a project and shows it under ?status=archived', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const created = await createProject(admin.cookies, admin.organizationId, 'Gamma');

    const arch = await archiveProject(admin.cookies, admin.organizationId, created.body.id);
    expect(arch.status).toBe(200);
    expect(arch.body).toEqual({ success: true });

    const active = await listProjects(admin.cookies, admin.organizationId, '?status=active');
    expect(active.body.projects.find((p: any) => p.id === created.body.id)).toBeUndefined();

    const archived = await listProjects(admin.cookies, admin.organizationId, '?status=archived');
    const found = archived.body.projects.find((p: any) => p.id === created.body.id);
    expect(found).toMatchObject({ status: 'archived' });
  });

  // TC-11-INT-06
  it('returns 400 already_archived when archiving twice', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const created = await createProject(admin.cookies, admin.organizationId, 'Delta');
    await archiveProject(admin.cookies, admin.organizationId, created.body.id);

    const again = await archiveProject(admin.cookies, admin.organizationId, created.body.id);
    expect(again.status).toBe(400);
    expect(again.body).toEqual({
      error: 'already_archived',
      message: PROJECT_MESSAGES.alreadyArchived,
    });
  });

  // TC-11-INT-07
  it('restores an archived project (happy path)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const created = await createProject(admin.cookies, admin.organizationId, 'Epsilon');
    await archiveProject(admin.cookies, admin.organizationId, created.body.id);

    const restore = await restoreProject(admin.cookies, admin.organizationId, created.body.id);
    expect(restore.status).toBe(200);
    expect(restore.body).toEqual({ success: true });

    const active = await listProjects(admin.cookies, admin.organizationId, '?status=active');
    expect(active.body.projects.find((p: any) => p.id === created.body.id)).toMatchObject({
      status: 'active',
    });

    // Restoring an already-active project is a 400.
    const again = await restoreProject(admin.cookies, admin.organizationId, created.body.id);
    expect(again.status).toBe(400);
    expect(again.body).toEqual({
      error: 'already_active',
      message: PROJECT_MESSAGES.alreadyActive,
    });
  });

  // TC-11-INT-08
  it('adds members to a project (happy path)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const u1 = await createMember(admin.organizationId, {
      email: 'u1@acme.com',
      role: 'user',
      firstName: 'Alex',
      lastName: 'Kaminski',
    });
    const u2 = await createMember(admin.organizationId, {
      email: 'u2@acme.com',
      role: 'user',
      firstName: 'Bob',
      lastName: 'Chen',
    });
    const project = await createProject(admin.cookies, admin.organizationId, 'Alpha');

    const add = await addMembers(admin.cookies, admin.organizationId, project.body.id, [
      u1.membershipId,
      u2.membershipId,
    ]);
    expect(add.status).toBe(200);
    expect(add.body).toEqual({ added: 2, alreadyAssigned: 0 });

    const members = await listMembers(admin.cookies, admin.organizationId, project.body.id);
    expect(members.status).toBe(200);
    const ids = members.body.members.map((m: any) => m.membershipId);
    expect(new Set(ids)).toEqual(new Set([u1.membershipId, u2.membershipId]));
    // Sorted by lastName, firstName asc: Chen before Kaminski.
    expect(members.body.members.map((m: any) => m.lastName)).toEqual(['Chen', 'Kaminski']);
    expect(members.body.members[0]).toMatchObject({
      accountId: u2.accountId,
      firstName: 'Bob',
      role: 'user',
    });
  });

  // TC-11-INT-09
  it('silently skips already-assigned members', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const u1 = await createMember(admin.organizationId, { email: 'u1@acme.com', role: 'user' });
    const u2 = await createMember(admin.organizationId, { email: 'u2@acme.com', role: 'user' });
    const project = await createProject(admin.cookies, admin.organizationId, 'Alpha');

    await addMembers(admin.cookies, admin.organizationId, project.body.id, [u1.membershipId]);

    const res = await addMembers(admin.cookies, admin.organizationId, project.body.id, [
      u1.membershipId,
      u2.membershipId,
    ]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ added: 1, alreadyAssigned: 1 });
  });

  // TC-11-INT-10
  it('removes a member from a project (happy path)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const u1 = await createMember(admin.organizationId, { email: 'u1@acme.com', role: 'user' });
    const project = await createProject(admin.cookies, admin.organizationId, 'Alpha');
    await addMembers(admin.cookies, admin.organizationId, project.body.id, [u1.membershipId]);

    const del = await removeMember(admin.cookies, admin.organizationId, project.body.id, u1.membershipId);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ success: true });

    const members = await listMembers(admin.cookies, admin.organizationId, project.body.id);
    expect(members.body.members).toHaveLength(0);

    // Removing a non-assigned membership is a 404.
    const again = await removeMember(admin.cookies, admin.organizationId, project.body.id, u1.membershipId);
    expect(again.status).toBe(404);
  });

  // TC-11-INT-11
  it('user sees only assigned active projects', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const user = await createMember(admin.organizationId, { email: 'u@acme.com', role: 'user' });

    const p1 = await createProject(admin.cookies, admin.organizationId, 'Assigned Active');
    const p2 = await createProject(admin.cookies, admin.organizationId, 'Unassigned Active');
    const p3 = await createProject(admin.cookies, admin.organizationId, 'Assigned Archived');

    await addMembers(admin.cookies, admin.organizationId, p1.body.id, [user.membershipId]);
    await addMembers(admin.cookies, admin.organizationId, p3.body.id, [user.membershipId]);
    await archiveProject(admin.cookies, admin.organizationId, p3.body.id);

    const res = await listProjects(user.cookies, admin.organizationId);
    expect(res.status).toBe(200);
    const ids = res.body.projects.map((p: any) => p.id);
    expect(ids).toEqual([p1.body.id]);
    expect(ids).not.toContain(p2.body.id);
    expect(ids).not.toContain(p3.body.id);
  });

  // The user-scoped GET ignores the status filter (still only assigned active).
  it('user list ignores ?status=archived and still returns only assigned active', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const user = await createMember(admin.organizationId, { email: 'u@acme.com', role: 'user' });
    const p1 = await createProject(admin.cookies, admin.organizationId, 'Assigned Active');
    await addMembers(admin.cookies, admin.organizationId, p1.body.id, [user.membershipId]);

    const res = await listProjects(user.cookies, admin.organizationId, '?status=archived');
    expect(res.status).toBe(200);
    expect(res.body.projects.map((p: any) => p.id)).toEqual([p1.body.id]);
  });

  // TC-11-INT-12
  it('forbids a viewer from listing projects', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const viewer = await createMember(admin.organizationId, { email: 'v@acme.com', role: 'viewer' });

    const res = await listProjects(viewer.cookies, admin.organizationId);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden', message: PROJECT_MESSAGES.forbidden });
  });

  // TC-11-INT-13
  it('cascade-deletes project assignments when a member is removed from the org', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const user = await createMember(admin.organizationId, { email: 'u@acme.com', role: 'user' });
    const project = await createProject(admin.cookies, admin.organizationId, 'Alpha');
    await addMembers(admin.cookies, admin.organizationId, project.body.id, [user.membershipId]);

    // Remove the member from the org via the spec-04 endpoint — cascades ProjectMember.
    const del = await request(server())
      .delete(`/api/organizations/${admin.organizationId}/members/${user.membershipId}`)
      .set('Cookie', admin.cookies);
    expect(del.status).toBe(200);

    // Spec-04 removal is a SOFT delete (status='removed'), so the FK onDelete:Cascade does
    // not fire on its own. `MembersService.remove` therefore deletes the member's
    // ProjectMember rows explicitly inside the removal transaction (spec 11 req 15), so
    // the assignment leaves no orphan row and the member drops from every roster/count.
    const orphanRows = await prisma.projectMember.count({
      where: { membershipId: user.membershipId },
    });
    expect(orphanRows).toBe(0);

    const members = await listMembers(admin.cookies, admin.organizationId, project.body.id);
    expect(members.body.members).toHaveLength(0);

    const list = await listProjects(admin.cookies, admin.organizationId);
    expect(list.body.projects.find((p: any) => p.id === project.body.id).memberCount).toBe(0);
  });

  // TC-11-INT-14
  it('cross-org project access returns 404 (not 403), byte-for-byte identical', async () => {
    const adminA = await signupAdmin('a@acme.com', 'Acme Inc');
    const adminB = await signupAdmin('b@beta.com', 'Beta LLC');
    const projectB = await createProject(adminB.cookies, adminB.organizationId, 'Secret B');

    // 1. GET members of B's project under A's org — 404 (project not in A's org).
    const getRes = await listMembers(adminA.cookies, adminA.organizationId, projectB.body.id);
    expect(getRes.status).toBe(404);

    // 2. Archive B's project under A's org — 404 (project not in A's org).
    const archRes = await archiveProject(adminA.cookies, adminA.organizationId, projectB.body.id);
    expect(archRes.status).toBe(404);

    // 3. Archive B's project under B's :orgId, but as A — OrgScopeGuard 404 (orgId mismatch).
    const scopeRes = await archiveProject(adminA.cookies, adminB.organizationId, projectB.body.id);
    expect(scopeRes.status).toBe(404);

    // A non-existent project id under A's own org — also 404, identical body to case 2.
    const ghost = await archiveProject(
      adminA.cookies,
      adminA.organizationId,
      '00000000-0000-0000-0000-000000000000',
    );
    expect(ghost.status).toBe(404);
    expect(archRes.body).toEqual(ghost.body);
  });

  // TC-11-INT-15
  it('resolves concurrent duplicate creates to exactly one 201 and one 409', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const [r1, r2] = await Promise.all([
      createProject(admin.cookies, admin.organizationId, 'Race'),
      createProject(admin.cookies, admin.organizationId, 'Race'),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const conflict = [r1, r2].find((r) => r.status === 409)!;
    expect(conflict.body.error).toBe('duplicate_name');

    // Exactly one row persisted.
    const count = await prisma.project.count({
      where: { organizationId: admin.organizationId, name: 'Race' },
    });
    expect(count).toBe(1);
  });

  // TC-11-INT-16 — deferred: no rate-limit infrastructure exists in this codebase (specs
  // 08–10 documented identical limits but never implemented or tested them). See spec 11
  // §Security 17. Kept as an explicit skip so the omission is traceable.
  it.skip('TC-11-INT-16 rate limit — deferred, no rate-limit infra in codebase (see spec 11 §Security 17)', () => {
    // intentionally empty
  });

  // TC-11-INT-17
  it('rejects an XSS payload in the project name with a 400 validation error', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const res = await createProject(
      admin.cookies,
      admin.organizationId,
      "<script>alert('x')</script>",
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: { name: PROJECT_MESSAGES.nameInvalidChars } });
  });

  // Empty-array member add is a 400 with the field error.
  it('rejects an empty membershipIds array with 400', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const project = await createProject(admin.cookies, admin.organizationId, 'Alpha');

    const res = await addMembers(admin.cookies, admin.organizationId, project.body.id, []);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errors: { membershipIds: PROJECT_MESSAGES.membersEmpty } });
  });

  // Bulk add with an invalid/foreign/removed member rejects the whole batch, no partial writes.
  it('rejects a batch containing an invalid member with 400 invalid_member and writes nothing', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const otherOrg = await signupAdmin('other@beta.com', 'Beta LLC');
    const good = await createMember(admin.organizationId, { email: 'g@acme.com', role: 'user' });
    const removed = await createMember(admin.organizationId, {
      email: 'r@acme.com',
      role: 'user',
      status: 'removed',
    });
    const project = await createProject(admin.cookies, admin.organizationId, 'Alpha');

    // Foreign-org membership.
    const foreign = await addMembers(admin.cookies, admin.organizationId, project.body.id, [
      good.membershipId,
      otherOrg.membershipId,
    ]);
    expect(foreign.status).toBe(400);
    expect(foreign.body).toEqual({ error: 'invalid_member', message: PROJECT_MESSAGES.membersInvalid });

    // Removed (inactive) membership.
    const inactive = await addMembers(admin.cookies, admin.organizationId, project.body.id, [
      good.membershipId,
      removed.membershipId,
    ]);
    expect(inactive.status).toBe(400);

    // No partial writes from either rejected batch.
    const members = await listMembers(admin.cookies, admin.organizationId, project.body.id);
    expect(members.body.members).toHaveLength(0);
  });

  // Unauthenticated requests are rejected by SessionGuard.
  it('rejects unauthenticated project list with 401', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const res = await request(server()).get(`/api/organizations/${admin.organizationId}/projects`);
    expect(res.status).toBe(401);
  });
});
