import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AUTH_MESSAGES, MEMBER_MESSAGES } from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

/** Cheap in tests — the policy under bcrypt doesn't depend on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

describe('Member list & management (spec 04)', () => {
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

  /** Directly inserts an account + membership, and signs them in — mirrors spec 03's
   * invitations.spec.ts fixture helpers; both spec files build their own multi-role
   * fixtures this way rather than sharing a cross-file helper. */
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
      joinedAt?: Date;
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
      },
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

  const listMembers = (
    cookies: string[],
    organizationId: string,
    query: Record<string, string> = {},
  ) => {
    const qs = new URLSearchParams(query).toString();
    const url = `/api/organizations/${organizationId}/members${qs ? `?${qs}` : ''}`;
    return request(app.getHttpServer()).get(url).set('Cookie', cookies);
  };

  const deleteMember = (cookies: string[], organizationId: string, memberId: string) =>
    request(app.getHttpServer())
      .delete(`/api/organizations/${organizationId}/members/${memberId}`)
      .set('Cookie', cookies);

  const restoreMember = (cookies: string[], organizationId: string, memberId: string) =>
    request(app.getHttpServer())
      .post(`/api/organizations/${organizationId}/members/${memberId}/restore`)
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

  // TC-04-INT-01
  it('lists members with name/role/email for every role, and reports callerRole', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com',
      role: 'manager',
    });
    const user = await createMember(admin.organizationId, {
      email: 'usr@acme.com',
      role: 'user',
    });
    const viewer = await createMember(admin.organizationId, {
      email: 'view@acme.com',
      role: 'viewer',
    });

    for (const [caller, expectedRole] of [
      [admin, 'admin'],
      [manager, 'manager'],
      [user, 'user'],
      [viewer, 'viewer'],
    ] as const) {
      const response = await listMembers(caller.cookies, admin.organizationId);
      expect(response.status).toBe(200);
      expect(response.body.members).toHaveLength(4);
      expect(response.body.callerRole).toBe(expectedRole);
      const email = response.body.members.find((m: { id: string }) => m.id === caller.membershipId);
      expect(email).toMatchObject({ role: expectedRole });
    }
  });

  // TC-04-INT-02
  it('soft-deletes: blocks login and revokes sessions with the deactivation message', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const member = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    const response = await deleteMember(admin.cookies, admin.organizationId, member.membershipId);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    const membership = await prisma.membership.findUniqueOrThrow({
      where: { id: member.membershipId },
    });
    expect(membership.status).toBe('removed');

    const loginResponse = await login('m@acme.com', 'Passw0rd');
    expect(loginResponse.status).toBe(400);
    expect(loginResponse.body.message).toBe(AUTH_MESSAGES.deactivated);

    const staleSessionResponse = await listMembers(member.cookies, admin.organizationId);
    expect(staleSessionResponse.status).toBe(401);
  });

  // TC-04-INT-03
  it('restore resets joinedAt and clears jobTitle while keeping the prior role', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const originalJoin = new Date('2025-01-01T00:00:00.000Z');
    const removed = await createMember(admin.organizationId, {
      email: 'ex@acme.com',
      role: 'user',
      status: 'removed',
      jobTitle: 'Engineer',
      joinedAt: originalJoin,
    });

    const response = await restoreMember(admin.cookies, admin.organizationId, removed.membershipId);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    const membership = await prisma.membership.findUniqueOrThrow({
      where: { id: removed.membershipId },
    });
    expect(membership.status).toBe('active');
    expect(membership.role).toBe('user');
    expect(membership.jobTitle).toBeNull();
    expect(membership.joinedAt.getTime()).toBeGreaterThan(originalJoin.getTime());

    expect(await prisma.invitation.count()).toBe(0);
  });

  // TC-04-INT-04
  it('blocks deleting the last admin', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com',
      role: 'manager',
    });

    const response = await deleteMember(manager.cookies, admin.organizationId, admin.membershipId);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'last_admin_guard',
      message: MEMBER_MESSAGES.lastAdminGuard,
    });
    const membership = await prisma.membership.findUniqueOrThrow({
      where: { id: admin.membershipId },
    });
    expect(membership.status).toBe('active');
  });

  // TC-04-INT-05
  it('rejects delete/restore from user and viewer', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const target = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });
    const removedTarget = await createMember(admin.organizationId, {
      email: 'r@acme.com',
      role: 'user',
      status: 'removed',
    });
    const user = await createMember(admin.organizationId, { email: 'usr@acme.com', role: 'user' });
    const viewer = await createMember(admin.organizationId, {
      email: 'view@acme.com',
      role: 'viewer',
    });

    for (const caller of [user, viewer]) {
      const deleteResponse = await deleteMember(caller.cookies, admin.organizationId, target.membershipId);
      expect(deleteResponse.status).toBe(403);
      expect(deleteResponse.body).toEqual({
        error: 'forbidden',
        message: MEMBER_MESSAGES.deleteForbidden,
      });

      const restoreResponse = await restoreMember(
        caller.cookies,
        admin.organizationId,
        removedTarget.membershipId,
      );
      expect(restoreResponse.status).toBe(403);
      expect(restoreResponse.body).toEqual({
        error: 'forbidden',
        message: MEMBER_MESSAGES.restoreForbidden,
      });
    }

    const targetMembership = await prisma.membership.findUniqueOrThrow({
      where: { id: target.membershipId },
    });
    expect(targetMembership.status).toBe('active');
    const removedMembership = await prisma.membership.findUniqueOrThrow({
      where: { id: removedTarget.membershipId },
    });
    expect(removedMembership.status).toBe('removed');
  });

  // TC-04-INT-06
  it('blocks an admin from removing themselves', async () => {
    const a1 = await signupAdmin('a1@acme.com', 'Acme Inc');
    await createMember(a1.organizationId, { email: 'a2@acme.com', role: 'admin' });

    const response = await deleteMember(a1.cookies, a1.organizationId, a1.membershipId);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'cannot_remove_self',
      message: MEMBER_MESSAGES.cannotRemoveSelf,
    });
    const membership = await prisma.membership.findUniqueOrThrow({ where: { id: a1.membershipId } });
    expect(membership.status).toBe('active');
  });

  // TC-04-INT-07
  it('blocks a manager from removing themselves', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com',
      role: 'manager',
    });

    const response = await deleteMember(
      manager.cookies,
      admin.organizationId,
      manager.membershipId,
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'cannot_remove_self',
      message: MEMBER_MESSAGES.cannotRemoveSelf,
    });
    const membership = await prisma.membership.findUniqueOrThrow({
      where: { id: manager.membershipId },
    });
    expect(membership.status).toBe('active');
  });

  // TC-04-INT-08
  it('removing a member revokes their active session token', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const member = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    const deleteResponse = await deleteMember(admin.cookies, admin.organizationId, member.membershipId);
    expect(deleteResponse.status).toBe(200);

    const staleResponse = await listMembers(member.cookies, admin.organizationId);
    expect(staleResponse.status).toBe(401);
  });

  // TC-04-INT-09
  it('race: exactly one of two concurrent mutual admin deletes succeeds', async () => {
    const a1 = await signupAdmin('a1@acme.com', 'Acme Inc');
    const a2 = await createMember(a1.organizationId, { email: 'a2@acme.com', role: 'admin' });

    const [r1, r2] = await Promise.all([
      deleteMember(a1.cookies, a1.organizationId, a2.membershipId),
      deleteMember(a2.cookies, a1.organizationId, a1.membershipId),
    ]);

    const statuses = [r1.status, r2.status].sort();
    // Exactly one 2xx success, and the loser rejected — but not always by the same rule,
    // and asserting `409` alone is what made this test flake on CI.
    //
    // `remove()` reads the caller's membership *before* it takes the organization row lock.
    // Whether the loser sees 409 or 403 is therefore decided by where the winner's commit
    // lands relative to that read:
    //
    //   - read first  -> the loser is still an active admin, enters the transaction, waits
    //                    on the lock, and the zero-admin count inside it refuses: 409.
    //   - commit first -> the loser's own membership is already `removed`, so it is not a
    //                    member of this organization any more and never reaches the guard:
    //                    403 (401 too, if `SessionGuard` is the one that reads the rotated
    //                    security stamp after the commit).
    //
    // Both outcomes preserve what the guard exists to preserve, which the count below is
    // the real assertion of. See TC-04-INT-09 in the spec.
    expect(statuses[0]).toBeLessThan(300);
    expect([401, 403, 409]).toContain(statuses[1]);

    const activeAdmins = await prisma.membership.count({
      where: { organizationId: a1.organizationId, role: 'admin', status: 'active' },
    });
    expect(activeAdmins).toBeGreaterThanOrEqual(1);
  });

  // TC-04-INT-10
  it('server-side search filters by query parameter', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createMember(admin.organizationId, {
      email: 'alex@acme.com',
      role: 'user',
      firstName: 'Alex',
      lastName: 'Kaminski',
    });
    await createMember(admin.organizationId, {
      email: 'pat@acme.com',
      role: 'user',
      firstName: 'Pat',
      lastName: 'Owner',
    });

    const matched = await listMembers(admin.cookies, admin.organizationId, { search: 'alex' });
    expect(matched.status).toBe(200);
    expect(matched.body.members).toHaveLength(1);
    expect(matched.body.members[0]).toMatchObject({ fullName: 'Alex Kaminski' });

    const empty = await listMembers(admin.cookies, admin.organizationId, { search: 'zzz' });
    expect(empty.status).toBe(200);
    expect(empty.body.members).toEqual([]);
  });

  // TC-04-INT-11
  it('showRemoved includes removed members alongside active ones', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createMember(admin.organizationId, { email: 'active2@acme.com', role: 'user' });
    await createMember(admin.organizationId, {
      email: 'removed@acme.com',
      role: 'user',
      status: 'removed',
    });

    const defaultView = await listMembers(admin.cookies, admin.organizationId);
    expect(defaultView.body.members).toHaveLength(2);
    expect(defaultView.body.members.every((m: { status: string }) => m.status === 'active')).toBe(
      true,
    );

    const withRemoved = await listMembers(admin.cookies, admin.organizationId, {
      showRemoved: 'true',
    });
    expect(withRemoved.body.members).toHaveLength(3);
  });

  // Cross-spec side effect (README: "Inviter removed → Pending invitations
  // invalidated → 03"), now wired through the real DELETE endpoint for the first
  // time — spec 03's own suite only ever calls invalidatePendingInvitationsFrom
  // directly.
  it('invalidates the removed member own pending invitations sent as inviter', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com',
      role: 'manager',
    });
    await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Cookie', manager.cookies)
      .send({ email: 'invitee@acme.com', role: 'user' })
      .expect(200);
    const pending = await prisma.invitation.findFirstOrThrow();
    expect(pending.status).toBe('pending');

    const deleteResponse = await deleteMember(
      admin.cookies,
      admin.organizationId,
      manager.membershipId,
    );
    expect(deleteResponse.status).toBe(200);

    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: pending.id } });
    expect(stored.status).toBe('invalidated');
  });

  it('404s deleting/restoring a member id that does not belong to the org', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const deleteResponse = await deleteMember(admin.cookies, admin.organizationId, 'fabricated-id');
    expect(deleteResponse.status).toBe(404);

    const restoreResponse = await restoreMember(
      admin.cookies,
      admin.organizationId,
      'fabricated-id',
    );
    expect(restoreResponse.status).toBe(404);
  });

  it('409s deleting an already-removed member and restoring an active one', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const removed = await createMember(admin.organizationId, {
      email: 'ex@acme.com',
      role: 'user',
      status: 'removed',
    });
    const active = await createMember(admin.organizationId, {
      email: 'active@acme.com',
      role: 'user',
    });

    const alreadyRemoved = await deleteMember(admin.cookies, admin.organizationId, removed.membershipId);
    expect(alreadyRemoved.status).toBe(409);
    expect(alreadyRemoved.body).toEqual({
      error: 'already_removed',
      message: MEMBER_MESSAGES.alreadyRemoved,
    });

    const notRemoved = await restoreMember(admin.cookies, admin.organizationId, active.membershipId);
    expect(notRemoved.status).toBe(409);
    expect(notRemoved.body).toEqual({ error: 'not_removed', message: MEMBER_MESSAGES.notRemoved });
  });
});
