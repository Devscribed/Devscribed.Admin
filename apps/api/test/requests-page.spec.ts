import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

/** Cheap in tests — the policy under bcrypt doesn't depend on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

/** Machine clock is 2026; keep all seeded rows in the current calendar year. */
const CURRENT_YEAR = new Date().getUTCFullYear();

/** Today at midnight UTC. */
const todayUtc = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

/** The Monday at least 7 days out, shifted `weekOffset` whole weeks later. */
const futureMonday = (weekOffset = 0): Date => {
  const d = todayUtc();
  d.setUTCDate(d.getUTCDate() + 7);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCDate(d.getUTCDate() + weekOffset * 7);
  return d;
};

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * A future date range (current year) spanning `nWorkingDays` weekdays from a Monday.
 * `weekOffset` picks a later week so successive ranges do not overlap.
 */
const futureWorkingRange = (
  nWorkingDays: number,
  weekOffset = 0,
): { startDate: string; endDate: string } => {
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
  return { startDate: ymd(start), endDate: ymd(end) };
};

/** Parse a 'YYYY-MM-DD' string to midnight UTC (for @db.Date columns). */
const toDbDate = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

/**
 * Spec 10 - the organization-wide vacation feed, as it is read after requests spec 01.
 *
 * The feed itself is unchanged: the same query, the same balance math, the same card.
 * Two things around it moved, and every case here follows them rather than pinning what
 * they replaced. The response envelope now carries the vacation rows under `vacation`
 * (requests spec 01's API contract), and the `status` vocabulary on this endpoint is that
 * spec's - `open` selects `pending`, `granted` selects `approved`, `declined` selects
 * `rejected` - with the retired `pending`/`approved`/`rejected` values answering 400
 * (requirement 42, pinned by TC-01-INT-22).
 */
describe('Organization Requests page (spec 10)', () => {
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
    opts: { email: string; role: string; firstName?: string; lastName?: string; status?: string },
  ): Promise<Signed> => {
    const password = 'Passw0rd';
    const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: {
        email: opts.email,
        passwordHash,
        firstName: opts.firstName ?? 'Test',
        lastName: opts.lastName ?? 'User',
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

  const putFinancials = (cookies: string[], orgId: string, memberId: string) =>
    request(app.getHttpServer())
      .put(`/api/organizations/${orgId}/members/${memberId}/vacation/financials`)
      .set('Cookie', cookies)
      .send({
        monthlySalary: 3000,
        clientHourlyRate: 40,
        vacationDaysPerYear: 20,
        currency: 'USD',
        isReservePercentManual: false,
      });

  const submitRequest = (
    cookies: string[],
    orgId: string,
    memberId: string,
    body: { startDate: string; endDate: string },
  ) =>
    request(app.getHttpServer())
      .post(`/api/organizations/${orgId}/members/${memberId}/vacation/requests`)
      .set('Cookie', cookies)
      .send(body);

  const getRequests = (cookies: string[], orgId: string, query = '') =>
    request(app.getHttpServer())
      .get(`/api/organizations/${orgId}/requests${query}`)
      .set('Cookie', cookies);

  /** Seed a current-year reserve credit (createdAt defaults to now → counts this year). */
  const seedCredit = (membershipId: string, amount: number, month = 1) =>
    prisma.vacationReserveTransaction.create({
      data: {
        membershipId,
        type: 'credit',
        amount,
        billingPeriodMonth: month,
        billingPeriodYear: CURRENT_YEAR,
        description: 'seed',
        isAutoGenerated: true,
      },
    });

  const configureAndFund = async (admin: Signed, member: Signed, credit: number) => {
    await putFinancials(admin.cookies, admin.organizationId, member.membershipId);
    if (credit > 0) await seedCredit(member.membershipId, credit);
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
    await prisma.vacationRequest.deleteMany();
    await prisma.vacationReserveTransaction.deleteMany();
    await prisma.memberFinancialsSnapshot.deleteMany();
    await prisma.memberFinancials.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
  });

  // TC-10-INT-01
  it('returns pending requests across all org members with member info + balance', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m1 = await createMember(admin.organizationId, {
      email: 'm1@acme.com',
      role: 'user',
      firstName: 'Alex',
      lastName: 'Kaminski',
    });
    const m2 = await createMember(admin.organizationId, {
      email: 'm2@acme.com',
      role: 'user',
      firstName: 'Jane',
      lastName: 'Smith',
    });
    await configureAndFund(admin, m1, 3000);
    await configureAndFund(admin, m2, 3000);

    await submitRequest(m1.cookies, admin.organizationId, m1.membershipId, futureWorkingRange(5, 0));
    await submitRequest(m2.cookies, admin.organizationId, m2.membershipId, futureWorkingRange(3, 2));
    await submitRequest(m2.cookies, admin.organizationId, m2.membershipId, futureWorkingRange(2, 4));

    const res = await getRequests(admin.cookies, admin.organizationId, '?status=open');
    expect(res.status).toBe(200);
    expect(res.body.vacation.requests).toHaveLength(3);
    expect(res.body.vacation.pendingCount).toBe(3);

    // The two sections are separate arrays and are not to be confused: nobody raised a
    // spec-01 request here, so that half is empty while the vacation half is full.
    expect(res.body.requests).toEqual([]);
    expect(res.body.counts).toEqual({ waitingOnMe: 0, total: 0 });

    const memberIds = new Set(
      res.body.vacation.requests.map((r: any) => r.member.membershipId),
    );
    expect(memberIds).toEqual(new Set([m1.membershipId, m2.membershipId]));

    for (const r of res.body.vacation.requests) {
      expect(r.member).toMatchObject({ firstName: expect.any(String), initials: expect.any(String) });
      expect(r.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.memberBalance).toMatchObject({
        availableDays: expect.any(Number),
        usedDays: expect.any(Number),
        pendingDays: expect.any(Number),
        totalDaysPerYear: 20,
      });
    }
    const alex = res.body.vacation.requests.find(
      (r: any) => r.member.membershipId === m1.membershipId,
    );
    expect(alex.member.initials).toBe('AK');
  });

  // TC-10-INT-02 - the same filtering, read through this page's vocabulary.
  it('filters by status (all / granted / open / declined)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, {
      email: 'm@acme.com',
      role: 'user',
      firstName: 'Mary',
      lastName: 'Poe',
    });
    await configureAndFund(admin, m, 3000);

    // 1 pending — submitted via the API.
    await submitRequest(m.cookies, admin.organizationId, m.membershipId, futureWorkingRange(5, 0));

    // 1 approved — seeded directly with its debit transaction.
    const approvedRange = futureWorkingRange(5, 2);
    const approved = await prisma.vacationRequest.create({
      data: {
        membershipId: m.membershipId,
        startDate: toDbDate(approvedRange.startDate),
        endDate: toDbDate(approvedRange.endDate),
        workingDays: 5,
        deductionAmount: 692.31,
        status: 'approved',
        reviewedAt: new Date(),
        reviewedByAccountId: admin.accountId,
      },
    });
    await prisma.vacationReserveTransaction.create({
      data: {
        membershipId: m.membershipId,
        type: 'debit',
        amount: -692.31,
        vacationRequestId: approved.id,
        isAutoGenerated: false,
        createdByAccountId: admin.accountId,
      },
    });

    // 1 rejected — seeded directly with reviewer info.
    const rejectedRange = futureWorkingRange(3, 4);
    await prisma.vacationRequest.create({
      data: {
        membershipId: m.membershipId,
        startDate: toDbDate(rejectedRange.startDate),
        endDate: toDbDate(rejectedRange.endDate),
        workingDays: 3,
        deductionAmount: 415.38,
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedByAccountId: admin.accountId,
        reviewerComment: 'Team availability conflict',
      },
    });

    const all = await getRequests(admin.cookies, admin.organizationId, '?status=all');
    expect(all.status).toBe(200);
    expect(all.body.vacation.requests).toHaveLength(3);
    expect(all.body.vacation.pendingCount).toBe(1);
    expect(all.body.vacation.requests.map((r: any) => r.status).sort()).toEqual([
      'approved',
      'pending',
      'rejected',
    ]);

    const grantedRes = await getRequests(admin.cookies, admin.organizationId, '?status=granted');
    expect(grantedRes.body.vacation.requests).toHaveLength(1);
    expect(grantedRes.body.vacation.requests[0].status).toBe('approved');

    const openRes = await getRequests(admin.cookies, admin.organizationId, '?status=open');
    expect(openRes.body.vacation.requests).toHaveLength(1);
    expect(openRes.body.vacation.requests[0].status).toBe('pending');

    const declinedRes = await getRequests(admin.cookies, admin.organizationId, '?status=declined');
    expect(declinedRes.body.vacation.requests).toHaveLength(1);
    expect(declinedRes.body.vacation.requests[0].status).toBe('rejected');
    expect(declinedRes.body.vacation.requests[0].reviewerComment).toBe(
      'Team availability conflict',
    );

    // Every counter is filter-independent, which is the fact the retired `totalCount`
    // used to pin and which `counts` + `vacation.pendingCount` carry now. A number that
    // moved when someone narrowed a filter would be reporting the view, not the work.
    expect(grantedRes.body.vacation.pendingCount).toBe(1);
    expect(openRes.body.vacation.pendingCount).toBe(1);
    expect(declinedRes.body.vacation.pendingCount).toBe(1);
    expect(grantedRes.body.counts).toEqual(all.body.counts);
    expect(openRes.body.counts).toEqual(all.body.counts);
    expect(declinedRes.body.counts).toEqual(all.body.counts);
  });

  // TC-10-INT-03 - reversed by requests spec 01 requirement 37, which opens the page to
  // every signed-in member and moves the `view-requests` gate inward to the vacation
  // section. What used to be a 403 for `user` and `viewer` is now a 200 carrying their
  // own requests and no `vacation` key at all. The whole rule, including the `scope=all`
  // refusal that replaced the page-level one, belongs to TC-01-INT-18 and TC-01-E2E-08;
  // this keeps a guard on this file's own route against the page-level refusal coming
  // back.
  it('lets user and viewer read the endpoint, with no vacation section and no All scope', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const u = await createMember(admin.organizationId, { email: 'u@acme.com', role: 'user' });
    const v = await createMember(admin.organizationId, { email: 'v@acme.com', role: 'viewer' });

    const uRes = await getRequests(u.cookies, admin.organizationId);
    expect(uRes.status).toBe(200);
    expect(uRes.body.vacation).toBeUndefined();
    expect(uRes.body.requests).toEqual([]);
    expect(uRes.body.counts).toEqual({ waitingOnMe: 0, total: 0 });

    const vRes = await getRequests(v.cookies, admin.organizationId);
    expect(vRes.status).toBe(200);
    expect(vRes.body.vacation).toBeUndefined();
    expect(vRes.body.requests).toEqual([]);
    expect(vRes.body.counts).toEqual({ waitingOnMe: 0, total: 0 });

    // The refusal did not disappear, it moved: the page-level 403 becomes the `All`
    // scope's, which is the only 403 this route may still emit. Asserted with the spec's
    // literal copy rather than the constant the code imports.
    const uScopeAll = await getRequests(u.cookies, admin.organizationId, '?scope=all');
    expect(uScopeAll.status).toBe(403);
    expect(uScopeAll.body).toEqual({
      error: 'forbidden',
      message: "You do not have permission to view other people's requests",
    });

    const vScopeAll = await getRequests(v.cookies, admin.organizationId, '?scope=all');
    expect(vScopeAll.status).toBe(403);
    expect(vScopeAll.body.error).toBe('forbidden');
    expect(vScopeAll.body.message).toBe(
      "You do not have permission to view other people's requests",
    );
  });

  // Default filter (no status param) is `all` since requests spec 01 requirement 42 -
  // both sections default to every row rather than to the pending-only view.
  it('defaults to all when no status param is given', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });
    await configureAndFund(admin, m, 3000);

    await submitRequest(m.cookies, admin.organizationId, m.membershipId, futureWorkingRange(5, 0));
    const rejectedRange = futureWorkingRange(3, 2);
    await prisma.vacationRequest.create({
      data: {
        membershipId: m.membershipId,
        startDate: toDbDate(rejectedRange.startDate),
        endDate: toDbDate(rejectedRange.endDate),
        workingDays: 3,
        deductionAmount: 415.38,
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedByAccountId: admin.accountId,
      },
    });

    const res = await getRequests(admin.cookies, admin.organizationId);
    expect(res.status).toBe(200);
    expect(res.body.vacation.requests).toHaveLength(2);
    expect(res.body.vacation.requests.map((r: any) => r.status).sort()).toEqual([
      'pending',
      'rejected',
    ]);
    expect(res.body.vacation.pendingCount).toBe(1);
    expect(res.body.counts).toEqual({ waitingOnMe: 0, total: 0 });

    // The value this case used to send by default is now refused outright: a closed set
    // is only a contract if breaking it is observable.
    const retired = await getRequests(admin.cookies, admin.organizationId, '?status=pending');
    expect(retired.status).toBe(400);
    expect(retired.body).toEqual({
      error: 'validation_error',
      fields: { status: 'unknown_value' },
    });
  });

  // Sorting — two pending requests come back oldest-first.
  it('sorts pending requests oldest requestedAt first', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });
    await configureAndFund(admin, m, 3000);

    const olderRange = futureWorkingRange(3, 0);
    const older = await prisma.vacationRequest.create({
      data: {
        membershipId: m.membershipId,
        startDate: toDbDate(olderRange.startDate),
        endDate: toDbDate(olderRange.endDate),
        workingDays: 3,
        deductionAmount: 415.38,
        status: 'pending',
        requestedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    const newerRange = futureWorkingRange(3, 2);
    const newer = await prisma.vacationRequest.create({
      data: {
        membershipId: m.membershipId,
        startDate: toDbDate(newerRange.startDate),
        endDate: toDbDate(newerRange.endDate),
        workingDays: 3,
        deductionAmount: 415.38,
        status: 'pending',
        requestedAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    });

    const res = await getRequests(admin.cookies, admin.organizationId, '?status=open');
    expect(res.body.vacation.requests.map((r: any) => r.id)).toEqual([older.id, newer.id]);
  });
});
