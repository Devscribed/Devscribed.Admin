import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { MembershipStatus, Role } from '@devscribed/shared';
import { Account } from '../src/entities/account.entity';
import { Membership } from '../src/entities/membership.entity';
import { Invitation } from '../src/entities/invitation.entity';
import { MailerService } from '../src/mail/mailer.service';
import { PasswordService } from '../src/auth/password.service';
import { InvitationsService } from '../src/invitations/invitations.service';
import { createTestApp, resetDatabase } from './test-app';

const DAY = 24 * 60 * 60 * 1000;

describe('User Invitation (spec 03)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let mailer: MailerService;
  let passwords: PasswordService;
  let invitationsService: InvitationsService;

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
    mailer = app.get(MailerService);
    passwords = app.get(PasswordService);
    invitationsService = app.get(InvitationsService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    mailer.clear();
  });

  const server = () => app.getHttpServer();
  const invite = (token: string, email: string, role: string) =>
    request(server())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ email, role });
  const accept = (body: Record<string, unknown>) =>
    request(server()).post('/api/invitations/accept').send(body);
  const validate = (token: string) => request(server()).get(`/api/invitations/${token}/validate`);

  async function signupOrg(email: string, orgName: string) {
    const res = await request(server())
      .post('/api/auth/signup')
      .send({ orgName, firstName: 'Ad', lastName: 'Min', email, password: 'Passw0rd' });
    return {
      token: res.body.token as string,
      orgId: res.body.organization.id as string,
      accountId: res.body.user.id as string,
    };
  }

  async function createAccountOnly(email: string): Promise<Account> {
    return dataSource.getRepository(Account).save(
      dataSource.getRepository(Account).create({
        email: email.toLowerCase(),
        passwordHash: await passwords.hash('Passw0rd'),
        firstName: 'Pat',
        lastName: 'Ex',
        timezone: 'UTC',
        securityStamp: randomUUID(),
      }),
    );
  }

  async function addMember(
    orgId: string,
    email: string,
    role: Role,
    opts: { status?: MembershipStatus; jobTitle?: string | null } = {},
  ): Promise<{ account: Account; membership: Membership }> {
    const account = await createAccountOnly(email);
    const membership = await dataSource.getRepository(Membership).save(
      dataSource.getRepository(Membership).create({
        accountId: account.id,
        organizationId: orgId,
        role,
        status: opts.status ?? MembershipStatus.Active,
        joinedAt: new Date(),
        jobTitle: opts.jobTitle ?? null,
      }),
    );
    return { account, membership };
  }

  async function loginToken(email: string): Promise<string> {
    const res = await request(server())
      .post('/api/auth/login')
      .send({ email, password: 'Passw0rd' });
    return res.body.token as string;
  }

  function inviteToken(email: string): string {
    const match = /token=([a-f0-9]+)/.exec(mailer.getLastTo(email)?.text ?? '');
    if (!match) {
      throw new Error(`no invitation token for ${email}`);
    }
    return match[1];
  }

  it('TC-03-INT-01: invite creates a pending record and dispatches an email', async () => {
    const { token, orgId } = await signupOrg('admin@acme.com', 'Acme Inc');
    const res = await invite(token, 'new@acme.com', 'user');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Invitation sent');

    const inv = await dataSource
      .getRepository(Invitation)
      .findOneOrFail({ where: { email: 'new@acme.com', organizationId: orgId } });
    expect(inv.status).toBe('pending');
    expect(inv.role).toBe('user');
    expect(inv.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * DAY);
    expect(mailer.getLastTo('new@acme.com')).toBeDefined();
  });

  it('TC-03-INT-02: accepting an expired invitation is rejected', async () => {
    const { token } = await signupOrg('admin@acme.com', 'Acme Inc');
    await invite(token, 'new@acme.com', 'user');
    const t = inviteToken('new@acme.com');
    await dataSource
      .getRepository(Invitation)
      .update({ email: 'new@acme.com' }, { expiresAt: new Date(Date.now() - 1000) });

    const res = await accept({
      token: t,
      firstName: 'New',
      lastName: 'Hire',
      password: 'Passw0rd',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This invitation has expired');
    expect(await dataSource.getRepository(Account).countBy({ email: 'new@acme.com' })).toBe(0);
  });

  it('TC-03-INT-03: accepting an already-used invitation is rejected', async () => {
    const { token } = await signupOrg('admin@acme.com', 'Acme Inc');
    await invite(token, 'new@acme.com', 'user');
    const t = inviteToken('new@acme.com');

    expect(
      (await accept({ token: t, firstName: 'New', lastName: 'Hire', password: 'Passw0rd' })).status,
    ).toBe(200);
    const again = await accept({
      token: t,
      firstName: 'New',
      lastName: 'Hire',
      password: 'Passw0rd',
    });
    expect(again.status).toBe(400);
    expect(again.body.message).toBe('This invitation is no longer valid');
  });

  it('TC-03-INT-04: accepting while a member of another org hard-deletes old data', async () => {
    const orgA = await signupOrg('adminA@acme.com', 'Org A');
    const u = await addMember(orgA.orgId, 'u@x.com', Role.User, { jobTitle: 'Engineer' });
    const orgB = await signupOrg('adminB@acme.com', 'Org B');

    await invite(orgB.token, 'u@x.com', 'manager');
    const t = inviteToken('u@x.com');
    const res = await accept({ token: t, password: 'Passw0rd', orgSwitchConfirmed: true });
    expect(res.status).toBe(200);

    const inA = await dataSource
      .getRepository(Membership)
      .findBy({ accountId: u.account.id, organizationId: orgA.orgId });
    expect(inA).toHaveLength(0);
    const inB = await dataSource
      .getRepository(Membership)
      .findOneOrFail({ where: { accountId: u.account.id, organizationId: orgB.orgId } });
    expect(inB.status).toBe('active');
    expect(inB.role).toBe('manager');
  });

  it('TC-03-INT-05: manager cannot invite at admin role', async () => {
    const { orgId } = await signupOrg('admin@acme.com', 'Acme Inc');
    await addMember(orgId, 'mgr@acme.com', Role.Manager);
    const mgr = await loginToken('mgr@acme.com');

    const res = await invite(mgr, 'new@acme.com', 'admin');
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('You do not have permission to assign the admin role');
  });

  it('TC-03-INT-06: invite to removed member restores with the new role and clears job title', async () => {
    const { token, orgId } = await signupOrg('admin@acme.com', 'Acme Inc');
    const ex = await addMember(orgId, 'ex@acme.com', Role.User, {
      status: MembershipStatus.Removed,
      jobTitle: 'Engineer',
    });

    await invite(token, 'ex@acme.com', 'manager');
    const t = inviteToken('ex@acme.com');
    expect((await accept({ token: t, password: 'Passw0rd' })).status).toBe(200);

    const mem = await dataSource
      .getRepository(Membership)
      .findOneOrFail({ where: { accountId: ex.account.id, organizationId: orgId } });
    expect(mem.status).toBe('active');
    expect(mem.role).toBe('manager');
    expect(mem.jobTitle).toBeNull();
  });

  it('TC-03-INT-07: manager invites non-admin roles; admin is rejected', async () => {
    const { orgId } = await signupOrg('admin@acme.com', 'Acme Inc');
    await addMember(orgId, 'mgr@acme.com', Role.Manager);
    const mgr = await loginToken('mgr@acme.com');

    expect((await invite(mgr, 'new1@acme.com', 'manager')).status).toBe(200);
    expect((await invite(mgr, 'new2@acme.com', 'user')).status).toBe(200);
    expect((await invite(mgr, 'new3@acme.com', 'viewer')).status).toBe(200);
    const admin = await invite(mgr, 'new4@acme.com', 'admin');
    expect(admin.status).toBe(403);
  });

  it('TC-03-INT-08: self-invitation is rejected (case-insensitive)', async () => {
    const { token } = await signupOrg('admin@acme.com', 'Acme Inc');
    for (const email of ['admin@acme.com', 'ADMIN@ACME.COM']) {
      const res = await invite(token, email, 'user');
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('You cannot invite yourself');
    }
  });

  it('TC-03-INT-09: existing account accepts with the correct password', async () => {
    await createAccountOnly('pat@other.com');
    const orgB = await signupOrg('adminB@acme.com', 'Org B');
    await invite(orgB.token, 'pat@other.com', 'user');
    const t = inviteToken('pat@other.com');

    const res = await accept({ token: t, password: 'Passw0rd' });
    expect(res.status).toBe(200);
    const mem = await dataSource
      .getRepository(Membership)
      .findOneOrFail({ where: { organizationId: orgB.orgId } });
    expect(mem.status).toBe('active');
  });

  it('TC-03-INT-10: existing account with wrong password is rejected, token not consumed', async () => {
    await createAccountOnly('pat@other.com');
    const orgB = await signupOrg('adminB@acme.com', 'Org B');
    await invite(orgB.token, 'pat@other.com', 'user');
    const t = inviteToken('pat@other.com');

    const res = await accept({ token: t, password: 'WrongPass1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Incorrect password');
    const inv = await dataSource
      .getRepository(Invitation)
      .findOneOrFail({ where: { email: 'pat@other.com' } });
    expect(inv.status).toBe('pending');
  });

  it('TC-03-INT-11: org-switch as last admin hard-deletes old org data', async () => {
    const orgA = await signupOrg('admin@orgA.com', 'Org A');
    await addMember(orgA.orgId, 'other@orgA.com', Role.User);
    const orgB = await signupOrg('adminB@acme.com', 'Org B');

    await invite(orgB.token, 'admin@orgA.com', 'manager');
    const t = inviteToken('admin@orgA.com');
    expect(
      (await accept({ token: t, password: 'Passw0rd', orgSwitchConfirmed: true })).status,
    ).toBe(200);

    expect(
      await dataSource
        .getRepository(Membership)
        .countBy({ accountId: orgA.accountId, organizationId: orgA.orgId }),
    ).toBe(0);
    expect(
      await dataSource
        .getRepository(Membership)
        .countBy({ organizationId: orgA.orgId, role: Role.Admin, status: MembershipStatus.Active }),
    ).toBe(0);
  });

  it('TC-03-INT-12: inviter removal invalidates pending invitations', async () => {
    const { token, orgId, accountId } = await signupOrg('admin@acme.com', 'Acme Inc');
    await invite(token, 'new@acme.com', 'user');
    const t = inviteToken('new@acme.com');

    const inviterMembership = await dataSource
      .getRepository(Membership)
      .findOneOrFail({ where: { accountId, organizationId: orgId } });
    await dataSource
      .getRepository(Membership)
      .update({ id: inviterMembership.id }, { status: MembershipStatus.Removed });
    await invitationsService.invalidatePendingInvitationsForInviter(inviterMembership.id);

    const inv = await dataSource
      .getRepository(Invitation)
      .findOneOrFail({ where: { email: 'new@acme.com' } });
    expect(inv.status).toBe('invalidated');

    const res = await accept({
      token: t,
      firstName: 'New',
      lastName: 'Hire',
      password: 'Passw0rd',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This invitation is no longer valid');
  });

  it('TC-03-INT-13: re-invitation supersedes the prior pending invitation', async () => {
    const { token } = await signupOrg('admin@acme.com', 'Acme Inc');
    await invite(token, 'new@acme.com', 'user');
    const t1 = inviteToken('new@acme.com');
    await invite(token, 'new@acme.com', 'manager');
    const t2 = inviteToken('new@acme.com');
    expect(t2).not.toBe(t1);

    const withT1 = await accept({
      token: t1,
      firstName: 'New',
      lastName: 'Hire',
      password: 'Passw0rd',
    });
    expect(withT1.status).toBe(400);
    expect(withT1.body.message).toBe('This invitation is no longer valid');

    expect(
      (await accept({ token: t2, firstName: 'New', lastName: 'Hire', password: 'Passw0rd' }))
        .status,
    ).toBe(200);
    const account = await dataSource
      .getRepository(Account)
      .findOneOrFail({ where: { email: 'new@acme.com' } });
    const membership = await dataSource
      .getRepository(Membership)
      .findOneOrFail({ where: { accountId: account.id } });
    expect(membership.role).toBe('manager');
  });

  it('TC-03-INT-14: org-switch without confirmation returns 409', async () => {
    const orgA = await signupOrg('adminA@acme.com', 'Org A');
    await addMember(orgA.orgId, 'user@x.com', Role.User);
    const orgB = await signupOrg('adminB@acme.com', 'Org B');

    await invite(orgB.token, 'user@x.com', 'user');
    const t = inviteToken('user@x.com');
    const res = await accept({ token: t, password: 'Passw0rd', orgSwitchConfirmed: false });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('org_switch_confirmation_required');
    expect(res.body.oldOrganizationName).toBe('Org A');
    expect(res.body.lastAdmin).toBe(false);
  });

  it('TC-03-INT-15: inviting an active member of the same org is rejected', async () => {
    const { token, orgId } = await signupOrg('admin@acme.com', 'Acme Inc');
    await addMember(orgId, 'member@acme.com', Role.User);
    const res = await invite(token, 'member@acme.com', 'user');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This person is already a member of your organization');
  });

  it('TC-03-INT-16: user cannot create invitations', async () => {
    const { orgId } = await signupOrg('admin@acme.com', 'Acme Inc');
    await addMember(orgId, 'user@acme.com', Role.User);
    const userToken = await loginToken('user@acme.com');
    const res = await invite(userToken, 'new@acme.com', 'user');
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('You do not have permission to invite members');
  });

  it('TC-03-INT-17: accepting with an unrecognized token is rejected', async () => {
    const res = await accept({ token: 'fabricated-token-value', password: 'Passw0rd' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This invitation is no longer valid');
  });

  it('TC-03-INT-18: new account accepts with valid name and password', async () => {
    const { token, orgId } = await signupOrg('admin@acme.com', 'Acme Inc');
    await invite(token, 'new@acme.com', 'user');
    const t = inviteToken('new@acme.com');

    const res = await accept({
      token: t,
      firstName: 'New',
      lastName: 'Hire',
      password: 'Passw0rd',
      timezone: 'America/New_York',
    });
    expect(res.status).toBe(200);

    const account = await dataSource
      .getRepository(Account)
      .findOneOrFail({ where: { email: 'new@acme.com' } });
    expect(account.firstName).toBe('New');
    expect(account.lastName).toBe('Hire');
    expect(account.timezone).toBe('America/New_York');

    const membership = await dataSource
      .getRepository(Membership)
      .findOneOrFail({ where: { accountId: account.id, organizationId: orgId } });
    expect(membership.role).toBe('user');
    expect(membership.status).toBe('active');

    const inv = await dataSource
      .getRepository(Invitation)
      .findOneOrFail({ where: { email: 'new@acme.com' } });
    expect(inv.status).toBe('used');
  });

  it('TC-03-INT-19: new account accept with invalid name is rejected without consuming the token', async () => {
    const { token } = await signupOrg('admin@acme.com', 'Acme Inc');
    await invite(token, 'new@acme.com', 'user');
    const t = inviteToken('new@acme.com');

    const bad = await accept({ token: t, firstName: '', lastName: 'Hire', password: 'Passw0rd' });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.firstName).toBe('First name is required');
    const inv = await dataSource
      .getRepository(Invitation)
      .findOneOrFail({ where: { email: 'new@acme.com' } });
    expect(inv.status).toBe('pending');

    expect(
      (await accept({ token: t, firstName: 'New', lastName: 'Hire', password: 'Passw0rd' })).status,
    ).toBe(200);
  });

  it('validate returns account/org-switch metadata', async () => {
    const orgA = await signupOrg('adminA@acme.com', 'Org A');
    await addMember(orgA.orgId, 'user@x.com', Role.User);
    const orgB = await signupOrg('adminB@acme.com', 'Org B');
    await invite(orgB.token, 'user@x.com', 'manager');
    const t = inviteToken('user@x.com');

    const res = await validate(t);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      organizationName: 'Org B',
      email: 'user@x.com',
      role: 'manager',
      accountExists: true,
      orgSwitch: true,
      oldOrganizationName: 'Org A',
      lastAdmin: false,
    });
  });
});
