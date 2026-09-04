import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  MEMBER_MESSAGES,
  PROFILE_MESSAGES,
  TIME_OFF_CALENDAR_MESSAGES,
} from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

/** Cheap in tests — the policy under bcrypt doesn't depend on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

/** Every window in this file is a month of a year nothing else in the suite touches. */
const MONTH_START = '2026-09-01';
const MONTH_END = '2026-09-30';

describe('Vacation calendar (time off spec 01)', () => {
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

  const signupAdmin = async (
    email: string,
    orgName: string,
    names: { firstName?: string; lastName?: string } = {},
  ): Promise<Signed> => {
    const response = await request(server()).post('/api/signup').send({
      orgName,
      firstName: names.firstName ?? 'Olga',
      lastName: names.lastName ?? 'Admin',
      email,
      password: 'Passw0rd',
    });
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const accountId = response.body.account.id as string;
    const organizationId = response.body.organization.id as string;
    const membership = await prisma.membership.findUniqueOrThrow({ where: { accountId } });
    return { cookies, accountId, organizationId, membershipId: membership.id, role: 'admin' };
  };

  const login = (email: string, password = 'Passw0rd') =>
    request(server()).post('/api/login').send({ email, password });

  const createMember = async (
    organizationId: string,
    opts: {
      email: string;
      role: string;
      firstName?: string;
      lastName?: string;
      /** The stated holiday country — the first link of the chain (REQ-01-026). */
      countryCode?: string | null;
      /** Seeded only to witness that it now reaches nothing (REQ-01-026). */
      phoneCountryCode?: string | null;
      timezone?: string | null;
      jobTitle?: string | null;
      status?: string;
    },
  ): Promise<Signed> => {
    const passwordHash = await bcrypt.hash('Passw0rd', TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: {
        email: opts.email,
        passwordHash,
        firstName: opts.firstName ?? 'Test',
        lastName: opts.lastName ?? 'User',
        timezone: opts.timezone === undefined ? 'America/New_York' : opts.timezone,
        phoneCountryCode: opts.phoneCountryCode ?? null,
      },
    });
    const membership = await prisma.membership.create({
      data: {
        accountId: account.id,
        organizationId,
        role: opts.role,
        status: opts.status ?? 'active',
        jobTitle: opts.jobTitle ?? null,
        countryCode: opts.countryCode ?? null,
      },
    });
    const cookies = (await login(opts.email)).headers['set-cookie'] as unknown as string[];
    return {
      cookies,
      accountId: account.id,
      organizationId,
      membershipId: membership.id,
      role: opts.role,
    };
  };

  const seedHoliday = (
    organizationId: string,
    createdByAccountId: string,
    opts: { date: string; name: string; countryCode?: string | null },
  ) =>
    prisma.holiday.create({
      data: {
        organizationId,
        createdByAccountId,
        name: opts.name,
        date: new Date(`${opts.date}T00:00:00.000Z`),
        paidHours: 8,
        countryCode: opts.countryCode ?? null,
      },
    });

  const seedRequest = (opts: {
    membershipId: string;
    startDate: string;
    endDate: string;
    workingDays: number;
    status: string;
  }) =>
    prisma.vacationRequest.create({
      data: {
        membershipId: opts.membershipId,
        startDate: new Date(`${opts.startDate}T00:00:00.000Z`),
        endDate: new Date(`${opts.endDate}T00:00:00.000Z`),
        workingDays: opts.workingDays,
        deductionAmount: 100,
        status: opts.status,
      },
    });

  const seedProject = (organizationId: string, createdByAccountId: string, name: string, status = 'active') =>
    prisma.project.create({ data: { organizationId, name, status, createdByAccountId } });

  const assign = (projectId: string, membershipId: string, assignedByAccountId: string) =>
    prisma.projectMember.create({ data: { projectId, membershipId, assignedByAccountId } });

  const calendar = (cookies: string[], orgId: string, query: string) =>
    request(server())
      .get(`/api/organizations/${orgId}/time-off/calendar${query}`)
      .set('Cookie', cookies);

  const month = (extra = '') => `?startDate=${MONTH_START}&endDate=${MONTH_END}&scope=all${extra}`;

  const setOrgCountry = (cookies: string[], orgId: string, countryCode: string | null) =>
    request(server())
      .put(`/api/organizations/${orgId}/settings/country`)
      .set('Cookie', cookies)
      .send({ countryCode });

  const getOrgCountry = (cookies: string[], orgId: string) =>
    request(server()).get(`/api/organizations/${orgId}/settings/country`).set('Cookie', cookies);

  const memberDetail = (cookies: string[], orgId: string, memberId: string) =>
    request(server()).get(`/api/organizations/${orgId}/members/${memberId}`).set('Cookie', cookies);

  const updateMember = (
    cookies: string[],
    orgId: string,
    memberId: string,
    body: Record<string, unknown>,
  ) =>
    request(server())
      .put(`/api/organizations/${orgId}/members/${memberId}`)
      .set('Cookie', cookies)
      .send(body);

  const rowFor = (body: any, membershipId: string) =>
    body.members.find((m: any) => m.membershipId === membershipId);

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
    await prisma.holiday.deleteMany();
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
  it('scope=all returns every active member, name-ordered, and no money or profile field', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc', {
      firstName: 'Zoe',
      lastName: 'Zephyr',
    });
    await createMember(admin.organizationId, {
      email: 'ivan@acme.com',
      role: 'user',
      firstName: 'ivan',
      lastName: 'demchenko',
    });
    await createMember(admin.organizationId, {
      email: 'anna@acme.com',
      role: 'user',
      firstName: 'Anna',
      lastName: 'Kovalenko',
    });
    await createMember(admin.organizationId, {
      email: 'pavel@acme.com',
      role: 'user',
      firstName: 'Pavel',
      lastName: 'Mishin',
    });
    await createMember(admin.organizationId, {
      email: 'marta@acme.com',
      role: 'viewer',
      firstName: 'Marta',
      lastName: 'Sokolova',
    });

    const response = await calendar(admin.cookies, admin.organizationId, month());
    expect(response.status).toBe(200);
    expect(response.body.members.map((m: any) => m.displayName)).toEqual([
      'Anna Kovalenko',
      'ivan demchenko',
      'Marta Sokolova',
      'Pavel Mishin',
      'Zoe Zephyr',
    ]);
    expect(response.body.meta).toEqual({ scope: 'all', memberCount: 5 });

    // One entry per calendar day, weekends flagged exactly on Saturday and Sunday.
    expect(response.body.days).toHaveLength(30);
    const weekends = response.body.days
      .filter((d: any) => d.isWeekend)
      .map((d: any) => d.date);
    expect(weekends).toEqual([
      '2026-09-05', '2026-09-06', '2026-09-12', '2026-09-13',
      '2026-09-19', '2026-09-20', '2026-09-26', '2026-09-27',
    ]);

    // Neither money nor an address can reach this screen through the payload.
    const whole = JSON.stringify(response.body);
    for (const forbidden of [
      'deductionAmount',
      'monthlySalary',
      'vacationReservePercent',
      'reserveBalance',
      'availableDays',
      'phoneCountryCode',
      'addressLine1',
      'postalCode',
      'taxId',
    ]) {
      expect(whole).not.toContain(forbidden);
    }
    // `MemberProfile.country` never reaches it either: the only country-shaped key on a
    // member row is the resolved holiday country.
    expect(Object.keys(response.body.members[0]).sort()).toEqual([
      'absences',
      'countryCode',
      'displayName',
      'holidayIds',
      'jobTitle',
      'membershipId',
    ]);
  });

  // TC-01-INT-02
  it('a viewer is refused the calendar with a bare 404', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const viewer = await createMember(admin.organizationId, {
      email: 'viewer@acme.com',
      role: 'viewer',
    });

    const response = await calendar(viewer.cookies, admin.organizationId, month());
    expect(response.status).toBe(404);
    expect(response.body.members).toBeUndefined();
  });

  // TC-01-INT-03
  it('ids belonging to another organization are dropped silently', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const own = await createMember(admin.organizationId, {
      email: 'own@acme.com',
      role: 'user',
      firstName: 'Own',
      lastName: 'Member',
    });
    const ownProject = await seedProject(admin.organizationId, admin.accountId, 'Ours');
    await assign(ownProject.id, own.membershipId, admin.accountId);

    const other = await signupAdmin('other@beta.com', 'Beta Ltd');
    const foreign = await createMember(other.organizationId, {
      email: 'foreign@beta.com',
      role: 'user',
      firstName: 'Foreign',
      lastName: 'Member',
    });
    const foreignProject = await seedProject(other.organizationId, other.accountId, 'Theirs');
    await assign(foreignProject.id, foreign.membershipId, other.accountId);

    const people = await calendar(
      admin.cookies,
      admin.organizationId,
      `?startDate=${MONTH_START}&endDate=${MONTH_END}&scope=people` +
        `&memberIds=${own.membershipId}&memberIds=${foreign.membershipId}`,
    );
    expect(people.status).toBe(200);
    expect(people.body.members.map((m: any) => m.membershipId)).toEqual([own.membershipId]);

    const teams = await calendar(
      admin.cookies,
      admin.organizationId,
      `?startDate=${MONTH_START}&endDate=${MONTH_END}&scope=teams` +
        `&projectIds=${ownProject.id}&projectIds=${foreignProject.id}`,
    );
    expect(teams.status).toBe(200);
    expect(teams.body.members.map((m: any) => m.membershipId)).toEqual([own.membershipId]);
  });

  // TC-01-INT-04
  it('the `none` sentinel returns the unassigned, and mixes with a named project', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc', {
      firstName: 'Olga',
      lastName: 'Admin',
    });
    const a = await createMember(admin.organizationId, {
      email: 'a@acme.com', role: 'user', firstName: 'Anna', lastName: 'A',
    });
    const b = await createMember(admin.organizationId, {
      email: 'b@acme.com', role: 'user', firstName: 'Boris', lastName: 'B',
    });
    const c = await createMember(admin.organizationId, {
      email: 'c@acme.com', role: 'user', firstName: 'Clara', lastName: 'C',
    });
    const d = await createMember(admin.organizationId, {
      email: 'd@acme.com', role: 'user', firstName: 'Dmitry', lastName: 'D',
    });

    const projectA = await seedProject(admin.organizationId, admin.accountId, 'A');
    const projectB = await seedProject(admin.organizationId, admin.accountId, 'B');
    await assign(projectA.id, a.membershipId, admin.accountId);
    await assign(projectA.id, b.membershipId, admin.accountId);
    await assign(projectB.id, c.membershipId, admin.accountId);
    // The admin is on a project too, so the unassigned bucket is exactly D.
    await assign(projectA.id, admin.membershipId, admin.accountId);

    const unassigned = await calendar(
      admin.cookies,
      admin.organizationId,
      `?startDate=${MONTH_START}&endDate=${MONTH_END}&scope=teams&projectIds=none`,
    );
    expect(unassigned.status).toBe(200);
    expect(unassigned.body.members.map((m: any) => m.membershipId)).toEqual([d.membershipId]);

    const both = await calendar(
      admin.cookies,
      admin.organizationId,
      `?startDate=${MONTH_START}&endDate=${MONTH_END}&scope=teams` +
        `&projectIds=${projectA.id}&projectIds=none`,
    );
    expect(both.status).toBe(200);
    const ids = both.body.members.map((m: any) => m.membershipId);
    expect(new Set(ids)).toEqual(
      new Set([a.membershipId, b.membershipId, admin.membershipId, d.membershipId]),
    );
    expect(ids).toHaveLength(4);
  });

  // TC-01-INT-05
  it('scope=teams returns the union of the named projects, each member once', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const a = await createMember(admin.organizationId, {
      email: 'a@acme.com', role: 'user', firstName: 'Anna', lastName: 'A',
    });
    const b = await createMember(admin.organizationId, {
      email: 'b@acme.com', role: 'user', firstName: 'Boris', lastName: 'B',
    });
    const c = await createMember(admin.organizationId, {
      email: 'c@acme.com', role: 'user', firstName: 'Clara', lastName: 'C',
    });
    const d = await createMember(admin.organizationId, {
      email: 'd@acme.com', role: 'user', firstName: 'Dmitry', lastName: 'D',
    });

    const one = await seedProject(admin.organizationId, admin.accountId, 'One');
    const two = await seedProject(admin.organizationId, admin.accountId, 'Two');
    await assign(one.id, a.membershipId, admin.accountId);
    await assign(one.id, b.membershipId, admin.accountId);
    await assign(two.id, b.membershipId, admin.accountId);
    await assign(two.id, c.membershipId, admin.accountId);

    const response = await calendar(
      admin.cookies,
      admin.organizationId,
      `?startDate=${MONTH_START}&endDate=${MONTH_END}&scope=teams` +
        `&projectIds=${one.id}&projectIds=${two.id}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.members.map((m: any) => m.membershipId)).toEqual([
      a.membershipId,
      b.membershipId,
      c.membershipId,
    ]);
    expect(response.body.members.map((m: any) => m.membershipId)).not.toContain(d.membershipId);
  });

  // TC-01-INT-06
  it('scope=teams with nothing ticked is refused, not drawn empty', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const response = await calendar(
      admin.cookies,
      admin.organizationId,
      `?startDate=${MONTH_START}&endDate=${MONTH_END}&scope=teams`,
    );
    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: 'validation_error',
      fields: { projectIds: 'Choose at least one team.' },
    });
    expect(response.body.members).toBeUndefined();
  });

  // TC-01-INT-07
  it('scope=people draws exactly the named memberships', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const picked: string[] = [];
    for (const name of ['Anna', 'Boris', 'Clara', 'Dmitry', 'Elena', 'Fyodor', 'Galina', 'Igor']) {
      const member = await createMember(admin.organizationId, {
        email: `${name.toLowerCase()}@acme.com`,
        role: 'user',
        firstName: name,
        lastName: 'Member',
      });
      if (picked.length < 4) picked.push(member.membershipId);
    }

    const response = await calendar(
      admin.cookies,
      admin.organizationId,
      `?startDate=${MONTH_START}&endDate=${MONTH_END}&scope=people` +
        picked.map((id) => `&memberIds=${id}`).join(''),
    );
    expect(response.status).toBe(200);
    expect(response.body.members).toHaveLength(4);
    expect(new Set(response.body.members.map((m: any) => m.membershipId))).toEqual(new Set(picked));
  });

  // TC-01-INT-08
  it('scope=people with nobody picked is refused', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const response = await calendar(
      admin.cookies,
      admin.organizationId,
      `?startDate=${MONTH_START}&endDate=${MONTH_END}&scope=people`,
    );
    expect(response.status).toBe(422);
    expect(response.body.fields.memberIds).toBe('Choose at least one person.');
  });

  // TC-01-INT-09
  it('only approved and pending draw a band, and only inside the window', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const member = await createMember(admin.organizationId, {
      email: 'm@acme.com', role: 'user', firstName: 'Ivan', lastName: 'D',
    });

    const approved = await seedRequest({
      membershipId: member.membershipId,
      startDate: '2026-09-14', endDate: '2026-09-18', workingDays: 5, status: 'approved',
    });
    const pending = await seedRequest({
      membershipId: member.membershipId,
      startDate: '2026-09-23', endDate: '2026-09-25', workingDays: 3, status: 'pending',
    });
    const rejected = await seedRequest({
      membershipId: member.membershipId,
      startDate: '2026-09-07', endDate: '2026-09-08', workingDays: 2, status: 'rejected',
    });
    const cancelled = await seedRequest({
      membershipId: member.membershipId,
      startDate: '2026-09-02', endDate: '2026-09-03', workingDays: 2, status: 'cancelled',
    });
    const outside = await seedRequest({
      membershipId: member.membershipId,
      startDate: '2026-10-05', endDate: '2026-10-07', workingDays: 3, status: 'approved',
    });

    const response = await calendar(admin.cookies, admin.organizationId, month());
    expect(response.status).toBe(200);
    const bands = rowFor(response.body, member.membershipId).absences;
    expect(bands).toHaveLength(2);
    expect(bands.map((b: any) => b.id).sort()).toEqual([approved.id, pending.id].sort());
    for (const band of bands) expect(band.kind).toBe('vacation');
    expect(bands.map((b: any) => b.status).sort()).toEqual(['approved', 'pending']);

    const whole = JSON.stringify(response.body);
    for (const id of [rejected.id, cancelled.id, outside.id]) expect(whole).not.toContain(id);
  });

  // TC-01-INT-10
  it('a band clipped by the window keeps its true dates and its frozen working days', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const auckland = await createMember(admin.organizationId, {
      email: 'nz@acme.com', role: 'admin', timezone: 'Pacific/Auckland',
      firstName: 'Nina', lastName: 'Zed',
    });
    const losAngeles = await createMember(admin.organizationId, {
      email: 'la@acme.com', role: 'admin', timezone: 'America/Los_Angeles',
      firstName: 'Lars', lastName: 'Angel',
    });
    const member = await createMember(admin.organizationId, {
      email: 'm@acme.com', role: 'user', firstName: 'Ivan', lastName: 'D',
    });
    await seedRequest({
      membershipId: member.membershipId,
      startDate: '2026-08-28', endDate: '2026-09-03', workingDays: 5, status: 'approved',
    });

    for (const caller of [auckland, losAngeles]) {
      const response = await calendar(caller.cookies, admin.organizationId, month());
      expect(response.status).toBe(200);
      const [band] = rowFor(response.body, member.membershipId).absences;
      // The boundary day 2026-09-01 is inside the window in BOTH zones; a
      // DATE-against-TIMESTAMPTZ comparison would drop it for one of them.
      expect(band).toMatchObject({
        startDate: '2026-08-28',
        endDate: '2026-09-03',
        startsBeforeWindow: true,
        endsAfterWindow: false,
        workingDays: 5,
      });
    }
  });

  // TC-01-INT-11
  it('a removed member is drawn by no scope, and naming them is not an error', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const member = await createMember(admin.organizationId, {
      email: 'm@acme.com', role: 'user', firstName: 'Ivan', lastName: 'D',
    });
    const req = await seedRequest({
      membershipId: member.membershipId,
      startDate: '2026-09-14', endDate: '2026-09-18', workingDays: 5, status: 'approved',
    });

    const removed = await request(server())
      .delete(`/api/organizations/${admin.organizationId}/members/${member.membershipId}`)
      .set('Cookie', admin.cookies);
    expect(removed.status).toBe(200);

    const all = await calendar(admin.cookies, admin.organizationId, month());
    expect(all.status).toBe(200);
    expect(rowFor(all.body, member.membershipId)).toBeUndefined();
    expect(JSON.stringify(all.body)).not.toContain(req.id);

    const named = await calendar(
      admin.cookies,
      admin.organizationId,
      `?startDate=${MONTH_START}&endDate=${MONTH_END}&scope=people&memberIds=${member.membershipId}`,
    );
    expect(named.status).toBe(200);
    expect(named.body.members).toEqual([]);
  });

  // TC-01-INT-12
  it('the chain: the membership wins, an unusable value falls through, and clearing the org resolves null', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const global = await seedHoliday(admin.organizationId, admin.accountId, {
      date: '2026-09-21', name: 'Company Day', countryCode: null,
    });
    const polish = await seedHoliday(admin.organizationId, admin.accountId, {
      date: '2026-09-16', name: 'Polish National Day', countryCode: 'PL',
    });
    const american = await seedHoliday(admin.organizationId, admin.accountId, {
      date: '2026-09-07', name: 'Labor Day', countryCode: 'US',
    });
    await setOrgCountry(admin.cookies, admin.organizationId, 'PL');

    const a = await createMember(admin.organizationId, {
      email: 'a@acme.com', role: 'user', firstName: 'Anna', lastName: 'A',
      countryCode: 'US', phoneCountryCode: 'BY',
    });
    const b = await createMember(admin.organizationId, {
      email: 'b@acme.com', role: 'user', firstName: 'Boris', lastName: 'B', countryCode: 'PL',
    });
    const c = await createMember(admin.organizationId, {
      email: 'c@acme.com', role: 'user', firstName: 'Clara', lastName: 'C',
    });
    const d = await createMember(admin.organizationId, {
      email: 'd@acme.com', role: 'user', firstName: 'Dmitry', lastName: 'D', countryCode: 'XX',
    });

    const first = await calendar(admin.cookies, admin.organizationId, month());
    expect(first.status).toBe(200);
    // A's stated US wins over the organization's PL, and their BY phone country reaches
    // nothing — the source this spec drops.
    expect(rowFor(first.body, a.membershipId).holidayIds.sort()).toEqual(
      [global.id, american.id].sort(),
    );
    for (const member of [b, c, d]) {
      expect(rowFor(first.body, member.membershipId).holidayIds.sort()).toEqual(
        [global.id, polish.id].sort(),
      );
    }
    expect([a, b, c, d].map((m) => rowFor(first.body, m.membershipId).countryCode)).toEqual([
      'US', 'PL', 'PL', 'PL',
    ]);

    await setOrgCountry(admin.cookies, admin.organizationId, null);
    const second = await calendar(admin.cookies, admin.organizationId, month());
    expect(second.status).toBe(200);
    expect(rowFor(second.body, a.membershipId).countryCode).toBe('US');
    expect(rowFor(second.body, b.membershipId).countryCode).toBe('PL');
    for (const member of [c, d]) {
      expect(rowFor(second.body, member.membershipId).countryCode).toBeNull();
      expect(rowFor(second.body, member.membershipId).holidayIds).toEqual([global.id]);
    }

    // No membership was written by either read.
    const stored = await prisma.membership.findMany({
      where: { organizationId: admin.organizationId },
      select: { id: true, countryCode: true },
    });
    expect(new Map(stored.map((m) => [m.id, m.countryCode])).get(d.membershipId)).toBe('XX');
    expect(new Map(stored.map((m) => [m.id, m.countryCode])).get(c.membershipId)).toBeNull();
  });

  // TC-01-INT-13
  it('two holidays on one date answer appliesToAllInView separately', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    // The admin themselves is a row, so they carry the PL country too — otherwise the PL
    // holiday would be partial for a reason the case is not about.
    await prisma.membership.update({
      where: { id: admin.membershipId },
      data: { countryCode: 'PL' },
    });
    const polish = await createMember(admin.organizationId, {
      email: 'pl@acme.com', role: 'user', firstName: 'Piotr', lastName: 'P', countryCode: 'PL',
    });
    const nobody = await createMember(admin.organizationId, {
      email: 'no@acme.com', role: 'user', firstName: 'Nina', lastName: 'N',
    });

    const plHoliday = await seedHoliday(admin.organizationId, admin.accountId, {
      date: '2026-09-16', name: 'Polish National Day', countryCode: 'PL',
    });
    const globalHoliday = await seedHoliday(admin.organizationId, admin.accountId, {
      date: '2026-09-16', name: 'Company Day', countryCode: null,
    });

    const response = await calendar(admin.cookies, admin.organizationId, month());
    expect(response.status).toBe(200);
    expect(response.body.holidays).toHaveLength(2);
    const holidayRow = (id: string) => response.body.holidays.find((h: any) => h.id === id);
    expect(holidayRow(plHoliday.id).appliesToAllInView).toBe(false);
    expect(holidayRow(globalHoliday.id).appliesToAllInView).toBe(true);

    expect(rowFor(response.body, polish.membershipId).holidayIds.sort()).toEqual(
      [plHoliday.id, globalHoliday.id].sort(),
    );
    expect(rowFor(response.body, nobody.membershipId).holidayIds).toEqual([globalHoliday.id]);
  });

  // TC-01-INT-14
  it('setting the organization country gives an unstated member that country’s holidays', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com', role: 'manager', firstName: 'Maya', lastName: 'M',
    });
    const member = await createMember(admin.organizationId, {
      email: 'm@acme.com', role: 'user', firstName: 'Ivan', lastName: 'D',
    });
    const polish = await seedHoliday(admin.organizationId, admin.accountId, {
      date: '2026-09-16', name: 'Polish National Day', countryCode: 'PL',
    });

    const before = await calendar(admin.cookies, admin.organizationId, month());
    expect(rowFor(before.body, member.membershipId).holidayIds).toEqual([]);

    const set = await setOrgCountry(manager.cookies, admin.organizationId, 'PL');
    expect(set.status).toBe(200);

    const after = await calendar(admin.cookies, admin.organizationId, month());
    expect(rowFor(after.body, member.membershipId).holidayIds).toEqual([polish.id]);
    // Nothing was written to the membership — the chain is evaluated on read.
    const stored = await prisma.membership.findUniqueOrThrow({
      where: { id: member.membershipId },
    });
    expect(stored.countryCode).toBeNull();
  });

  // TC-01-INT-15
  it('a manager may set the organization country; a user and a viewer get an identical 404', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com', role: 'manager',
    });
    const user = await createMember(admin.organizationId, { email: 'u@acme.com', role: 'user' });
    const viewer = await createMember(admin.organizationId, { email: 'v@acme.com', role: 'viewer' });

    expect((await setOrgCountry(manager.cookies, admin.organizationId, 'PL')).status).toBe(200);

    const refusedUser = await setOrgCountry(user.cookies, admin.organizationId, 'US');
    const refusedViewer = await setOrgCountry(viewer.cookies, admin.organizationId, 'US');
    expect(refusedUser.status).toBe(404);
    expect(refusedViewer.status).toBe(404);
    expect(refusedUser.body).toEqual(refusedViewer.body);

    const stored = await prisma.organization.findUniqueOrThrow({
      where: { id: admin.organizationId },
    });
    expect(stored.countryCode).toBe('PL');
  });

  // TC-01-INT-16
  it('the 92-day bound is inclusive, and a window may cross a year boundary', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const tooWide = await calendar(
      admin.cookies,
      admin.organizationId,
      '?startDate=2026-09-01&endDate=2026-12-02&scope=all',
    );
    expect(tooWide.status).toBe(422);
    expect(tooWide.body.fields.range).toBe('Choose a range of 92 days or fewer.');

    const exact = await calendar(
      admin.cookies,
      admin.organizationId,
      '?startDate=2026-09-01&endDate=2026-12-01&scope=all',
    );
    expect(exact.status).toBe(200);
    expect(exact.body.days).toHaveLength(92);

    const crossing = await calendar(
      admin.cookies,
      admin.organizationId,
      '?startDate=2026-12-01&endDate=2027-01-29&scope=all',
    );
    expect(crossing.status).toBe(200);
    expect(crossing.body.days[0]).toMatchObject({ date: '2026-12-01', isoWeek: 49 });
    // The ISO week numbers restart across the boundary rather than running on.
    const newYear = crossing.body.days.find((d: any) => d.date === '2027-01-04');
    expect(newYear.isoWeek).toBe(1);
  });

  // TC-01-INT-17
  it('a scope resolving to more than 100 rows is refused, never truncated', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const ids: string[] = [];
    for (let i = 0; i < 100; i += 1) {
      const member = await createMember(admin.organizationId, {
        email: `m${i}@acme.com`,
        role: 'user',
        firstName: `Member${String(i).padStart(3, '0')}`,
        lastName: 'Bulk',
      });
      ids.push(member.membershipId);
    }
    // 100 members plus the admin is 101 active memberships.

    const all = await calendar(admin.cookies, admin.organizationId, month());
    expect(all.status).toBe(422);
    expect(all.body.fields.scope).toBe(
      'This view covers more than 100 people. Narrow the scope to see the calendar.',
    );

    const hundred = await calendar(
      admin.cookies,
      admin.organizationId,
      `?startDate=${MONTH_START}&endDate=${MONTH_END}&scope=people` +
        ids.map((id) => `&memberIds=${id}`).join(''),
    );
    expect(hundred.status).toBe(200);
    expect(hundred.body.members).toHaveLength(100);
  }, 60_000);

  // TC-01-INT-18
  it('reading another organization’s calendar answers the same 404 as a missing capability', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const other = await signupAdmin('other@beta.com', 'Beta Ltd');

    const crossOrg = await calendar(admin.cookies, other.organizationId, month());
    expect(crossOrg.status).toBe(404);

    const viewer = await createMember(admin.organizationId, {
      email: 'v@acme.com', role: 'viewer',
    });
    const refused = await calendar(viewer.cookies, admin.organizationId, month());
    expect(refused.status).toBe(404);
    expect(crossOrg.body).toEqual(refused.body);
  });

  // TC-01-INT-19
  it("range.today is the caller's own calendar date, and UTC when they have no zone", async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const east = await createMember(admin.organizationId, {
      email: 'east@acme.com', role: 'user', timezone: 'Pacific/Kiritimati',
    });
    const west = await createMember(admin.organizationId, {
      email: 'west@acme.com', role: 'user', timezone: 'Pacific/Niue',
    });
    const zoneless = await createMember(admin.organizationId, {
      email: 'none@acme.com', role: 'user', timezone: null,
    });

    const dateIn = (timeZone: string, at: Date) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(at);

    const instant = new Date();
    const [eastRead, westRead, zonelessRead] = await Promise.all([
      calendar(east.cookies, admin.organizationId, month()),
      calendar(west.cookies, admin.organizationId, month()),
      calendar(zoneless.cookies, admin.organizationId, month()),
    ]);

    expect(eastRead.body.range.today).toBe(dateIn('Pacific/Kiritimati', instant));
    expect(westRead.body.range.today).toBe(dateIn('Pacific/Niue', instant));
    expect(zonelessRead.body.range.today).toBe(dateIn('UTC', instant));
    // The two zones are 25 hours apart, so their answers never agree.
    expect(eastRead.body.range.today).not.toBe(westRead.body.range.today);
    // Only the marker moves: the columns are calendar days and are identical.
    expect(eastRead.body.days).toEqual(westRead.body.days);
    expect(eastRead.body.days).toEqual(zonelessRead.body.days);
  });

  // TC-01-INT-20
  it('an empty organization country clears the stored value', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    expect((await setOrgCountry(admin.cookies, admin.organizationId, 'PL')).body).toEqual({
      countryCode: 'PL',
    });

    const cleared = await request(server())
      .put(`/api/organizations/${admin.organizationId}/settings/country`)
      .set('Cookie', admin.cookies)
      .send({ countryCode: '' });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ countryCode: null });
  });

  // TC-01-INT-21
  it('the organization country write refuses anything but an assigned uppercase alpha-2', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    // Something is already stored, so the read-back after the refusal has a value to keep.
    await setOrgCountry(admin.cookies, admin.organizationId, 'BY');

    for (const bad of ['POL', '1', 'pl', 'XX']) {
      const response = await setOrgCountry(admin.cookies, admin.organizationId, bad);
      expect(response.status).toBe(422);
      expect(response.body).toEqual({
        error: 'validation_error',
        fields: { countryCode: 'Enter a valid country' },
      });
    }

    // `XX` is the one that matters: it is two uppercase letters and names no assigned
    // country, so storing it would leave a value REQ-01-026 discards on every read while
    // the page showed it as set. The read-back still answers what was there before.
    const readBack = await getOrgCountry(admin.cookies, admin.organizationId);
    expect(readBack.body).toEqual({ countryCode: 'BY' });

    const accepted = await setOrgCountry(admin.cookies, admin.organizationId, 'PL');
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ countryCode: 'PL' });
  });

  // TC-01-INT-22
  it('a scope that resolves to nobody is a successful read of nothing', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const empty = await seedProject(admin.organizationId, admin.accountId, 'Nobody here');

    const response = await calendar(
      admin.cookies,
      admin.organizationId,
      `?startDate=${MONTH_START}&endDate=${MONTH_END}&scope=teams&projectIds=${empty.id}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.members).toEqual([]);
    expect(response.body.days).toHaveLength(30);
    expect(response.body.meta).toEqual({ scope: 'teams', memberCount: 0 });
  });

  // TC-01-INT-23
  it('an unrecognized or absent scope is refused, never defaulted to all', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const unknown = await calendar(
      admin.cookies,
      admin.organizationId,
      `?startDate=${MONTH_START}&endDate=${MONTH_END}&scope=everyone`,
    );
    const absent = await calendar(
      admin.cookies,
      admin.organizationId,
      `?startDate=${MONTH_START}&endDate=${MONTH_END}`,
    );
    for (const response of [unknown, absent]) {
      expect(response.status).toBe(422);
      expect(response.body.fields.scope).toBe('Choose All, Teams, or People.');
      expect(response.body.members).toBeUndefined();
    }
  });

  // TC-01-INT-24
  it('the organization country reads back what it stored, and is refused to a user and a viewer', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com', role: 'manager',
    });
    const user = await createMember(admin.organizationId, { email: 'u@acme.com', role: 'user' });
    const viewer = await createMember(admin.organizationId, { email: 'v@acme.com', role: 'viewer' });

    const first = await getOrgCountry(admin.cookies, admin.organizationId);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ countryCode: null });

    await setOrgCountry(admin.cookies, admin.organizationId, 'PL');
    const second = await getOrgCountry(admin.cookies, admin.organizationId);
    expect(second.body).toEqual({ countryCode: 'PL' });

    expect((await getOrgCountry(manager.cookies, admin.organizationId)).status).toBe(200);
    const refusedUser = await getOrgCountry(user.cookies, admin.organizationId);
    const refusedViewer = await getOrgCountry(viewer.cookies, admin.organizationId);
    expect(refusedUser.status).toBe(404);
    expect(refusedViewer.status).toBe(404);
    expect(refusedUser.body).toEqual(refusedViewer.body);
  });

  // TC-01-INT-25
  it('a member country overrides the organization, clearing returns them to it, and `pl` and `XX` are 400s', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com', role: 'manager',
    });
    const member = await createMember(admin.organizationId, {
      email: 'm@acme.com', role: 'user', firstName: 'Ivan', lastName: 'D', jobTitle: 'Engineer',
    });
    const american = await seedHoliday(admin.organizationId, admin.accountId, {
      date: '2026-09-07', name: 'Labor Day', countryCode: 'US',
    });
    const polish = await seedHoliday(admin.organizationId, admin.accountId, {
      date: '2026-09-16', name: 'Polish National Day', countryCode: 'PL',
    });
    await setOrgCountry(admin.cookies, admin.organizationId, 'PL');

    const stated = await updateMember(manager.cookies, admin.organizationId, member.membershipId, {
      role: 'user',
      jobTitle: 'Engineer',
      countryCode: 'US',
    });
    expect(stated.status).toBe(200);

    const afterStated = await calendar(admin.cookies, admin.organizationId, month());
    expect(rowFor(afterStated.body, member.membershipId).holidayIds).toEqual([american.id]);

    const cleared = await updateMember(manager.cookies, admin.organizationId, member.membershipId, {
      role: 'user',
      jobTitle: 'Engineer',
      countryCode: '',
    });
    expect(cleared.status).toBe(200);
    const storedCleared = await prisma.membership.findUniqueOrThrow({
      where: { id: member.membershipId },
    });
    expect(storedCleared.countryCode).toBeNull();
    expect(storedCleared.role).toBe('user');
    expect(storedCleared.jobTitle).toBe('Engineer');

    const afterCleared = await calendar(admin.cookies, admin.organizationId, month());
    expect(rowFor(afterCleared.body, member.membershipId).holidayIds).toEqual([polish.id]);

    // `pl` and `XX` are both refused, with 400 — the status this route already refuses an
    // invalid role and job title with, not the 422 the organization country write answers.
    // `XX` is the one that matters: the right shape, and storing it would leave a country
    // the read discards.
    for (const bad of ['pl', 'XX']) {
      const refused = await updateMember(
        manager.cookies,
        admin.organizationId,
        member.membershipId,
        { role: 'user', jobTitle: 'Engineer', countryCode: bad },
      );
      expect(refused.status).toBe(400);
      expect(refused.body).toEqual({ errors: { countryCode: 'Enter a valid country' } });
      const stillCleared = await prisma.membership.findUniqueOrThrow({
        where: { id: member.membershipId },
      });
      expect(stillCleared.countryCode).toBeNull();
    }
  });

  // TC-01-INT-26
  it('a caller without edit-detail is refused the member write, for others and for themselves', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const user = await createMember(admin.organizationId, { email: 'u@acme.com', role: 'user' });
    const other = await createMember(admin.organizationId, { email: 'o@acme.com', role: 'user' });

    for (const target of [other.membershipId, user.membershipId]) {
      const response = await updateMember(user.cookies, admin.organizationId, target, {
        role: 'user',
        jobTitle: '',
        countryCode: 'PL',
      });
      expect(response.status).toBe(403);
      expect(response.body.message).toBe(MEMBER_MESSAGES.editForbidden);
    }
  });

  // TC-01-INT-27
  it('the member detail read carries the STORED country, for every role it answers', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await setOrgCountry(admin.cookies, admin.organizationId, 'PL');
    const stated = await createMember(admin.organizationId, {
      email: 'stated@acme.com', role: 'user', countryCode: 'US',
    });
    const unstated = await createMember(admin.organizationId, {
      email: 'unstated@acme.com', role: 'user',
    });
    const user = await createMember(admin.organizationId, { email: 'u@acme.com', role: 'user' });
    const viewer = await createMember(admin.organizationId, { email: 'v@acme.com', role: 'viewer' });

    const first = await memberDetail(admin.cookies, admin.organizationId, stated.membershipId);
    expect(first.status).toBe(200);
    expect(first.body.countryCode).toBe('US');

    const second = await memberDetail(admin.cookies, admin.organizationId, unstated.membershipId);
    // The stored value, never the resolved one — the organization's PL is not this member's.
    expect(second.body.countryCode).toBeNull();

    const asUser = await memberDetail(user.cookies, admin.organizationId, stated.membershipId);
    const asViewer = await memberDetail(viewer.cookies, admin.organizationId, stated.membershipId);
    expect(asUser.status).toBe(200);
    expect(asViewer.status).toBe(200);
    // The field is not conditional on a capability. Compared field by field rather than
    // body to body: `callerRole`, `canEditRole` and `availableRoles` are the caller's.
    for (const body of [asUser.body, asViewer.body]) {
      expect(body.countryCode).toBe('US');
      expect(body.id).toBe(first.body.id);
      expect(body.fullName).toBe(first.body.fullName);
      expect(body.role).toBe(first.body.role);
      expect(body.jobTitle).toBe(first.body.jobTitle);
    }
  });

  // TC-01-INT-28
  it('a restored membership keeps its country, though the restore clears the job title', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const member = await createMember(admin.organizationId, {
      email: 'm@acme.com', role: 'user', firstName: 'Ivan', lastName: 'D', jobTitle: 'Engineer',
    });
    const american = await seedHoliday(admin.organizationId, admin.accountId, {
      date: '2026-09-07', name: 'Labor Day', countryCode: 'US',
    });
    await updateMember(admin.cookies, admin.organizationId, member.membershipId, {
      role: 'user',
      jobTitle: 'Engineer',
      countryCode: 'US',
    });

    await request(server())
      .delete(`/api/organizations/${admin.organizationId}/members/${member.membershipId}`)
      .set('Cookie', admin.cookies);
    const restored = await request(server())
      .post(`/api/organizations/${admin.organizationId}/members/${member.membershipId}/restore`)
      .set('Cookie', admin.cookies);
    expect(restored.status).toBe(200);

    const detail = await memberDetail(admin.cookies, admin.organizationId, member.membershipId);
    expect(detail.body.countryCode).toBe('US');
    expect(detail.body.jobTitle).toBeNull();

    const response = await calendar(admin.cookies, admin.organizationId, month());
    expect(rowFor(response.body, member.membershipId).holidayIds).toEqual([american.id]);
  });

  // TC-01-INT-29
  it('the holiday list beside the calendar resolves the same chain, and no phone country', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await seedHoliday(admin.organizationId, admin.accountId, {
      date: '2026-09-16', name: 'Polish National Day', countryCode: 'PL',
    });
    await seedHoliday(admin.organizationId, admin.accountId, {
      date: '2026-09-21', name: 'Company Day', countryCode: null,
    });
    const member = await createMember(admin.organizationId, {
      email: 'm@acme.com', role: 'user', countryCode: 'PL', phoneCountryCode: 'BY',
    });

    const mine = () =>
      request(server())
        .get(`/api/organizations/${admin.organizationId}/holidays?year=2026&scope=mine`)
        .set('Cookie', member.cookies);

    const viaMembership = await mine();
    expect(viaMembership.status).toBe(200);
    expect(viaMembership.body.holidays.map((h: any) => h.name).sort()).toEqual([
      'Company Day',
      'Polish National Day',
    ]);

    await prisma.membership.update({
      where: { id: member.membershipId },
      data: { countryCode: null },
    });
    await setOrgCountry(admin.cookies, admin.organizationId, 'PL');

    const viaOrganization = await mine();
    expect(viaOrganization.status).toBe(200);
    expect(viaOrganization.body.holidays.map((h: any) => h.name).sort()).toEqual([
      'Company Day',
      'Polish National Day',
    ]);
  });

  it('carries the tabulated refusal text on every 422 this route answers', () => {
    // The messages the cases above assert are the document's literal text; this pins the
    // exports they come from to the same words, so a reworded constant fails here rather
    // than quietly changing what every banner says.
    expect(TIME_OFF_CALENDAR_MESSAGES.rangeRequired).toBe('Choose a start and an end date.');
    expect(TIME_OFF_CALENDAR_MESSAGES.rangeInverted).toBe(
      'The end date must be on or after the start date.',
    );
    // Both country writes carry this one, and not `HOLIDAY_MESSAGES.countryCodeInvalid`
    // ("Country code must be 2 uppercase letters."), which is false of `XX`.
    expect(PROFILE_MESSAGES.country.invalid).toBe('Enter a valid country');
  });
});
