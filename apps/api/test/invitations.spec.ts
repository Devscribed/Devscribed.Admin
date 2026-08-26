import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { INVITE_MESSAGES, MESSAGES } from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InvitationsService } from '../src/invitations/invitations.service';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

/** Cheap in tests — the policy under bcrypt doesn't depend on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

describe('User invitation (spec 03)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;
  let invitations: InvitationsService;

  interface Signed {
    cookies: string[];
    accountId: string;
    organizationId: string;
  }

  const signupAdmin = async (email: string, orgName: string): Promise<Signed> => {
    const response = await request(app.getHttpServer()).post('/api/signup').send({
      orgName,
      firstName: 'Pat',
      lastName: 'Admin',
      email,
      password: 'Passw0rd',
    });
    return {
      cookies: response.headers['set-cookie'] as unknown as string[],
      accountId: response.body.account.id,
      organizationId: response.body.organization.id,
    };
  };

  /** Directly inserts an account + membership — mirrors how other spec suites build fixtures. */
  const createMember = async (
    organizationId: string,
    opts: {
      email: string;
      role: string;
      status?: string;
      jobTitle?: string | null;
      password?: string;
      joinedAt?: Date;
    },
  ) => {
    const passwordHash = await bcrypt.hash(opts.password ?? 'Passw0rd', TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: { email: opts.email, passwordHash, firstName: 'Test', lastName: 'User' },
    });
    const membership = await prisma.membership.create({
      data: {
        accountId: account.id,
        organizationId,
        role: opts.role,
        status: opts.status ?? 'active',
        jobTitle: opts.jobTitle ?? null,
        ...(opts.joinedAt ? { joinedAt: opts.joinedAt } : {}),
      },
    });
    return { account, membership };
  };

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/api/login').send({ email, password });

  const invite = (cookies: string[], body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/invitations').set('Cookie', cookies).send(body);

  const validateInvite = (token: string) =>
    request(app.getHttpServer()).get(`/api/invitations/${encodeURIComponent(token)}/validate`);

  const acceptInvite = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/invitations/accept').send(body);

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
    invitations = app.get(InvitationsService);
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

  // TC-03-INT-01
  it('creates a pending record and dispatches an email', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const response = await invite(admin.cookies, { email: 'new@acme.com', role: 'user' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Invitation sent' });

    const stored = await prisma.invitation.findFirstOrThrow();
    expect(stored).toMatchObject({
      email: 'new@acme.com',
      organizationId: admin.organizationId,
      role: 'user',
      status: 'pending',
    });
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBe(7 * 24 * 60 * 60_000);

    expect(mail.sentInvitations.map((m) => m.to)).toEqual(['new@acme.com']);
  });

  // TC-03-INT-02
  it('rejects accepting an expired invitation', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await invite(admin.cookies, { email: 'new@acme.com', role: 'user' });
    const token = mail.lastInvitationFor('new@acme.com')!.token;
    await prisma.invitation.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await acceptInvite({ token, firstName: 'New', lastName: 'Hire', password: 'Passw0rd' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(INVITE_MESSAGES.tokenExpired);
    expect(await prisma.account.count()).toBe(1); // only the admin
  });

  // TC-03-INT-03
  it('rejects accepting an already-used invitation', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await invite(admin.cookies, { email: 'new@acme.com', role: 'user' });
    const token = mail.lastInvitationFor('new@acme.com')!.token;
    await acceptInvite({ token, firstName: 'New', lastName: 'Hire', password: 'Passw0rd' }).expect(200);

    const response = await acceptInvite({ token, firstName: 'New', lastName: 'Hire', password: 'Passw0rd' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(INVITE_MESSAGES.tokenInvalid);
    expect(await prisma.account.count()).toBe(2); // admin + the one created the first time
  });

  // TC-03-INT-04
  it('hard-deletes old-org data when accepting an invite while already a member of another org', async () => {
    const orgA = await signupAdmin('adminA@x.com', 'Org A');
    await createMember(orgA.organizationId, {
      email: 'u@x.com',
      role: 'user',
      jobTitle: 'Engineer',
    });
    const orgB = await signupAdmin('adminB@y.com', 'Org B');
    await invite(orgB.cookies, { email: 'u@x.com', role: 'manager' });
    const token = mail.lastInvitationFor('u@x.com')!.token;

    const response = await acceptInvite({ token, password: 'Passw0rd', orgSwitchConfirmed: true });

    expect(response.status).toBe(200);
    const account = await prisma.account.findUniqueOrThrow({ where: { email: 'u@x.com' } });
    const membership = await prisma.membership.findUnique({ where: { accountId: account.id } });
    expect(membership).toMatchObject({
      organizationId: orgB.organizationId,
      role: 'manager',
      status: 'active',
    });

    const orgAMemberships = await prisma.membership.findMany({
      where: { organizationId: orgA.organizationId, accountId: account.id },
    });
    expect(orgAMemberships).toHaveLength(0);

    const usedInvitation = await prisma.invitation.findFirstOrThrow();
    expect(usedInvitation.status).toBe('used');
  });

  // TC-03-INT-05
  it('refuses a manager assigning the admin role', async () => {
    const org = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(org.organizationId, { email: 'mgr@acme.com', role: 'manager' });
    const managerCookies = (await login('mgr@acme.com', 'Passw0rd')).headers['set-cookie'] as unknown as string[];
    void manager;

    const response = await invite(managerCookies, { email: 'new@acme.com', role: 'admin' });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe(INVITE_MESSAGES.roleAuthority);
    expect(await prisma.invitation.count()).toBe(0);
  });

  // TC-03-INT-06
  it('restores a removed member of the same org with the invitation role and clears job title', async () => {
    const org = await signupAdmin('admin@acme.com', 'Acme Inc');
    const originalJoin = new Date('2020-01-01T00:00:00.000Z');
    await createMember(org.organizationId, {
      email: 'ex@acme.com',
      role: 'user',
      status: 'removed',
      jobTitle: 'Engineer',
      joinedAt: originalJoin,
    });

    const inviteResponse = await invite(org.cookies, { email: 'ex@acme.com', role: 'manager' });
    expect(inviteResponse.status).toBe(200);

    const token = mail.lastInvitationFor('ex@acme.com')!.token;
    const acceptResponse = await acceptInvite({ token, password: 'Passw0rd' });
    expect(acceptResponse.status).toBe(200);

    const account = await prisma.account.findUniqueOrThrow({ where: { email: 'ex@acme.com' } });
    const membership = await prisma.membership.findUniqueOrThrow({ where: { accountId: account.id } });
    expect(membership.status).toBe('active');
    expect(membership.role).toBe('manager');
    expect(membership.jobTitle).toBeNull();
    expect(membership.joinedAt.getTime()).toBeGreaterThan(originalJoin.getTime());
  });

  // TC-03-INT-07
  it('lets a manager invite manager/user/viewer but not admin', async () => {
    const org = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createMember(org.organizationId, { email: 'mgr@acme.com', role: 'manager' });
    const managerCookies = (await login('mgr@acme.com', 'Passw0rd')).headers['set-cookie'] as unknown as string[];

    const r1 = await invite(managerCookies, { email: 'new1@acme.com', role: 'manager' });
    const r2 = await invite(managerCookies, { email: 'new2@acme.com', role: 'user' });
    const r3 = await invite(managerCookies, { email: 'new3@acme.com', role: 'viewer' });
    const r4 = await invite(managerCookies, { email: 'new4@acme.com', role: 'admin' });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
    expect(r4.status).toBe(403);
    expect(r4.body.message).toBe(INVITE_MESSAGES.roleAuthority);
    expect(await prisma.invitation.count()).toBe(3);
  });

  // TC-03-INT-08
  it('rejects self-invitation, case-insensitively', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const lower = await invite(admin.cookies, { email: 'admin@acme.com', role: 'user' });
    const upper = await invite(admin.cookies, { email: 'ADMIN@ACME.COM', role: 'user' });

    expect(lower.status).toBe(400);
    expect(lower.body.message).toBe(INVITE_MESSAGES.selfInvitation);
    expect(upper.status).toBe(400);
    expect(upper.body.message).toBe(INVITE_MESSAGES.selfInvitation);
    expect(await prisma.invitation.count()).toBe(0);
  });

  // TC-03-INT-09
  it('lets an existing account accept an invitation with the correct password', async () => {
    const org = await signupAdmin('admin@orgB.com', 'Org B');
    await prisma.account.create({
      data: {
        email: 'pat@other.com',
        passwordHash: await bcrypt.hash('Passw0rd', TEST_BCRYPT_ROUNDS),
        firstName: 'Pat',
        lastName: 'Other',
      },
    });
    await invite(org.cookies, { email: 'pat@other.com', role: 'user' });
    const token = mail.lastInvitationFor('pat@other.com')!.token;

    const response = await acceptInvite({ token, password: 'Passw0rd' });

    expect(response.status).toBe(200);
    const account = await prisma.account.findUniqueOrThrow({ where: { email: 'pat@other.com' } });
    const membership = await prisma.membership.findUniqueOrThrow({ where: { accountId: account.id } });
    expect(membership).toMatchObject({ organizationId: org.organizationId, role: 'user', status: 'active' });
  });

  // TC-03-INT-10
  it('rejects an existing account accepting with the wrong password, without consuming the token', async () => {
    const org = await signupAdmin('admin@orgB.com', 'Org B');
    await prisma.account.create({
      data: {
        email: 'pat@other.com',
        passwordHash: await bcrypt.hash('Passw0rd', TEST_BCRYPT_ROUNDS),
        firstName: 'Pat',
        lastName: 'Other',
      },
    });
    await invite(org.cookies, { email: 'pat@other.com', role: 'user' });
    const token = mail.lastInvitationFor('pat@other.com')!.token;

    const response = await acceptInvite({ token, password: 'WrongPass1' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(INVITE_MESSAGES.incorrectPassword);
    const stored = await prisma.invitation.findFirstOrThrow();
    expect(stored.status).toBe('pending');
    const patAccount = await prisma.account.findUniqueOrThrow({ where: { email: 'pat@other.com' } });
    const membership = await prisma.membership.findUnique({ where: { accountId: patAccount.id } });
    expect(membership).toBeNull();
  });

  // TC-03-INT-11
  it('hard-deletes old-org data when the last admin org-switches', async () => {
    // Emails are lowercased at signup, so lookups below use the accountId the signup
    // response returned rather than re-deriving it from a mixed-case literal.
    const orgA = await signupAdmin('admin@orga.com', 'Org A');
    await createMember(orgA.organizationId, { email: 'member2@orga.com', role: 'user' });
    const orgB = await signupAdmin('admin@orgb.com', 'Org B');
    await invite(orgB.cookies, { email: 'admin@orga.com', role: 'manager' });
    const token = mail.lastInvitationFor('admin@orga.com')!.token;

    const response = await acceptInvite({ token, password: 'Passw0rd', orgSwitchConfirmed: true });

    expect(response.status).toBe(200);
    const orgAAdminMemberships = await prisma.membership.count({
      where: { organizationId: orgA.organizationId, role: 'admin' },
    });
    expect(orgAAdminMemberships).toBe(0);

    const membership = await prisma.membership.findUniqueOrThrow({ where: { accountId: orgA.accountId } });
    expect(membership).toMatchObject({ organizationId: orgB.organizationId, role: 'manager', status: 'active' });
  });

  // TC-03-INT-12
  it('invalidates pending invitations from an inviter when the inviter is removed', async () => {
    const orgA = await signupAdmin('admin@acme.com', 'Acme Inc');
    await invite(orgA.cookies, { email: 'new@acme.com', role: 'user' });
    const token = mail.lastInvitationFor('new@acme.com')!.token;

    const inviterMembership = await prisma.membership.findUniqueOrThrow({
      where: { accountId: orgA.accountId },
    });
    await prisma.membership.update({ where: { id: inviterMembership.id }, data: { status: 'removed' } });
    // Spec 04's member-removal endpoint (out of scope here) is what will call this in
    // production; this test invokes it directly to prove requirement 10 works today.
    await invitations.invalidatePendingInvitationsFrom(inviterMembership.id);

    const stored = await prisma.invitation.findFirstOrThrow();
    expect(stored.status).toBe('invalidated');

    const response = await acceptInvite({ token, firstName: 'New', lastName: 'Hire', password: 'Passw0rd' });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe(INVITE_MESSAGES.tokenInvalid);
  });

  // TC-03-INT-13
  it('supersedes a prior pending invitation on re-invite', async () => {
    const org = await signupAdmin('admin@acme.com', 'Acme Inc');
    await invite(org.cookies, { email: 'new@acme.com', role: 'user' });
    const t1 = mail.lastInvitationFor('new@acme.com')!.token;

    const second = await invite(org.cookies, { email: 'new@acme.com', role: 'manager' });
    expect(second.status).toBe(200);
    const t2 = mail.lastInvitationFor('new@acme.com')!.token;

    const invitations1 = await prisma.invitation.findMany({ where: { email: 'new@acme.com' } });
    expect(invitations1).toHaveLength(2);
    expect(invitations1.find((i) => i.tokenHash !== undefined && i.status === 'invalidated')).toBeDefined();

    const t1Attempt = await acceptInvite({ token: t1, firstName: 'New', lastName: 'Hire', password: 'Passw0rd' });
    expect(t1Attempt.status).toBe(400);
    expect(t1Attempt.body.message).toBe(INVITE_MESSAGES.tokenInvalid);

    const t2Attempt = await acceptInvite({ token: t2, firstName: 'New', lastName: 'Hire', password: 'Passw0rd' });
    expect(t2Attempt.status).toBe(200);
    const account = await prisma.account.findUniqueOrThrow({ where: { email: 'new@acme.com' } });
    const membership = await prisma.membership.findUniqueOrThrow({ where: { accountId: account.id } });
    expect(membership.role).toBe('manager');
  });

  // TC-03-INT-14
  it('rejects an org-switch accept without confirmation, with 409', async () => {
    const orgA = await signupAdmin('admin@orgA.com', 'Org A');
    await createMember(orgA.organizationId, { email: 'user@x.com', role: 'user' });
    const orgB = await signupAdmin('admin@orgB.com', 'Org B');
    await invite(orgB.cookies, { email: 'user@x.com', role: 'user' });
    const token = mail.lastInvitationFor('user@x.com')!.token;

    const response = await acceptInvite({ token, password: 'Passw0rd', orgSwitchConfirmed: false });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      message: 'org_switch_confirmation_required',
      oldOrganizationName: 'Org A',
      lastAdmin: false,
    });

    const account = await prisma.account.findUniqueOrThrow({ where: { email: 'user@x.com' } });
    const membership = await prisma.membership.findUniqueOrThrow({ where: { accountId: account.id } });
    expect(membership.organizationId).toBe(orgA.organizationId);
    const stored = await prisma.invitation.findFirstOrThrow();
    expect(stored.status).toBe('pending');
  });

  // TC-03-INT-15
  it('rejects inviting an active member of the same org', async () => {
    const org = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createMember(org.organizationId, { email: 'member@acme.com', role: 'user' });

    const response = await invite(org.cookies, { email: 'member@acme.com', role: 'user' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(INVITE_MESSAGES.alreadyMember);
    expect(await prisma.invitation.count()).toBe(0);
  });

  // TC-03-INT-16
  it('refuses a user or viewer creating invitations', async () => {
    const org = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createMember(org.organizationId, { email: 'usr@acme.com', role: 'user' });
    await createMember(org.organizationId, { email: 'view@acme.com', role: 'viewer' });
    const userCookies = (await login('usr@acme.com', 'Passw0rd')).headers['set-cookie'] as unknown as string[];
    const viewerCookies = (await login('view@acme.com', 'Passw0rd')).headers['set-cookie'] as unknown as string[];

    const userResponse = await invite(userCookies, { email: 'new@acme.com', role: 'user' });
    const viewerResponse = await invite(viewerCookies, { email: 'new@acme.com', role: 'user' });

    expect(userResponse.status).toBe(403);
    expect(userResponse.body.message).toBe(INVITE_MESSAGES.permissionDenied);
    expect(viewerResponse.status).toBe(403);
    expect(viewerResponse.body.message).toBe(INVITE_MESSAGES.permissionDenied);
  });

  // TC-03-INT-17
  it('rejects accepting with an unrecognized token', async () => {
    const response = await acceptInvite({ token: 'fabricated-token-value', password: 'Passw0rd' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(INVITE_MESSAGES.tokenInvalid);
  });

  // TC-03-INT-18
  it('creates a new account and membership on valid new-account acceptance', async () => {
    const org = await signupAdmin('admin@acme.com', 'Acme Inc');
    await invite(org.cookies, { email: 'new@acme.com', role: 'user' });
    const token = mail.lastInvitationFor('new@acme.com')!.token;

    const response = await acceptInvite({
      token,
      firstName: 'New',
      lastName: 'Hire',
      password: 'Passw0rd',
      timezone: 'America/New_York',
    });

    expect(response.status).toBe(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.join(';')).toContain('HttpOnly');

    const account = await prisma.account.findUniqueOrThrow({ where: { email: 'new@acme.com' } });
    expect(account).toMatchObject({ firstName: 'New', lastName: 'Hire', timezone: 'America/New_York' });

    const membership = await prisma.membership.findUniqueOrThrow({ where: { accountId: account.id } });
    expect(membership).toMatchObject({ organizationId: org.organizationId, role: 'user', status: 'active' });

    const stored = await prisma.invitation.findFirstOrThrow();
    expect(stored.status).toBe('used');
  });

  // TC-03-INT-19
  it('rejects new-account accept with an invalid name, without consuming the token, then succeeds on retry', async () => {
    const org = await signupAdmin('admin@acme.com', 'Acme Inc');
    await invite(org.cookies, { email: 'new@acme.com', role: 'user' });
    const token = mail.lastInvitationFor('new@acme.com')!.token;

    const first = await acceptInvite({ token, firstName: '', lastName: 'Hire', password: 'Passw0rd' });
    expect(first.status).toBe(400);
    expect(first.body.errors).toEqual({ firstName: MESSAGES.firstName.required });

    const stored = await prisma.invitation.findFirstOrThrow();
    expect(stored.status).toBe('pending');

    const second = await acceptInvite({ token, firstName: 'New', lastName: 'Hire', password: 'Passw0rd' });
    expect(second.status).toBe(200);
    expect(await prisma.account.count()).toBe(2); // admin + the new hire
  });
});
