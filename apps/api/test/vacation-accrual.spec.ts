import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ACCRUAL_MESSAGES,
  calculateMonthlyCredit,
  calculateReservePercent,
  prorateCredit,
  workingDaysFromDateToMonthEnd,
  workingDaysInMonth,
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

describe('Vacation reserve auto-accrual (spec 08)', () => {
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

  const getVacation = (cookies: string[], orgId: string, memberId: string) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${orgId}/members/${memberId}/vacation`)
      .set('Cookie', cookies);

  const runAccrual = (cookies: string[], body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/admin/accrual/run').set('Cookie', cookies).send(body);

  /** Set effectiveFrom (date-only, UTC) on a membership's snapshot(s), optionally filtered by salary. */
  const backdateSnapshots = (membershipId: string, isoDate: string, monthlySalary?: number) =>
    prisma.memberFinancialsSnapshot.updateMany({
      where:
        monthlySalary === undefined ? { membershipId } : { membershipId, monthlySalary },
      data: { effectiveFrom: new Date(`${isoDate}T00:00:00.000Z`) },
    });

  const AUTO_FINANCIALS = {
    monthlySalary: 3000,
    clientHourlyRate: 40,
    vacationDaysPerYear: 20,
    currency: 'USD',
    isReservePercentManual: false,
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
    await prisma.vacationReserveTransaction.deleteMany();
    await prisma.memberFinancialsSnapshot.deleteMany();
    await prisma.memberFinancials.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
  });

  // TC-08-INT-01
  it('creates a full-month credit and exposes it in balance and transactions', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    await putFinancials(admin.cookies, admin.organizationId, m.membershipId, AUTO_FINANCIALS);
    await backdateSnapshots(m.membershipId, '2025-05-01');

    const run = await runAccrual(admin.cookies, { month: 6, year: 2025 });
    expect(run.status).toBe(200);
    expect(run.body.creditsCreated).toBe(1);

    const txns = await prisma.vacationReserveTransaction.findMany({
      where: { membershipId: m.membershipId },
    });
    expect(txns).toHaveLength(1);
    expect(txns[0].type).toBe('credit');
    expect(txns[0].amount.toNumber()).toBe(230.88);
    expect(txns[0].billingPeriodMonth).toBe(6);
    expect(txns[0].billingPeriodYear).toBe(2025);
    expect(txns[0].isAutoGenerated).toBe(true);
    expect(txns[0].createdByAccountId).toBeNull();

    const get = await getVacation(admin.cookies, admin.organizationId, m.membershipId);
    expect(get.status).toBe(200);
    expect(get.body.balance.reserveBalance).toBe(230.88);
    expect(get.body.transactions).toHaveLength(1);
    expect(get.body.transactions[0]).toMatchObject({
      type: 'credit',
      amount: 230.88,
      billingPeriodMonth: 6,
      billingPeriodYear: 2025,
      description: 'June 2025 accrual',
      isAutoGenerated: true,
      createdBy: null,
    });
  });

  // TC-08-INT-02
  it('pro-rates the first month when financials became effective mid-month', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    await putFinancials(admin.cookies, admin.organizationId, m.membershipId, AUTO_FINANCIALS);
    // Single snapshot became effective mid-month → pro-rated. June 15 2025 is a Sunday, so
    // there are 11 working days from June 15 to month-end (the spec's "12" is a calendar
    // error — assert the calendar-correct value via the shared helpers).
    await backdateSnapshots(m.membershipId, '2025-06-15');

    const run = await runAccrual(admin.cookies, { month: 6, year: 2025 });
    expect(run.status).toBe(200);
    expect(run.body.creditsCreated).toBe(1);

    const fullMonthCredit = calculateMonthlyCredit(40, 3.33);
    const expected = prorateCredit(
      fullMonthCredit,
      workingDaysFromDateToMonthEnd(2025, 6, 15),
      workingDaysInMonth(2025, 6),
    );

    const txn = await prisma.vacationReserveTransaction.findFirstOrThrow({
      where: { membershipId: m.membershipId },
    });
    expect(txn.amount.toNumber()).toBe(expected);
  });

  // TC-08-INT-03
  it('uses the snapshot effective during the billing month after a salary change', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    // Original snapshot (salary 1000), backdated to before June.
    await putFinancials(admin.cookies, admin.organizationId, m.membershipId, {
      ...AUTO_FINANCIALS,
      monthlySalary: 1000,
    });
    // Salary changed on June 20 (new snapshot, salary 2000).
    await putFinancials(admin.cookies, admin.organizationId, m.membershipId, {
      ...AUTO_FINANCIALS,
      monthlySalary: 2000,
    });
    await backdateSnapshots(m.membershipId, '2025-05-01', 1000);
    await backdateSnapshots(m.membershipId, '2025-06-20', 2000);

    const junePercent = calculateReservePercent({
      monthlySalary: 2000,
      clientHourlyRate: 40,
      vacationDaysPerYear: 20,
    });
    const expectedCredit = calculateMonthlyCredit(40, junePercent);

    // June: earliest snapshot (May 1) is before June → no proration; effective snapshot is
    // the June-20 one (salary 2000).
    const june = await runAccrual(admin.cookies, { month: 6, year: 2025 });
    expect(june.status).toBe(200);
    expect(june.body.creditsCreated).toBe(1);

    const juneTxn = await prisma.vacationReserveTransaction.findFirstOrThrow({
      where: { membershipId: m.membershipId, billingPeriodMonth: 6, billingPeriodYear: 2025 },
    });
    expect(juneTxn.amount.toNumber()).toBe(expectedCredit);

    // July: the June-20 snapshot is still the effective one (≤ Jul 31).
    const july = await runAccrual(admin.cookies, { month: 7, year: 2025 });
    expect(july.status).toBe(200);
    expect(july.body.creditsCreated).toBe(1);

    const julyTxn = await prisma.vacationReserveTransaction.findFirstOrThrow({
      where: { membershipId: m.membershipId, billingPeriodMonth: 7, billingPeriodYear: 2025 },
    });
    expect(julyTxn.amount.toNumber()).toBe(expectedCredit);
  });

  // TC-08-INT-04
  it('is idempotent — a second run for the same month creates no duplicate credit', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    await putFinancials(admin.cookies, admin.organizationId, m.membershipId, AUTO_FINANCIALS);
    await backdateSnapshots(m.membershipId, '2025-05-01');

    const first = await runAccrual(admin.cookies, { month: 6, year: 2025 });
    expect(first.body.creditsCreated).toBe(1);

    const second = await runAccrual(admin.cookies, { month: 6, year: 2025 });
    expect(second.status).toBe(200);
    expect(second.body.creditsCreated).toBe(0);
    expect(second.body.skipped).toBe(1);

    const txns = await prisma.vacationReserveTransaction.findMany({
      where: { membershipId: m.membershipId },
    });
    expect(txns).toHaveLength(1);
  });

  // TC-08-INT-05
  it('skips members without financials and removed members', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m1 = await createMember(admin.organizationId, { email: 'm1@acme.com', role: 'user' });
    const m2 = await createMember(admin.organizationId, { email: 'm2@acme.com', role: 'user' });
    const m3 = await createMember(admin.organizationId, { email: 'm3@acme.com', role: 'user' });

    // M1: financials configured and backdated → eligible.
    await putFinancials(admin.cookies, admin.organizationId, m1.membershipId, AUTO_FINANCIALS);
    await backdateSnapshots(m1.membershipId, '2025-05-01');

    // M3: financials configured (while active) and backdated, then removed.
    await putFinancials(admin.cookies, admin.organizationId, m3.membershipId, AUTO_FINANCIALS);
    await backdateSnapshots(m3.membershipId, '2025-05-01');
    await prisma.membership.update({
      where: { id: m3.membershipId },
      data: { status: 'removed' },
    });

    // M2 has no financials.

    const run = await runAccrual(admin.cookies, { month: 6, year: 2025 });
    expect(run.status).toBe(200);
    expect(run.body.creditsCreated).toBe(1);

    expect(
      await prisma.vacationReserveTransaction.count({ where: { membershipId: m1.membershipId } }),
    ).toBe(1);
    expect(
      await prisma.vacationReserveTransaction.count({ where: { membershipId: m2.membershipId } }),
    ).toBe(0);
    expect(
      await prisma.vacationReserveTransaction.count({ where: { membershipId: m3.membershipId } }),
    ).toBe(0);
  });

  // TC-08-INT-06
  it('manual trigger — happy path returns the run summary', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    await putFinancials(admin.cookies, admin.organizationId, m.membershipId, AUTO_FINANCIALS);
    await backdateSnapshots(m.membershipId, '2025-05-01');

    const run = await runAccrual(admin.cookies, { month: 6, year: 2025 });
    expect(run.status).toBe(200);
    expect(run.body).toEqual({
      success: true,
      billingPeriod: 'June 2025',
      processed: 1,
      creditsCreated: 1,
      skipped: 0,
    });
  });

  // TC-08-INT-07
  it('manual trigger — idempotent second run skips the already-credited member', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m = await createMember(admin.organizationId, { email: 'm@acme.com', role: 'user' });

    await putFinancials(admin.cookies, admin.organizationId, m.membershipId, AUTO_FINANCIALS);
    await backdateSnapshots(m.membershipId, '2025-05-01');

    await runAccrual(admin.cookies, { month: 6, year: 2025 });
    const second = await runAccrual(admin.cookies, { month: 6, year: 2025 });
    expect(second.status).toBe(200);
    expect(second.body.creditsCreated).toBe(0);
    expect(second.body.skipped).toBe(1);
  });

  // TC-08-INT-08
  it('manual trigger — forbidden for manager and user (403)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, { email: 'g@acme.com', role: 'manager' });
    const user = await createMember(admin.organizationId, { email: 'u@acme.com', role: 'user' });

    for (const caller of [manager, user]) {
      const response = await runAccrual(caller.cookies, { month: 6, year: 2025 });
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('forbidden');
      expect(response.body.message).toBe(ACCRUAL_MESSAGES.forbidden);
    }
  });

  // TC-08-INT-09
  it('manual trigger — rejects a future billing period (400)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const now = new Date();
    const response = await runAccrual(admin.cookies, {
      month: now.getUTCMonth() + 1,
      year: now.getUTCFullYear() + 1,
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('future_period');
    expect(response.body.message).toBe(ACCRUAL_MESSAGES.futurePeriod);
  });
});
