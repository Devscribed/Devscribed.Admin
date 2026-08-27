import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { REQUEST_MESSAGES } from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

/** Cheap in tests — the policy under bcrypt doesn't depend on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

/**
 * The machine clock is in 2026, and requirement 3 forbids past-dated starts, so every
 * request window is computed dynamically in the CURRENT calendar year (today is August,
 * so September ranges are safely future-dated and in-year).
 */
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
 * A future date range (in the current year) spanning exactly `nWorkingDays` weekdays,
 * starting on a Monday. `weekOffset` picks a later week so successive ranges do not
 * overlap. 5 working days → Mon–Fri; 3 → Mon–Wed.
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

describe('Vacation requests (spec 09)', () => {
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

  const getVacation = (cookies: string[], orgId: string, memberId: string) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${orgId}/members/${memberId}/vacation`)
      .set('Cookie', cookies);

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

  const reviewRequest = (
    cookies: string[],
    orgId: string,
    memberId: string,
    requestId: string,
    body: { decision: string; comment?: string },
  ) =>
    request(app.getHttpServer())
      .put(`/api/organizations/${orgId}/members/${memberId}/vacation/requests/${requestId}/review`)
      .set('Cookie', cookies)
      .send(body);

  const cancelRequest = (
    cookies: string[],
    orgId: string,
    memberId: string,
    requestId: string,
  ) =>
    request(app.getHttpServer())
      .put(`/api/organizations/${orgId}/members/${memberId}/vacation/requests/${requestId}/cancel`)
      .set('Cookie', cookies);

  const deleteMember = (cookies: string[], orgId: string, memberId: string) =>
    request(app.getHttpServer())
      .delete(`/api/organizations/${orgId}/members/${memberId}`)
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

  /** Configure a member's financials (salary 3000 → dailySalary 138.46) and fund the reserve. */
  const configureAndFund = async (admin: Signed, member: Signed, credit: number) => {
    await putFinancials(admin.cookies, admin.organizationId, member.membershipId);
    if (credit > 0) await seedCredit(member.membershipId, credit);
  };

  const reserveBalance = async (membershipId: string): Promise<number> => {
    const txns = await prisma.vacationReserveTransaction.findMany({ where: { membershipId } });
    return txns
      .filter((t) => t.createdAt.getUTCFullYear() === CURRENT_YEAR)
      .reduce((sum, t) => sum + t.amount.toNumber(), 0);
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

  // TC-09-INT-01
  it('submits a request (happy path) and reflects the pending hold in the balance', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });
    await configureAndFund(admin, m, 1500); // ~10 available days

    const before = await getVacation(m.cookies, admin.organizationId, m.membershipId);
    const availableBefore = before.body.balance.availableDays as number;

    const range = futureWorkingRange(5);
    const res = await submitRequest(m.cookies, admin.organizationId, m.membershipId, range);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ workingDays: 5, status: 'pending' });

    const after = await getVacation(m.cookies, admin.organizationId, m.membershipId);
    expect(after.body.balance.pendingDays).toBe(5);
    expect(after.body.balance.availableDays).toBe(availableBefore - 5);
    expect(after.body.requests).toHaveLength(1);
  });

  // TC-09-INT-02
  it('rejects a request that exceeds the available balance (insufficient_balance)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });
    await configureAndFund(admin, m, 300); // floor(300 / 138.46) = 2 days

    const range = futureWorkingRange(5);
    const res = await submitRequest(m.cookies, admin.organizationId, m.membershipId, range);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'insufficient_balance',
      message: REQUEST_MESSAGES.insufficientBalance(2),
    });
  });

  // TC-09-INT-03
  it('rejects a request that overlaps an existing one (overlap)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });
    await configureAndFund(admin, m, 3000); // plenty

    const first = futureWorkingRange(5);
    const r1 = await submitRequest(m.cookies, admin.organizationId, m.membershipId, first);
    expect(r1.status).toBe(201);

    // Overlaps the first window: starts on its Wednesday.
    const overlapStart = toDbDate(first.startDate);
    overlapStart.setUTCDate(overlapStart.getUTCDate() + 2);
    const overlapEnd = new Date(overlapStart);
    overlapEnd.setUTCDate(overlapEnd.getUTCDate() + 1);
    const res = await submitRequest(m.cookies, admin.organizationId, m.membershipId, {
      startDate: ymd(overlapStart),
      endDate: ymd(overlapEnd),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('overlap');
  });

  // TC-09-INT-04
  it('rejects a cross-year request (cross_year)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });
    await configureAndFund(admin, m, 3000);

    const res = await submitRequest(m.cookies, admin.organizationId, m.membershipId, {
      startDate: `${CURRENT_YEAR}-12-29`,
      endDate: `${CURRENT_YEAR + 1}-01-02`,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('cross_year');
  });

  // TC-09-INT-05
  it('forbids submitting for another member (forbidden)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const u = await createMember(admin.organizationId, { email: 'u@acme.com', role: 'user' });
    await putFinancials(admin.cookies, admin.organizationId, admin.membershipId);

    const range = futureWorkingRange(5);
    const res = await submitRequest(u.cookies, admin.organizationId, admin.membershipId, range);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'forbidden',
      message: REQUEST_MESSAGES.forAnotherMember,
    });
  });

  // TC-09-INT-06
  it('approves a pending request (happy path) — debit written, balance moves', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });
    await configureAndFund(admin, m, 1500);

    const range = futureWorkingRange(5);
    const submitted = await submitRequest(m.cookies, admin.organizationId, m.membershipId, range);
    const requestId = submitted.body.id as string;

    const res = await reviewRequest(admin.cookies, admin.organizationId, m.membershipId, requestId, {
      decision: 'approved',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, status: 'approved' });

    const debits = await prisma.vacationReserveTransaction.findMany({
      where: { membershipId: m.membershipId, type: 'debit' },
    });
    expect(debits).toHaveLength(1);
    expect(debits[0].amount.toNumber()).toBe(-692.31);
    expect(debits[0].vacationRequestId).toBe(requestId);

    const get = await getVacation(admin.cookies, admin.organizationId, m.membershipId);
    expect(get.body.balance.usedDays).toBe(5);
    expect(get.body.balance.pendingDays).toBe(0);
    expect(get.body.balance.reserveBalance).toBe(807.69); // 1500 - 692.31
  });

  // TC-09-INT-07
  it('forbids self-approval (self_approval) — request stays pending', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await configureAndFund(admin, admin, 1500);

    const range = futureWorkingRange(5);
    const submitted = await submitRequest(admin.cookies, admin.organizationId, admin.membershipId, range);
    expect(submitted.status).toBe(201);
    const requestId = submitted.body.id as string;

    const res = await reviewRequest(
      admin.cookies,
      admin.organizationId,
      admin.membershipId,
      requestId,
      { decision: 'approved' },
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('self_approval');

    const request = await prisma.vacationRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe('pending');
  });

  // TC-09-INT-08
  it('rejects a pending request with a comment — no debit, hold released', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const g = await createMember(admin.organizationId, { email: 'g@acme.com', role: 'manager' });
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });
    await configureAndFund(admin, m, 1500);

    const range = futureWorkingRange(5);
    const submitted = await submitRequest(m.cookies, admin.organizationId, m.membershipId, range);
    const requestId = submitted.body.id as string;

    const res = await reviewRequest(g.cookies, admin.organizationId, m.membershipId, requestId, {
      decision: 'rejected',
      comment: 'Team capacity',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, status: 'rejected' });

    const get = await getVacation(admin.cookies, admin.organizationId, m.membershipId);
    const row = get.body.requests.find((r: { id: string }) => r.id === requestId);
    expect(row.status).toBe('rejected');
    expect(row.reviewerComment).toBe('Team capacity');
    expect(get.body.balance.pendingDays).toBe(0);
    expect(
      await prisma.vacationReserveTransaction.count({
        where: { membershipId: m.membershipId, type: 'debit' },
      }),
    ).toBe(0);
  });

  // TC-09-INT-09
  it('cancels an own pending request (refunded:false) — no new transaction', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });
    await configureAndFund(admin, m, 1500);

    const range = futureWorkingRange(5);
    const submitted = await submitRequest(m.cookies, admin.organizationId, m.membershipId, range);
    const requestId = submitted.body.id as string;

    const res = await cancelRequest(m.cookies, admin.organizationId, m.membershipId, requestId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, refunded: false });

    const request = await prisma.vacationRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe('cancelled');
    // Only the seed credit exists — no debit/refund.
    const txns = await prisma.vacationReserveTransaction.findMany({
      where: { membershipId: m.membershipId },
    });
    expect(txns).toHaveLength(1);
    expect(txns[0].type).toBe('credit');
  });

  // TC-09-INT-10
  it('cancels an approved request as a manager (refund) — reserve refunded', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const g = await createMember(admin.organizationId, { email: 'g@acme.com', role: 'manager' });
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });
    await configureAndFund(admin, m, 1500);

    const range = futureWorkingRange(5);
    const submitted = await submitRequest(m.cookies, admin.organizationId, m.membershipId, range);
    const requestId = submitted.body.id as string;
    await reviewRequest(admin.cookies, admin.organizationId, m.membershipId, requestId, {
      decision: 'approved',
    });

    const res = await cancelRequest(g.cookies, admin.organizationId, m.membershipId, requestId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, refunded: true, refundAmount: 692.31 });

    const refunds = await prisma.vacationReserveTransaction.findMany({
      where: { membershipId: m.membershipId, type: 'refund' },
    });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount.toNumber()).toBe(692.31);
    expect(refunds[0].vacationRequestId).toBe(requestId);

    // 1500 (credit) − 692.31 (debit) + 692.31 (refund) = 1500.
    expect(await reserveBalance(m.membershipId)).toBeCloseTo(1500, 2);
  });

  // TC-09-INT-11
  it('forbids a user from cancelling their own approved request (forbidden)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });
    await configureAndFund(admin, m, 1500);

    const range = futureWorkingRange(5);
    const submitted = await submitRequest(m.cookies, admin.organizationId, m.membershipId, range);
    const requestId = submitted.body.id as string;
    await reviewRequest(admin.cookies, admin.organizationId, m.membershipId, requestId, {
      decision: 'approved',
    });

    const res = await cancelRequest(m.cookies, admin.organizationId, m.membershipId, requestId);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');

    const request = await prisma.vacationRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe('approved');
  });

  // TC-09-INT-12
  it('serializes concurrent approvals — exactly one succeeds, no double-debit', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const g = await createMember(admin.organizationId, { email: 'g@acme.com', role: 'manager' });
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });
    await putFinancials(admin.cookies, admin.organizationId, m.membershipId);
    await seedCredit(m.membershipId, 700); // floor(700 / 138.46) = 5 available days

    // Two pending requests, 3 working days each, seeded directly.
    const r1Range = futureWorkingRange(3, 0);
    const r2Range = futureWorkingRange(3, 2);
    const r1 = await prisma.vacationRequest.create({
      data: {
        membershipId: m.membershipId,
        startDate: toDbDate(r1Range.startDate),
        endDate: toDbDate(r1Range.endDate),
        workingDays: 3,
        deductionAmount: 415.38,
        status: 'pending',
      },
    });
    const r2 = await prisma.vacationRequest.create({
      data: {
        membershipId: m.membershipId,
        startDate: toDbDate(r2Range.startDate),
        endDate: toDbDate(r2Range.endDate),
        workingDays: 3,
        deductionAmount: 415.38,
        status: 'pending',
      },
    });

    const [a, b] = await Promise.allSettled([
      reviewRequest(admin.cookies, admin.organizationId, m.membershipId, r1.id, {
        decision: 'approved',
      }),
      reviewRequest(g.cookies, admin.organizationId, m.membershipId, r2.id, {
        decision: 'approved',
      }),
    ]);

    const statuses = [a, b].map((r) => (r.status === 'fulfilled' ? r.value.status : 0));
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 400)).toHaveLength(1);

    const failed = [a, b].find((r) => r.status === 'fulfilled' && r.value.status === 400);
    if (failed && failed.status === 'fulfilled') {
      expect(failed.value.body.error).toBe('insufficient_balance');
    }

    // Exactly one debit — the second approval was blocked atomically.
    expect(
      await prisma.vacationReserveTransaction.count({
        where: { membershipId: m.membershipId, type: 'debit' },
      }),
    ).toBe(1);
  });

  // TC-09-INT-13
  it('auto-cancels requests on member removal (pending → cancelled, future approved → refund)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });
    await putFinancials(admin.cookies, admin.organizationId, m.membershipId);
    await seedCredit(m.membershipId, 1500);

    // R1 — pending.
    const r1Range = futureWorkingRange(5, 0);
    const r1 = await prisma.vacationRequest.create({
      data: {
        membershipId: m.membershipId,
        startDate: toDbDate(r1Range.startDate),
        endDate: toDbDate(r1Range.endDate),
        workingDays: 5,
        deductionAmount: 692.31,
        status: 'pending',
      },
    });

    // R2 — approved, future-dated, with its debit transaction.
    const r2Range = futureWorkingRange(5, 2);
    const r2 = await prisma.vacationRequest.create({
      data: {
        membershipId: m.membershipId,
        startDate: toDbDate(r2Range.startDate),
        endDate: toDbDate(r2Range.endDate),
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
        vacationRequestId: r2.id,
        isAutoGenerated: false,
        createdByAccountId: admin.accountId,
      },
    });

    const del = await deleteMember(admin.cookies, admin.organizationId, m.membershipId);
    expect(del.status).toBe(200);

    const r1After = await prisma.vacationRequest.findUniqueOrThrow({ where: { id: r1.id } });
    const r2After = await prisma.vacationRequest.findUniqueOrThrow({ where: { id: r2.id } });
    expect(r1After.status).toBe('cancelled');
    expect(r2After.status).toBe('cancelled');

    // R1 (pending) → no refund; R2 (future approved) → a compensating refund.
    const refunds = await prisma.vacationReserveTransaction.findMany({
      where: { membershipId: m.membershipId, type: 'refund' },
    });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].vacationRequestId).toBe(r2.id);
    expect(refunds[0].amount.toNumber()).toBe(692.31);
  });
});
