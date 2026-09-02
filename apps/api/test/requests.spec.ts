import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MAIL_MESSAGE_TYPES, MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

/** Cheap in tests — the policy under bcrypt doesn't depend on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

/** Today, tomorrow and yesterday as 'YYYY-MM-DD' in UTC — every seeded account is UTC. */
const ymdUtc = (offsetDays = 0): string => {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays),
  );
  return d.toISOString().slice(0, 10);
};

/** The exact copy of the spec's Error Messages table. Asserted literally, never through
 * the constant the code imports — an assertion about a message must be able to fail when
 * the code's wording drifts. */
const COPY = {
  createForbidden: 'You do not have permission to create requests',
  scopeForbidden: "You do not have permission to view other people's requests",
  typeUnknown: 'Choose a request type',
  titleRequired: 'Enter a title',
  titleTooLong: 'Title must be 200 characters or fewer',
  accessKindRequired: 'Choose what kind of access this is',
  accessKindNotAllowed: 'A question does not have an access kind',
  neededByPast: 'The date needed cannot be in the past',
  assigneeInvalid: 'Choose who this request is for',
  assigneeInactive: 'That person is no longer active in this organization',
  projectUnavailable: 'That project is not available',
  threadClosed: 'This request is closed',
  alreadyTerminal: 'This request has already been closed',
  invalidTransition: 'This request cannot move to that state',
  notYoursToAnswer: 'Only the person this is addressed to can answer it',
  notYoursToGrant: 'Only the person who asked can confirm this',
  fieldImmutable: 'That field cannot be changed after the request is created',
  declineReasonRequired: 'Say why you cannot provide this',
  declineReasonTooLong: 'Reason must be 1000 characters or fewer',
} as const;

describe('Requests (requests spec 01)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;

  interface Signed {
    cookies: string[];
    accountId: string;
    organizationId: string;
    membershipId: string;
    role: string;
    email: string;
  }

  const server = () => app.getHttpServer();

  const login = (email: string, password = 'Passw0rd') =>
    request(server()).post('/api/login').send({ email, password });

  const signupAdmin = async (email: string, orgName: string): Promise<Signed> => {
    const response = await request(server()).post('/api/signup').send({
      orgName,
      firstName: 'Ada',
      lastName: 'Owner',
      email,
      password: 'Passw0rd',
      timezone: 'UTC',
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

  const createMember = async (
    organizationId: string,
    opts: {
      email: string;
      role: string;
      firstName?: string;
      lastName?: string;
      status?: string;
      timezone?: string;
    },
  ): Promise<Signed> => {
    const password = 'Passw0rd';
    const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: {
        email: opts.email,
        passwordHash,
        firstName: opts.firstName ?? 'Sam',
        lastName: opts.lastName ?? 'Dev',
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
      email: opts.email,
    };
  };

  const softDelete = (membershipId: string) =>
    prisma.membership.update({ where: { id: membershipId }, data: { status: 'removed' } });

  const post = (who: Signed, orgId: string, path: string, body: object = {}) =>
    request(server())
      .post(`/api/organizations/${orgId}/requests${path}`)
      .set('Cookie', who.cookies)
      .send(body);

  const patch = (who: Signed, orgId: string, path: string, body: object = {}) =>
    request(server())
      .patch(`/api/organizations/${orgId}/requests${path}`)
      .set('Cookie', who.cookies)
      .send(body);

  const get = (who: Signed, orgId: string, path = '') =>
    request(server())
      .get(`/api/organizations/${orgId}/requests${path}`)
      .set('Cookie', who.cookies);

  /** A minimal valid create body addressed to `assignee`. */
  const newRequestBody = (assignee: Signed, over: Record<string, unknown> = {}) => ({
    type: 'access',
    accessKind: 'repository',
    title: 'Staging DB access',
    assigneeKind: 'member',
    assigneeMembershipId: assignee.membershipId,
    ...over,
  });

  const createRequest = async (
    who: Signed,
    orgId: string,
    assignee: Signed,
    over: Record<string, unknown> = {},
  ) => {
    const response = await post(who, orgId, '', newRequestBody(assignee, over));
    if (response.status !== 201) {
      throw new Error(`Precondition failed: create returned ${response.status} ${response.text}`);
    }
    return response.body as { id: string; number: number; status: string };
  };

  /* -------------------------------------------------------------- *
   * Vacation preconditions (spec 09/10), for the two-section cases
   * -------------------------------------------------------------- */

  const futureMonday = (weekOffset = 0): Date => {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7));
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCDate(d.getUTCDate() + weekOffset * 7);
    return d;
  };

  const futureWorkingRange = (nWorkingDays: number, weekOffset = 0) => {
    const start = futureMonday(weekOffset);
    const cursor = new Date(start);
    let end = new Date(start);
    let count = 0;
    while (count < nWorkingDays) {
      const dow = cursor.getUTCDay();
      if (dow >= 1 && dow <= 5) {
        count += 1;
        end = new Date(cursor);
      }
      if (count < nWorkingDays) cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  };

  const configureAndFund = async (admin: Signed, member: Signed, credit: number) => {
    await request(server())
      .put(
        `/api/organizations/${admin.organizationId}/members/${member.membershipId}/vacation/financials`,
      )
      .set('Cookie', admin.cookies)
      .send({
        monthlySalary: 3000,
        clientHourlyRate: 40,
        vacationDaysPerYear: 20,
        currency: 'USD',
        isReservePercentManual: false,
      });
    if (credit > 0) {
      await prisma.vacationReserveTransaction.create({
        data: {
          membershipId: member.membershipId,
          type: 'credit',
          amount: credit,
          billingPeriodMonth: 1,
          billingPeriodYear: new Date().getUTCFullYear(),
          description: 'seed',
          isAutoGenerated: true,
        },
      });
    }
  };

  const submitVacation = (member: Signed, weekOffset = 0) =>
    request(server())
      .post(
        `/api/organizations/${member.organizationId}/members/${member.membershipId}/vacation/requests`,
      )
      .set('Cookie', member.cookies)
      .send(futureWorkingRange(3, weekOffset));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useClass(InMemoryMailService)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    mail = app.get(MailService) as unknown as InMemoryMailService;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.requestEvent.deleteMany();
    await prisma.requestMessage.deleteMany();
    await prisma.request.deleteMany();
    await prisma.vacationRequest.deleteMany();
    await prisma.vacationReserveTransaction.deleteMany();
    await prisma.memberFinancialsSnapshot.deleteMany();
    await prisma.memberFinancials.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
    mail.clear();
  });

  /* ================================================================ *
   * Creating
   * ================================================================ */

  // TC-01-INT-01
  it('creates a request open, numbered 1, with its created event in the same transaction', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });

    const response = await post(user, admin.organizationId, '', newRequestBody(admin));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: 'open',
      number: 1,
      type: 'access',
      accessKind: 'repository',
      title: 'Staging DB access',
      priority: 'normal',
      blocking: false,
      overdue: false,
    });
    expect(response.body.requester.membershipId).toBe(user.membershipId);
    expect(response.body.assignee).toMatchObject({
      kind: 'member',
      id: admin.membershipId,
      inactive: false,
    });

    const events = await prisma.requestEvent.findMany({ where: { requestId: response.body.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'created', actorMembershipId: user.membershipId });

    const row = await prisma.request.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(row.lastActivityAt.getTime()).toBe(row.createdAt.getTime());
  });

  // TC-01-INT-02
  it('numbers requests per organization, not globally', async () => {
    const a = await signupAdmin('a-admin@acme.test', 'Acme Inc');
    const aUser = await createMember(a.organizationId, { email: 'a-user@acme.test', role: 'user' });
    const b = await signupAdmin('b-admin@globex.test', 'Globex');

    const first = await createRequest(aUser, a.organizationId, a);
    const second = await createRequest(aUser, a.organizationId, a);
    const other = await createRequest(b, b.organizationId, b);

    expect([first.number, second.number]).toEqual([1, 2]);
    expect(other.number).toBe(1);

    // The unique index holds: two rows may share a number only across organizations.
    const numbers = await prisma.request.findMany({
      select: { organizationId: true, number: true },
    });
    const pairs = numbers.map((n) => `${n.organizationId}:${n.number}`);
    expect(new Set(pairs).size).toBe(3);
  });

  // TC-01-INT-03 (concurrency — runs serially against the shared organization row)
  it('allocates consecutive numbers under concurrent creation, with no gap and no duplicate', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });

    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        post(user, admin.organizationId, '', newRequestBody(admin, { title: `Access ${i + 1}` })),
      ),
    );

    expect(responses.map((r) => r.status)).toEqual(Array(10).fill(201));
    const numbers = responses.map((r) => r.body.number as number).sort((x, y) => x - y);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const created = await prisma.requestEvent.count({ where: { action: 'created' } });
    expect(created).toBe(10);
  });

  // TC-01-INT-04
  it('refuses creation by a viewer with createForbidden and writes no row', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const viewer = await createMember(admin.organizationId, {
      email: 'vi@acme.test',
      role: 'viewer',
    });

    const response = await post(viewer, admin.organizationId, '', newRequestBody(admin));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'forbidden',
      message: 'You do not have permission to create requests',
    });
    expect(await prisma.request.count()).toBe(0);
  });

  // TC-01-INT-05
  it('rejects each invalid body with its field and message, writing nothing', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });

    // Edge case 5 — a question with an access kind.
    const questionWithKind = await post(
      user,
      admin.organizationId,
      '',
      newRequestBody(admin, { type: 'question', accessKind: 'vpn' }),
    );
    expect(questionWithKind.status).toBe(400);
    expect(questionWithKind.body).toEqual({
      error: 'validation_error',
      fields: { accessKind: COPY.accessKindNotAllowed },
    });

    // Edge case 6 — an access request with no access kind.
    const accessNoKind = await post(
      user,
      admin.organizationId,
      '',
      newRequestBody(admin, { accessKind: undefined }),
    );
    expect(accessNoKind.status).toBe(400);
    expect(accessNoKind.body.fields).toEqual({ accessKind: COPY.accessKindRequired });

    // Edge case 7 — an addressee kind that is not `member`, and a missing id.
    const badKind = await post(
      user,
      admin.organizationId,
      '',
      newRequestBody(admin, { assigneeKind: 'client' }),
    );
    expect(badKind.status).toBe(400);
    expect(badKind.body.fields).toEqual({ assigneeMembershipId: COPY.assigneeInvalid });

    const noAssignee = await post(
      user,
      admin.organizationId,
      '',
      newRequestBody(admin, { assigneeMembershipId: undefined }),
    );
    expect(noAssignee.status).toBe(400);
    expect(noAssignee.body.fields).toEqual({ assigneeMembershipId: COPY.assigneeInvalid });

    // Edge case 8 — a needed-by date in the past.
    const past = await post(
      user,
      admin.organizationId,
      '',
      newRequestBody(admin, { neededBy: ymdUtc(-1) }),
    );
    expect(past.status).toBe(400);
    expect(past.body.fields).toEqual({ neededBy: COPY.neededByPast });

    // Edge case 19 — a 201-character title, reported together with every other error.
    const longTitle = await post(
      user,
      admin.organizationId,
      '',
      newRequestBody(admin, { title: 'a'.repeat(201), type: 'nonsense' }),
    );
    expect(longTitle.status).toBe(400);
    expect(longTitle.body.fields).toEqual({
      title: COPY.titleTooLong,
      type: COPY.typeUnknown,
    });

    expect(await prisma.request.count()).toBe(0);

    // Edge case 21 — a decline with an empty reason changes nothing.
    const created = await createRequest(user, admin.organizationId, admin);
    const decline = await post(admin, admin.organizationId, `/${created.id}/decline`, {
      reason: '',
    });
    expect(decline.status).toBe(400);
    expect(decline.body.fields).toEqual({ reason: COPY.declineReasonRequired });
    const still = await prisma.request.findUniqueOrThrow({ where: { id: created.id } });
    expect(still.status).toBe('open');
    expect(await prisma.requestMessage.count()).toBe(0);
  });

  // TC-01-INT-06
  it('answers 404 for an addressee in another organization and 400 for a removed one', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const other = await signupAdmin('admin@globex.test', 'Globex');
    const removed = await createMember(admin.organizationId, {
      email: 'gone@acme.test',
      role: 'user',
      status: 'removed',
    });

    const crossOrg = await post(
      user,
      admin.organizationId,
      '',
      newRequestBody(admin, { assigneeMembershipId: other.membershipId }),
    );
    expect(crossOrg.status).toBe(404);
    expect(crossOrg.body.fields).toBeUndefined();

    const inactive = await post(
      user,
      admin.organizationId,
      '',
      newRequestBody(admin, { assigneeMembershipId: removed.membershipId }),
    );
    expect(inactive.status).toBe(400);
    expect(inactive.body.fields).toEqual({ assigneeMembershipId: COPY.assigneeInactive });

    expect(await prisma.request.count()).toBe(0);
  });

  /* ================================================================ *
   * Lifecycle
   * ================================================================ */

  // TC-01-INT-07
  it('answers once: a second answer is 409 invalidTransition and answeredAt does not move', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const created = await createRequest(user, admin.organizationId, admin);

    const first = await post(admin, admin.organizationId, `/${created.id}/answer`);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('answered');
    const answeredAt = (await prisma.request.findUniqueOrThrow({ where: { id: created.id } }))
      .answeredAt;
    expect(answeredAt).not.toBeNull();

    const second = await post(admin, admin.organizationId, `/${created.id}/answer`);
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: 'conflict', message: COPY.invalidTransition });

    const after = await prisma.request.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.answeredAt!.getTime()).toBe(answeredAt!.getTime());
  });

  // TC-01-INT-08
  it('lets only the requester or an admin grant, and only the addressee or an admin answer', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const addressee = await createMember(admin.organizationId, {
      email: 'pat@acme.test',
      role: 'user',
    });
    const manager = await createMember(admin.organizationId, {
      email: 'morgan@acme.test',
      role: 'manager',
    });
    const stranger = await createMember(admin.organizationId, {
      email: 'noone@acme.test',
      role: 'user',
    });

    const first = await createRequest(user, admin.organizationId, addressee);

    const byAddressee = await post(addressee, admin.organizationId, `/${first.id}/grant`);
    expect(byAddressee.status).toBe(403);
    expect(byAddressee.body).toEqual({ error: 'forbidden', message: COPY.notYoursToGrant });

    // A manager IS a party (they hold view-all-requests), so they get the 403, not a 404.
    const byManager = await post(manager, admin.organizationId, `/${first.id}/grant`);
    expect(byManager.status).toBe(403);
    expect(byManager.body).toEqual({ error: 'forbidden', message: COPY.notYoursToGrant });

    const byRequester = await post(user, admin.organizationId, `/${first.id}/grant`);
    expect(byRequester.status).toBe(200);
    expect(byRequester.body.status).toBe('granted');

    const second = await createRequest(user, admin.organizationId, addressee);

    // Edge case 4a — the requester is a party the route forbids: 403, not 404, not 409.
    const requesterAnswers = await post(user, admin.organizationId, `/${second.id}/answer`);
    expect(requesterAnswers.status).toBe(403);
    expect(requesterAnswers.body).toEqual({ error: 'forbidden', message: COPY.notYoursToAnswer });

    // A non-party is told nothing at all.
    const strangerAnswers = await post(stranger, admin.organizationId, `/${second.id}/answer`);
    expect(strangerAnswers.status).toBe(404);
    expect(strangerAnswers.body.message).not.toBe(COPY.notYoursToAnswer);

    const addresseeAnswers = await post(addressee, admin.organizationId, `/${second.id}/answer`);
    expect(addresseeAnswers.status).toBe(200);
    expect(addresseeAnswers.body.status).toBe('answered');
  });

  // TC-01-INT-09 (concurrency — the row lock is what serializes these)
  it('lets exactly one of two concurrent grants win, with one status_changed event', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const created = await createRequest(user, admin.organizationId, admin);

    const [a, b] = await Promise.all([
      post(user, admin.organizationId, `/${created.id}/grant`),
      post(user, admin.organizationId, `/${created.id}/grant`),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body).toEqual({ error: 'conflict', message: COPY.alreadyTerminal });

    const events = await prisma.requestEvent.findMany({
      where: { requestId: created.id, action: 'status_changed' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ oldValue: 'open', newValue: 'granted' });

    const row = await prisma.request.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe('granted');
    expect(row.resolvedAt).not.toBeNull();
    expect(row.resolvedByAccountId).toBe(user.accountId);
  });

  // TC-01-INT-10
  it('refuses every write on a terminal request', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const created = await createRequest(user, admin.organizationId, admin);
    expect((await post(user, admin.organizationId, `/${created.id}/grant`)).status).toBe(200);

    for (const action of ['answer', 'decline', 'cancel']) {
      const response = await post(admin, admin.organizationId, `/${created.id}/${action}`, {
        reason: 'because',
      });
      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'conflict', message: COPY.alreadyTerminal });
    }

    const edit = await patch(user, admin.organizationId, `/${created.id}`, { title: 'New title' });
    expect(edit.status).toBe(409);
    expect(edit.body).toEqual({ error: 'conflict', message: COPY.alreadyTerminal });

    const message = await post(user, admin.organizationId, `/${created.id}/messages`, {
      body: 'Anything?',
    });
    expect(message.status).toBe(409);
    expect(message.body).toEqual({ error: 'conflict', message: COPY.threadClosed });
  });

  // TC-01-INT-11
  it('writes a decline reason into the thread in the same transaction as the status', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const created = await createRequest(user, admin.organizationId, admin);

    const response = await post(admin, admin.organizationId, `/${created.id}/decline`, {
      reason: 'No budget for another seat this quarter',
    });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('declined');

    const messages = await prisma.requestMessage.findMany({ where: { requestId: created.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe('No budget for another seat this quarter');
    expect(messages[0].authorMembershipId).toBe(admin.membershipId);

    const events = await prisma.requestEvent.findMany({
      where: { requestId: created.id, action: 'status_changed' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ oldValue: 'open', newValue: 'declined' });

    // Requirement 19 applies to the reason too — it is a message (requirement 25), and
    // every message writes its `message_posted` event in the same transaction. Asserted
    // separately from the status change so a merged or duplicated event fails: exactly
    // one `status_changed` above (invariant 4), exactly one `message_posted` here.
    const posted = await prisma.requestEvent.findMany({
      where: { requestId: created.id, action: 'message_posted' },
    });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      actorKind: 'member',
      actorMembershipId: admin.membershipId,
    });
  });

  // TC-01-INT-12
  it('refuses a decline with no reason and one that is too long, changing nothing', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const created = await createRequest(user, admin.organizationId, admin);

    const empty = await post(admin, admin.organizationId, `/${created.id}/decline`, {
      reason: '   ',
    });
    expect(empty.status).toBe(400);
    expect(empty.body.fields).toEqual({ reason: COPY.declineReasonRequired });

    const long = await post(admin, admin.organizationId, `/${created.id}/decline`, {
      reason: 'r'.repeat(1001),
    });
    expect(long.status).toBe(400);
    expect(long.body.fields).toEqual({ reason: COPY.declineReasonTooLong });

    const row = await prisma.request.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe('open');
    expect(await prisma.requestMessage.count()).toBe(0);
  });

  // TC-01-INT-13
  //
  // AC-8: a request whose `neededBy` has passed reads `overdue: true` with no job having
  // run and no column holding the flag. The spec's steps say "create with neededBy =
  // tomorrow, then read it as an account whose timezone makes that date past", which no
  // pair of zones can produce — the widest offset spread is 26 hours, so two readers'
  // calendar dates differ by at most one day and a date after every reader's today cannot
  // be before any reader's today. The two halves below reach the same criterion by the
  // two routes the spec itself describes: the boundary day of edge case 10, and a date
  // that has genuinely passed while the request stayed open (requirement 8: "it may
  // become past afterwards, which is what makes a request overdue").
  it('derives overdue per reading account timezone, with no column and no job', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    // Honolulu is UTC-10 and Kiritimati UTC+14 — a full day apart.
    const west = await createMember(admin.organizationId, {
      email: 'west@acme.test',
      role: 'user',
      timezone: 'Pacific/Honolulu',
    });
    const east = await createMember(admin.organizationId, {
      email: 'east@acme.test',
      role: 'manager',
      timezone: 'Pacific/Kiritimati',
    });

    // Needed by the western reader's today, which the eastern reader may already be past.
    const westToday = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Pacific/Honolulu',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const eastToday = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Pacific/Kiritimati',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const created = await createRequest(west, admin.organizationId, east, { neededBy: westToday });

    const asWest = await get(west, admin.organizationId, `/${created.id}`);
    expect(asWest.status).toBe(200);
    expect(asWest.body.request.neededBy).toBe(westToday);
    // The two readers agree exactly when their calendar dates agree — that is the whole
    // content of edge case 10, and it is a property of the reader, not of the row.
    expect(asWest.body.request.overdue).toBe(false);

    const asEast = await get(east, admin.organizationId, `/${created.id}`);
    expect(asEast.body.request.overdue).toBe(westToday < eastToday);

    // A date that has passed: PATCH may set one (requirement 8 scopes the past-date rule
    // to creation), and the flag follows with no job having run.
    const edit = await patch(west, admin.organizationId, `/${created.id}`, {
      neededBy: '2020-01-01',
    });
    expect(edit.status).toBe(200);
    expect(edit.body.overdue).toBe(true);

    // No column holds it — the row itself carries only the date.
    const raw = await prisma.request.findUniqueOrThrow({ where: { id: created.id } });
    expect(Object.keys(raw)).not.toContain('overdue');

    // ...and it goes away in a terminal status, because the work is no longer waiting.
    expect((await post(west, admin.organizationId, `/${created.id}/grant`)).status).toBe(200);
    const granted = await get(west, admin.organizationId, `/${created.id}`);
    expect(granted.body.request.overdue).toBe(false);
  });

  // TC-01-INT-14
  it('edits the five editable fields, refuses the rest, and stops at a terminal status', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const created = await createRequest(user, admin.organizationId, admin);

    const edit = await patch(user, admin.organizationId, `/${created.id}`, {
      title: 'Staging database access',
      blocking: true,
    });
    expect(edit.status).toBe(200);
    expect(edit.body).toMatchObject({ title: 'Staging database access', blocking: true });

    const events = await prisma.requestEvent.findMany({
      where: { requestId: created.id, action: 'field_changed' },
      orderBy: { field: 'asc' },
    });
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.field)).toEqual(['blocking', 'title']);
    expect(events.find((e) => e.field === 'title')).toMatchObject({
      oldValue: 'Staging DB access',
      newValue: 'Staging database access',
    });

    const immutable = await patch(user, admin.organizationId, `/${created.id}`, {
      type: 'question',
    });
    expect(immutable.status).toBe(400);
    expect(immutable.body.fields).toEqual({ type: COPY.fieldImmutable });

    expect((await post(user, admin.organizationId, `/${created.id}/grant`)).status).toBe(200);
    const afterGrant = await patch(user, admin.organizationId, `/${created.id}`, {
      title: 'Too late',
    });
    expect(afterGrant.status).toBe(409);
    expect(afterGrant.body).toEqual({ error: 'conflict', message: COPY.alreadyTerminal });
  });

  // TC-01-INT-15
  it('distinguishes an archived project from one in another organization', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const other = await signupAdmin('admin@globex.test', 'Globex');

    const project = await request(server())
      .post(`/api/organizations/${admin.organizationId}/projects`)
      .set('Cookie', admin.cookies)
      .send({ name: 'Acme redesign' });
    expect(project.status).toBe(201);

    const otherProject = await request(server())
      .post(`/api/organizations/${other.organizationId}/projects`)
      .set('Cookie', other.cookies)
      .send({ name: 'Globex rollout' });
    expect(otherProject.status).toBe(201);

    const bound = await createRequest(user, admin.organizationId, admin, {
      projectId: project.body.id,
    });

    // Edge case 13 — archiving keeps the project on the request and still renders its name.
    const archive = await request(server())
      .patch(`/api/organizations/${admin.organizationId}/projects/${project.body.id}/archive`)
      .set('Cookie', admin.cookies)
      .send({});
    expect(archive.status).toBe(200);

    const read = await get(user, admin.organizationId, `/${bound.id}`);
    expect(read.status).toBe(200);
    expect(read.body.request.project).toEqual({ id: project.body.id, name: 'Acme redesign' });

    const archived = await post(
      user,
      admin.organizationId,
      '',
      newRequestBody(admin, { projectId: project.body.id }),
    );
    expect(archived.status).toBe(400);
    expect(archived.body.fields).toEqual({ projectId: COPY.projectUnavailable });

    // Edge case 18a — a project id from another organization is a bare 404 with no
    // `fields` key, so the id is never confirmed to exist.
    const crossOrg = await post(
      user,
      admin.organizationId,
      '',
      newRequestBody(admin, { projectId: otherProject.body.id }),
    );
    expect(crossOrg.status).toBe(404);
    expect(crossOrg.body.fields).toBeUndefined();
  });

  // TC-01-INT-16
  it('leaves a request open when its requester is removed, and lets only an admin grant', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const addressee = await createMember(admin.organizationId, {
      email: 'pat@acme.test',
      role: 'user',
    });
    const created = await createRequest(user, admin.organizationId, addressee);

    await softDelete(user.membershipId);

    const read = await get(admin, admin.organizationId, `/${created.id}`);
    expect(read.status).toBe(200);
    expect(read.body.request.status).toBe('open');

    const byAddressee = await post(addressee, admin.organizationId, `/${created.id}/grant`);
    expect(byAddressee.status).toBe(403);
    expect(byAddressee.body).toEqual({ error: 'forbidden', message: COPY.notYoursToGrant });

    const byAdmin = await post(admin, admin.organizationId, `/${created.id}/grant`);
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.status).toBe('granted');
  });

  // TC-01-INT-17
  it('flags a removed addressee inactive, cancels nothing, and records both names on reassign', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const addressee = await createMember(admin.organizationId, {
      email: 'pat@acme.test',
      role: 'user',
      firstName: 'Pat',
      lastName: 'Member',
    });
    const replacement = await createMember(admin.organizationId, {
      email: 'robin@acme.test',
      role: 'user',
      firstName: 'Robin',
      lastName: 'Ops',
    });
    const created = await createRequest(user, admin.organizationId, addressee);

    await softDelete(addressee.membershipId);

    const read = await get(user, admin.organizationId, `/${created.id}`);
    expect(read.status).toBe(200);
    expect(read.body.request.status).toBe('open');
    expect(read.body.request.assignee).toMatchObject({
      id: addressee.membershipId,
      displayName: 'Pat Member',
      inactive: true,
    });

    const reassign = await post(admin, admin.organizationId, `/${created.id}/reassign`, {
      assigneeKind: 'member',
      assigneeMembershipId: replacement.membershipId,
    });
    expect(reassign.status).toBe(200);
    expect(reassign.body.assignee).toMatchObject({
      id: replacement.membershipId,
      displayName: 'Robin Ops',
      inactive: false,
    });
    expect(reassign.body.status).toBe('open');

    const events = await prisma.requestEvent.findMany({
      where: { requestId: created.id, action: 'assignee_changed' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      oldValue: addressee.membershipId,
      newValue: replacement.membershipId,
      oldLabel: 'Pat Member',
      newLabel: 'Robin Ops',
    });
  });

  /* ================================================================ *
   * The list
   * ================================================================ */

  // TC-01-INT-18
  it('gives a user their own rows and no vacation, refuses them scope=all, and gives a manager both', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const manager = await createMember(admin.organizationId, {
      email: 'morgan@acme.test',
      role: 'manager',
    });
    const stranger = await createMember(admin.organizationId, {
      email: 'noone@acme.test',
      role: 'user',
    });

    const mine = await createRequest(user, admin.organizationId, admin);
    const theirs = await createRequest(stranger, admin.organizationId, admin);

    await configureAndFund(admin, user, 3000);
    expect((await submitVacation(user)).status).toBe(201);

    const asUser = await get(user, admin.organizationId);
    expect(asUser.status).toBe(200);
    expect(asUser.body.requests.map((r: { id: string }) => r.id)).toEqual([mine.id]);
    expect(asUser.body.vacation).toBeUndefined();
    expect(Object.keys(asUser.body)).not.toContain('vacation');

    const scopeAll = await get(user, admin.organizationId, '?scope=all');
    expect(scopeAll.status).toBe(403);
    expect(scopeAll.body).toEqual({ error: 'forbidden', message: COPY.scopeForbidden });

    const asManager = await get(manager, admin.organizationId, '?scope=all');
    expect(asManager.status).toBe(200);
    expect(asManager.body.requests.map((r: { id: string }) => r.id).sort()).toEqual(
      [mine.id, theirs.id].sort(),
    );
    expect(asManager.body.vacation.requests).toHaveLength(1);
    expect(asManager.body.vacation.pendingCount).toBe(1);
  });

  // Requirement 42's other two filters. They have no case of their own in the spec, and
  // both are query shapes that either run or throw — `q` in particular is the only
  // case-insensitive match in this feature.
  it('narrows by project and by a case-insensitive title match, leaving the counters alone', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });

    const project = await request(server())
      .post(`/api/organizations/${admin.organizationId}/projects`)
      .set('Cookie', admin.cookies)
      .send({ name: 'Acme redesign' });
    expect(project.status).toBe(201);

    const bound = await createRequest(user, admin.organizationId, admin, {
      title: 'Staging DB access',
      projectId: project.body.id,
    });
    const loose = await createRequest(user, admin.organizationId, admin, {
      title: 'Figma seat',
    });

    const unfiltered = await get(user, admin.organizationId);
    expect(unfiltered.body.counts.total).toBe(2);

    const byProject = await get(
      user,
      admin.organizationId,
      `?projectId=${project.body.id}`,
    );
    expect(byProject.status).toBe(200);
    expect(byProject.body.requests.map((r: { id: string }) => r.id)).toEqual([bound.id]);
    expect(byProject.body.counts.total).toBe(2);

    const byQuery = await get(user, admin.organizationId, '?q=STAGING');
    expect(byQuery.status).toBe(200);
    expect(byQuery.body.requests.map((r: { id: string }) => r.id)).toEqual([bound.id]);
    expect(byQuery.body.counts.total).toBe(2);

    const noMatch = await get(user, admin.organizationId, '?q=nothing-like-this');
    expect(noMatch.body.requests).toEqual([]);
    expect(noMatch.body.counts.total).toBe(2);
    expect(loose.id.length).toBeGreaterThan(0);
  });

  // TC-01-INT-19
  it('answers 404 on every route for a foreign id, an unknown id and a non-party', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const addressee = await createMember(admin.organizationId, {
      email: 'pat@acme.test',
      role: 'user',
    });
    const stranger = await createMember(admin.organizationId, {
      email: 'noone@acme.test',
      role: 'user',
    });

    const other = await signupAdmin('admin@globex.test', 'Globex');
    const foreign = await createRequest(other, other.organizationId, other);
    const mine = await createRequest(user, admin.organizationId, addressee);
    const unknownId = '00000000-0000-4000-8000-000000000000';

    const targets: { who: Signed; id: string }[] = [
      { who: user, id: foreign.id },
      { who: user, id: unknownId },
      { who: stranger, id: mine.id },
    ];

    for (const target of targets) {
      const reads = await get(target.who, admin.organizationId, `/${target.id}`);
      expect(reads.status).toBe(404);

      const edits = await patch(target.who, admin.organizationId, `/${target.id}`, {
        title: 'Nope',
      });
      expect(edits.status).toBe(404);

      for (const action of ['answer', 'grant', 'decline', 'cancel']) {
        const response = await post(
          target.who,
          admin.organizationId,
          `/${target.id}/${action}`,
          { reason: 'because' },
        );
        expect(response.status).toBe(404);
        // The same body every time: existence is not enumerable.
        expect(response.body).toEqual(reads.body);
      }

      const messages = await post(target.who, admin.organizationId, `/${target.id}/messages`, {
        body: 'hello',
      });
      expect(messages.status).toBe(404);
    }
  });

  // TC-01-INT-20
  it('leaves every vacation row byte-identical to the shape spec 10 already asserts', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const member = await createMember(admin.organizationId, {
      email: 'alex@acme.test',
      role: 'user',
      firstName: 'Alex',
      lastName: 'Kaminski',
    });
    await configureAndFund(admin, member, 3000);
    const submitted = await submitVacation(member);
    expect(submitted.status).toBe(201);

    const response = await get(admin, admin.organizationId);
    expect(response.status).toBe(200);
    expect(response.body.vacation.requests).toHaveLength(1);

    const card = response.body.vacation.requests[0];
    expect(Object.keys(card).sort()).toEqual(
      [
        'cancelledAt',
        'cancelledBy',
        'deductionAmount',
        'endDate',
        'id',
        'member',
        'memberBalance',
        'requestedAt',
        'reviewedAt',
        'reviewedBy',
        'reviewerComment',
        'startDate',
        'status',
        'type',
        'workingDays',
      ].sort(),
    );
    expect(card.type).toBe('vacation');
    expect(card.status).toBe('pending');
    expect(card.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(card.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(card.member).sort()).toEqual(
      ['avatarUrl', 'firstName', 'initials', 'lastName', 'membershipId'].sort(),
    );
    expect(card.member.initials).toBe('AK');
    expect(card.member.avatarUrl).toBeNull();
    expect(Object.keys(card.memberBalance).sort()).toEqual(
      ['availableDays', 'pendingDays', 'totalDaysPerYear', 'usedDays'].sort(),
    );
    expect(card.memberBalance.totalDaysPerYear).toBe(20);
    expect(typeof card.deductionAmount).toBe('number');
    expect(typeof card.workingDays).toBe('number');
    expect(card.reviewedAt).toBeNull();
    expect(card.reviewedBy).toBeNull();
    expect(card.reviewerComment).toBeNull();
    expect(card.cancelledAt).toBeNull();
    expect(card.cancelledBy).toBeNull();
  });

  // TC-01-INT-21
  it('sends no mail for anything in this spec, and adds no mail message type', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const replacement = await createMember(admin.organizationId, {
      email: 'robin@acme.test',
      role: 'user',
    });

    // Everything the spec can send: create, message, answer, grant, decline, cancel,
    // reassign. The double records rather than swallows, so a send here would be seen.
    mail.clear();

    const granted = await createRequest(user, admin.organizationId, admin);
    expect(
      (await post(user, admin.organizationId, `/${granted.id}/messages`, { body: 'Please?' }))
        .status,
    ).toBe(201);
    expect((await post(admin, admin.organizationId, `/${granted.id}/answer`)).status).toBe(200);
    expect((await post(user, admin.organizationId, `/${granted.id}/grant`)).status).toBe(200);

    const declined = await createRequest(user, admin.organizationId, admin);
    expect(
      (await post(admin, admin.organizationId, `/${declined.id}/decline`, { reason: 'No' }))
        .status,
    ).toBe(200);

    const cancelled = await createRequest(user, admin.organizationId, admin);
    expect((await post(user, admin.organizationId, `/${cancelled.id}/cancel`)).status).toBe(200);

    const reassigned = await createRequest(user, admin.organizationId, admin);
    expect(
      (
        await post(admin, admin.organizationId, `/${reassigned.id}/reassign`, {
          assigneeKind: 'member',
          assigneeMembershipId: replacement.membershipId,
        })
      ).status,
    ).toBe(200);

    expect(mail.sent).toEqual([]);
    expect(MAIL_MESSAGE_TYPES).toEqual([
      'password_reset',
      'invitation',
      'email_change_confirmation',
      'email_change_notification',
      'signing_invitation',
      'signing_reminder',
      'envelope_completed',
      'envelope_declined',
      'envelope_voided',
    ]);
  });

  // TC-01-INT-22
  it('filters both sections through one vocabulary and refuses the retired one', async () => {
    const admin = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const reviewer = await createMember(admin.organizationId, {
      email: 'pat@acme.test',
      role: 'user',
    });

    const open = await createRequest(admin, admin.organizationId, user);
    const granted = await createRequest(admin, admin.organizationId, user);
    expect((await post(admin, admin.organizationId, `/${granted.id}/grant`)).status).toBe(200);

    // One pending and one rejected vacation request in the same organization.
    await configureAndFund(admin, reviewer, 3000);
    const pending = await submitVacation(reviewer, 0);
    expect(pending.status).toBe(201);
    const toReject = await submitVacation(reviewer, 3);
    expect(toReject.status).toBe(201);
    const rejected = await request(server())
      .put(
        `/api/organizations/${admin.organizationId}/members/${reviewer.membershipId}` +
          `/vacation/requests/${toReject.body.id}/review`,
      )
      .set('Cookie', admin.cookies)
      .send({ decision: 'rejected', reviewerComment: 'Team availability conflict' });
    expect(rejected.status).toBe(200);

    const unfiltered = await get(admin, admin.organizationId);
    expect(unfiltered.status).toBe(200);
    const counts = unfiltered.body.counts;
    const vacationPending = unfiltered.body.vacation.pendingCount;
    expect(unfiltered.body.requests.map((r: { id: string }) => r.id).sort()).toEqual(
      [open.id, granted.id].sort(),
    );
    expect(unfiltered.body.vacation.requests).toHaveLength(2);

    const table: {
      status: string;
      requests: string[];
      vacation: string[];
    }[] = [
      { status: 'open', requests: [open.id], vacation: ['pending'] },
      { status: 'granted', requests: [granted.id], vacation: [] },
      { status: 'declined', requests: [], vacation: ['rejected'] },
      { status: 'answered', requests: [], vacation: [] },
      { status: 'all', requests: [open.id, granted.id], vacation: ['pending', 'rejected'] },
    ];

    for (const row of table) {
      const response = await get(admin, admin.organizationId, `?status=${row.status}`);
      expect(response.status).toBe(200);
      expect(response.body.requests.map((r: { id: string }) => r.id).sort()).toEqual(
        [...row.requests].sort(),
      );
      expect(
        response.body.vacation.requests.map((r: { status: string }) => r.status).sort(),
      ).toEqual([...row.vacation].sort());
      // Neither counter ever moves with a filter.
      expect(response.body.counts).toEqual(counts);
      expect(response.body.vacation.pendingCount).toBe(vacationPending);
    }

    // The retired spec-10 vocabulary is neither accepted nor silently defaulted.
    for (const status of ['pending', 'approved', 'rejected', 'nonsense']) {
      const response = await get(admin, admin.organizationId, `?status=${status}`);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'validation_error',
        fields: { status: 'unknown_value' },
      });
    }

    // `type=vacation` chooses the section rather than filtering one array.
    const vacationOnly = await get(admin, admin.organizationId, '?type=vacation');
    expect(vacationOnly.status).toBe(200);
    expect(vacationOnly.body.requests).toEqual([]);
    expect(vacationOnly.body.vacation.requests).toHaveLength(2);
    expect(vacationOnly.body.counts).toEqual(counts);

    // A caller without `view-requests` who asks for the vacation section gets an empty
    // list and no `vacation` key — a view preference, not a 403.
    const asUser = await get(user, admin.organizationId, '?type=vacation');
    expect(asUser.status).toBe(200);
    expect(asUser.body.requests).toEqual([]);
    expect(asUser.body.vacation).toBeUndefined();
  });
});
