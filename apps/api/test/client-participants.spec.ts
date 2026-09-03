import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

/** Cheap in tests — the policy under bcrypt doesn't depend on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

/**
 * The spec's Error Messages table, quoted literally rather than imported. An assertion
 * that reads the constant the route also reads certifies whatever the code happens to
 * say; these are the words the spec promises.
 */
const COPY = {
  emailInvalid: 'Enter a valid email address',
  alreadyLinked: 'This person is already a contact of a client in this workspace',
  alreadyRemoved: 'This contact has already been removed',
  principalConflict: 'This email address already belongs to somebody in a workspace',
  clientCannotCreate: 'Client contacts cannot raise requests',
  clientArchived: 'This client is archived and cannot be assigned to new projects.',
  deactivated: 'Your account has been deactivated. Contact your administrator.',
  tokenInvalid: 'This invitation is no longer valid',
  clientProjectRequired: 'Choose the project this request belongs to',
  clientProjectMismatch: 'That project does not belong to this client',
  notOnProject: 'You can only ask a client about a project you are assigned to',
  assigneeInvalid: 'Choose who this request is for',
  assigneeInactive: 'That person is no longer active in this organization',
  topicAudienceMismatch: 'That topic cannot be used for this addressee',
  topicUnavailable: 'That topic is not available',
  createForbidden: 'You do not have permission to create requests',
  scopeForbidden: "You do not have permission to view other people's requests",
  notYoursToAnswer: 'Only the person this is addressed to can answer it',
  notYoursToDecline: 'Only the person this is addressed to can decline it',
  notYoursToGrant: 'Only the person who asked can confirm this',
  declineReasonRequired: 'Say why you cannot provide this',
  alreadyTerminal: 'This request has already been closed',
  threadClosed: 'This request is closed',
} as const;

describe('Client participants (requests spec 03)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;

  const server = () => app.getHttpServer();

  interface Signed {
    cookies: string[];
    accountId: string;
    organizationId: string;
    membershipId: string;
    email: string;
  }

  const signupAdmin = async (email: string, orgName: string): Promise<Signed> => {
    const response = await request(server()).post('/api/signup').send({
      orgName,
      firstName: 'Pat',
      lastName: 'Owner',
      email,
      password: 'Passw0rd',
    });
    const accountId = response.body.account.id as string;
    const membership = await prisma.membership.findUniqueOrThrow({ where: { accountId } });
    return {
      cookies: response.headers['set-cookie'] as unknown as string[],
      accountId,
      organizationId: response.body.organization.id as string,
      membershipId: membership.id,
      email,
    };
  };

  const login = (email: string, password = 'Passw0rd') =>
    request(server()).post('/api/login').send({ email, password });

  const createMember = async (
    organizationId: string,
    opts: { email: string; role: string; status?: string; firstName?: string },
  ): Promise<Signed> => {
    const passwordHash = await bcrypt.hash('Passw0rd', TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: {
        email: opts.email,
        passwordHash,
        firstName: opts.firstName ?? 'Test',
        lastName: 'User',
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
      opts.status === 'removed'
        ? []
        : ((await login(opts.email)).headers['set-cookie'] as unknown as string[]);
    return {
      cookies,
      accountId: account.id,
      organizationId,
      membershipId: membership.id,
      email: opts.email,
    };
  };

  /** An account with a password and no principal at all. */
  const createBareAccount = async (email: string): Promise<string> => {
    const passwordHash = await bcrypt.hash('Passw0rd', TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: { email, passwordHash, firstName: 'Bare', lastName: 'Account' },
    });
    return account.id;
  };

  const createClient = async (caller: Signed, name: string): Promise<string> => {
    const response = await request(server())
      .post(`/api/organizations/${caller.organizationId}/clients`)
      .set('Cookie', caller.cookies)
      .send({ name });
    expect(response.status).toBe(201);
    return response.body.client.id as string;
  };

  const createProject = async (
    caller: Signed,
    name: string,
    clientId: string | null,
  ): Promise<string> => {
    const response = await request(server())
      .post(`/api/organizations/${caller.organizationId}/projects`)
      .set('Cookie', caller.cookies)
      .send({ name, ...(clientId ? { clientId } : {}) });
    expect(response.status).toBe(201);
    return (response.body.project?.id ?? response.body.id) as string;
  };

  const assignProject = async (
    caller: Signed,
    projectId: string,
    membershipIds: string[],
  ): Promise<void> => {
    const response = await request(server())
      .post(`/api/organizations/${caller.organizationId}/projects/${projectId}/members`)
      .set('Cookie', caller.cookies)
      .send({ membershipIds });
    expect(response.status).toBe(200);
  };

  const inviteContact = (caller: Signed, clientId: string, body: Record<string, unknown>) =>
    request(server())
      .post(`/api/organizations/${caller.organizationId}/clients/${clientId}/contacts`)
      .set('Cookie', caller.cookies)
      .send(body);

  const listContacts = (caller: Signed, clientId: string) =>
    request(server())
      .get(`/api/organizations/${caller.organizationId}/clients/${clientId}/contacts`)
      .set('Cookie', caller.cookies);

  const removeContact = (caller: Signed, clientId: string, contactId: string) =>
    request(server())
      .delete(
        `/api/organizations/${caller.organizationId}/clients/${clientId}/contacts/${contactId}`,
      )
      .set('Cookie', caller.cookies);

  const acceptInvite = (body: Record<string, unknown>) =>
    request(server()).post('/api/invitations/accept').send(body);

  /** The raw token of the latest invitation the sink received for an address. */
  const tokenFor = (email: string): string => {
    const messages = mail.sentInvitations.filter((message) => message.to === email);
    expect(messages.length).toBeGreaterThan(0);
    return messages[messages.length - 1].token;
  };

  interface Contact {
    cookies: string[];
    accountId: string;
    clientMembershipId: string;
    email: string;
  }

  /** Invite an address to a client, accept as a brand-new account, and sign in. */
  const inviteAndAccept = async (
    admin: Signed,
    clientId: string,
    email: string,
    firstName = 'Dana',
  ): Promise<Contact> => {
    const invited = await inviteContact(admin, clientId, { email });
    expect(invited.status).toBe(201);
    const accepted = await acceptInvite({
      token: tokenFor(email),
      firstName,
      lastName: 'Stone',
      password: 'Passw0rd',
    });
    expect(accepted.status).toBe(200);
    const row = await prisma.clientMembership.findFirstOrThrow({
      where: { account: { email } },
    });
    const cookies = (await login(email)).headers['set-cookie'] as unknown as string[];
    return { cookies, accountId: row.accountId, clientMembershipId: row.id, email };
  };

  const topicId = async (organizationId: string, audience: string, name: string) => {
    const topic = await prisma.requestTopic.findFirstOrThrow({
      where: { organizationId, audience, name },
    });
    return topic.id;
  };

  const createRequest = (caller: Signed, body: Record<string, unknown>) =>
    request(server())
      .post(`/api/organizations/${caller.organizationId}/requests`)
      .set('Cookie', caller.cookies)
      .send(body);

  const getRequest = (cookies: string[], orgId: string, requestId: string) =>
    request(server())
      .get(`/api/organizations/${orgId}/requests/${requestId}`)
      .set('Cookie', cookies);

  const act = (
    cookies: string[],
    orgId: string,
    requestId: string,
    action: string,
    body: Record<string, unknown> = {},
  ) =>
    request(server())
      .post(`/api/organizations/${orgId}/requests/${requestId}/${action}`)
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
    await prisma.requestNotification.deleteMany();
    await prisma.requestEvent.deleteMany();
    await prisma.requestMessage.deleteMany();
    await prisma.request.deleteMany();
    await prisma.requestTopic.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.clientMembership.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
    mail.clear();
  });

  // TC-03-INT-01
  it('creates one active ClientMembership, no Membership, and lands on requests', async () => {
    const admin = await signupAdmin('admin1@acme.test', 'Acme One');
    const clientId = await createClient(admin, 'Acme Client');

    const invited = await inviteContact(admin, clientId, { email: 'dana@acme.example' });
    expect(invited.status).toBe(201);
    expect(invited.body.contact).toMatchObject({
      email: 'dana@acme.example',
      status: 'invited',
    });

    const accepted = await acceptInvite({
      token: tokenFor('dana@acme.example'),
      firstName: 'Dana',
      lastName: 'Stone',
      password: 'Passw0rd',
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body.redirectTo).toBe('/requests');
    expect(accepted.headers['set-cookie']).toBeDefined();

    const account = await prisma.account.findUniqueOrThrow({
      where: { email: 'dana@acme.example' },
    });
    const contact = await prisma.clientMembership.findUniqueOrThrow({
      where: { accountId: account.id },
    });
    expect(contact).toMatchObject({
      status: 'active',
      organizationId: admin.organizationId,
      clientId,
    });
    expect(await prisma.membership.count({ where: { accountId: account.id } })).toBe(0);
  });

  // TC-03-INT-02
  it('writes an invitation carrying the client, the client role, a hashed token and a 7-day expiry', async () => {
    const admin = await signupAdmin('admin2@acme.test', 'Acme Two');
    const clientId = await createClient(admin, 'Acme Client');

    const before = Date.now();
    const invited = await inviteContact(admin, clientId, { email: 'sam@acme.example' });
    expect(invited.status).toBe(201);

    const row = await prisma.invitation.findFirstOrThrow({
      where: { email: 'sam@acme.example' },
    });
    expect(row.clientId).toBe(clientId);
    expect(row.role).toBe('client');
    expect(row.status).toBe('pending');
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(row.expiresAt.getTime() - before).toBeGreaterThan(sevenDays - 60_000);
    expect(row.expiresAt.getTime() - before).toBeLessThan(sevenDays + 60_000);

    const token = tokenFor('sam@acme.example');
    expect(token.length).toBeGreaterThan(10);
    // The raw token is in the message and nowhere in the database.
    expect(row.tokenHash).not.toBe(token);
    expect(await prisma.invitation.count({ where: { tokenHash: token } })).toBe(0);
  });

  // TC-03-INT-03
  it('signs a client contact in — the very case that answered deactivated before', async () => {
    const admin = await signupAdmin('admin3@acme.test', 'Acme Three');
    const clientId = await createClient(admin, 'Acme Client');
    await inviteAndAccept(admin, clientId, 'dana3@acme.example');

    const signedIn = await login('dana3@acme.example');
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.organizationId).toBe(admin.organizationId);
    expect(signedIn.headers['set-cookie']).toBeDefined();

    const account = await prisma.account.findUniqueOrThrow({
      where: { email: 'dana3@acme.example' },
    });
    expect(await prisma.membership.count({ where: { accountId: account.id } })).toBe(0);
  });

  // TC-03-INT-04
  it('refuses an account with no principal at all, whatever the password', async () => {
    await createBareAccount('nobody@acme.example');

    const right = await login('nobody@acme.example');
    expect(right.status).toBe(400);
    expect(right.body.message).toBe(COPY.deactivated);

    const wrong = await login('nobody@acme.example', 'WrongPassw0rd');
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toBe(COPY.deactivated);
  });

  // TC-03-INT-05
  it('answers one identity shape for both principals', async () => {
    const admin = await signupAdmin('admin5@acme.test', 'Acme Five');
    const clientId = await createClient(admin, 'Acme Client');
    const contact = await inviteAndAccept(admin, clientId, 'dana5@acme.example');

    const asContact = await request(server()).get('/api/me').set('Cookie', contact.cookies);
    expect(asContact.status).toBe(200);
    expect(asContact.body).not.toBeNull();
    expect(asContact.body.principal).toBe('client');
    expect(asContact.body.role).toBeNull();
    expect(asContact.body.organization.id).toBe(admin.organizationId);
    expect(asContact.body.client).toMatchObject({ id: clientId, name: 'Acme Client' });

    const asAdmin = await request(server()).get('/api/me').set('Cookie', admin.cookies);
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.principal).toBe('member');
    expect(asAdmin.body.role).toBe('admin');
    expect(asAdmin.body.client).toBeNull();
  });

  // TC-03-INT-06
  it('refuses a contact for an archived client and accepts one once restored', async () => {
    const admin = await signupAdmin('admin6@acme.test', 'Acme Six');
    const clientId = await createClient(admin, 'Acme Client');

    await request(server())
      .patch(`/api/organizations/${admin.organizationId}/clients/${clientId}/archive`)
      .set('Cookie', admin.cookies)
      .expect(200);

    const refused = await inviteContact(admin, clientId, { email: 'dana6@acme.example' });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe(COPY.clientArchived);
    expect(await prisma.invitation.count()).toBe(0);

    await request(server())
      .patch(`/api/organizations/${admin.organizationId}/clients/${clientId}/restore`)
      .set('Cookie', admin.cookies)
      .expect(200);

    const accepted = await inviteContact(admin, clientId, { email: 'dana6@acme.example' });
    expect(accepted.status).toBe(201);
  });

  // TC-03-INT-07
  it('refuses an address already contacting any client of the organization', async () => {
    const admin = await signupAdmin('admin7@acme.test', 'Acme Seven');
    const first = await createClient(admin, 'First Client');
    const second = await createClient(admin, 'Second Client');
    const contact = await inviteAndAccept(admin, first, 'dana7@acme.example');

    const sameClient = await inviteContact(admin, first, { email: 'dana7@acme.example' });
    expect(sameClient.status).toBe(409);
    expect(sameClient.body.message).toBe(COPY.alreadyLinked);

    const otherClient = await inviteContact(admin, second, { email: 'dana7@acme.example' });
    expect(otherClient.status).toBe(409);
    expect(otherClient.body.message).toBe(COPY.alreadyLinked);

    const removed = await removeContact(admin, first, contact.clientMembershipId);
    expect(removed.status).toBe(200);

    const otherClientAfterRemoval = await inviteContact(admin, second, {
      email: 'dana7@acme.example',
    });
    expect(otherClientAfterRemoval.status).toBe(409);
    expect(otherClientAfterRemoval.body.message).toBe(COPY.alreadyLinked);
  });

  // TC-03-INT-08
  it('refuses the two-principal cell from both directions and resolves every reachable one', async () => {
    const admin = await signupAdmin('admin8@acme.test', 'Acme Eight');
    const clientId = await createClient(admin, 'Acme Client');

    // From the client side: an account holding an active staff membership accepts a
    // client invitation.
    const staff = await createMember(admin.organizationId, {
      email: 'staff8@acme.test',
      role: 'user',
    });
    const invitedStaff = await inviteContact(admin, clientId, { email: staff.email });
    expect(invitedStaff.status).toBe(201);
    const conflictFromClientSide = await acceptInvite({
      token: tokenFor(staff.email),
      password: 'Passw0rd',
    });
    expect(conflictFromClientSide.status).toBe(409);
    expect(conflictFromClientSide.body.message).toBe(COPY.principalConflict);
    expect(await prisma.clientMembership.count({ where: { accountId: staff.accountId } })).toBe(0);
    const staffMembership = await prisma.membership.findUniqueOrThrow({
      where: { accountId: staff.accountId },
    });
    expect(staffMembership.status).toBe('active');

    // From the staff side: inviting an active contact to staff.
    const contact = await inviteAndAccept(admin, clientId, 'dana8@acme.example');
    const staffInvite = await request(server())
      .post('/api/invitations')
      .set('Cookie', admin.cookies)
      .send({ email: 'dana8@acme.example', role: 'user' });
    expect(staffInvite.status).toBe(409);
    expect(staffInvite.body.message).toBe(COPY.principalConflict);
    expect(
      await prisma.invitation.count({ where: { email: 'dana8@acme.example', role: 'user' } }),
    ).toBe(0);

    // And from the staff side at the accept: an invitation written for an address that
    // is a client contact of ANOTHER organization by the time it is accepted.
    const other = await signupAdmin('admin8b@beta.test', 'Beta Eight');
    const pending = await request(server())
      .post('/api/invitations')
      .set('Cookie', other.cookies)
      .send({ email: 'later8@acme.example', role: 'user' });
    expect(pending.status).toBe(200);
    const staffToken = tokenFor('later8@acme.example');
    await inviteAndAccept(admin, clientId, 'later8@acme.example', 'Later');
    const conflictFromStaffSide = await acceptInvite({
      token: staffToken,
      password: 'Passw0rd',
    });
    expect(conflictFromStaffSide.status).toBe(409);
    expect(conflictFromStaffSide.body.message).toBe(COPY.principalConflict);
    const laterAccount = await prisma.account.findUniqueOrThrow({
      where: { email: 'later8@acme.example' },
    });
    expect(await prisma.membership.count({ where: { accountId: laterAccount.id } })).toBe(0);

    // Every reachable cell of the principal decision table.
    // none/none — the bare account.
    await createBareAccount('cell-none@acme.example');
    expect((await login('cell-none@acme.example')).body.message).toBe(COPY.deactivated);

    // none/active — the contact created above.
    const activeClientOnly = await login('dana8@acme.example');
    expect(activeClientOnly.status).toBe(200);
    expect(activeClientOnly.body.organizationId).toBe(admin.organizationId);

    // none/removed.
    await prisma.clientMembership.update({
      where: { id: contact.clientMembershipId },
      data: { status: 'removed', removedAt: new Date() },
    });
    expect((await login('dana8@acme.example')).body.message).toBe(COPY.deactivated);

    // active/none — an ordinary member of staff.
    expect((await login(staff.email)).status).toBe(200);

    // active/removed — the staff row wins.
    await prisma.clientMembership.create({
      data: {
        accountId: staff.accountId,
        organizationId: admin.organizationId,
        clientId,
        status: 'removed',
        removedAt: new Date(),
      },
    });
    const staffWithRemovedClientRow = await login(staff.email);
    expect(staffWithRemovedClientRow.status).toBe(200);
    expect(staffWithRemovedClientRow.body.organizationId).toBe(admin.organizationId);

    // removed/active — the client row wins.
    const switcher = await createMember(admin.organizationId, {
      email: 'switch8@acme.test',
      role: 'user',
    });
    await prisma.membership.update({
      where: { id: switcher.membershipId },
      data: { status: 'removed' },
    });
    await prisma.clientMembership.create({
      data: {
        accountId: switcher.accountId,
        organizationId: admin.organizationId,
        clientId,
        status: 'active',
      },
    });
    const removedStaffActiveClient = await login(switcher.email);
    expect(removedStaffActiveClient.status).toBe(200);
    expect(removedStaffActiveClient.body.organizationId).toBe(admin.organizationId);

    // removed/none, and removed/removed.
    const goneStaff = await createMember(admin.organizationId, {
      email: 'gone8@acme.test',
      role: 'user',
      status: 'removed',
    });
    expect((await login(goneStaff.email)).body.message).toBe(COPY.deactivated);
    await prisma.clientMembership.create({
      data: {
        accountId: goneStaff.accountId,
        organizationId: admin.organizationId,
        clientId,
        status: 'removed',
        removedAt: new Date(),
      },
    });
    expect((await login(goneStaff.email)).body.message).toBe(COPY.deactivated);
  });

  // TC-03-INT-09
  it('refuses a removed contact at sign-in with the deactivated message', async () => {
    const admin = await signupAdmin('admin9@acme.test', 'Acme Nine');
    const clientId = await createClient(admin, 'Acme Client');
    const contact = await inviteAndAccept(admin, clientId, 'dana9@acme.example');

    expect((await removeContact(admin, clientId, contact.clientMembershipId)).status).toBe(200);

    const refused = await login('dana9@acme.example');
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe(COPY.deactivated);
  });

  // TC-03-INT-10
  it('rotates the security stamp in the removal transaction, ending every live session', async () => {
    const admin = await signupAdmin('admin10@acme.test', 'Acme Ten');
    const clientId = await createClient(admin, 'Acme Client');
    const contact = await inviteAndAccept(admin, clientId, 'dana10@acme.example');

    const before = await prisma.account.findUniqueOrThrow({ where: { id: contact.accountId } });
    expect(
      (await request(server()).get('/api/me').set('Cookie', contact.cookies)).status,
    ).toBe(200);

    const removed = await removeContact(admin, clientId, contact.clientMembershipId);
    expect(removed.status).toBe(200);

    const row = await prisma.clientMembership.findUniqueOrThrow({
      where: { id: contact.clientMembershipId },
    });
    expect(row.status).toBe('removed');
    expect(row.removedAt).not.toBeNull();
    expect(row.removedByAccountId).toBe(admin.accountId);

    const after = await prisma.account.findUniqueOrThrow({ where: { id: contact.accountId } });
    expect(after.securityStamp).not.toBe(before.securityStamp);

    const held = await request(server()).get('/api/me').set('Cookie', contact.cookies);
    expect(held.status).toBe(401);

    const twice = await removeContact(admin, clientId, contact.clientMembershipId);
    expect(twice.status).toBe(409);
    expect(twice.body.message).toBe(COPY.alreadyRemoved);
  });

  // TC-03-INT-11
  it('returns the same row to active when a removed contact is invited again', async () => {
    const admin = await signupAdmin('admin11@acme.test', 'Acme Eleven');
    const clientId = await createClient(admin, 'Acme Client');
    const contact = await inviteAndAccept(admin, clientId, 'dana11@acme.example');

    await removeContact(admin, clientId, contact.clientMembershipId);

    const reinvited = await inviteContact(admin, clientId, { email: 'dana11@acme.example' });
    expect(reinvited.status).toBe(201);
    const accepted = await acceptInvite({
      token: tokenFor('dana11@acme.example'),
      password: 'Passw0rd',
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body.redirectTo).toBe('/requests');

    const rows = await prisma.clientMembership.findMany({
      where: { accountId: contact.accountId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(contact.clientMembershipId);
    expect(rows[0].status).toBe('active');
    expect(rows[0].removedAt).toBeNull();
    expect(rows[0].removedByAccountId).toBeNull();
  });

  // TC-03-INT-12
  it('answers a user 404 on every contacts route and a manager 200/201', async () => {
    const admin = await signupAdmin('admin12@acme.test', 'Acme Twelve');
    const clientId = await createClient(admin, 'Acme Client');
    const contact = await inviteAndAccept(admin, clientId, 'dana12@acme.example');

    const user = await createMember(admin.organizationId, {
      email: 'user12@acme.test',
      role: 'user',
    });
    const manager = await createMember(admin.organizationId, {
      email: 'manager12@acme.test',
      role: 'manager',
    });

    // The answer is the one the client's own detail route already gives this caller, so
    // the refusal discloses nothing the detail route does not.
    const detail = await request(server())
      .get(`/api/organizations/${admin.organizationId}/clients/${clientId}`)
      .set('Cookie', user.cookies);
    expect(detail.status).toBe(404);

    const userList = await listContacts(user, clientId);
    expect(userList.status).toBe(404);
    expect(JSON.stringify(userList.body)).not.toContain('manage-clients');
    expect(JSON.stringify(userList.body)).not.toContain('view-clients');
    const userInvite = await inviteContact(user, clientId, { email: 'nope12@acme.example' });
    expect(userInvite.status).toBe(404);
    const userRemove = await removeContact(user, clientId, contact.clientMembershipId);
    expect(userRemove.status).toBe(404);
    expect(await prisma.invitation.count({ where: { email: 'nope12@acme.example' } })).toBe(0);
    expect(
      (await prisma.clientMembership.findUniqueOrThrow({ where: { id: contact.clientMembershipId } }))
        .status,
    ).toBe('active');

    expect((await listContacts(manager, clientId)).status).toBe(200);
    expect((await inviteContact(manager, clientId, { email: 'sam12@acme.example' })).status).toBe(
      201,
    );
    expect((await removeContact(manager, clientId, contact.clientMembershipId)).status).toBe(200);
  });

  // TC-03-INT-13
  it('answers a client principal 404 on every organization route it is not given', async () => {
    const admin = await signupAdmin('admin13@acme.test', 'Acme Thirteen');
    const clientId = await createClient(admin, 'Acme Client');
    const contact = await inviteAndAccept(admin, clientId, 'dana13@acme.example');
    const orgId = admin.organizationId;

    // The baseline: what an organization the caller has no part in answers. Every
    // refusal below is that same body, so the shape of the staff product is not
    // enumerable by a contact.
    const foreign = await signupAdmin('admin13b@beta.test', 'Beta Thirteen');
    const strangerOrg = await request(server())
      .get(`/api/organizations/${foreign.organizationId}/members`)
      .set('Cookie', contact.cookies);
    expect(strangerOrg.status).toBe(404);
    const bare = JSON.stringify(strangerOrg.body);

    const members = await request(server())
      .get(`/api/organizations/${orgId}/members`)
      .set('Cookie', contact.cookies);
    expect(members.status).toBe(404);
    expect(JSON.stringify(members.body)).toBe(bare);

    const projects = await request(server())
      .get(`/api/organizations/${orgId}/projects`)
      .set('Cookie', contact.cookies);
    expect(projects.status).toBe(404);
    expect(JSON.stringify(projects.body)).toBe(bare);

    const contacts = await request(server())
      .get(`/api/organizations/${orgId}/clients/${clientId}/contacts`)
      .set('Cookie', contact.cookies);
    expect(contacts.status).toBe(404);
    expect(JSON.stringify(contacts.body)).toBe(bare);

    const topics = await request(server())
      .get(`/api/organizations/${orgId}/request-topics`)
      .set('Cookie', contact.cookies);
    expect(topics.status).toBe(404);
    expect(JSON.stringify(topics.body)).toBe(bare);

    const asAdmin = await request(server())
      .get(`/api/organizations/${orgId}/members`)
      .set('Cookie', admin.cookies);
    expect(asAdmin.status).toBe(200);
  });

  // TC-03-INT-14
  it('refuses a client contact the create route with its own message, whatever the body', async () => {
    const admin = await signupAdmin('admin14@acme.test', 'Acme Fourteen');
    const clientId = await createClient(admin, 'Acme Client');
    const projectId = await createProject(admin, 'Acme Redesign', clientId);
    const contact = await inviteAndAccept(admin, clientId, 'dana14@acme.example');
    const other = await inviteAndAccept(admin, clientId, 'sam14@acme.example', 'Sam');
    const clientTopic = await topicId(admin.organizationId, 'client', 'Access');

    const wellFormed = await request(server())
      .post(`/api/organizations/${admin.organizationId}/requests`)
      .set('Cookie', contact.cookies)
      .send({
        topicId: clientTopic,
        title: 'Please grant this',
        projectId,
        assigneeKind: 'client',
        assigneeClientMembershipId: other.clientMembershipId,
      });
    expect(wellFormed.status).toBe(403);
    expect(wellFormed.body.message).toBe(COPY.clientCannotCreate);
    expect(wellFormed.body.message).not.toBe(COPY.createForbidden);

    const empty = await request(server())
      .post(`/api/organizations/${admin.organizationId}/requests`)
      .set('Cookie', contact.cookies)
      .send({});
    expect(empty.status).toBe(403);
    expect(empty.body.message).toBe(COPY.clientCannotCreate);

    expect(await prisma.request.count()).toBe(0);
  });

  // TC-03-INT-15
  it('requires a project on a client-addressed request and leaves it optional otherwise', async () => {
    const admin = await signupAdmin('admin15@acme.test', 'Acme Fifteen');
    const clientId = await createClient(admin, 'Acme Client');
    const projectId = await createProject(admin, 'Acme Redesign', clientId);
    await assignProject(admin, projectId, [admin.membershipId]);
    const contact = await inviteAndAccept(admin, clientId, 'dana15@acme.example');
    const clientTopic = await topicId(admin.organizationId, 'client', 'Access');
    const staffTopic = await topicId(admin.organizationId, 'staff', 'VPN');

    const noProject = await createRequest(admin, {
      topicId: clientTopic,
      title: 'Warehouse access',
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.clientMembershipId,
    });
    expect(noProject.status).toBe(400);
    expect(noProject.body.fields.projectId).toBe(COPY.clientProjectRequired);

    const withProject = await createRequest(admin, {
      topicId: clientTopic,
      title: 'Warehouse access',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.clientMembershipId,
    });
    expect(withProject.status).toBe(201);

    const toMember = await createRequest(admin, {
      topicId: staffTopic,
      title: 'VPN please',
      assigneeKind: 'member',
      assigneeMembershipId: admin.membershipId,
    });
    expect(toMember.status).toBe(201);
  });

  // TC-03-INT-16
  it('refuses a project that does not belong to the addressee client, saying nothing more', async () => {
    const admin = await signupAdmin('admin16@acme.test', 'Acme Sixteen');
    const firstClient = await createClient(admin, 'First Client');
    const secondClient = await createClient(admin, 'Second Client');
    const firstProject = await createProject(admin, 'First Project', firstClient);
    const secondProject = await createProject(admin, 'Second Project', secondClient);
    const unlinked = await createProject(admin, 'Unlinked Project', null);
    await assignProject(admin, firstProject, [admin.membershipId]);
    await assignProject(admin, secondProject, [admin.membershipId]);
    await assignProject(admin, unlinked, [admin.membershipId]);
    const contact = await inviteAndAccept(admin, firstClient, 'dana16@acme.example');
    const clientTopic = await topicId(admin.organizationId, 'client', 'Access');

    const wrongClient = await createRequest(admin, {
      topicId: clientTopic,
      title: 'Warehouse access',
      projectId: secondProject,
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.clientMembershipId,
    });
    expect(wrongClient.status).toBe(400);
    expect(wrongClient.body.fields.projectId).toBe(COPY.clientProjectMismatch);

    const noClientLink = await createRequest(admin, {
      topicId: clientTopic,
      title: 'Warehouse access',
      projectId: unlinked,
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.clientMembershipId,
    });
    expect(noClientLink.status).toBe(400);
    expect(noClientLink.body.fields.projectId).toBe(COPY.clientProjectMismatch);

    expect(await prisma.request.count()).toBe(0);
  });

  // TC-03-INT-17
  it('requires the requester to work on the project, carving out no admin', async () => {
    const admin = await signupAdmin('admin17@acme.test', 'Acme Seventeen');
    const clientId = await createClient(admin, 'Acme Client');
    const projectId = await createProject(admin, 'Acme Redesign', clientId);
    const contact = await inviteAndAccept(admin, clientId, 'dana17@acme.example');
    const clientTopic = await topicId(admin.organizationId, 'client', 'Access');
    const user = await createMember(admin.organizationId, {
      email: 'user17@acme.test',
      role: 'user',
    });

    const body = {
      topicId: clientTopic,
      title: 'Warehouse access',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.clientMembershipId,
    };

    const unassignedUser = await createRequest(user, body);
    expect(unassignedUser.status).toBe(400);
    expect(unassignedUser.body.fields.projectId).toBe(COPY.notOnProject);

    const unassignedAdmin = await createRequest(admin, body);
    expect(unassignedAdmin.status).toBe(400);
    expect(unassignedAdmin.body.fields.projectId).toBe(COPY.notOnProject);

    await assignProject(admin, projectId, [admin.membershipId]);
    const assignedAdmin = await createRequest(admin, body);
    expect(assignedAdmin.status).toBe(201);
  });

  // TC-03-INT-18
  it('decides all four audience cells, and refuses an archived topic by the other sentence', async () => {
    const admin = await signupAdmin('admin18@acme.test', 'Acme Eighteen');
    const clientId = await createClient(admin, 'Acme Client');
    const projectId = await createProject(admin, 'Acme Redesign', clientId);
    await assignProject(admin, projectId, [admin.membershipId]);
    const contact = await inviteAndAccept(admin, clientId, 'dana18@acme.example');
    const clientTopic = await topicId(admin.organizationId, 'client', 'Access');
    const staffTopic = await topicId(admin.organizationId, 'staff', 'VPN');

    const staffToMember = await createRequest(admin, {
      topicId: staffTopic,
      title: 'VPN please',
      assigneeKind: 'member',
      assigneeMembershipId: admin.membershipId,
    });
    expect(staffToMember.status).toBe(201);

    const staffToClient = await createRequest(admin, {
      topicId: staffTopic,
      title: 'Warehouse access',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.clientMembershipId,
    });
    expect(staffToClient.status).toBe(400);
    expect(staffToClient.body.fields.topicId).toBe(COPY.topicAudienceMismatch);

    const clientToMember = await createRequest(admin, {
      topicId: clientTopic,
      title: 'VPN please',
      assigneeKind: 'member',
      assigneeMembershipId: admin.membershipId,
    });
    expect(clientToMember.status).toBe(400);
    expect(clientToMember.body.fields.topicId).toBe(COPY.topicAudienceMismatch);

    const clientToClient = await createRequest(admin, {
      topicId: clientTopic,
      title: 'Warehouse access',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.clientMembershipId,
    });
    expect(clientToClient.status).toBe(201);

    expect(await prisma.request.count()).toBe(2);

    await prisma.requestTopic.update({
      where: { id: clientTopic },
      data: { status: 'archived', archivedAt: new Date() },
    });
    const archived = await createRequest(admin, {
      topicId: clientTopic,
      title: 'Warehouse access',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.clientMembershipId,
    });
    expect(archived.status).toBe(400);
    expect(archived.body.fields.topicId).toBe(COPY.topicUnavailable);
  });

  // TC-03-INT-19
  it('gives a contact their own request and answers 404 for every other', async () => {
    const admin = await signupAdmin('admin19@acme.test', 'Acme Nineteen');
    const clientId = await createClient(admin, 'Acme Client');
    const projectId = await createProject(admin, 'Acme Redesign', clientId);
    await assignProject(admin, projectId, [admin.membershipId]);
    const contactA = await inviteAndAccept(admin, clientId, 'dana19@acme.example');
    const contactB = await inviteAndAccept(admin, clientId, 'sam19@acme.example', 'Sam');
    const clientTopic = await topicId(admin.organizationId, 'client', 'Access');
    const staffTopic = await topicId(admin.organizationId, 'staff', 'VPN');

    const toA = await createRequest(admin, {
      topicId: clientTopic,
      title: 'For Dana',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contactA.clientMembershipId,
    });
    expect(toA.status).toBe(201);
    const toB = await createRequest(admin, {
      topicId: clientTopic,
      title: 'For Sam',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contactB.clientMembershipId,
    });
    expect(toB.status).toBe(201);
    const staffOnly = await createRequest(admin, {
      topicId: staffTopic,
      title: 'Between colleagues',
      assigneeKind: 'member',
      assigneeMembershipId: admin.membershipId,
    });
    expect(staffOnly.status).toBe(201);

    const own = await getRequest(contactA.cookies, admin.organizationId, toA.body.id);
    expect(own.status).toBe(200);
    expect(own.body.request.assignee).toMatchObject({
      kind: 'client',
      id: contactA.clientMembershipId,
      displayName: 'Dana Stone',
      clientName: 'Acme Client',
      inactive: false,
    });
    expect(JSON.stringify(own.body)).not.toContain('dana19@acme.example');
    expect(own.body.messages).toBeDefined();
    expect(own.body.events.length).toBeGreaterThan(0);

    expect((await getRequest(contactA.cookies, admin.organizationId, toB.body.id)).status).toBe(
      404,
    );
    expect(
      (await getRequest(contactA.cookies, admin.organizationId, staffOnly.body.id)).status,
    ).toBe(404);
  });

  // TC-03-INT-20
  it('lets the addressee contact answer, and nobody else', async () => {
    const admin = await signupAdmin('admin20@acme.test', 'Acme Twenty');
    const clientId = await createClient(admin, 'Acme Client');
    const projectId = await createProject(admin, 'Acme Redesign', clientId);
    // The requester is a plain member: an admin is allowed to act for the addressee
    // (spec 01 requirement 23), so the actor guard is only observable on somebody who
    // holds no such carve-out.
    const requester = await createMember(admin.organizationId, {
      email: 'user20@acme.test',
      role: 'user',
    });
    await assignProject(admin, projectId, [requester.membershipId]);
    const contact = await inviteAndAccept(admin, clientId, 'dana20@acme.example');
    const clientTopic = await topicId(admin.organizationId, 'client', 'Access');

    const raised = await createRequest(requester, {
      topicId: clientTopic,
      title: 'Warehouse access',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.clientMembershipId,
    });
    expect(raised.status).toBe(201);
    const requestId = raised.body.id as string;

    const byRequester = await act(requester.cookies, admin.organizationId, requestId, 'answer');
    expect(byRequester.status).toBe(403);
    expect(byRequester.body.message).toBe(COPY.notYoursToAnswer);

    const byContact = await act(contact.cookies, admin.organizationId, requestId, 'answer');
    expect(byContact.status).toBe(200);

    const row = await prisma.request.findUniqueOrThrow({ where: { id: requestId } });
    expect(row.status).toBe('answered');
    expect(row.answeredAt).not.toBeNull();
    const statusEvents = await prisma.requestEvent.findMany({
      where: { requestId, action: 'status_changed' },
    });
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0].actorKind).toBe('client');
    expect(statusEvents[0].actorClientMembershipId).toBe(contact.clientMembershipId);

    expect(
      (await act(requester.cookies, admin.organizationId, requestId, 'cancel')).status,
    ).toBe(200);
    const afterCancel = await act(contact.cookies, admin.organizationId, requestId, 'answer');
    expect(afterCancel.status).toBe(409);
    expect(afterCancel.body.message).toBe(COPY.alreadyTerminal);
  });

  // TC-03-INT-21
  it('lets the addressee contact decline with a reason, and nobody else', async () => {
    const admin = await signupAdmin('admin21@acme.test', 'Acme TwentyOne');
    const clientId = await createClient(admin, 'Acme Client');
    const projectId = await createProject(admin, 'Acme Redesign', clientId);
    // A plain member again: an admin may decline for the addressee, so the guard this
    // case is about is only observable on a requester who is not one.
    const requester = await createMember(admin.organizationId, {
      email: 'user21@acme.test',
      role: 'user',
    });
    await assignProject(admin, projectId, [requester.membershipId]);
    const contact = await inviteAndAccept(admin, clientId, 'dana21@acme.example');
    const clientTopic = await topicId(admin.organizationId, 'client', 'Access');

    const body = {
      topicId: clientTopic,
      title: 'Warehouse access',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.clientMembershipId,
    };
    const first = await createRequest(requester, body);
    const second = await createRequest(requester, { ...body, title: 'Second request' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const noReason = await act(contact.cookies, admin.organizationId, first.body.id, 'decline', {
      reason: '   ',
    });
    expect(noReason.status).toBe(400);
    expect(noReason.body.fields.reason).toBe(COPY.declineReasonRequired);
    expect(
      (await prisma.request.findUniqueOrThrow({ where: { id: first.body.id } })).status,
    ).toBe('open');

    const declined = await act(contact.cookies, admin.organizationId, first.body.id, 'decline', {
      reason: 'We cannot open that system.',
    });
    expect(declined.status).toBe(200);

    const messages = await prisma.requestMessage.findMany({ where: { requestId: first.body.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe('We cannot open that system.');
    expect(messages[0].authorKind).toBe('client');
    expect(messages[0].authorClientMembershipId).toBe(contact.clientMembershipId);
    expect(
      (await prisma.request.findUniqueOrThrow({ where: { id: first.body.id } })).status,
    ).toBe('declined');

    const byRequester = await act(
      requester.cookies,
      admin.organizationId,
      second.body.id,
      'decline',
      { reason: 'Changed my mind' },
    );
    expect(byRequester.status).toBe(403);
    expect(byRequester.body.message).toBe(COPY.notYoursToDecline);
  });

  // TC-03-INT-22
  it('refuses a contact the grant and lets the requester make it', async () => {
    const admin = await signupAdmin('admin22@acme.test', 'Acme TwentyTwo');
    const clientId = await createClient(admin, 'Acme Client');
    const projectId = await createProject(admin, 'Acme Redesign', clientId);
    await assignProject(admin, projectId, [admin.membershipId]);
    const contact = await inviteAndAccept(admin, clientId, 'dana22@acme.example');
    const clientTopic = await topicId(admin.organizationId, 'client', 'Access');

    const raised = await createRequest(admin, {
      topicId: clientTopic,
      title: 'Warehouse access',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.clientMembershipId,
    });
    const requestId = raised.body.id as string;

    const byContact = await act(contact.cookies, admin.organizationId, requestId, 'grant');
    expect(byContact.status).toBe(403);
    expect(byContact.body.message).toBe(COPY.notYoursToGrant);
    expect((await prisma.request.findUniqueOrThrow({ where: { id: requestId } })).status).toBe(
      'open',
    );

    const byRequester = await act(admin.cookies, admin.organizationId, requestId, 'grant');
    expect(byRequester.status).toBe(200);
    expect((await prisma.request.findUniqueOrThrow({ where: { id: requestId } })).status).toBe(
      'granted',
    );
  });

  // TC-03-INT-23
  it('gives a contact only their own rows for every scope, with no vacation member', async () => {
    const admin = await signupAdmin('admin23@acme.test', 'Acme TwentyThree');
    const clientId = await createClient(admin, 'Acme Client');
    const projectId = await createProject(admin, 'Acme Redesign', clientId);
    await assignProject(admin, projectId, [admin.membershipId]);
    const contactA = await inviteAndAccept(admin, clientId, 'dana23@acme.example');
    const contactB = await inviteAndAccept(admin, clientId, 'sam23@acme.example', 'Sam');
    const clientTopic = await topicId(admin.organizationId, 'client', 'Access');
    const staffTopic = await topicId(admin.organizationId, 'staff', 'VPN');

    const mine = await createRequest(admin, {
      topicId: clientTopic,
      title: 'For Dana',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contactA.clientMembershipId,
    });
    await createRequest(admin, {
      topicId: clientTopic,
      title: 'For Sam',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contactB.clientMembershipId,
    });
    await createRequest(admin, {
      topicId: staffTopic,
      title: 'Between colleagues',
      assigneeKind: 'member',
      assigneeMembershipId: admin.membershipId,
    });

    const list = async (query: string) =>
      request(server())
        .get(`/api/organizations/${admin.organizationId}/requests${query}`)
        .set('Cookie', contactA.cookies);

    for (const query of ['', '?scope=mine', '?scope=all']) {
      const response = await list(query);
      expect(response.status).toBe(200);
      expect(response.body.requests).toHaveLength(1);
      expect(response.body.requests[0].id).toBe(mine.body.id);
      expect(response.body.vacation).toBeUndefined();
      expect(response.body.counts.waitingOnMe).toBe(1);
      expect(response.body.message).not.toBe(COPY.scopeForbidden);
    }

    const unknownScope = await list('?scope=everything');
    expect(unknownScope.status).toBe(400);
    expect(unknownScope.body.error).toBe('validation_error');
    expect(unknownScope.body.fields.scope).toBeDefined();
  });

  // TC-03-INT-31
  it('invalidates the previous pending invitation whichever kind supersedes it', async () => {
    const admin = await signupAdmin('admin31@acme.test', 'Acme ThirtyOne');
    const clientId = await createClient(admin, 'Acme Client');

    expect((await inviteContact(admin, clientId, { email: 'dana31@acme.example' })).status).toBe(
      201,
    );
    const firstToken = tokenFor('dana31@acme.example');

    expect((await inviteContact(admin, clientId, { email: 'dana31@acme.example' })).status).toBe(
      201,
    );
    const staffInvite = await request(server())
      .post('/api/invitations')
      .set('Cookie', admin.cookies)
      .send({ email: 'dana31@acme.example', role: 'user' });
    expect(staffInvite.status).toBe(200);

    const pending = await prisma.invitation.findMany({
      where: { email: 'dana31@acme.example', status: 'pending' },
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].role).toBe('user');

    const stale = await acceptInvite({
      token: firstToken,
      firstName: 'Dana',
      lastName: 'Stone',
      password: 'Passw0rd',
    });
    expect(stale.status).toBe(400);
    expect(stale.body.message).toBe(COPY.tokenInvalid);
  });

  // TC-03-INT-32
  it('tells a missing addressee from an unresolvable one, and both from an inactive one', async () => {
    const admin = await signupAdmin('admin32@acme.test', 'Acme ThirtyTwo');
    const clientId = await createClient(admin, 'Acme Client');
    const projectId = await createProject(admin, 'Acme Redesign', clientId);
    await assignProject(admin, projectId, [admin.membershipId]);
    const clientTopic = await topicId(admin.organizationId, 'client', 'Access');

    const other = await signupAdmin('admin32b@beta.test', 'Beta ThirtyTwo');
    const otherClient = await createClient(other, 'Beta Client');
    const otherContact = await inviteAndAccept(other, otherClient, 'dana32@beta.example');

    const base = {
      topicId: clientTopic,
      title: 'Warehouse access',
      projectId,
      assigneeKind: 'client',
    };

    const missing = await createRequest(admin, base);
    expect(missing.status).toBe(400);
    expect(missing.body.fields.assigneeClientMembershipId).toBe(COPY.assigneeInvalid);

    const crossOrg = await createRequest(admin, {
      ...base,
      assigneeClientMembershipId: otherContact.clientMembershipId,
    });
    expect(crossOrg.status).toBe(404);

    const unknown = await createRequest(admin, {
      ...base,
      assigneeClientMembershipId: '00000000-0000-4000-8000-000000000000',
    });
    expect(unknown.status).toBe(404);
    expect(JSON.stringify(unknown.body)).toBe(JSON.stringify(crossOrg.body));
    expect(JSON.stringify(unknown.body)).not.toContain(COPY.assigneeInactive);

    const wrongIdName = await createRequest(admin, {
      ...base,
      assigneeMembershipId: admin.membershipId,
    });
    expect(wrongIdName.status).toBe(400);
    expect(wrongIdName.body.fields.assigneeClientMembershipId).toBe(COPY.assigneeInvalid);
  });

  // TC-03-INT-33
  it('refuses a removed contact as an addressee with the inactive message', async () => {
    const admin = await signupAdmin('admin33@acme.test', 'Acme ThirtyThree');
    const clientId = await createClient(admin, 'Acme Client');
    const projectId = await createProject(admin, 'Acme Redesign', clientId);
    await assignProject(admin, projectId, [admin.membershipId]);
    const contact = await inviteAndAccept(admin, clientId, 'dana33@acme.example');
    const clientTopic = await topicId(admin.organizationId, 'client', 'Access');

    expect((await removeContact(admin, clientId, contact.clientMembershipId)).status).toBe(200);

    const refused = await createRequest(admin, {
      topicId: clientTopic,
      title: 'Warehouse access',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.clientMembershipId,
    });
    expect(refused.status).toBe(400);
    expect(refused.body.fields.assigneeClientMembershipId).toBe(COPY.assigneeInactive);
    expect(await prisma.request.count()).toBe(0);
  });

  // TC-03-INT-34
  it('reports a removed addressee as inactive and cancels nothing', async () => {
    const admin = await signupAdmin('admin34@acme.test', 'Acme ThirtyFour');
    const clientId = await createClient(admin, 'Acme Client');
    const projectId = await createProject(admin, 'Acme Redesign', clientId);
    await assignProject(admin, projectId, [admin.membershipId]);
    const contact = await inviteAndAccept(admin, clientId, 'dana34@acme.example');
    const clientTopic = await topicId(admin.organizationId, 'client', 'Access');

    const raised = await createRequest(admin, {
      topicId: clientTopic,
      title: 'Warehouse access',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.clientMembershipId,
    });
    expect(raised.status).toBe(201);

    expect((await removeContact(admin, clientId, contact.clientMembershipId)).status).toBe(200);

    const read = await getRequest(admin.cookies, admin.organizationId, raised.body.id);
    expect(read.status).toBe(200);
    expect(read.body.request.status).toBe('open');
    expect(read.body.request.assignee).toMatchObject({
      kind: 'client',
      inactive: true,
      displayName: 'Dana Stone',
      clientName: 'Acme Client',
    });
  });

  // TC-03-INT-35
  it('lets a contact write in the thread while it is open, and refuses a closed one', async () => {
    const admin = await signupAdmin('admin35@acme.test', 'Acme ThirtyFive');
    const clientId = await createClient(admin, 'Acme Client');
    const projectId = await createProject(admin, 'Acme Redesign', clientId);
    await assignProject(admin, projectId, [admin.membershipId]);
    const contact = await inviteAndAccept(admin, clientId, 'dana35@acme.example');
    const clientTopic = await topicId(admin.organizationId, 'client', 'Access');

    const raised = await createRequest(admin, {
      topicId: clientTopic,
      title: 'Warehouse access',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.clientMembershipId,
    });
    const requestId = raised.body.id as string;

    const posted = await request(server())
      .post(`/api/organizations/${admin.organizationId}/requests/${requestId}/messages`)
      .set('Cookie', contact.cookies)
      .send({ body: 'Looking into it now.' });
    expect(posted.status).toBe(201);

    const message = await prisma.requestMessage.findFirstOrThrow({ where: { requestId } });
    expect(message.authorKind).toBe('client');
    expect(message.authorClientMembershipId).toBe(contact.clientMembershipId);
    const events = await prisma.requestEvent.findMany({
      where: { requestId, action: 'message_posted' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].actorKind).toBe('client');

    expect((await act(admin.cookies, admin.organizationId, requestId, 'cancel')).status).toBe(200);

    const afterClose = await request(server())
      .post(`/api/organizations/${admin.organizationId}/requests/${requestId}/messages`)
      .set('Cookie', contact.cookies)
      .send({ body: 'One more thing.' });
    expect(afterClose.status).toBe(409);
    expect(afterClose.body.message).toBe(COPY.threadClosed);
  });
});
