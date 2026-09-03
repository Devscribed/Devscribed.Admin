import { readFileSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';
import { RequestTopicsService } from '../src/requests/request-topics.service';

/** Cheap in tests — the policy under bcrypt doesn't depend on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

/**
 * The exact copy of the spec's Error Messages table. Asserted literally, never through
 * the constant the code imports — an assertion about a message must be able to fail when
 * the code's wording drifts.
 */
const COPY = {
  audienceUnknown: 'Choose a valid audience',
  statusUnknown: 'Choose a valid status',
  audienceImmutable: 'A topic cannot change audience after it is created',
  typeUnknown: 'Choose whether this topic is an access or a question',
  typeImmutable: 'A topic cannot change kind after it is created',
  nameRequired: 'Enter a topic name',
  nameTooLong: 'Topic name must be 60 characters or fewer',
  nameDuplicate: 'A topic with this name already exists for this audience',
  sortOrderInvalid: 'Enter a whole number for the order',
  manageForbidden: 'You do not have permission to manage request topics',
  statusUnchanged: 'This topic is already in that state',
  topicRequired: 'Choose what this request is about',
  topicUnavailable: 'That topic is not available',
  topicAudienceMismatch: 'That topic cannot be used for this addressee',
  classifierNotAccepted: 'The request kind is set by the topic and cannot be sent',
  fieldImmutable: 'That field cannot be changed after the request is created',
} as const;

/** The eleven Seed Data rows, in the order the spec's table gives them. */
const SEEDED_STAFF = [
  'VPN',
  'Claude',
  'Repository',
  'Environment',
  'Server',
  'Admin panel',
  'Documentation',
  'Question',
  'Other',
];
const SEEDED_CLIENT = ['Access', 'Other'];

/** The backfill migration this suite executes by path (TC-02-INT-02). */
const BACKFILL_MIGRATION = join(
  __dirname,
  '..',
  'prisma',
  'migrations',
  '20260903120100_requests_02_request_topics_backfill',
  'migration.sql',
);

describe('Request topics (requests spec 02)', () => {
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

  const login = (email: string, password = 'Passw0rd') =>
    request(server()).post('/api/login').send({ email, password });

  const signupAdmin = async (email: string, orgName: string): Promise<Signed> => {
    const response = await request(server()).post('/api/signup').send({
      orgName,
      firstName: 'Pat',
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
    opts: { email: string; role: string; firstName?: string; lastName?: string },
  ): Promise<Signed> => {
    const password = 'Passw0rd';
    const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: {
        email: opts.email,
        passwordHash,
        firstName: opts.firstName ?? 'Sam',
        lastName: opts.lastName ?? 'Dev',
        timezone: 'UTC',
      },
    });
    const membership = await prisma.membership.create({
      data: { accountId: account.id, organizationId, role: opts.role, status: 'active' },
    });
    const cookies = (await login(opts.email)).headers['set-cookie'] as unknown as string[];
    return {
      cookies,
      accountId: account.id,
      organizationId,
      membershipId: membership.id,
      role: opts.role,
      email: opts.email,
    };
  };

  /* -------------------------------------------------------------- *
   * Route helpers. `orgId` is always passed explicitly, because two of the cases below
   * deliberately put another organization's id in the path.
   * -------------------------------------------------------------- */

  const getTopics = (who: Signed, orgId: string, query = '') =>
    request(server())
      .get(`/api/organizations/${orgId}/request-topics${query}`)
      .set('Cookie', who.cookies);

  const postTopic = (who: Signed, orgId: string, body: object) =>
    request(server())
      .post(`/api/organizations/${orgId}/request-topics`)
      .set('Cookie', who.cookies)
      .send(body);

  const patchTopic = (who: Signed, orgId: string, path: string, body: object = {}) =>
    request(server())
      .patch(`/api/organizations/${orgId}/request-topics${path}`)
      .set('Cookie', who.cookies)
      .send(body);

  const postRequest = (who: Signed, orgId: string, body: object) =>
    request(server())
      .post(`/api/organizations/${orgId}/requests`)
      .set('Cookie', who.cookies)
      .send(body);

  const getRequests = (who: Signed, orgId: string, query = '') =>
    request(server())
      .get(`/api/organizations/${orgId}/requests${query}`)
      .set('Cookie', who.cookies);

  const topicIdOf = async (organizationId: string, name: string, audience = 'staff') => {
    const topic = await prisma.requestTopic.findFirstOrThrow({
      where: { organizationId, name, audience },
    });
    return topic.id;
  };

  /** A minimal valid create body: the topic, and no classifier of any kind. */
  const requestBody = (
    assignee: Signed,
    topicId: string,
    over: Record<string, unknown> = {},
  ) => ({
    topicId,
    title: 'VPN profile for the new hire',
    assigneeKind: 'member',
    assigneeMembershipId: assignee.membershipId,
    ...over,
  });

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
    await prisma.requestEvent.deleteMany();
    await prisma.requestMessage.deleteMany();
    await prisma.request.deleteMany();
    await prisma.requestTopic.deleteMany();
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
  });

  /* ================================================================ *
   * The catalogue
   * ================================================================ */

  // TC-02-INT-01
  it('gives a newly signed-up organization the whole seeded catalogue, scoped to itself', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');

    const staff = await getTopics(acme, acme.organizationId, '?audience=staff');
    expect(staff.status).toBe(200);
    expect(staff.body.topics.map((t: { name: string }) => t.name)).toEqual(SEEDED_STAFF);
    expect(staff.body.topics.every((t: { status: string }) => t.status === 'active')).toBe(true);

    const client = await getTopics(acme, acme.organizationId, '?audience=client');
    expect(client.status).toBe(200);
    expect(client.body.topics.map((t: { name: string }) => t.name)).toEqual(SEEDED_CLIENT);

    // Nobody created these, so the audit column is null on every one — observed through
    // the database, because the documented response shape does not carry it.
    const rows = await prisma.requestTopic.findMany({
      where: { organizationId: acme.organizationId },
    });
    expect(rows).toHaveLength(11);
    expect(rows.every((row) => row.createdByAccountId === null)).toBe(true);

    // A second organization sees its own rows and none of the first's.
    const globex = await signupAdmin('admin@globex.test', 'Globex');
    // No `audience` — omitting it returns both audiences, so all eleven.
    const theirs = await getTopics(globex, globex.organizationId);
    expect(theirs.status).toBe(200);
    expect(theirs.body.topics).toHaveLength(11);
    const acmeIds = new Set(rows.map((row) => row.id));
    expect(theirs.body.topics.some((t: { id: string }) => acmeIds.has(t.id))).toBe(false);
  });

  // TC-02-INT-02
  it('backfills an organization that predates the spec, rewriting no request', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const vpn = await topicIdOf(acme.organizationId, 'VPN');

    const created = await postRequest(acme, acme.organizationId, requestBody(acme, vpn));
    expect(created.status).toBe(201);

    // The shape every request raised before this spec has: no topic, no label.
    const legacy = await prisma.request.create({
      data: {
        organizationId: acme.organizationId,
        number: 999,
        type: 'question',
        title: 'Which invoice template?',
        requesterMembershipId: acme.membershipId,
        assigneeKind: 'member',
        assigneeMembershipId: acme.membershipId,
        status: 'open',
        topicId: null,
        topicLabel: null,
      },
    });

    // The state an organization predating this spec is in: rows on Request, none on
    // RequestTopic. Detaching first, because the FK is SetNull and the case is about a
    // label that outlives its topic.
    await prisma.request.updateMany({
      where: { organizationId: acme.organizationId },
      data: { topicId: null },
    });
    await prisma.requestTopic.deleteMany({ where: { organizationId: acme.organizationId } });

    const requestsBefore = await prisma.request.findMany({
      where: { organizationId: acme.organizationId },
      orderBy: { number: 'asc' },
      select: { id: true, type: true, topicLabel: true, updatedAt: true },
    });

    // Executed by its path under prisma/migrations, statement by statement — the harness
    // has applied every migration before this body runs, so this is a second execution
    // and must therefore be safe (the file inserts only where no row exists).
    await runSqlFile(BACKFILL_MIGRATION);

    const catalogue = await getTopics(acme, acme.organizationId, '?status=all');
    expect(catalogue.status).toBe(200);
    expect(catalogue.body.topics).toHaveLength(11);

    const list = await getRequests(acme, acme.organizationId, '?status=all');
    expect(list.status).toBe(200);
    const rows = list.body.requests as {
      id: string;
      type: string;
      topic: {
        id: string | null;
        name: string;
        audience: string | null;
        type: string | null;
        status: string | null;
      } | null;
    }[];

    const withLabel = rows.find((row) => row.id === created.body.id)!;
    // The member is keyed on the label, so a request that has one is never served
    // `topic: null` — even once its `topicId` is gone.
    expect(withLabel.type).toBe('access');
    expect(withLabel.topic).toEqual({
      id: null,
      name: 'VPN',
      audience: null,
      type: null,
      status: null,
    });

    const withoutLabel = rows.find((row) => row.id === legacy.id)!;
    expect(withoutLabel.topic).toBeNull();
    expect(withoutLabel.type).toBe('question');

    // No request row is written by the backfill.
    const requestsAfter = await prisma.request.findMany({
      where: { organizationId: acme.organizationId },
      orderBy: { number: 'asc' },
      select: { id: true, type: true, topicLabel: true, updatedAt: true },
    });
    expect(requestsAfter).toEqual(requestsBefore);

    // Executing it a second time inserts nothing.
    await runSqlFile(BACKFILL_MIGRATION);
    expect(
      await prisma.requestTopic.count({ where: { organizationId: acme.organizationId } }),
    ).toBe(11);
  });

  // TC-02-INT-03
  it('defaults, clamps and refuses sortOrder, and orders the catalogue by it', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');

    const noOrder = await postTopic(acme, acme.organizationId, {
      audience: 'staff',
      type: 'question',
      name: 'Bottom',
    });
    expect(noOrder.status).toBe(201);
    // Ten above the highest seeded staff value, which is 90.
    expect(noOrder.body.topic.sortOrder).toBe(100);

    const low = await postTopic(acme, acme.organizationId, {
      audience: 'staff',
      type: 'question',
      name: 'Top',
      sortOrder: 5,
    });
    expect(low.status).toBe(201);

    const high = await postTopic(acme, acme.organizationId, {
      audience: 'staff',
      type: 'question',
      name: 'Way down',
      sortOrder: 40000,
    });
    expect(high.status).toBe(201);
    expect(high.body.topic.sortOrder).toBe(32767);

    const negative = await postTopic(acme, acme.organizationId, {
      audience: 'staff',
      type: 'question',
      name: 'Way up',
      sortOrder: -5,
    });
    expect(negative.status).toBe(201);
    expect(negative.body.topic.sortOrder).toBe(0);

    // A value that is not an integer is refused, not clamped and not dropped.
    const word = await postTopic(acme, acme.organizationId, {
      audience: 'staff',
      type: 'question',
      name: 'Nope',
      sortOrder: 'top',
    });
    expect(word.status).toBe(400);
    expect(word.body).toEqual({
      error: 'validation_error',
      fields: { sortOrder: COPY.sortOrderInvalid },
    });

    const fraction = await postTopic(acme, acme.organizationId, {
      audience: 'staff',
      type: 'question',
      name: 'Also nope',
      sortOrder: 1.5,
    });
    expect(fraction.status).toBe(400);
    expect(fraction.body.fields).toEqual({ sortOrder: COPY.sortOrderInvalid });

    expect(
      await prisma.requestTopic.count({
        where: { organizationId: acme.organizationId, name: { in: ['Nope', 'Also nope'] } },
      }),
    ).toBe(0);

    const list = await getTopics(acme, acme.organizationId, '?audience=staff');
    const names = list.body.topics.map((t: { name: string }) => t.name);
    expect(names[0]).toBe('Way up');
    expect(names[1]).toBe('Top');
    expect(names[names.length - 1]).toBe('Way down');
    expect(names[names.length - 2]).toBe('Bottom');
    expect(
      list.body.topics.every((t: { status: string }) => t.status === 'active'),
    ).toBe(true);
  });

  // TC-02-INT-04
  it('refuses an unknown audience or type on create, and an unknown query value on read', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const before = await prisma.requestTopic.count();

    const badAudience = await postTopic(acme, acme.organizationId, {
      audience: 'partner',
      type: 'access',
      name: 'Partner access',
    });
    expect(badAudience.status).toBe(400);
    expect(badAudience.body.fields).toEqual({ audience: COPY.audienceUnknown });

    const badType = await postTopic(acme, acme.organizationId, {
      audience: 'staff',
      type: 'vacation',
      name: 'Time off',
    });
    expect(badType.status).toBe(400);
    expect(badType.body.fields).toEqual({ type: COPY.typeUnknown });

    // Both reads refuse rather than returning everything or falling back to `active`, so
    // a typo in a query string cannot look like an empty catalogue.
    const badAudienceRead = await getTopics(acme, acme.organizationId, '?audience=partner');
    expect(badAudienceRead.status).toBe(400);
    expect(badAudienceRead.body.fields).toEqual({ audience: COPY.audienceUnknown });

    const badStatusRead = await getTopics(acme, acme.organizationId, '?status=activ');
    expect(badStatusRead.status).toBe(400);
    expect(badStatusRead.body.fields).toEqual({ status: COPY.statusUnknown });

    expect(await prisma.requestTopic.count()).toBe(before);
  });

  // TC-02-INT-05
  it('holds one name per audience, ignoring case and surrounding whitespace', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');

    const first = await postTopic(acme, acme.organizationId, {
      audience: 'staff',
      type: 'access',
      name: 'Figma seat',
    });
    expect(first.status).toBe(201);

    const duplicate = await postTopic(acme, acme.organizationId, {
      audience: 'staff',
      type: 'access',
      name: '  figma   SEAT ',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toBe(COPY.nameDuplicate);
    expect(
      await prisma.requestTopic.count({
        where: { organizationId: acme.organizationId, audience: 'staff', name: 'Figma seat' },
      }),
    ).toBe(1);

    // Uniqueness is per audience: the same name is free on the other one.
    const otherAudience = await postTopic(acme, acme.organizationId, {
      audience: 'client',
      type: 'access',
      name: 'Figma seat',
    });
    expect(otherAudience.status).toBe(201);
  });

  // TC-02-INT-06
  it('refuses a changed audience or kind before it checks the name, writing nothing', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const vpn = await topicIdOf(acme.organizationId, 'VPN');
    const before = await prisma.requestTopic.findUniqueOrThrow({ where: { id: vpn } });

    const renamed = await patchTopic(acme, acme.organizationId, `/${vpn}`, {
      name: 'VPN access',
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.topic.name).toBe('VPN access');
    expect(new Date(renamed.body.topic.updatedAt).getTime()).toBeGreaterThanOrEqual(
      before.updatedAt.getTime(),
    );

    // The stored audience and the stored kind are accepted and change nothing.
    const sameAudience = await patchTopic(acme, acme.organizationId, `/${vpn}`, {
      audience: 'staff',
    });
    expect(sameAudience.status).toBe(200);
    expect(sameAudience.body.topic.audience).toBe('staff');

    const sameType = await patchTopic(acme, acme.organizationId, `/${vpn}`, { type: 'access' });
    expect(sameType.status).toBe(200);
    expect(sameType.body.topic.type).toBe('access');

    const otherAudience = await patchTopic(acme, acme.organizationId, `/${vpn}`, {
      audience: 'client',
    });
    expect(otherAudience.status).toBe(400);
    expect(otherAudience.body.fields).toEqual({ audience: COPY.audienceImmutable });

    const otherType = await patchTopic(acme, acme.organizationId, `/${vpn}`, {
      type: 'question',
    });
    expect(otherType.status).toBe(400);
    expect(otherType.body.fields).toEqual({ type: COPY.typeImmutable });

    let row = await prisma.requestTopic.findUniqueOrThrow({ where: { id: vpn } });
    expect(row.audience).toBe('staff');
    expect(row.type).toBe('access');

    // Both at once: the immutability refusal is answered before the name-uniqueness one,
    // so this is 400 and not 409, and nothing is written.
    const both = await patchTopic(acme, acme.organizationId, `/${vpn}`, {
      audience: 'client',
      name: 'Claude',
    });
    expect(both.status).toBe(400);
    expect(both.body.fields).toEqual({ audience: COPY.audienceImmutable });

    row = await prisma.requestTopic.findUniqueOrThrow({ where: { id: vpn } });
    expect(row.name).toBe('VPN access');
    expect(row.audience).toBe('staff');
  });

  // TC-02-INT-07
  it('lets every member read the catalogue and only a curator write it', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const user = await createMember(acme.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const viewer = await createMember(acme.organizationId, {
      email: 'vi@acme.test',
      role: 'viewer',
    });
    const manager = await createMember(acme.organizationId, {
      email: 'mo@acme.test',
      role: 'manager',
    });
    const vpn = await topicIdOf(acme.organizationId, 'VPN');

    for (const who of [user, viewer]) {
      const read = await getTopics(who, acme.organizationId);
      expect(read.status).toBe(200);
      expect(read.body.topics).toHaveLength(11);
    }

    const forbidden = [
      await postTopic(user, acme.organizationId, {
        audience: 'staff',
        type: 'access',
        name: 'Sneaky',
      }),
      await patchTopic(user, acme.organizationId, `/${vpn}`, { name: 'Sneaky' }),
      await patchTopic(user, acme.organizationId, `/${vpn}/archive`),
      await patchTopic(user, acme.organizationId, `/${vpn}/restore`),
    ];
    for (const response of forbidden) {
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: 'forbidden',
        message: COPY.manageForbidden,
      });
    }
    const untouched = await prisma.requestTopic.findUniqueOrThrow({ where: { id: vpn } });
    expect(untouched.name).toBe('VPN');
    expect(untouched.status).toBe('active');
    expect(
      await prisma.requestTopic.count({
        where: { organizationId: acme.organizationId, name: 'Sneaky' },
      }),
    ).toBe(0);

    // Every manager write succeeds, so the capability is proven granted as well as
    // withheld. Create, rename, archive, restore on one topic: the one order in which
    // every one of the four is a legal move.
    const created = await postTopic(manager, acme.organizationId, {
      audience: 'staff',
      type: 'question',
      name: 'Manager topic',
    });
    expect(created.status).toBe(201);
    const managed = created.body.topic.id as string;

    expect(
      (await patchTopic(manager, acme.organizationId, `/${managed}`, { name: 'Renamed' })).status,
    ).toBe(200);
    expect((await patchTopic(manager, acme.organizationId, `/${managed}/archive`)).status).toBe(
      200,
    );
    expect((await patchTopic(manager, acme.organizationId, `/${managed}/restore`)).status).toBe(
      200,
    );
  });

  // TC-02-INT-08
  it('archives and restores a topic, moving it between the three reads', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const vpn = await topicIdOf(acme.organizationId, 'VPN');

    const archived = await patchTopic(acme, acme.organizationId, `/${vpn}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.topic.status).toBe('archived');

    // Both audit columns are observed through the database — the documented row shape
    // does not carry them.
    let row = await prisma.requestTopic.findUniqueOrThrow({ where: { id: vpn } });
    expect(row.archivedAt).not.toBeNull();
    expect(row.archivedByAccountId).toBe(acme.accountId);

    const active = await getTopics(acme, acme.organizationId, '?status=active');
    expect(active.body.topics.some((t: { id: string }) => t.id === vpn)).toBe(false);

    const archivedRead = await getTopics(acme, acme.organizationId, '?status=archived');
    expect(archivedRead.body.topics.map((t: { id: string }) => t.id)).toEqual([vpn]);

    const all = await getTopics(acme, acme.organizationId, '?status=all');
    expect(all.body.topics.some((t: { id: string }) => t.id === vpn)).toBe(true);

    const restored = await patchTopic(acme, acme.organizationId, `/${vpn}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.topic.status).toBe('active');

    row = await prisma.requestTopic.findUniqueOrThrow({ where: { id: vpn } });
    expect(row.archivedAt).toBeNull();
    expect(row.archivedByAccountId).toBeNull();

    const activeAgain = await getTopics(acme, acme.organizationId, '?status=active');
    expect(activeAgain.body.topics.some((t: { id: string }) => t.id === vpn)).toBe(true);
  });

  // TC-02-INT-09
  it('refuses a repeated archive or restore rather than repeating it', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const vpn = await topicIdOf(acme.organizationId, 'VPN');

    expect((await patchTopic(acme, acme.organizationId, `/${vpn}/archive`)).status).toBe(200);
    const firstArchivedAt = (
      await prisma.requestTopic.findUniqueOrThrow({ where: { id: vpn } })
    ).archivedAt;

    const again = await patchTopic(acme, acme.organizationId, `/${vpn}/archive`);
    expect(again.status).toBe(409);
    expect(again.body.message).toBe(COPY.statusUnchanged);
    expect(
      (await prisma.requestTopic.findUniqueOrThrow({ where: { id: vpn } })).archivedAt,
    ).toEqual(firstArchivedAt);

    expect((await patchTopic(acme, acme.organizationId, `/${vpn}/restore`)).status).toBe(200);
    const restoredAgain = await patchTopic(acme, acme.organizationId, `/${vpn}/restore`);
    expect(restoredAgain.status).toBe(409);
    expect(restoredAgain.body.message).toBe(COPY.statusUnchanged);
  });

  /* ================================================================ *
   * Raising a request under a topic
   * ================================================================ */

  // TC-02-INT-10
  it('writes the kind from the topic and snapshots its name, which a rename never rewrites', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const vpn = await topicIdOf(acme.organizationId, 'VPN');

    const created = await postRequest(acme, acme.organizationId, requestBody(acme, vpn));
    expect(created.status).toBe(201);
    expect(created.body.type).toBe('access');
    // `null` although the topic's kind is `access`: `accessKind` is written on no new row.
    expect(created.body.accessKind).toBeNull();
    expect(created.body.topic).toEqual({
      id: vpn,
      name: 'VPN',
      audience: 'staff',
      type: 'access',
      status: 'active',
    });

    const row = await prisma.request.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.type).toBe('access');
    expect(row.accessKind).toBeNull();
    expect(row.topicLabel).toBe('VPN');
    expect(row.topicId).toBe(vpn);

    expect(
      (await patchTopic(acme, acme.organizationId, `/${vpn}`, { name: 'VPN access' })).status,
    ).toBe(200);

    const read = await request(server())
      .get(`/api/organizations/${acme.organizationId}/requests/${created.body.id}`)
      .set('Cookie', acme.cookies);
    expect(read.status).toBe(200);
    expect(read.body.request.topic.name).toBe('VPN');

    const catalogue = await getTopics(acme, acme.organizationId, '?audience=staff');
    expect(
      catalogue.body.topics.find((t: { id: string }) => t.id === vpn).name,
    ).toBe('VPN access');
  });

  // TC-02-INT-11
  it('refuses a body carrying the retired classifier rather than accepting it silently', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const vpn = await topicIdOf(acme.organizationId, 'VPN');

    const withType = await postRequest(
      acme,
      acme.organizationId,
      requestBody(acme, vpn, { type: 'access' }),
    );
    expect(withType.status).toBe(400);
    expect(withType.body).toEqual({
      error: 'validation_error',
      fields: { type: COPY.classifierNotAccepted },
    });

    const withKind = await postRequest(
      acme,
      acme.organizationId,
      requestBody(acme, vpn, { accessKind: 'vpn' }),
    );
    expect(withKind.status).toBe(400);
    expect(withKind.body.fields).toEqual({ accessKind: COPY.classifierNotAccepted });

    const withBoth = await postRequest(
      acme,
      acme.organizationId,
      requestBody(acme, vpn, { type: 'access', accessKind: 'vpn' }),
    );
    expect(withBoth.status).toBe(400);
    expect(withBoth.body.fields).toEqual({
      type: COPY.classifierNotAccepted,
      accessKind: COPY.classifierNotAccepted,
    });

    expect(await prisma.request.count({ where: { organizationId: acme.organizationId } })).toBe(
      0,
    );
  });

  // TC-02-INT-12
  it('refuses a client-audience topic on a request addressed to a colleague', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const clientAccess = await topicIdOf(acme.organizationId, 'Access', 'client');
    const vpn = await topicIdOf(acme.organizationId, 'VPN');

    const mismatch = await postRequest(
      acme,
      acme.organizationId,
      requestBody(acme, clientAccess),
    );
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.fields).toEqual({ topicId: COPY.topicAudienceMismatch });
    expect(await prisma.request.count()).toBe(0);

    const ok = await postRequest(acme, acme.organizationId, requestBody(acme, vpn));
    expect(ok.status).toBe(201);
  });

  // TC-02-INT-13
  it('gives one answer to a foreign, an archived and a non-existent topic id', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const globex = await signupAdmin('admin@globex.test', 'Globex');

    const theirs = await topicIdOf(globex.organizationId, 'VPN');
    const claude = await topicIdOf(acme.organizationId, 'Claude');
    expect((await patchTopic(acme, acme.organizationId, `/${claude}/archive`)).status).toBe(200);

    const expected = {
      error: 'validation_error',
      fields: { topicId: COPY.topicUnavailable },
    };

    const foreign = await postRequest(acme, acme.organizationId, requestBody(acme, theirs));
    expect(foreign.status).toBe(400);
    expect(foreign.body).toEqual(expected);

    const archived = await postRequest(acme, acme.organizationId, requestBody(acme, claude));
    expect(archived.status).toBe(400);
    expect(archived.body).toEqual(expected);

    const missing = await postRequest(
      acme,
      acme.organizationId,
      requestBody(acme, '3f2b0a6c-0000-4000-8000-000000000000'),
    );
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual(expected);

    expect(await prisma.request.count()).toBe(0);
  });

  // TC-02-INT-14
  it('leaves a request reading the name it was raised under after a rename and an archive', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const vpn = await topicIdOf(acme.organizationId, 'VPN');
    const created = await postRequest(acme, acme.organizationId, requestBody(acme, vpn));
    expect(created.status).toBe(201);

    expect(
      (await patchTopic(acme, acme.organizationId, `/${vpn}`, { name: 'Network access' }))
        .status,
    ).toBe(200);
    expect((await patchTopic(acme, acme.organizationId, `/${vpn}/archive`)).status).toBe(200);

    const list = await getRequests(acme, acme.organizationId, '?status=all');
    expect(list.status).toBe(200);
    const row = list.body.requests.find(
      (r: { id: string }) => r.id === created.body.id,
    ) as { topic: { name: string; status: string } };
    expect(row.topic.name).toBe('VPN');
    // The catalogue's live status, so a screen can mark it without the label changing.
    expect(row.topic.status).toBe('archived');
  });

  // TC-02-INT-15
  it('filters the list by topic, still finds an archived one, and never crosses organizations', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const globex = await signupAdmin('admin@globex.test', 'Globex');
    const vpn = await topicIdOf(acme.organizationId, 'VPN');
    const question = await topicIdOf(acme.organizationId, 'Question');

    const first = await postRequest(acme, acme.organizationId, requestBody(acme, vpn));
    expect(first.status).toBe(201);
    const second = await postRequest(
      acme,
      acme.organizationId,
      requestBody(acme, question, { title: 'Which invoice template?' }),
    );
    expect(second.status).toBe(201);

    const filtered = await getRequests(
      acme,
      acme.organizationId,
      `?status=all&topicId=${vpn}`,
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.requests.map((r: { id: string }) => r.id)).toEqual([first.body.id]);

    // Archiving hides a topic from the picker and not from the list.
    expect((await patchTopic(acme, acme.organizationId, `/${vpn}/archive`)).status).toBe(200);
    const afterArchive = await getRequests(
      acme,
      acme.organizationId,
      `?status=all&topicId=${vpn}`,
    );
    expect(afterArchive.body.requests.map((r: { id: string }) => r.id)).toEqual([
      first.body.id,
    ]);

    const foreign = await topicIdOf(globex.organizationId, 'VPN');
    const crossOrg = await getRequests(
      acme,
      acme.organizationId,
      `?status=all&topicId=${foreign}`,
    );
    expect(crossOrg.status).toBe(200);
    expect(crossOrg.body.requests).toEqual([]);
  });

  // TC-02-INT-16 (concurrency)
  it('serializes two archives on the row lock and lets the unique index settle two renames', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const second = await createMember(acme.organizationId, {
      email: 'mo@acme.test',
      role: 'manager',
    });
    const vpn = await topicIdOf(acme.organizationId, 'VPN');

    const archives = await Promise.all([
      patchTopic(acme, acme.organizationId, `/${vpn}/archive`),
      patchTopic(second, acme.organizationId, `/${vpn}/archive`),
    ]);
    const archiveStatuses = archives.map((r) => r.status).sort();
    expect(archiveStatuses).toEqual([200, 409]);
    expect(archives.find((r) => r.status === 409)!.body.message).toBe(COPY.statusUnchanged);

    const row = await prisma.requestTopic.findUniqueOrThrow({ where: { id: vpn } });
    expect(row.status).toBe('archived');
    expect(row.archivedAt).not.toBeNull();
    expect([acme.accountId, second.accountId]).toContain(row.archivedByAccountId);

    // Two renames of two DIFFERENT rows to one name. The row lock does not settle this;
    // the functional unique index does, and the loser's violation becomes the same 409
    // the pre-check would have given.
    const claude = await topicIdOf(acme.organizationId, 'Claude');
    const repository = await topicIdOf(acme.organizationId, 'Repository');
    const renames = await Promise.all([
      patchTopic(acme, acme.organizationId, `/${claude}`, { name: 'Shared name' }),
      patchTopic(second, acme.organizationId, `/${repository}`, { name: 'Shared name' }),
    ]);
    const renameStatuses = renames.map((r) => r.status).sort();
    expect(renameStatuses).toEqual([200, 409]);
    expect(renames.find((r) => r.status === 409)!.body.message).toBe(COPY.nameDuplicate);

    const names = await prisma.requestTopic.findMany({
      where: { id: { in: [claude, repository] } },
      select: { name: true },
    });
    expect(names.filter((n) => n.name === 'Shared name')).toHaveLength(1);
    // The loser's stored name is unchanged.
    expect(
      names.some((n) => n.name === 'Claude' || n.name === 'Repository'),
    ).toBe(true);
  });

  // TC-02-INT-17
  it('answers status=closed with both closures, and still resolves each stored value', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const other = await createMember(acme.organizationId, {
      email: 'sam@acme.test',
      role: 'user',
    });
    const vpn = await topicIdOf(acme.organizationId, 'VPN');

    const raise = async (title: string) => {
      const response = await postRequest(
        other,
        acme.organizationId,
        requestBody(acme, vpn, { title }),
      );
      expect(response.status).toBe(201);
      return response.body.id as string;
    };
    const act = (who: Signed, id: string, action: string, body: object = {}) =>
      request(server())
        .post(`/api/organizations/${acme.organizationId}/requests/${id}/${action}`)
        .set('Cookie', who.cookies)
        .send(body);

    const open = await raise('Still open');
    const answered = await raise('Being handled');
    const granted = await raise('All done');
    const declined = await raise('Cannot do it');
    const cancelled = await raise('Never mind');

    expect((await act(acme, answered, 'answer')).status).toBe(200);
    expect((await act(other, granted, 'grant')).status).toBe(200);
    expect((await act(acme, declined, 'decline', { reason: 'No licence left' })).status).toBe(
      200,
    );
    expect((await act(other, cancelled, 'cancel')).status).toBe(200);

    const ids = async (query: string) => {
      const response = await getRequests(acme, acme.organizationId, query);
      expect(response.status).toBe(200);
      return (response.body.requests as { id: string }[]).map((r) => r.id).sort();
    };

    expect(await ids('?scope=all&status=closed')).toEqual([declined, cancelled].sort());
    expect(await ids('?scope=all&status=declined')).toEqual([declined]);
    expect(await ids('?scope=all&status=cancelled')).toEqual([cancelled]);
    expect(await ids('?scope=all&status=open')).toEqual([open]);
    expect(await ids('?scope=all&status=all')).toEqual(
      [open, answered, granted, declined, cancelled].sort(),
    );

    // The vacation section answers the same control: `closed` selects both closures
    // there too, and no pending row.
    const closedWithVacation = await getRequests(acme, acme.organizationId, '?status=closed');
    expect(closedWithVacation.status).toBe(200);
    expect(closedWithVacation.body.vacation).toBeDefined();
    expect(
      (closedWithVacation.body.vacation.requests as { status: string }[]).every((v) =>
        ['rejected', 'cancelled'].includes(v.status),
      ),
    ).toBe(true);
  });

  // TC-02-INT-18
  it('requires a topicId, with absent, null and empty all answering the same message', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');

    for (const over of [{}, { topicId: null }, { topicId: '' }] as Record<string, unknown>[]) {
      const body: Record<string, unknown> = {
        title: 'VPN profile for the new hire',
        assigneeKind: 'member',
        assigneeMembershipId: acme.membershipId,
        ...over,
      };
      const response = await postRequest(acme, acme.organizationId, body);
      expect(response.status).toBe(400);
      expect(response.body.fields).toEqual({ topicId: COPY.topicRequired });
    }

    expect(await prisma.request.count()).toBe(0);
  });

  // TC-02-INT-19
  it('refuses topicId on a patch while the editable fields stay editable', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const vpn = await topicIdOf(acme.organizationId, 'VPN');
    const question = await topicIdOf(acme.organizationId, 'Question');
    const created = await postRequest(acme, acme.organizationId, requestBody(acme, vpn));
    expect(created.status).toBe(201);

    const moved = await request(server())
      .patch(`/api/organizations/${acme.organizationId}/requests/${created.body.id}`)
      .set('Cookie', acme.cookies)
      .send({ topicId: question });
    expect(moved.status).toBe(400);
    expect(moved.body.fields).toEqual({ topicId: COPY.fieldImmutable });

    const row = await prisma.request.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.topicId).toBe(vpn);
    expect(row.topicLabel).toBe('VPN');

    const edited = await request(server())
      .patch(`/api/organizations/${acme.organizationId}/requests/${created.body.id}`)
      .set('Cookie', acme.cookies)
      .send({ title: 'A better title', priority: 'high' });
    expect(edited.status).toBe(200);
    expect(edited.body.title).toBe('A better title');
    expect(edited.body.priority).toBe('high');
  });

  /* ================================================================ *
   * There is no delete, and nothing crosses an organization
   * ================================================================ */

  // TC-02-INT-20
  it('exposes no route that removes a topic row', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const vpn = await topicIdOf(acme.organizationId, 'VPN');

    const deleted = await request(server())
      .delete(`/api/organizations/${acme.organizationId}/request-topics/${vpn}`)
      .set('Cookie', acme.cookies);
    expect(deleted.status).toBe(404);

    const collection = await request(server())
      .delete(`/api/organizations/${acme.organizationId}/request-topics`)
      .set('Cookie', acme.cookies);
    expect(collection.status).toBe(404);

    expect(
      await prisma.requestTopic.count({ where: { organizationId: acme.organizationId } }),
    ).toBe(11);

    // And no service method removes one: the class exposes exactly the five the
    // controller registers, none of which is a delete.
    const service = app.get(RequestTopicsService);
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service)).filter(
      (name) => name !== 'constructor' && !name.startsWith('_'),
    );
    expect(methods.some((name) => /delete|remove|destroy|purge/i.test(name))).toBe(false);
  });

  // TC-02-INT-21
  it('answers 404 for another organization in the path and for a foreign topic id', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');
    const globex = await signupAdmin('admin@globex.test', 'Globex');
    const theirs = await topicIdOf(globex.organizationId, 'VPN');
    const ours = await topicIdOf(acme.organizationId, 'VPN');

    // Their orgId in the path — `OrgScopeGuard` answers before anything is read.
    const crossPath = [
      await getTopics(acme, globex.organizationId),
      await patchTopic(acme, globex.organizationId, `/${theirs}`, { name: 'Nope' }),
      await patchTopic(acme, globex.organizationId, `/${theirs}/archive`),
      await patchTopic(acme, globex.organizationId, `/${theirs}/restore`),
    ];
    // A bare 404 — the framework's own body. Nothing names the resource, and nothing
    // distinguishes it from the answer an id that never existed gets, which is asserted
    // against `bare` below.
    const bare = crossPath[0].body;
    for (const response of crossPath) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual(bare);
      expect(JSON.stringify(response.body).toLowerCase()).not.toContain('topic');
    }

    // Our orgId in the path and their topic id — the path id is never a selector, so the
    // answer is the same bare 404 an id that never existed gets.
    const crossId = [
      await patchTopic(acme, acme.organizationId, `/${theirs}`, { name: 'Nope' }),
      await patchTopic(acme, acme.organizationId, `/${theirs}/archive`),
      await patchTopic(acme, acme.organizationId, `/${theirs}/restore`),
      await patchTopic(acme, acme.organizationId, `/3f2b0a6c-0000-4000-8000-000000000000`, {
        name: 'Nope',
      }),
    ];
    for (const response of crossId) {
      expect(response.status).toBe(404);
      // Identical to the answer for a path id that never existed — the last entry of the
      // list above is exactly that, and every entry compares equal to the same body.
      expect(response.body).toEqual(bare);
    }

    const untouched = await prisma.requestTopic.findMany({
      where: { id: { in: [theirs, ours] } },
      select: { name: true, status: true },
    });
    expect(untouched.every((row) => row.name === 'VPN' && row.status === 'active')).toBe(true);
  });

  // TC-02-INT-22
  it('reorders one row and only that row, and renames and reorders an archived topic', async () => {
    const acme = await signupAdmin('admin@acme.test', 'Acme Inc');

    const before = await getTopics(acme, acme.organizationId, '?audience=staff');
    const names = before.body.topics.map((t: { name: string }) => t.name);
    expect(names[0]).toBe('VPN');
    const last = before.body.topics[before.body.topics.length - 1] as {
      id: string;
      name: string;
    };
    const untouchedBefore = await prisma.requestTopic.findMany({
      where: { organizationId: acme.organizationId, id: { not: last.id } },
      select: { id: true, sortOrder: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });

    const moved = await patchTopic(acme, acme.organizationId, `/${last.id}`, { sortOrder: 1 });
    expect(moved.status).toBe(200);

    const after = await getTopics(acme, acme.organizationId, '?audience=staff');
    expect(after.body.topics[0].id).toBe(last.id);

    const untouchedAfter = await prisma.requestTopic.findMany({
      where: { organizationId: acme.organizationId, id: { not: last.id } },
      select: { id: true, sortOrder: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });
    expect(untouchedAfter).toEqual(untouchedBefore);
    const movedRow = await prisma.requestTopic.findUniqueOrThrow({ where: { id: last.id } });
    expect(movedRow.sortOrder).toBe(1);

    // The route renames and reorders an archived topic for a caller holding its id —
    // the allowance the screen does not draw.
    const claude = await topicIdOf(acme.organizationId, 'Claude');
    expect((await patchTopic(acme, acme.organizationId, `/${claude}/archive`)).status).toBe(200);

    const editedArchived = await patchTopic(acme, acme.organizationId, `/${claude}`, {
      name: 'Claude seats',
      sortOrder: 2,
    });
    expect(editedArchived.status).toBe(200);
    expect(editedArchived.body.topic.name).toBe('Claude seats');
    expect(editedArchived.body.topic.sortOrder).toBe(2);

    const archivedRead = await getTopics(acme, acme.organizationId, '?status=archived');
    expect(archivedRead.body.topics.map((t: { name: string }) => t.name)).toEqual([
      'Claude seats',
    ]);

    expect((await patchTopic(acme, acme.organizationId, `/${claude}/restore`)).status).toBe(200);
    const activeRead = await getTopics(acme, acme.organizationId, '?audience=staff&status=active');
    // sortOrder 1 then 2: the moved row, then the restored one under its new name.
    expect(activeRead.body.topics[0].id).toBe(last.id);
    expect(activeRead.body.topics[1].name).toBe('Claude seats');
  });

  /**
   * Runs a migration file by path, statement by statement. Comment lines are dropped
   * first so a `--` line cannot ride into the statement that follows it.
   */
  async function runSqlFile(path: string): Promise<void> {
    const sql = readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    for (const statement of sql.split(';')) {
      if (statement.trim().length === 0) continue;
      await prisma.$executeRawUnsafe(statement);
    }
  }
});
