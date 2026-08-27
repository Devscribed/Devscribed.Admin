import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FINANCIALS_MESSAGES, MEMBER_MESSAGES } from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

/** Cheap in tests — the policy under bcrypt doesn't depend on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

describe('Vacation financial settings (spec 07)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  interface Signed {
    cookies: string[];
    accountId: string;
    organizationId: string;
    membershipId: string;
    role: string;
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
    return { cookies, accountId, organizationId, membershipId: membership.id, role: 'admin' };
  };

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/api/login').send({ email, password });

  const createMember = async (
    organizationId: string,
    opts: { email: string; role: string; status?: string },
  ): Promise<Signed> => {
    const password = 'Passw0rd';
    const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: {
        email: opts.email,
        passwordHash,
        firstName: 'Test',
        lastName: 'User',
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

  const getVacation = (cookies: string[], orgId: string, memberId: string) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${orgId}/members/${memberId}/vacation`)
      .set('Cookie', cookies);

  const putFinancials = (
    cookies: string[],
    orgId: string,
    memberId: string,
    body: Record<string, unknown>,
  ) =>
    request(app.getHttpServer())
      .put(`/api/organizations/${orgId}/members/${memberId}/vacation/financials`)
      .set('Cookie', cookies)
      .send(body);

  const todayDateOnly = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
    await prisma.memberFinancialsSnapshot.deleteMany();
    await prisma.memberFinancials.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
  });

  // TC-07-INT-01
  it('creates financial settings (auto) and returns 3.33 with exactly one snapshot for today', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    const put = await putFinancials(admin.cookies, admin.organizationId, m.membershipId, {
      monthlySalary: 3000,
      clientHourlyRate: 40,
      vacationDaysPerYear: 20,
      currency: 'USD',
      isReservePercentManual: false,
    });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ success: true, vacationReservePercent: 3.33 });

    const snapshots = await prisma.memberFinancialsSnapshot.findMany({
      where: { membershipId: m.membershipId },
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].effectiveFrom.getTime()).toBe(todayDateOnly().getTime());
    expect(snapshots[0].vacationReservePercent.toNumber()).toBe(3.33);

    const get = await getVacation(admin.cookies, admin.organizationId, m.membershipId);
    expect(get.status).toBe(200);
    expect(get.body).toEqual({
      financials: {
        monthlySalary: 3000,
        clientHourlyRate: 40,
        vacationReservePercent: 3.33,
        isReservePercentManual: false,
        vacationDaysPerYear: 20,
        currency: 'USD',
      },
      balance: {
        reserveBalance: 0,
        availableDays: 0,
        usedDays: 0,
        pendingDays: 0,
        totalDaysPerYear: 20,
      },
      canEdit: true,
      canReviewRequests: false,
      canSubmitRequest: false,
    });
  });

  // TC-07-INT-02
  it('stores a manual reserve percent verbatim (5.00)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    const put = await putFinancials(admin.cookies, admin.organizationId, m.membershipId, {
      monthlySalary: 3000,
      clientHourlyRate: 40,
      vacationDaysPerYear: 20,
      currency: 'USD',
      isReservePercentManual: true,
      vacationReservePercent: 5.0,
    });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ success: true, vacationReservePercent: 5 });

    const get = await getVacation(admin.cookies, admin.organizationId, m.membershipId);
    expect(get.body.financials.vacationReservePercent).toBe(5);
    expect(get.body.financials.isReservePercentManual).toBe(true);
  });

  // TC-07-INT-03
  it('rejects each invalid field with 400 and the matching message', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    const base = {
      monthlySalary: 3000,
      clientHourlyRate: 40,
      vacationDaysPerYear: 20,
      currency: 'USD',
      isReservePercentManual: false,
    };
    const cases: Array<[Record<string, unknown>, string, string]> = [
      [{ monthlySalary: 0 }, 'monthlySalary', FINANCIALS_MESSAGES.monthlySalaryRange],
      [{ monthlySalary: 1000000 }, 'monthlySalary', FINANCIALS_MESSAGES.monthlySalaryRange],
      [{ clientHourlyRate: -5 }, 'clientHourlyRate', FINANCIALS_MESSAGES.clientHourlyRateRange],
      [{ vacationDaysPerYear: 0 }, 'vacationDaysPerYear', FINANCIALS_MESSAGES.vacationDaysRange],
      [{ currency: 'XXXX' }, 'currency', FINANCIALS_MESSAGES.invalidCurrency],
      [
        { isReservePercentManual: true, vacationReservePercent: 100 },
        'vacationReservePercent',
        FINANCIALS_MESSAGES.reservePercentRange,
      ],
    ];

    for (const [override, field, message] of cases) {
      const response = await putFinancials(admin.cookies, admin.organizationId, m.membershipId, {
        ...base,
        ...override,
      });
      expect(response.status).toBe(400);
      expect(response.body.errors[field]).toBe(message);
    }

    // No financials were persisted by any rejected write.
    const financials = await prisma.memberFinancials.findUnique({
      where: { membershipId: m.membershipId },
    });
    expect(financials).toBeNull();
  });

  // TC-07-INT-04
  it('forbids user and viewer from editing financials (403)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const target = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });
    const user = await createMember(admin.organizationId, { email: 'usr@acme.com', role: 'user' });
    const viewer = await createMember(admin.organizationId, { email: 'v@acme.com', role: 'viewer' });

    const body = {
      monthlySalary: 3000,
      clientHourlyRate: 40,
      vacationDaysPerYear: 20,
      currency: 'USD',
      isReservePercentManual: false,
    };

    for (const caller of [user, viewer]) {
      const response = await putFinancials(caller.cookies, admin.organizationId, target.membershipId, body);
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: 'forbidden',
        message: FINANCIALS_MESSAGES.editForbidden,
      });
    }

    const financials = await prisma.memberFinancials.findUnique({
      where: { membershipId: target.membershipId },
    });
    expect(financials).toBeNull();
  });

  // TC-07-INT-05
  it('recalculates the auto percent on salary change and appends a second snapshot', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    const first = await putFinancials(admin.cookies, admin.organizationId, m.membershipId, {
      monthlySalary: 3000,
      clientHourlyRate: 40,
      vacationDaysPerYear: 20,
      currency: 'USD',
      isReservePercentManual: false,
    });
    expect(first.body.vacationReservePercent).toBe(3.33);

    const second = await putFinancials(admin.cookies, admin.organizationId, m.membershipId, {
      monthlySalary: 4000,
      clientHourlyRate: 40,
      vacationDaysPerYear: 20,
      currency: 'USD',
      isReservePercentManual: false,
    });
    expect(second.status).toBe(200);
    expect(second.body.vacationReservePercent).toBe(4.44);

    // The live record reflects the latest values; two immutable snapshots exist.
    const financials = await prisma.memberFinancials.findUniqueOrThrow({
      where: { membershipId: m.membershipId },
    });
    expect(financials.monthlySalary.toNumber()).toBe(4000);
    expect(financials.vacationReservePercent.toNumber()).toBe(4.44);

    const snapshots = await prisma.memberFinancialsSnapshot.findMany({
      where: { membershipId: m.membershipId },
      orderBy: { createdAt: 'asc' },
    });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].vacationReservePercent.toNumber()).toBe(3.33);
    expect(snapshots[1].vacationReservePercent.toNumber()).toBe(4.44);
    expect(snapshots[1].monthlySalary.toNumber()).toBe(4000);
  });

  // TC-07-INT-06
  it('rejects configuring a removed member (400 member_removed)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const removed = await createMember(admin.organizationId, {
      email: 'r@acme.com',
      role: 'user',
      status: 'removed',
    });

    const response = await putFinancials(admin.cookies, admin.organizationId, removed.membershipId, {
      monthlySalary: 3000,
      clientHourlyRate: 40,
      vacationDaysPerYear: 20,
      currency: 'USD',
      isReservePercentManual: false,
    });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'member_removed',
      message: FINANCIALS_MESSAGES.memberRemoved,
    });
  });

  // TC-07-INT-07
  it('lets a user see own vacation (days only) but 403 on another member', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const u = await createMember(admin.organizationId, { email: 'u@acme.com', role: 'user' });
    const other = await createMember(admin.organizationId, { email: 'o@acme.com', role: 'user' });

    // Admin configures both members.
    for (const target of [u, other]) {
      await putFinancials(admin.cookies, admin.organizationId, target.membershipId, {
        monthlySalary: 3000,
        clientHourlyRate: 40,
        vacationDaysPerYear: 20,
        currency: 'USD',
        isReservePercentManual: false,
      });
    }

    const own = await getVacation(u.cookies, admin.organizationId, u.membershipId);
    expect(own.status).toBe(200);
    expect(own.body).toEqual({
      financials: null,
      balance: {
        reserveBalance: null,
        availableDays: 0,
        usedDays: 0,
        pendingDays: 0,
        totalDaysPerYear: 20,
      },
      canEdit: false,
      canReviewRequests: false,
      canSubmitRequest: false,
    });

    const another = await getVacation(u.cookies, admin.organizationId, other.membershipId);
    expect(another.status).toBe(403);
    expect(another.body).toEqual({
      error: 'forbidden',
      message: FINANCIALS_MESSAGES.viewForbidden,
    });
  });

  // TC-07-INT-08
  it('forbids a viewer from viewing any member vacation, including their own', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });
    const viewer = await createMember(admin.organizationId, { email: 'v@acme.com', role: 'viewer' });

    await putFinancials(admin.cookies, admin.organizationId, m.membershipId, {
      monthlySalary: 3000,
      clientHourlyRate: 40,
      vacationDaysPerYear: 20,
      currency: 'USD',
      isReservePercentManual: false,
    });

    for (const memberId of [m.membershipId, viewer.membershipId]) {
      const response = await getVacation(viewer.cookies, admin.organizationId, memberId);
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: 'forbidden',
        message: FINANCIALS_MESSAGES.viewForbidden,
      });
    }
  });

  // Additional coverage: GET on an unconfigured member (admin) — the empty-state shape.
  it('returns the unconfigured shape for admin/manager when no financials exist', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    const response = await getVacation(admin.cookies, admin.organizationId, m.membershipId);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      financials: null,
      balance: null,
      canEdit: true,
      canReviewRequests: false,
      canSubmitRequest: false,
    });
  });

  // Additional coverage: GET 404 for a non-existent member.
  it('returns 404 for a non-existent member', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const response = await getVacation(admin.cookies, admin.organizationId, 'fabricated-id');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found', message: MEMBER_MESSAGES.memberNotFound });
  });

  // Additional coverage: user viewing OWN unconfigured membership → balance null.
  it('returns balance null for a user viewing their own unconfigured membership', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const u = await createMember(admin.organizationId, { email: 'u@acme.com', role: 'user' });

    const response = await getVacation(u.cookies, admin.organizationId, u.membershipId);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      financials: null,
      balance: null,
      canEdit: false,
      canReviewRequests: false,
      canSubmitRequest: false,
    });
  });
});
