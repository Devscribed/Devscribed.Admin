import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { normalizeEmail, parseIsoDate, todayInTimeZone, zonedTimeToUtc } from '@devscribed/validation';
import { PrismaService } from '../src/prisma.service';

/** Cheap in tests — the policy under bcrypt doesn't depend on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

/**
 * The exact copy of the contracts file's "Error Messages" table. Asserted literally,
 * never through the constant the code imports — an assertion about a message must be
 * able to fail when the code's wording drifts.
 */
const COPY = {
  limitInvalid: 'Ask for between 1 and 50 entries.',
  cursorInvalid: 'That page marker is not one this feed issued.',
  groupsInvalid: 'Say true or false for People, Hiring and Work.',
  settingsForbidden: 'You do not have permission to change the portal settings.',
  noProject: '(No project)',
} as const;

/** Today, as 'YYYY-MM-DD' in UTC, offset by whole days. */
const ymdUtc = (offsetDays = 0): string => {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays),
  );
  return d.toISOString().slice(0, 10);
};

/** Today, minus a whole number of calendar years (same month and day). */
const ymdUtcYearsAgo = (years: number): string => {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()));
  return d.toISOString().slice(0, 10);
};

describe('Portal (spec 01 — home)', () => {
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

  /**
   * A session cookie, or a precondition failure that names the actor.
   *
   * Superagent answers `Invalid value "undefined" for header "Cookie"` from whichever request
   * happens to use the actor next, which points at the wrong line and says nothing about who
   * failed to sign in. The seam is worth one check.
   */
  const requireCookies = (
    response: { headers: Record<string, unknown>; status: number; text: string },
    who: string,
  ): string[] => {
    const cookies = response.headers['set-cookie'] as string[] | undefined;
    if (!cookies || cookies.length === 0) {
      throw new Error(
        `Precondition failed: no session cookie for ${who} — ${response.status} ${response.text}`,
      );
    }
    return cookies;
  };

  const signupAdmin = async (email: string, orgName: string): Promise<Signed> => {
    const response = await request(server()).post('/api/signup').send({
      orgName,
      firstName: 'Ada',
      lastName: 'Owner',
      email,
      password: 'Passw0rd',
      timezone: 'UTC',
    });
    if (response.status !== 201) {
      throw new Error(`Precondition failed: signup answered ${response.status} ${response.text}`);
    }
    const cookies = requireCookies(response, `signup ${email}`);
    const accountId = response.body.account.id as string;
    const organizationId = response.body.organization.id as string;
    const membership = await prisma.membership.findUniqueOrThrow({ where: { accountId } });
    return { cookies, accountId, organizationId, membershipId: membership.id, role: 'admin', email };
  };

  const createMember = async (
    organizationId: string,
    opts: {
      email: string;
      role: string;
      firstName?: string;
      lastName?: string;
      status?: string;
      timezone?: string | null;
      countryCode?: string | null;
      jobTitle?: string | null;
    },
  ): Promise<Signed> => {
    const password = 'Passw0rd';
    const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
    /* Seed the address the product itself would have stored. `LoginService` normalizes what
       it is given (`normalizeEmail`, login.service.ts:18) and looks the account up by the
       normalized form, so a row written straight through Prisma in mixed case is an account
       nobody can sign in to — a defect in the seed that reads as a defect in the route. */
    const email = normalizeEmail(opts.email);
    const account = await prisma.account.create({
      data: {
        email,
        passwordHash,
        firstName: opts.firstName ?? 'Sam',
        lastName: opts.lastName ?? 'Dev',
        timezone: opts.timezone === undefined ? 'UTC' : opts.timezone,
      },
    });
    const membership = await prisma.membership.create({
      data: {
        accountId: account.id,
        organizationId,
        role: opts.role,
        status: opts.status ?? 'active',
        countryCode: opts.countryCode ?? null,
        jobTitle: opts.jobTitle ?? null,
      },
    });
    const cookies =
      opts.status !== 'removed' ? requireCookies(await login(email, password), email) : [];
    return {
      cookies,
      accountId: account.id,
      organizationId,
      membershipId: membership.id,
      role: opts.role,
      email,
    };
  };

  /** A signed-in client contact — TC-01-INT-01's only actor. */
  const createClientContact = async (
    organizationId: string,
    adminAccountId: string,
    email: string,
  ): Promise<Signed> => {
    const client = await prisma.client.create({
      data: { organizationId, name: `Client ${email}`, createdByAccountId: adminAccountId },
    });
    const passwordHash = await bcrypt.hash('Passw0rd', TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: { email: normalizeEmail(email), passwordHash, firstName: 'Cara', lastName: 'Contact' },
    });
    await prisma.clientMembership.create({
      data: { accountId: account.id, organizationId, clientId: client.id, status: 'active' },
    });
    const cookies = requireCookies(await login(email), email);
    return {
      cookies,
      accountId: account.id,
      organizationId,
      membershipId: '',
      role: 'client',
      email,
    };
  };

  /* ---------------------------------------------------------------- *
   * The routes under test
   * ---------------------------------------------------------------- */

  const home = (who: Signed, orgId: string) =>
    request(server()).get(`/api/organizations/${orgId}/portal/home`).set('Cookie', who.cookies);

  const news = (who: Signed, orgId: string, query = '') =>
    request(server())
      .get(`/api/organizations/${orgId}/portal/news${query}`)
      .set('Cookie', who.cookies);

  const newsEntry = (who: Signed, orgId: string, entryId: string) =>
    request(server())
      .get(`/api/organizations/${orgId}/portal/news/${encodeURIComponent(entryId)}`)
      .set('Cookie', who.cookies);

  const getSettings = (who: Signed, orgId: string) =>
    request(server())
      .get(`/api/organizations/${orgId}/portal/settings`)
      .set('Cookie', who.cookies);

  const putSettings = (who: Signed, orgId: string, body: unknown) =>
    request(server())
      .put(`/api/organizations/${orgId}/portal/settings`)
      .set('Cookie', who.cookies)
      .send(body as object);

  const backdateJoined = (email: string, joinedAt: string) =>
    request(server()).post('/api/test/membership/backdate-joined').send({ email, joinedAt });

  /* ---------------------------------------------------------------- *
   * Preconditions from the areas this spec projects — vacancies, projects,
   * clients, holidays, financials, requests. Each is a precondition, not the
   * thing under test.
   * ---------------------------------------------------------------- */

  const createVacancy = async (
    who: Signed,
    overrides: {
      title?: string;
      description?: string | null;
      durationMinutes?: number;
      interviewerAccountId?: string;
      categoryIds?: string[];
      newCategoryNames?: string[];
    } = {},
  ) => {
    const response = await request(server())
      .post(`/api/organizations/${who.organizationId}/hiring/vacancies`)
      .set('Cookie', who.cookies)
      .send({
        title: overrides.title ?? 'Senior React Engineer',
        description: overrides.description,
        interviewerAccountId: overrides.interviewerAccountId ?? who.accountId,
        durationMinutes: overrides.durationMinutes ?? 60,
        ...(overrides.categoryIds ? { categoryIds: overrides.categoryIds } : {}),
        ...(overrides.newCategoryNames ? { newCategoryNames: overrides.newCategoryNames } : {}),
      });
    if (response.status !== 201) {
      throw new Error(`Precondition failed: vacancy create answered ${response.status} ${response.text}`);
    }
    return response.body as {
      id: string;
      title: string;
      description: string | null;
      publicSlug: string;
      durationMinutes: number;
      interviewer: { accountId: string; fullName: string };
      categories: Array<{ id: string; name: string }>;
    };
  };

  const closeVacancy = (who: Signed, vacancyId: string) =>
    request(server())
      .patch(`/api/organizations/${who.organizationId}/hiring/vacancies/${vacancyId}`)
      .set('Cookie', who.cookies)
      .send({ status: 'closed' });

  const createProject = async (
    who: Signed,
    name: string,
    overrides: { clientId?: string } = {},
  ) => {
    const response = await request(server())
      .post(`/api/organizations/${who.organizationId}/projects`)
      .set('Cookie', who.cookies)
      .send({ name, ...overrides });
    if (response.status !== 201) {
      throw new Error(`Precondition failed: project create answered ${response.status} ${response.text}`);
    }
    return response.body as { id: string; name: string; createdAt: string; clientId: string | null };
  };

  const archiveProject = (who: Signed, projectId: string) =>
    request(server())
      .patch(`/api/organizations/${who.organizationId}/projects/${projectId}/archive`)
      .set('Cookie', who.cookies);

  const addProjectMembers = (who: Signed, projectId: string, membershipIds: string[]) =>
    request(server())
      .post(`/api/organizations/${who.organizationId}/projects/${projectId}/members`)
      .set('Cookie', who.cookies)
      .send({ membershipIds });

  const createClientApi = async (who: Signed, name: string) => {
    const response = await request(server())
      .post(`/api/organizations/${who.organizationId}/clients`)
      .set('Cookie', who.cookies)
      .send({ name });
    if (response.status !== 201) {
      throw new Error(`Precondition failed: client create answered ${response.status} ${response.text}`);
    }
    return response.body as { client: { id: string; name: string } };
  };

  const configureFinancials = (admin: Signed, member: Signed, overrides: Record<string, unknown> = {}) =>
    request(server())
      .put(`/api/organizations/${admin.organizationId}/members/${member.membershipId}/vacation/financials`)
      .set('Cookie', admin.cookies)
      .send({
        monthlySalary: 3000,
        clientHourlyRate: 40,
        vacationDaysPerYear: 20,
        currency: 'USD',
        isReservePercentManual: false,
        ...overrides,
      });

  const seedReserveCredit = (member: Signed, amount: number) =>
    prisma.vacationReserveTransaction.create({
      data: {
        membershipId: member.membershipId,
        type: 'credit',
        amount,
        isAutoGenerated: true,
        description: 'seed',
      },
    });

  const createHoliday = (
    organizationId: string,
    createdByAccountId: string,
    input: { name: string; date: string; countryCode?: string | null },
  ) =>
    prisma.holiday.create({
      data: {
        organizationId,
        name: input.name,
        date: new Date(`${input.date}T00:00:00.000Z`),
        countryCode: input.countryCode ?? null,
        createdByAccountId,
      },
    });

  const createTimeEntry = (
    member: Signed,
    input: { date: string; durationMinutes: number; projectId?: string | null },
  ) =>
    prisma.timeEntry.create({
      data: {
        membershipId: member.membershipId,
        organizationId: member.organizationId,
        projectId: input.projectId ?? null,
        date: new Date(`${input.date}T00:00:00.000Z`),
        durationMinutes: input.durationMinutes,
        createdByAccountId: member.accountId,
      },
    });

  const seededTopicId = async (organizationId: string, name = 'VPN'): Promise<string> => {
    const topic = await prisma.requestTopic.findFirstOrThrow({ where: { organizationId, name } });
    return topic.id;
  };

  const createRequestApi = async (
    who: Signed,
    assignee: Signed,
    overrides: Record<string, unknown> = {},
  ) => {
    const topicId = await seededTopicId(who.organizationId);
    const response = await request(server())
      .post(`/api/organizations/${who.organizationId}/requests`)
      .set('Cookie', who.cookies)
      .send({
        topicId,
        title: 'A request',
        assigneeKind: 'member',
        assigneeMembershipId: assignee.membershipId,
        ...overrides,
      });
    if (response.status !== 201) {
      throw new Error(`Precondition failed: request create answered ${response.status} ${response.text}`);
    }
    return response.body as { id: string; number: number };
  };

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
    await prisma.applicationCriterion.deleteMany();
    await prisma.applicationScheduleEvent.deleteMany();
    await prisma.applicationCv.deleteMany();
    await prisma.application.deleteMany();
    await prisma.candidate.deleteMany();
    await prisma.criterionValue.deleteMany();
    await prisma.criterion.deleteMany();
    await prisma.vacancyCategory.deleteMany();
    await prisma.vacancy.deleteMany();
    await prisma.category.deleteMany();
    await prisma.organizationPortalSettings.deleteMany();
    await prisma.requestNotification.deleteMany();
    await prisma.requestEvent.deleteMany();
    await prisma.requestMessage.deleteMany();
    await prisma.request.deleteMany();
    await prisma.requestTopic.deleteMany();
    await prisma.vacationRequest.deleteMany();
    await prisma.vacationReserveTransaction.deleteMany();
    await prisma.memberFinancialsSnapshot.deleteMany();
    await prisma.memberFinancials.deleteMany();
    await prisma.timeEntry.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.clientMembership.deleteMany();
    await prisma.client.deleteMany();
    await prisma.holiday.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
  });

  /* ================================================================ *
   * TC-01-INT-01 — the client contact, refused everywhere
   * ================================================================ */

  it('TC-01-INT-01 refuses a client contact 404 on every route, no body naming the portal', async () => {
    const admin = await signupAdmin('admin1@acme.test', 'Acme Inc');
    const contact = await createClientContact(admin.organizationId, admin.accountId, 'cara@acme.test');
    const orgId = admin.organizationId;

    const responses = await Promise.all([
      home(contact, orgId),
      news(contact, orgId),
      newsEntry(contact, orgId, 'member-joined:whatever'),
      getSettings(contact, orgId),
      putSettings(contact, orgId, { groups: { people: true, hiring: true, work: true } }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(JSON.stringify(response.body).toLowerCase()).not.toContain('portal');
    }
  });

  /* ================================================================ *
   * TC-01-INT-02 — every staff role reads 200, the feed writes nothing
   * ================================================================ */

  it('TC-01-INT-02 answers 200 for every staff role and writes no row on a read', async () => {
    const admin = await signupAdmin('admin2@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;
    const manager = await createMember(orgId, { email: 'manager2@acme.test', role: 'manager' });
    const user = await createMember(orgId, { email: 'user2@acme.test', role: 'user' });
    const viewer = await createMember(orgId, { email: 'viewer2@acme.test', role: 'viewer' });
    const legacy = await createMember(orgId, { email: 'legacy2@acme.test', role: 'member' });

    const before = {
      membership: await prisma.membership.count({ where: { organizationId: orgId } }),
      vacancy: await prisma.vacancy.count({ where: { organizationId: orgId } }),
      project: await prisma.project.count({ where: { organizationId: orgId } }),
    };

    for (const who of [admin, manager, user, viewer, legacy]) {
      expect((await home(who, orgId)).status).toBe(200);
      expect((await news(who, orgId)).status).toBe(200);
    }

    const after = {
      membership: await prisma.membership.count({ where: { organizationId: orgId } }),
      vacancy: await prisma.vacancy.count({ where: { organizationId: orgId } }),
      project: await prisma.project.count({ where: { organizationId: orgId } }),
    };
    expect(after).toEqual(before);
  });

  /* ================================================================ *
   * TC-01-INT-03 — the month is computed in the caller's own timezone
   * ================================================================ */

  it('TC-01-INT-03 computes the month in the caller’s own timezone, UTC when unset', async () => {
    const admin = await signupAdmin('admin3@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;
    const ahead = await createMember(orgId, {
      email: 'ahead3@acme.test',
      role: 'user',
      timezone: 'Pacific/Kiritimati',
    });
    const unset = await createMember(orgId, { email: 'unset3@acme.test', role: 'user', timezone: null });

    jest.useFakeTimers({
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'nextTick',
        'hrtime',
        'performance',
        'queueMicrotask',
      ],
    });
    jest.setSystemTime(new Date('2026-06-15T23:00:00.000Z'));
    try {
      const aheadRes = await home(ahead, orgId);
      const unsetRes = await home(unset, orgId);
      expect(aheadRes.status).toBe(200);
      expect(unsetRes.status).toBe(200);

      expect(unsetRes.body.month.timezone).toBe('UTC');
      expect(unsetRes.body.month.today).toBe('2026-06-15');
      expect(aheadRes.body.month.today).toBe('2026-06-16');

      const diffDays =
        (new Date(aheadRes.body.month.today).getTime() - new Date(unsetRes.body.month.today).getTime()) /
        86_400_000;
      expect(diffDays).toBe(1);

      expect(aheadRes.body.month.startDate).toBe('2026-06-01');
      expect(unsetRes.body.month.startDate).toBe('2026-06-01');
    } finally {
      jest.useRealTimers();
    }
  });

  /* ================================================================ *
   * TC-01-INT-04 — tracked time this month, split by project, no money
   * ================================================================ */

  it('TC-01-INT-04 sums the month’s tracked time by project and carries no monetary field', async () => {
    const admin = await signupAdmin('admin4@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;
    const member = await createMember(orgId, { email: 'member4@acme.test', role: 'user' });
    const project = await createProject(admin, 'Aurora');

    await createTimeEntry(member, { date: ymdUtc(-1), durationMinutes: 120, projectId: project.id });
    await createTimeEntry(member, { date: ymdUtc(-2), durationMinutes: 60, projectId: project.id });
    await createTimeEntry(member, { date: ymdUtc(-3), durationMinutes: 90, projectId: null });
    // Outside the month — must not be counted.
    const priorMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    priorMonth.setUTCDate(priorMonth.getUTCDate() - 1);
    await createTimeEntry(member, {
      date: priorMonth.toISOString().slice(0, 10),
      durationMinutes: 500,
      projectId: project.id,
    });

    const response = await home(member, orgId);
    expect(response.status).toBe(200);
    expect(response.body.month.totalMinutes).toBe(270);
    expect(response.body.month.daysWithEntry).toBe(3);
    expect(response.body.month.byProject).toEqual([
      { projectId: project.id, projectName: 'Aurora', minutes: 180 },
      { projectId: null, projectName: COPY.noProject, minutes: 90 },
    ]);

    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain('reserveBalance');
    expect(raw).not.toContain('monthlySalary');
    expect(raw).not.toContain('clientHourlyRate');
  });

  /* ================================================================ *
   * TC-01-INT-05 — a membership with no financials, then with a reserve
   * ================================================================ */

  it('TC-01-INT-05 answers timeOff null with the holidays intact, then the reserve in days', async () => {
    const admin = await signupAdmin('admin5@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;
    const member = await createMember(orgId, { email: 'member5@acme.test', role: 'user' });

    const first = await home(member, orgId);
    expect(first.status).toBe(200);
    expect(first.body.timeOff).toBeNull();
    expect(typeof first.body.holidays).toBe('object');
    expect(first.body.holidays).not.toBeNull();

    expect((await configureFinancials(admin, member)).status).toBe(200);
    await seedReserveCredit(member, 10);

    const second = await home(member, orgId);
    expect(second.status).toBe(200);
    expect(second.body.timeOff).not.toBeNull();
    expect(Object.keys(second.body.timeOff).sort()).toEqual(
      ['availableDays', 'pendingDays', 'totalDaysPerYear', 'usedDays'].sort(),
    );
  });

  /* ================================================================ *
   * TC-01-INT-06 — the three earliest holidays ahead, past excluded
   * ================================================================ */

  it('TC-01-INT-06 answers the three earliest upcoming holidays, ascending, past excluded', async () => {
    const admin = await signupAdmin('admin6@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;
    const member = await createMember(orgId, { email: 'member6@acme.test', role: 'user' });

    await createHoliday(orgId, admin.accountId, { name: 'Past', date: ymdUtc(-1) });
    const h1 = await createHoliday(orgId, admin.accountId, { name: 'Soon', date: ymdUtc(1) });
    const h2 = await createHoliday(orgId, admin.accountId, { name: 'Later', date: ymdUtc(2) });
    const h3 = await createHoliday(orgId, admin.accountId, { name: 'Even later', date: ymdUtc(3) });
    await createHoliday(orgId, admin.accountId, { name: 'Furthest', date: ymdUtc(4) });

    const response = await home(member, orgId);
    expect(response.status).toBe(200);
    expect(response.body.holidays.upcoming.map((h: { id: string }) => h.id)).toEqual([
      h1.id,
      h2.id,
      h3.id,
    ]);
    expect(response.body.holidays.upcoming.map((h: { name: string }) => h.name)).not.toContain('Past');
  });

  /* ================================================================ *
   * TC-01-INT-07 — which country reaches the caller; no org fallback
   * ================================================================ */

  it('TC-01-INT-07 resolves the caller’s own country and never the organization’s', async () => {
    const admin = await signupAdmin('admin7@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;
    const member = await createMember(orgId, {
      email: 'member7@acme.test',
      role: 'user',
      countryCode: 'PL',
    });

    await createHoliday(orgId, admin.accountId, { name: 'Global', date: ymdUtc(5) });
    await createHoliday(orgId, admin.accountId, { name: 'Poland', date: ymdUtc(6), countryCode: 'PL' });
    await createHoliday(orgId, admin.accountId, { name: 'Germany', date: ymdUtc(7), countryCode: 'DE' });

    const first = await home(member, orgId);
    expect(first.status).toBe(200);
    expect(first.body.holidays.countryCode).toBe('PL');
    expect(first.body.holidays.upcoming.map((h: { name: string }) => h.name).sort()).toEqual(
      ['Global', 'Poland'].sort(),
    );

    await prisma.membership.update({ where: { id: member.membershipId }, data: { countryCode: null } });
    await prisma.organization.update({ where: { id: orgId }, data: { countryCode: 'DE' } });

    const second = await home(member, orgId);
    expect(second.status).toBe(200);
    expect(second.body.holidays.countryCode).toBeNull();
    expect(second.body.holidays.upcoming.map((h: { name: string }) => h.name)).toEqual(['Global']);
  });

  /* ================================================================ *
   * TC-01-INT-08 — the requests on the caller, at most three, ordered
   * ================================================================ */

  it('TC-01-INT-08 answers at most three open requests on the caller, overdue first', async () => {
    const admin = await signupAdmin('admin8@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;
    const caller = await createMember(orgId, { email: 'caller8@acme.test', role: 'user' });
    const other1 = await createMember(orgId, { email: 'other1-8@acme.test', role: 'user' });
    const other2 = await createMember(orgId, { email: 'other2-8@acme.test', role: 'user' });

    // Overdue — created with a valid future date, then pushed into the past directly.
    const overdue = await createRequestApi(caller, admin, {
      title: 'Overdue one',
      neededBy: ymdUtc(3),
    });
    await prisma.request.update({
      where: { id: overdue.id },
      data: { neededBy: new Date(`${ymdUtc(-2)}T00:00:00.000Z`) },
    });

    const soon = await createRequestApi(caller, admin, { title: 'Soon', neededBy: ymdUtc(5) });
    const later = await createRequestApi(admin, caller, { title: 'Later', neededBy: ymdUtc(10) });
    await createRequestApi(caller, admin, { title: 'No date A' });
    await createRequestApi(admin, caller, { title: 'No date B' });

    // Between two other members — must not involve the caller at all.
    await createRequestApi(other1, other2, { title: 'Not mine' });

    const response = await home(caller, orgId);
    expect(response.status).toBe(200);
    expect(response.body.requests.openTotal).toBe(5);
    expect(response.body.requests.items.map((i: { id: string }) => i.id)).toEqual([
      overdue.id,
      soon.id,
      later.id,
    ]);
  });

  /* ================================================================ *
   * TC-01-INT-09 — somebody joined, an anniversary, a removal draws nothing
   * ================================================================ */

  it('TC-01-INT-09 derives member-joined and member-anniversary, never for a removed membership', async () => {
    const admin = await signupAdmin('admin9@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;
    const removed = await createMember(orgId, { email: 'removed9@acme.test', role: 'user' });
    const backdated = await createMember(orgId, { email: 'backdated9@acme.test', role: 'user' });
    const today = await createMember(orgId, { email: 'today9@acme.test', role: 'user' });

    await prisma.membership.update({ where: { id: removed.membershipId }, data: { status: 'removed' } });
    // Two years back, then one more day: the joining itself is 731 days ago — outside
    // REQ-01-026's 365-day window — while the second (Y=2) anniversary, 366 days ago,
    // falls inside it. The first (Y=1) anniversary is far outside the window too.
    const now = new Date();
    const twoYearsAndADayAgo = new Date(
      Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), now.getUTCDate() - 1),
    )
      .toISOString()
      .slice(0, 10);
    await backdateJoined(backdated.email, twoYearsAndADayAgo);
    await backdateJoined(today.email, ymdUtc(0));

    const response = await news(admin, orgId);
    expect(response.status).toBe(200);
    const entries = response.body.entries as Array<{
      kind: string;
      subject: { id: string };
      detail: Record<string, unknown>;
    }>;

    const memberJoined = entries.filter((e) => e.kind === 'member-joined');
    expect(memberJoined.some((e) => e.subject.id === today.membershipId)).toBe(true);
    expect(memberJoined.some((e) => e.subject.id === backdated.membershipId)).toBe(false);

    const anniversaries = entries.filter(
      (e) => e.kind === 'member-anniversary' && e.subject.id === backdated.membershipId,
    );
    expect(anniversaries).toHaveLength(1);
    expect(anniversaries[0].detail.years).toBe(2);

    expect(entries.some((e) => e.subject.id === removed.membershipId)).toBe(false);
  });

  /* ================================================================ *
   * TC-01-INT-10 — the same entries to every role, field for field
   * ================================================================ */

  it('TC-01-INT-10 answers an identical entry set to every staff role, and no entry for a client', async () => {
    const admin = await signupAdmin('admin10@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;
    const manager = await createMember(orgId, { email: 'manager10@acme.test', role: 'manager' });
    const user = await createMember(orgId, { email: 'user10@acme.test', role: 'user' });
    const viewer = await createMember(orgId, { email: 'viewer10@acme.test', role: 'viewer' });
    await createMember(orgId, { email: 'seeded10@acme.test', role: 'user' });

    await createVacancy(admin, { title: 'Backend Engineer' });
    await createProject(admin, 'Nimbus');
    const client = await createClientApi(admin, 'Ten Client');

    const [adminBody, managerBody, userBody, viewerBody] = await Promise.all([
      news(admin, orgId),
      news(manager, orgId),
      news(user, orgId),
      news(viewer, orgId),
    ]);

    expect(adminBody.status).toBe(200);
    expect(managerBody.body.entries).toEqual(adminBody.body.entries);
    expect(userBody.body.entries).toEqual(adminBody.body.entries);
    expect(viewerBody.body.entries).toEqual(adminBody.body.entries);

    const raw = JSON.stringify(adminBody.body);
    expect(raw).not.toContain(client.client.name);
    expect(adminBody.body.entries.some((e: { kind: string }) => e.kind === 'vacancy-opened')).toBe(true);
    expect(adminBody.body.entries.some((e: { kind: string }) => e.kind === 'project-started')).toBe(true);
  });

  /* ================================================================ *
   * TC-01-INT-11 — paging, and the two validation failures
   * ================================================================ */

  it('TC-01-INT-11 pages the feed by cursor and refuses a bad cursor and a bad limit', async () => {
    const admin = await signupAdmin('admin11@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;

    expect((await putSettings(admin, orgId, { groups: { people: false, hiring: false, work: true } })).status).toBe(
      200,
    );

    const created: string[] = [];
    for (let i = 1; i <= 5; i += 1) {
      const project = await createProject(admin, `Proj ${i}`);
      created.push(project.id);
    }
    // Distinct, unambiguous moments — newest last created, oldest first created.
    for (let i = 0; i < created.length; i += 1) {
      await prisma.project.update({
        where: { id: created[i] },
        data: { createdAt: new Date(Date.now() - (created.length - i) * 60_000) },
      });
    }
    const expectedDescending = [...created].reverse();

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const response = await news(admin, orgId, `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      expect(response.status).toBe(200);
      const ids = response.body.entries.map((e: { subject: { id: string } }) => e.subject.id);
      seen.push(...ids);
      if (!response.body.nextCursor) {
        expect(ids.length).toBe(1);
        break;
      }
      expect(ids.length).toBe(2);
      cursor = response.body.nextCursor as string;
    }

    expect(seen).toEqual(expectedDescending);
    expect(new Set(seen).size).toBe(5);

    const badCursor = await news(admin, orgId, '?cursor=not-a-cursor');
    expect(badCursor.status).toBe(422);
    expect(badCursor.body.fields.cursor).toBe(COPY.cursorInvalid);

    const badLimit = await news(admin, orgId, '?limit=51');
    expect(badLimit.status).toBe(422);
    expect(badLimit.body.fields.limit).toBe(COPY.limitInvalid);
  });

  /* ================================================================ *
   * TC-01-INT-12 — the 365-day window's own boundary
   * ================================================================ */

  it('TC-01-INT-12 includes a 364-day-old joining, excludes a 366-day-old one, keeps its anniversary', async () => {
    const admin = await signupAdmin('admin12@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;
    const inside = await createMember(orgId, { email: 'inside12@acme.test', role: 'user' });
    const outside = await createMember(orgId, { email: 'outside12@acme.test', role: 'user' });

    await backdateJoined(inside.email, ymdUtc(-364));
    await backdateJoined(outside.email, ymdUtc(-366));

    const response = await news(admin, orgId);
    expect(response.status).toBe(200);
    const entries = response.body.entries as Array<{ kind: string; subject: { id: string }; detail: Record<string, unknown> }>;

    expect(
      entries.some((e) => e.kind === 'member-joined' && e.subject.id === inside.membershipId),
    ).toBe(true);
    expect(
      entries.some((e) => e.kind === 'member-joined' && e.subject.id === outside.membershipId),
    ).toBe(false);
    expect(
      entries.some(
        (e) =>
          e.kind === 'member-anniversary' && e.subject.id === outside.membershipId && e.detail.years === 1,
      ),
    ).toBe(true);
  });

  /* ================================================================ *
   * REQ-01-026 — the window ends at the caller's own today, not UTC's
   * ================================================================ */

  it('REQ-01-026 keeps a row inside the caller’s own today even after the UTC day has rolled over', async () => {
    const admin = await signupAdmin('admin26@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;
    // A zone behind UTC — the only kind that can expose a UTC-anchored end as too
    // early, since a zone ahead of (or equal to) UTC never has this gap.
    const zone = 'America/Los_Angeles';
    const westCoast = await createMember(orgId, { email: 'westcoast26@acme.test', role: 'user', timezone: zone });

    const vacancy = await createVacancy(admin, { title: 'Frontend Engineer' });

    // The caller's own "today", read exactly as the production code reads it, then
    // a moment 3 hours after *UTC's* end of that date — inside the caller's actual
    // local day (which, behind UTC, ends several hours later) and therefore a moment
    // a UTC-anchored window drops but the caller's own window must keep.
    const now = new Date();
    const today = todayInTimeZone(zone, now);
    const utcEndOfToday = new Date(`${today}T23:59:59.999Z`).getTime();
    const insideLocalTodayAfterUtcRollover = new Date(utcEndOfToday + 3 * 60 * 60 * 1000);
    // Sanity on the fixture itself: this moment must still be within the caller's
    // true local day, or the case would prove nothing.
    const { year, month, day } = parseIsoDate(today);
    const trueLocalEnd = zonedTimeToUtc(year, month, day + 1, 0, 0, zone).getTime() - 1;
    expect(insideLocalTodayAfterUtcRollover.getTime()).toBeLessThanOrEqual(trueLocalEnd);

    await prisma.vacancy.update({
      where: { id: vacancy.id },
      data: { createdAt: insideLocalTodayAfterUtcRollover },
    });

    const feed = await news(westCoast, orgId);
    expect(feed.status).toBe(200);
    const entries = feed.body.entries as Array<{ kind: string; subject: { id: string } }>;
    expect(entries.some((e) => e.kind === 'vacancy-opened' && e.subject.id === vacancy.id)).toBe(true);

    const entryPage = await newsEntry(westCoast, orgId, `vacancy-opened:${vacancy.id}`);
    expect(entryPage.status).toBe(200);
  });

  /* ================================================================ *
   * TC-01-INT-13 — the settings, their default, and their effect on the feed
   * ================================================================ */

  it('TC-01-INT-13 defaults to every group enabled, and a disabled group drops exactly its own entries', async () => {
    const admin = await signupAdmin('admin13@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;
    const manager = await createMember(orgId, { email: 'manager13@acme.test', role: 'manager' });
    await createMember(orgId, { email: 'member13@acme.test', role: 'user' });
    const vacancy = await createVacancy(admin, { title: 'Data Engineer' });
    const project = await createProject(admin, 'Comet');

    const noRow = await prisma.organizationPortalSettings.findUnique({ where: { organizationId: orgId } });
    expect(noRow).toBeNull();

    const first = await getSettings(admin, orgId);
    expect(first.status).toBe(200);
    expect(first.body.groups).toEqual({ people: true, hiring: true, work: true });

    const saveWorkOff = await putSettings(admin, orgId, {
      groups: { people: true, hiring: true, work: false },
    });
    expect(saveWorkOff.status).toBe(200);

    const afterWorkOff = await news(admin, orgId);
    expect(afterWorkOff.body.entries.some((e: { subject: { id: string } }) => e.subject.id === project.id)).toBe(
      false,
    );
    expect(
      afterWorkOff.body.entries.some((e: { subject: { id: string } }) => e.subject.id === vacancy.id),
    ).toBe(true);
    expect(
      afterWorkOff.body.entries.some((e: { subject: { id: string } }) => e.subject.id === admin.membershipId),
    ).toBe(true);

    const saveHiringOffToo = await putSettings(admin, orgId, {
      groups: { people: true, hiring: false, work: false },
    });
    expect(saveHiringOffToo.status).toBe(200);
    const afterHiringOffToo = await news(admin, orgId);
    expect(
      afterHiringOffToo.body.entries.some((e: { subject: { id: string } }) => e.subject.id === vacancy.id),
    ).toBe(false);
    expect(
      afterHiringOffToo.body.entries.some((e: { subject: { id: string } }) => e.subject.id === project.id),
    ).toBe(false);
    expect(
      afterHiringOffToo.body.entries.some((e: { subject: { id: string } }) => e.subject.id === admin.membershipId),
    ).toBe(true);

    const managerAttempt = await putSettings(manager, orgId, {
      groups: { people: true, hiring: true, work: true },
    });
    expect(managerAttempt.status).toBe(403);
    expect(managerAttempt.body.message).toBe(COPY.settingsForbidden);

    const partialAttempt = await putSettings(admin, orgId, { groups: { people: true, hiring: true } });
    expect(partialAttempt.status).toBe(422);
    expect(partialAttempt.body.fields.groups).toBe(COPY.groupsInvalid);
  });

  /* ================================================================ *
   * TC-01-INT-14 — hiring says one thing and no more
   * ================================================================ */

  it('TC-01-INT-14 draws exactly one vacancy-opened and names no candidate, application or assessment', async () => {
    const admin = await signupAdmin('admin14@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;
    const vacancy = await createVacancy(admin, { title: 'Platform Engineer' });

    const candidate = await prisma.candidate.create({
      data: {
        organizationId: orgId,
        firstName: 'Priya',
        lastName: 'Sharma',
        email: 'priya.sharma@example.test',
      },
    });
    const application = await prisma.application.create({
      data: {
        organizationId: orgId,
        candidateId: candidate.id,
        vacancyId: vacancy.id,
        position: 1000,
        submittedName: 'Priya Sharma',
        start: new Date(),
        end: new Date(Date.now() + 45 * 60_000),
        timeZone: 'UTC',
        manageToken: randomUUID(),
        interviewerAccountId: admin.accountId,
      },
    });
    await prisma.applicationScheduleEvent.create({
      data: {
        applicationId: application.id,
        type: 'booked',
        actor: 'candidate',
        toStart: application.start,
        timeZone: 'UTC',
      },
    });
    const criterion = await prisma.criterion.create({
      data: { organizationId: orgId, name: 'Communication', type: 'boolean' },
    });
    await prisma.applicationCriterion.create({
      data: { applicationId: application.id, criterionId: criterion.id, type: 'boolean', valueBool: true },
    });

    expect((await closeVacancy(admin, vacancy.id)).status).toBe(200);

    const response = await news(admin, orgId);
    expect(response.status).toBe(200);
    const entries = response.body.entries as Array<{ kind: string; subject: { id: string } }>;

    const vacancyOpened = entries.filter((e) => e.kind === 'vacancy-opened');
    expect(vacancyOpened).toHaveLength(1);
    expect(vacancyOpened[0].subject.id).toBe(vacancy.id);
    expect(entries.every((e) => e.kind === 'vacancy-opened' || e.kind === 'member-joined')).toBe(true);

    const raw = JSON.stringify(response.body).toLowerCase();
    expect(raw).not.toContain('priya');
    expect(raw).not.toContain('priya.sharma@example.test');
  });

  /* ================================================================ *
   * TC-01-INT-15 — a project's client, named where the reader may see it
   * ================================================================ */

  it('TC-01-INT-15 names a project’s client only where the reader already may see it', async () => {
    const admin = await signupAdmin('admin15@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;
    const assigned = await createMember(orgId, { email: 'assigned15@acme.test', role: 'user' });
    const unassigned = await createMember(orgId, { email: 'unassigned15@acme.test', role: 'user' });

    const client = await createClientApi(admin, 'Northwind');
    const project1 = await createProject(admin, 'Linked', { clientId: client.client.id });
    const project2 = await createProject(admin, 'Unlinked');
    expect((await archiveProject(admin, project2.id)).status).toBe(200);
    expect((await addProjectMembers(admin, project1.id, [assigned.membershipId])).status).toBe(200);

    for (const who of [admin, assigned, unassigned]) {
      const response = await news(who, orgId);
      expect(response.status).toBe(200);
      const entries = response.body.entries as Array<{
        kind: string;
        subject: { id: string };
        detail: { clientName: string | null };
      }>;
      const e1 = entries.find((e) => e.kind === 'project-started' && e.subject.id === project1.id);
      const e2 = entries.find((e) => e.kind === 'project-started' && e.subject.id === project2.id);
      expect(e1).toBeDefined();
      expect(e2).toBeDefined();

      if (who === unassigned) {
        expect(e1!.detail.clientName).toBeNull();
      } else {
        expect(e1!.detail.clientName).toBe('Northwind');
      }
      expect(e2!.detail.clientName).toBeNull();
    }
  });

  /* ================================================================ *
   * TC-01-INT-16 — not-found, byte-identical, for four different reasons
   * ================================================================ */

  it('TC-01-INT-16 answers 404, byte-identically, for a foreign id, garbage, an undrawn kind and a vanished row', async () => {
    const adminA = await signupAdmin('adminA16@acme.test', 'Org A');
    const orgIdA = adminA.organizationId;
    const userA = await createMember(orgIdA, { email: 'userA16@acme.test', role: 'user' });

    const adminB = await signupAdmin('adminB16@acme.test', 'Org B');
    const projectB = await createProject(adminB, 'Foreign');

    const doomed = await createProject(adminA, 'Doomed');
    await prisma.project.delete({ where: { id: doomed.id } });

    const foreign = await newsEntry(userA, orgIdA, `project-started:${projectB.id}`);
    const garbage = await newsEntry(userA, orgIdA, 'garbage');
    const undrawnKind = await newsEntry(userA, orgIdA, `client-added:${randomUUID()}`);
    const vanished = await newsEntry(userA, orgIdA, `project-started:${doomed.id}`);

    for (const response of [foreign, garbage, undrawnKind, vanished]) {
      expect(response.status).toBe(404);
    }
    expect(foreign.body).toEqual(garbage.body);
    expect(garbage.body).toEqual(undrawnKind.body);
    expect(undrawnKind.body).toEqual(vanished.body);

    const ownProject = await createProject(adminA, 'Home Turf');
    const success = await newsEntry(userA, orgIdA, `project-started:${ownProject.id}`);
    expect(success.status).toBe(200);
  });

  /* ================================================================ *
   * TC-01-INT-17 — the vacancy's page, and its booking link while open
   * ================================================================ */

  it('TC-01-INT-17 carries a vacancy’s facts and a share link only while it is open', async () => {
    const admin = await signupAdmin('admin17@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;
    const user = await createMember(orgId, { email: 'user17@acme.test', role: 'user' });
    const vacancy = await createVacancy(admin, {
      title: 'Staff Engineer',
      description: 'Lead the platform team.',
      durationMinutes: 45,
      newCategoryNames: ['React', 'Senior'],
    });

    const first = await newsEntry(user, orgId, `vacancy-opened:${vacancy.id}`);
    expect(first.status).toBe(200);
    expect(first.body.subject.name).toBe('Staff Engineer');
    expect(first.body.body).toBe('Lead the platform team.');
    expect(first.body.categories.sort()).toEqual(['React', 'Senior'].sort());
    expect(first.body.facts).toContainEqual({
      key: 'interviewer',
      label: 'Interviews with',
      value: 'Ada Owner',
    });
    expect(first.body.facts).toContainEqual({
      key: 'duration',
      label: 'Interview length',
      value: '45 minutes',
    });
    expect(typeof first.body.shareUrl).toBe('string');
    expect(first.body.shareUrl.endsWith(vacancy.publicSlug)).toBe(true);

    expect((await closeVacancy(admin, vacancy.id)).status).toBe(200);

    const second = await newsEntry(user, orgId, `vacancy-opened:${vacancy.id}`);
    expect(second.status).toBe(200);
    expect(second.body.shareUrl).toBeNull();
    expect(second.body).toEqual({ ...first.body, shareUrl: null });
  });

  /* ================================================================ *
   * TC-01-INT-18 — a person's page and a project's, each headed the same
   * ================================================================ */

  it('TC-01-INT-18 heads a member’s and a project’s page with the feed’s own sentence', async () => {
    const admin = await signupAdmin('admin18@acme.test', 'Acme Inc');
    const orgId = admin.organizationId;
    const target = await createMember(orgId, {
      email: 'target18@acme.test',
      role: 'user',
      firstName: 'Nina',
      lastName: 'Petrova',
      jobTitle: 'Designer',
    });
    const reader = await createMember(orgId, { email: 'reader18@acme.test', role: 'user' });

    const feedForReader = await news(reader, orgId);
    const feedEntryForTarget = (feedForReader.body.entries as Array<{ kind: string; subject: { id: string; name: string } }>).find(
      (e) => e.kind === 'member-joined' && e.subject.id === target.membershipId,
    );
    expect(feedEntryForTarget).toBeDefined();

    const memberPage = await newsEntry(reader, orgId, `member-joined:${target.membershipId}`);
    expect(memberPage.status).toBe(200);
    expect(memberPage.body.subject.name).toBe(feedEntryForTarget!.subject.name);
    expect(memberPage.body.link).toBe(`/org/${orgId}/members/${target.membershipId}`);
    expect(memberPage.body.facts).toContainEqual({ key: 'jobTitle', label: 'Job title', value: 'Designer' });

    const project = await createProject(admin, 'Roster Test');
    const assignedUser = await createMember(orgId, { email: 'assigned18@acme.test', role: 'user' });
    const unassignedUser = await createMember(orgId, { email: 'unassigned18@acme.test', role: 'user' });
    expect((await addProjectMembers(admin, project.id, [assignedUser.membershipId])).status).toBe(200);

    const feedForAssigned = await news(assignedUser, orgId);
    const feedEntryForProject = (feedForAssigned.body.entries as Array<{ kind: string; subject: { id: string; name: string } }>).find(
      (e) => e.kind === 'project-started' && e.subject.id === project.id,
    );
    expect(feedEntryForProject).toBeDefined();

    const assignedPage = await newsEntry(assignedUser, orgId, `project-started:${project.id}`);
    expect(assignedPage.status).toBe(200);
    expect(assignedPage.body.subject.name).toBe(feedEntryForProject!.subject.name);
    expect(Array.isArray(assignedPage.body.members)).toBe(true);
    expect(
      (assignedPage.body.members as Array<{ id: string }>).some((m) => m.id === assignedUser.membershipId),
    ).toBe(true);

    const unassignedPage = await newsEntry(unassignedUser, orgId, `project-started:${project.id}`);
    expect(unassignedPage.status).toBe(200);
    // REQ-01-056 — the roster is omitted, not nulled, for a reader who holds neither
    // `manage-projects` nor a `ProjectMember` row: the key itself must be absent so
    // this case cannot be told apart from a project whose roster is `[]`.
    expect(unassignedPage.body).not.toHaveProperty('members');
    expect(unassignedPage.body.link).toBeNull();
    expect(
      (unassignedPage.body.facts as Array<{ key: string }>).some((f) => f.key === 'client'),
    ).toBe(false);
  });
});
