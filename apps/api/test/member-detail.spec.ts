import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MEMBER_MESSAGES, MESSAGES } from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

/** Cheap in tests — the policy under bcrypt doesn't depend on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

describe('Member detail: About (spec 05)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;

  interface Signed {
    cookies: string[];
    accountId: string;
    organizationId: string;
    membershipId: string;
  }

  const signupAdmin = async (email: string, orgName: string): Promise<Signed> => {
    const response = await request(app.getHttpServer()).post('/api/signup').send({
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
    return { cookies, accountId, organizationId, membershipId: membership.id };
  };

  /** Directly inserts an account + membership, and signs them in — mirrors spec 04's
   * members.spec.ts fixture helper; each spec file builds its own multi-role fixtures
   * rather than sharing a cross-file helper (established precedent). */
  const createMember = async (
    organizationId: string,
    opts: {
      email: string;
      role: string;
      status?: string;
      jobTitle?: string | null;
      firstName?: string;
      lastName?: string;
      password?: string;
      timezone?: string | null;
    },
  ): Promise<Signed & { role: string }> => {
    const password = opts.password ?? 'Passw0rd';
    const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: {
        email: opts.email,
        passwordHash,
        firstName: opts.firstName ?? 'Test',
        lastName: opts.lastName ?? 'User',
        timezone: opts.timezone ?? 'America/New_York',
      },
    });
    const membership = await prisma.membership.create({
      data: {
        accountId: account.id,
        organizationId,
        role: opts.role,
        status: opts.status ?? 'active',
        jobTitle: opts.jobTitle ?? null,
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

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/api/login').send({ email, password });

  const getDetail = (cookies: string[], organizationId: string, memberId: string) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${organizationId}/members/${memberId}`)
      .set('Cookie', cookies);

  const putDetail = (
    cookies: string[],
    organizationId: string,
    memberId: string,
    body: { role: string; jobTitle: string },
  ) =>
    request(app.getHttpServer())
      .put(`/api/organizations/${organizationId}/members/${memberId}`)
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
    mail = app.get(MailService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
    mail.clear();
  });

  // TC-05-INT-01
  it('allows admin and manager to save role + job title on active members', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com',
      role: 'manager',
    });
    const target = await createMember(admin.organizationId, {
      email: 'm@acme.com',
      role: 'user',
    });

    const step1 = await putDetail(admin.cookies, admin.organizationId, target.membershipId, {
      role: 'manager',
      jobTitle: 'Engineer',
    });
    expect(step1.status).toBe(200);
    expect(step1.body).toEqual({ success: true });

    let updated = await prisma.membership.findUniqueOrThrow({ where: { id: target.membershipId } });
    expect(updated.role).toBe('manager');
    expect(updated.jobTitle).toBe('Engineer');

    // Now target is a `manager` — a manager caller has no authority over it at all.
    const step3 = await putDetail(manager.cookies, admin.organizationId, target.membershipId, {
      role: 'user',
      jobTitle: 'Senior Engineer',
    });
    expect(step3.status).toBe(403);
    expect(step3.body).toEqual({
      error: 'role_authority',
      message: MEMBER_MESSAGES.roleAuthority,
    });

    updated = await prisma.membership.findUniqueOrThrow({ where: { id: target.membershipId } });
    expect(updated.role).toBe('manager');
    expect(updated.jobTitle).toBe('Engineer');
  });

  // TC-05-INT-02
  it('rejects save at the API for user/viewer callers', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const target = await createMember(admin.organizationId, {
      email: 'm@acme.com',
      role: 'user',
      jobTitle: 'Engineer',
    });
    const user = await createMember(admin.organizationId, { email: 'usr@acme.com', role: 'user' });
    const viewer = await createMember(admin.organizationId, {
      email: 'view@acme.com',
      role: 'viewer',
    });

    for (const caller of [user, viewer]) {
      const response = await putDetail(caller.cookies, admin.organizationId, target.membershipId, {
        role: 'user',
        jobTitle: 'Hacker',
      });
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: 'forbidden',
        message: MEMBER_MESSAGES.editForbidden,
      });
    }

    const unchanged = await prisma.membership.findUniqueOrThrow({
      where: { id: target.membershipId },
    });
    expect(unchanged.jobTitle).toBe('Engineer');
  });

  // TC-05-INT-03
  it('rejects save for a removed member', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const removed = await createMember(admin.organizationId, {
      email: 'r@acme.com',
      role: 'user',
      status: 'removed',
      jobTitle: 'Engineer',
    });

    const response = await putDetail(admin.cookies, admin.organizationId, removed.membershipId, {
      role: 'manager',
      jobTitle: 'Senior Engineer',
    });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'member_removed',
      message: MEMBER_MESSAGES.memberRemoved,
    });

    const unchanged = await prisma.membership.findUniqueOrThrow({
      where: { id: removed.membershipId },
    });
    expect(unchanged.role).toBe('user');
    expect(unchanged.jobTitle).toBe('Engineer');
  });

  // TC-05-INT-04
  it('rejects a job title over 100 characters', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const target = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    const response = await putDetail(admin.cookies, admin.organizationId, target.membershipId, {
      role: 'user',
      jobTitle: 'a'.repeat(101),
    });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ errors: { jobTitle: MEMBER_MESSAGES.jobTitleTooLong } });
  });

  // TC-05-INT-05
  it('atomically fails role + job title together when the zero-admin guard trips', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    const response = await putDetail(admin.cookies, admin.organizationId, admin.membershipId, {
      role: 'manager',
      jobTitle: 'New Title',
    });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'last_admin_guard',
      message: MEMBER_MESSAGES.lastAdminGuard,
    });

    const unchanged = await prisma.membership.findUniqueOrThrow({ where: { id: admin.membershipId } });
    expect(unchanged.role).toBe('admin');
    expect(unchanged.jobTitle).toBeNull();
  });

  // TC-05-INT-06
  it('blocks the last admin from demoting themselves via detail save', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createMember(admin.organizationId, { email: 'usr@acme.com', role: 'user' });

    const response = await putDetail(admin.cookies, admin.organizationId, admin.membershipId, {
      role: 'manager',
      jobTitle: '',
    });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'last_admin_guard',
      message: MEMBER_MESSAGES.lastAdminGuard,
    });

    const unchanged = await prisma.membership.findUniqueOrThrow({ where: { id: admin.membershipId } });
    expect(unchanged.role).toBe('admin');
  });

  // TC-05-INT-07
  it('blocks a manager from changing an admin role via detail save', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com',
      role: 'manager',
    });

    const response = await putDetail(manager.cookies, admin.organizationId, admin.membershipId, {
      role: 'manager',
      jobTitle: 'CEO',
    });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'role_authority',
      message: MEMBER_MESSAGES.roleAuthority,
    });

    const unchanged = await prisma.membership.findUniqueOrThrow({ where: { id: admin.membershipId } });
    expect(unchanged.role).toBe('admin');
  });

  // TC-05-INT-08
  it('rejects a removed member role change with member_removed, not role_authority', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const removed = await createMember(admin.organizationId, {
      email: 'r@acme.com',
      role: 'user',
      status: 'removed',
    });

    const response = await putDetail(admin.cookies, admin.organizationId, removed.membershipId, {
      role: 'manager',
      jobTitle: '',
    });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'member_removed',
      message: MEMBER_MESSAGES.memberRemoved,
    });
  });

  // TC-05-INT-09
  it('GET returns correct permission flags and fields for admin', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const target = await createMember(admin.organizationId, {
      email: 'm@acme.com',
      role: 'user',
      jobTitle: 'Engineer',
      firstName: 'Alex',
      lastName: 'Kaminski',
    });

    const response = await getDetail(admin.cookies, admin.organizationId, target.membershipId);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      canEditRole: true,
      canEditJobTitle: true,
      availableRoles: ['admin', 'manager', 'user', 'viewer'],
      callerRole: 'admin',
      fullName: 'Alex Kaminski',
      email: 'm@acme.com',
      role: 'user',
      status: 'active',
      jobTitle: 'Engineer',
      timezone: 'America/New_York',
      avatarInitials: 'AK',
    });
    expect(response.body.joinedAt).toEqual(expect.any(String));
    expect(response.body.id).toBe(target.membershipId);
  });

  // TC-05-INT-10
  it('GET returns correct permission flags for manager viewing a user', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com',
      role: 'manager',
    });
    const target = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    const response = await getDetail(manager.cookies, admin.organizationId, target.membershipId);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      canEditRole: true,
      canEditJobTitle: true,
      availableRoles: ['manager', 'user', 'viewer'],
      callerRole: 'manager',
    });
  });

  // TC-05-INT-11
  it('GET returns correct permission flags for manager viewing an admin', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com',
      role: 'manager',
    });

    const response = await getDetail(manager.cookies, admin.organizationId, admin.membershipId);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      canEditRole: false,
      canEditJobTitle: true,
      availableRoles: [],
    });
  });

  // TC-05-INT-12
  it('GET returns correct permission flags for user/viewer callers', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const user = await createMember(admin.organizationId, { email: 'usr@acme.com', role: 'user' });
    const target = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    const response = await getDetail(user.cookies, admin.organizationId, target.membershipId);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      canEditRole: false,
      canEditJobTitle: false,
      availableRoles: [],
    });
  });

  // TC-05-INT-13
  it('GET returns fully-locked-down flags for a removed member', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const removed = await createMember(admin.organizationId, {
      email: 'r@acme.com',
      role: 'user',
      status: 'removed',
    });

    const response = await getDetail(admin.cookies, admin.organizationId, removed.membershipId);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'removed',
      canEditRole: false,
      canEditJobTitle: false,
      availableRoles: [],
    });
  });

  // TC-05-INT-14
  it('GET returns 404 for a non-existent member', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const response = await getDetail(admin.cookies, admin.organizationId, 'fabricated-id');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found', message: MEMBER_MESSAGES.memberNotFound });
  });

  // TC-05-INT-15
  it('manager edits job title of an admin member with role unchanged — succeeds', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com',
      role: 'manager',
    });
    await prisma.membership.update({
      where: { id: admin.membershipId },
      data: { jobTitle: 'CTO' },
    });

    const response = await putDetail(manager.cookies, admin.organizationId, admin.membershipId, {
      role: 'admin',
      jobTitle: 'CEO',
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    const updated = await prisma.membership.findUniqueOrThrow({ where: { id: admin.membershipId } });
    expect(updated.role).toBe('admin');
    expect(updated.jobTitle).toBe('CEO');
  });

  // Additional coverage: invalid role enum value at the API.
  it('rejects an invalid role enum value', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const target = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    const response = await putDetail(admin.cookies, admin.organizationId, target.membershipId, {
      role: 'superadmin',
      jobTitle: '',
    });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_role', message: MESSAGES.role.invalid });
  });

  // Additional coverage: PUT 404 for a non-existent member (mirrors GET's TC-05-INT-14).
  it('PUT returns 404 for a non-existent member', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const response = await putDetail(admin.cookies, admin.organizationId, 'fabricated-id', {
      role: 'user',
      jobTitle: '',
    });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found', message: MEMBER_MESSAGES.memberNotFound });
  });

  // Additional coverage: clearing a job title persists as null/empty.
  it('allows clearing a job title', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const target = await createMember(admin.organizationId, {
      email: 'm@acme.com',
      role: 'user',
      jobTitle: 'Backend Engineer',
    });

    const response = await putDetail(admin.cookies, admin.organizationId, target.membershipId, {
      role: 'user',
      jobTitle: '',
    });
    expect(response.status).toBe(200);

    const updated = await prisma.membership.findUniqueOrThrow({ where: { id: target.membershipId } });
    expect(updated.jobTitle).toBeNull();
  });
});
