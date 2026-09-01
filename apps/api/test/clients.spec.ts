import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CLIENT_MESSAGES } from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

/** Cheap in tests — the policy under bcrypt doesn't depend on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

describe('Clients (spec organization/01)', () => {
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

  const listClients = (cookies: string[], orgId: string, query = '') =>
    request(server()).get(`/api/organizations/${orgId}/clients${query}`).set('Cookie', cookies);

  const createClient = (cookies: string[], orgId: string, name: unknown) =>
    request(server())
      .post(`/api/organizations/${orgId}/clients`)
      .set('Cookie', cookies)
      .send({ name });

  const getClient = (cookies: string[], orgId: string, clientId: string) =>
    request(server())
      .get(`/api/organizations/${orgId}/clients/${clientId}`)
      .set('Cookie', cookies);

  const renameClient = (cookies: string[], orgId: string, clientId: string, name: unknown) =>
    request(server())
      .patch(`/api/organizations/${orgId}/clients/${clientId}`)
      .set('Cookie', cookies)
      .send({ name });

  const archiveClient = (cookies: string[], orgId: string, clientId: string) =>
    request(server())
      .patch(`/api/organizations/${orgId}/clients/${clientId}/archive`)
      .set('Cookie', cookies);

  const restoreClient = (cookies: string[], orgId: string, clientId: string) =>
    request(server())
      .patch(`/api/organizations/${orgId}/clients/${clientId}/restore`)
      .set('Cookie', cookies);

  const createProjectWith = (
    cookies: string[],
    orgId: string,
    body: Record<string, unknown>,
  ) =>
    request(server())
      .post(`/api/organizations/${orgId}/projects`)
      .set('Cookie', cookies)
      .send(body);

  const renameProjectWith = (
    cookies: string[],
    orgId: string,
    projectId: string,
    body: Record<string, unknown>,
  ) =>
    request(server())
      .put(`/api/organizations/${orgId}/projects/${projectId}`)
      .set('Cookie', cookies)
      .send(body);

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
    await prisma.client.deleteMany();
    await prisma.vacationRequest.deleteMany();
    await prisma.vacationReserveTransaction.deleteMany();
    await prisma.memberFinancialsSnapshot.deleteMany();
    await prisma.memberFinancials.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
  });

  // TC-01-INT-01
  it('admin creates a client (happy path) and it appears in the list', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const created = await createClient(admin.cookies, admin.organizationId, 'Acme Corp');
    expect(created.status).toBe(201);
    expect(created.body.client).toMatchObject({ name: 'Acme Corp', status: 'active' });
    expect(created.body.client.id).toEqual(expect.any(String));
    expect(created.body.client.createdByAccountId).toBe(admin.accountId);
    expect(created.body.client.archivedAt).toBeNull();

    const list = await listClients(admin.cookies, admin.organizationId);
    expect(list.status).toBe(200);
    const found = list.body.clients.find((c: any) => c.id === created.body.client.id);
    expect(found).toMatchObject({
      name: 'Acme Corp',
      status: 'active',
      projectCount: 0,
      activeProjectCount: 0,
    });
  });

  // TC-01-INT-02
  it('manager creates a client (happy path)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com',
      role: 'manager',
    });

    const created = await createClient(manager.cookies, admin.organizationId, 'Acme Corp');
    expect(created.status).toBe(201);
    expect(created.body.client.createdByAccountId).toBe(manager.accountId);
  });

  // TC-01-INT-03
  it('user is forbidden from creating a client (404 org-scope-style hiding)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const user = await createMember(admin.organizationId, { email: 'u@acme.com', role: 'user' });

    const res = await createClient(user.cookies, admin.organizationId, 'Nope');
    expect(res.status).toBe(404);
  });

  // TC-01-INT-04
  it('viewer is forbidden from creating a client (404)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const viewer = await createMember(admin.organizationId, {
      email: 'v@acme.com',
      role: 'viewer',
    });

    const res = await createClient(viewer.cookies, admin.organizationId, 'Nope');
    expect(res.status).toBe(404);
  });

  // TC-01-INT-05
  it('rejects an exact duplicate name with 409 client_name_taken', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createClient(admin.cookies, admin.organizationId, 'Acme Corp');

    const dup = await createClient(admin.cookies, admin.organizationId, 'Acme Corp');
    expect(dup.status).toBe(409);
    expect(dup.body).toEqual({
      error: 'client_name_taken',
      message: CLIENT_MESSAGES.nameDuplicate,
    });
  });

  // TC-01-INT-06
  it('rejects a case-only duplicate name with 409', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createClient(admin.cookies, admin.organizationId, 'Acme Corp');

    const dup = await createClient(admin.cookies, admin.organizationId, 'acme corp');
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('client_name_taken');
  });

  // TC-01-INT-07
  it('rejects a whitespace-only-different duplicate with 409 (normalisation)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createClient(admin.cookies, admin.organizationId, 'Acme Corp');

    const dup = await createClient(admin.cookies, admin.organizationId, '  Acme  Corp  ');
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('client_name_taken');
  });

  // TC-01-INT-08
  it('allows the same client name in two different organizations', async () => {
    const adminA = await signupAdmin('a@acme.com', 'Acme Inc');
    const adminB = await signupAdmin('b@beta.com', 'Beta LLC');

    const a = await createClient(adminA.cookies, adminA.organizationId, 'Acme Corp');
    const b = await createClient(adminB.cookies, adminB.organizationId, 'Acme Corp');
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
  });

  // TC-01-INT-09
  it('list defaults to status=active and hides archived clients', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const a = await createClient(admin.cookies, admin.organizationId, 'Alpha');
    const b = await createClient(admin.cookies, admin.organizationId, 'Beta');
    const c = await createClient(admin.cookies, admin.organizationId, 'Gamma');
    const d = await createClient(admin.cookies, admin.organizationId, 'Delta');
    const e = await createClient(admin.cookies, admin.organizationId, 'Epsilon');

    await archiveClient(admin.cookies, admin.organizationId, d.body.client.id);
    await archiveClient(admin.cookies, admin.organizationId, e.body.client.id);

    const res = await listClients(admin.cookies, admin.organizationId);
    expect(res.status).toBe(200);
    const ids = res.body.clients.map((c: any) => c.id).sort();
    expect(ids).toEqual([a.body.client.id, b.body.client.id, c.body.client.id].sort());
  });

  // TC-01-INT-10
  it('list ?status=archived returns only archived clients', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createClient(admin.cookies, admin.organizationId, 'Alpha');
    await createClient(admin.cookies, admin.organizationId, 'Beta');
    await createClient(admin.cookies, admin.organizationId, 'Gamma');
    const d = await createClient(admin.cookies, admin.organizationId, 'Delta');
    const e = await createClient(admin.cookies, admin.organizationId, 'Epsilon');
    await archiveClient(admin.cookies, admin.organizationId, d.body.client.id);
    await archiveClient(admin.cookies, admin.organizationId, e.body.client.id);

    const res = await listClients(admin.cookies, admin.organizationId, '?status=archived');
    expect(res.status).toBe(200);
    const names = res.body.clients.map((c: any) => c.name).sort();
    expect(names).toEqual(['Delta', 'Epsilon']);
    res.body.clients.forEach((c: any) => expect(c.status).toBe('archived'));
  });

  // TC-01-INT-11
  it('list ?status=all returns both active and archived', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createClient(admin.cookies, admin.organizationId, 'Alpha');
    await createClient(admin.cookies, admin.organizationId, 'Beta');
    await createClient(admin.cookies, admin.organizationId, 'Gamma');
    const d = await createClient(admin.cookies, admin.organizationId, 'Delta');
    const e = await createClient(admin.cookies, admin.organizationId, 'Epsilon');
    await archiveClient(admin.cookies, admin.organizationId, d.body.client.id);
    await archiveClient(admin.cookies, admin.organizationId, e.body.client.id);

    const res = await listClients(admin.cookies, admin.organizationId, '?status=all');
    expect(res.status).toBe(200);
    expect(res.body.clients).toHaveLength(5);
  });

  // TC-01-INT-12
  it('list ?q=ac returns case-insensitive substring matches', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    // The spec seeds "Acme Corp" / "Chronos Ltd" / "Alpha Analytics" and asserts "the
    // two starting with Ac" — but only ONE of those seed names contains "ac" as a
    // substring, and the API contract (spec §16) is a substring match, not a prefix
    // match. We keep the seed data faithful to the spec and assert exactly what the
    // contract produces: `Acme Corp` matches, `Chronos Ltd` and `Alpha Analytics`
    // do not. The `Ac`-lowercase-insensitive match is the meaningful part.
    await createClient(admin.cookies, admin.organizationId, 'Acme Corp');
    await createClient(admin.cookies, admin.organizationId, 'Chronos Ltd');
    await createClient(admin.cookies, admin.organizationId, 'Alpha Analytics');

    const res = await listClients(admin.cookies, admin.organizationId, '?q=ac');
    expect(res.status).toBe(200);
    const names = res.body.clients.map((c: any) => c.name);
    expect(names).toContain('Acme Corp');
    expect(names).not.toContain('Chronos Ltd');
    expect(names).not.toContain('Alpha Analytics');

    // And case-insensitivity — an uppercase query still hits Acme.
    const upper = await listClients(admin.cookies, admin.organizationId, '?q=AC');
    expect(upper.body.clients.map((c: any) => c.name)).toContain('Acme Corp');
  });

  // TC-01-INT-13
  it('projectCount and activeProjectCount are accurate per client', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const clientRes = await createClient(admin.cookies, admin.organizationId, 'Acme Corp');
    const clientId = clientRes.body.client.id as string;

    // Seed 3 active projects + 1 archived project linked to this client via direct
    // Prisma calls (avoids re-testing the project-create wiring here).
    for (const name of ['P1', 'P2', 'P3']) {
      await prisma.project.create({
        data: {
          organizationId: admin.organizationId,
          name,
          status: 'active',
          createdByAccountId: admin.accountId,
          clientId,
        },
      });
    }
    await prisma.project.create({
      data: {
        organizationId: admin.organizationId,
        name: 'P4',
        status: 'archived',
        createdByAccountId: admin.accountId,
        clientId,
      },
    });

    const res = await listClients(admin.cookies, admin.organizationId);
    const row = res.body.clients.find((c: any) => c.id === clientId);
    expect(row).toMatchObject({ projectCount: 4, activeProjectCount: 3 });
  });

  // TC-01-INT-14
  it('renames a client (happy path) and bumps updatedAt', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const created = await createClient(admin.cookies, admin.organizationId, 'Acme Corp');
    const originalUpdatedAt = created.body.client.updatedAt as string;

    // A one-tick delay so the timestamps compare strictly, without depending on
    // sub-millisecond clock resolution.
    await new Promise((r) => setTimeout(r, 15));

    const res = await renameClient(
      admin.cookies,
      admin.organizationId,
      created.body.client.id,
      'Acme Corporation',
    );
    expect(res.status).toBe(200);
    expect(res.body.client).toMatchObject({
      id: created.body.client.id,
      name: 'Acme Corporation',
    });
    expect(new Date(res.body.client.updatedAt).getTime()).toBeGreaterThan(
      new Date(originalUpdatedAt).getTime(),
    );

    const list = await listClients(admin.cookies, admin.organizationId);
    expect(list.body.clients.find((c: any) => c.id === created.body.client.id).name).toBe(
      'Acme Corporation',
    );
  });

  // TC-01-INT-15
  it('rejects a rename to an existing name with 409', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createClient(admin.cookies, admin.organizationId, 'Acme Corp');
    const other = await createClient(admin.cookies, admin.organizationId, 'Chronos Ltd');

    const res = await renameClient(
      admin.cookies,
      admin.organizationId,
      other.body.client.id,
      'Acme Corp',
    );
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'client_name_taken',
      message: CLIENT_MESSAGES.nameDuplicate,
    });
  });

  // TC-01-INT-16
  it('rename with the same name is a 200 and still bumps updatedAt', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const created = await createClient(admin.cookies, admin.organizationId, 'Acme Corp');
    const originalUpdatedAt = created.body.client.updatedAt as string;

    await new Promise((r) => setTimeout(r, 15));

    const res = await renameClient(
      admin.cookies,
      admin.organizationId,
      created.body.client.id,
      'Acme Corp',
    );
    expect(res.status).toBe(200);
    expect(new Date(res.body.client.updatedAt).getTime()).toBeGreaterThan(
      new Date(originalUpdatedAt).getTime(),
    );
  });

  // TC-01-INT-17
  it('archives a client (happy path); default list omits it afterwards', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const created = await createClient(admin.cookies, admin.organizationId, 'Acme Corp');

    const arch = await archiveClient(admin.cookies, admin.organizationId, created.body.client.id);
    expect(arch.status).toBe(200);
    expect(arch.body.client).toMatchObject({
      id: created.body.client.id,
      status: 'archived',
    });
    expect(arch.body.client.archivedAt).toEqual(expect.any(String));
    expect(arch.body.client.archivedByAccountId).toBe(admin.accountId);

    const list = await listClients(admin.cookies, admin.organizationId);
    expect(list.body.clients.find((c: any) => c.id === created.body.client.id)).toBeUndefined();
  });

  // TC-01-INT-18
  it('archive is idempotent — archivedAt does not change on the second call', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const created = await createClient(admin.cookies, admin.organizationId, 'Acme Corp');

    const first = await archiveClient(
      admin.cookies,
      admin.organizationId,
      created.body.client.id,
    );
    expect(first.status).toBe(200);
    const firstArchivedAt = first.body.client.archivedAt as string;

    await new Promise((r) => setTimeout(r, 15));

    const second = await archiveClient(
      admin.cookies,
      admin.organizationId,
      created.body.client.id,
    );
    expect(second.status).toBe(200);
    expect(second.body.client.status).toBe('archived');
    expect(second.body.client.archivedAt).toBe(firstArchivedAt);
  });

  // TC-01-INT-19
  it('archiving a client preserves its projects’ clientId FK', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const created = await createClient(admin.cookies, admin.organizationId, 'Acme Corp');
    const clientId = created.body.client.id as string;

    const project = await prisma.project.create({
      data: {
        organizationId: admin.organizationId,
        name: 'Website',
        createdByAccountId: admin.accountId,
        clientId,
      },
    });

    await archiveClient(admin.cookies, admin.organizationId, clientId);

    const refreshed = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(refreshed.clientId).toBe(clientId);
  });

  // TC-01-INT-20
  it('restore returns status=active and clears archivedAt', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const created = await createClient(admin.cookies, admin.organizationId, 'Acme Corp');
    await archiveClient(admin.cookies, admin.organizationId, created.body.client.id);

    const res = await restoreClient(admin.cookies, admin.organizationId, created.body.client.id);
    expect(res.status).toBe(200);
    expect(res.body.client).toMatchObject({
      id: created.body.client.id,
      status: 'active',
    });
    expect(res.body.client.archivedAt).toBeNull();
    expect(res.body.client.archivedByAccountId).toBeNull();
  });

  // TC-01-INT-21
  it('cross-org client access returns 404 (never 200) for GET detail', async () => {
    const adminA = await signupAdmin('a@acme.com', 'Acme Inc');
    const adminB = await signupAdmin('b@beta.com', 'Beta LLC');
    const bClient = await createClient(adminB.cookies, adminB.organizationId, 'Beta Client');

    // 1. A under B's :orgId — OrgScopeGuard 404s on the URL mismatch.
    const scoped = await getClient(adminA.cookies, adminB.organizationId, bClient.body.client.id);
    expect(scoped.status).toBe(404);

    // 2. A under A's own :orgId, with B's clientId — service 404s because the row is
    //    not in A's org (the exact IDOR the spec §Security guards against).
    const idor = await getClient(adminA.cookies, adminA.organizationId, bClient.body.client.id);
    expect(idor.status).toBe(404);
  });

  // TC-01-INT-22
  it('project create with an active client succeeds and reflects the link', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const client = await createClient(admin.cookies, admin.organizationId, 'Acme Corp');

    const res = await createProjectWith(admin.cookies, admin.organizationId, {
      name: 'Website',
      clientId: client.body.client.id,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Website',
      clientId: client.body.client.id,
      clientName: 'Acme Corp',
    });
  });

  // TC-01-INT-23
  it('project create with an archived client returns 422 client_archived', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const client = await createClient(admin.cookies, admin.organizationId, 'Acme Corp');
    await archiveClient(admin.cookies, admin.organizationId, client.body.client.id);

    const res = await createProjectWith(admin.cookies, admin.organizationId, {
      name: 'Website',
      clientId: client.body.client.id,
    });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: 'client_archived',
      message: CLIENT_MESSAGES.clientArchived,
    });
  });

  // TC-01-INT-24
  it('project create with a non-existent client returns 422 client_not_found', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const res = await createProjectWith(admin.cookies, admin.organizationId, {
      name: 'Website',
      clientId: '00000000-0000-0000-0000-000000000000',
    });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: 'client_not_found',
      message: CLIENT_MESSAGES.clientNotFound,
    });
  });

  // TC-01-INT-25
  it('project create with a cross-org client id returns 422 client_not_found (never 404)', async () => {
    const adminA = await signupAdmin('a@acme.com', 'Acme Inc');
    const adminB = await signupAdmin('b@beta.com', 'Beta LLC');
    const bClient = await createClient(adminB.cookies, adminB.organizationId, 'Beta Client');

    const res = await createProjectWith(adminA.cookies, adminA.organizationId, {
      name: 'Website',
      clientId: bClient.body.client.id,
    });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: 'client_not_found',
      message: CLIENT_MESSAGES.clientNotFound,
    });
  });

  // TC-01-INT-26
  it('project edit with clientId: null clears the link', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const client = await createClient(admin.cookies, admin.organizationId, 'Acme Corp');
    const project = await createProjectWith(admin.cookies, admin.organizationId, {
      name: 'Website',
      clientId: client.body.client.id,
    });
    expect(project.body.clientId).toBe(client.body.client.id);

    const cleared = await renameProjectWith(
      admin.cookies,
      admin.organizationId,
      project.body.id,
      { name: 'Website', clientId: null },
    );
    expect(cleared.status).toBe(200);
    expect(cleared.body.clientId).toBeNull();
    expect(cleared.body.clientName).toBeNull();
  });

  // TC-01-INT-27
  it('detail endpoint returns the client plus a projects array of id/name/status', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const client = await createClient(admin.cookies, admin.organizationId, 'Acme Corp');
    const clientId = client.body.client.id as string;

    await prisma.project.create({
      data: {
        organizationId: admin.organizationId,
        name: 'Website Redesign',
        status: 'active',
        createdByAccountId: admin.accountId,
        clientId,
      },
    });
    await prisma.project.create({
      data: {
        organizationId: admin.organizationId,
        name: 'Mobile App v2',
        status: 'archived',
        createdByAccountId: admin.accountId,
        clientId,
      },
    });

    const res = await getClient(admin.cookies, admin.organizationId, clientId);
    expect(res.status).toBe(200);
    expect(res.body.client).toMatchObject({ id: clientId, name: 'Acme Corp', status: 'active' });
    expect(res.body.projects).toHaveLength(2);
    const projectShapes = res.body.projects as Array<Record<string, unknown>>;
    projectShapes.forEach((p) => {
      // Nav-aid only — no members, no hours, no timestamps (spec §Detail req 19).
      expect(Object.keys(p).sort()).toEqual(['id', 'name', 'status']);
    });
  });

  // TC-01-INT-28
  it('user calling detail endpoint receives 404 (matches capability discipline)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const user = await createMember(admin.organizationId, { email: 'u@acme.com', role: 'user' });
    const client = await createClient(admin.cookies, admin.organizationId, 'Acme Corp');

    const res = await getClient(user.cookies, admin.organizationId, client.body.client.id);
    expect(res.status).toBe(404);

    // Same for the list endpoint — user cannot reach the Clients surface at all.
    const list = await listClients(user.cookies, admin.organizationId);
    expect(list.status).toBe(404);
  });

  // TC-01-INT-29
  it('rotating the account securityStamp mid-cycle revokes the session (401 after)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const before = await createClient(admin.cookies, admin.organizationId, 'Acme Corp');
    expect(before.status).toBe(201);

    // Rotate the stamp directly — mirrors the sign-out / password-change flow.
    await prisma.account.update({
      where: { id: admin.accountId },
      data: { securityStamp: 'rotated-' + Date.now() },
    });

    const after = await createClient(admin.cookies, admin.organizationId, 'Another Corp');
    expect(after.status).toBe(401);
  });

  // TC-01-INT-30
  it('vacation math is untouched by the Clients migration (workingDays frozen at 5)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    // Seed a VacationRequest directly with a frozen workingDays: 5. Cancellation/
    // approval flows are out of scope here — we're only asserting the schema didn't
    // regress a pre-existing row.
    const vacation = await prisma.vacationRequest.create({
      data: {
        membershipId: admin.membershipId,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-05'),
        workingDays: 5,
        deductionAmount: '500.00',
        status: 'pending',
      },
    });

    // Now create a client — the whole point of INT-30 is that this touches nothing
    // in the vacation surface.
    const client = await createClient(admin.cookies, admin.organizationId, 'Acme Corp');
    expect(client.status).toBe(201);

    const refreshed = await prisma.vacationRequest.findUniqueOrThrow({
      where: { id: vacation.id },
    });
    expect(refreshed.workingDays).toBe(5);
    expect(refreshed.deductionAmount.toString()).toBe('500');
  });
});
