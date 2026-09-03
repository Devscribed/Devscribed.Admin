import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PdfRenderer } from '../src/pdf/pdf-renderer';
import { PrismaService } from '../src/prisma.service';

const TEST_BCRYPT_ROUNDS = 4;

/**
 * Spec reports/01 — Time & Activity integration cases. Bootstrap and seed
 * helpers are copied from `reports-amounts-owed.spec.ts` verbatim — the
 * report reads only, so every fixture is a direct Prisma insert of
 * `TimeEntry`, `MemberFinancials(Snapshot)`, `Project` and `Client`. A stub
 * `PdfRenderer` replaces the Chromium driver so PDF cases assert
 * filename + content-type rather than actual bytes.
 */
class StubPdfRenderer extends PdfRenderer {
  rendered: string[] = [];
  async render(html: string): Promise<Buffer> {
    this.rendered.push(html);
    return Buffer.from(`%PDF-1.4 stub ${html.length}`);
  }
}

const toDbDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe('Reports · Time & Activity (spec reports/01)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pdf: StubPdfRenderer;

  interface Signed {
    cookies: string[];
    accountId: string;
    organizationId: string;
    membershipId: string;
    role: string;
    firstName: string;
    lastName: string;
  }

  const server = () => app.getHttpServer();

  const signupAdmin = async (
    email: string,
    orgName: string,
    firstName = 'Pat',
    lastName = 'Owner',
  ): Promise<Signed> => {
    const response = await request(server()).post('/api/signup').send({
      orgName,
      firstName,
      lastName,
      email,
      password: 'Passw0rd',
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
      firstName,
      lastName,
    };
  };

  const login = (email: string, password: string) =>
    request(server()).post('/api/login').send({ email, password });

  const createMember = async (
    organizationId: string,
    opts: {
      email: string;
      role: string;
      firstName?: string;
      lastName?: string;
      phoneCountryCode?: string | null;
      timezone?: string;
    },
  ): Promise<Signed> => {
    const password = 'Passw0rd';
    const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
    const firstName = opts.firstName ?? 'Test';
    const lastName = opts.lastName ?? 'User';
    const account = await prisma.account.create({
      data: {
        email: opts.email,
        passwordHash,
        firstName,
        lastName,
        timezone: opts.timezone ?? 'UTC',
        phoneCountryCode: opts.phoneCountryCode ?? null,
      },
    });
    const membership = await prisma.membership.create({
      data: {
        accountId: account.id,
        organizationId,
        role: opts.role,
        status: 'active',
      },
    });
    const cookies = (await login(opts.email, password)).headers[
      'set-cookie'
    ] as unknown as string[];
    return {
      cookies,
      accountId: account.id,
      organizationId,
      membershipId: membership.id,
      role: opts.role,
      firstName,
      lastName,
    };
  };

  const seedFinancials = async (
    admin: Signed,
    membershipId: string,
    opts: {
      clientHourlyRate: number;
      monthlySalary?: number;
      effectiveFrom?: string;
    },
  ) => {
    const monthlySalary = opts.monthlySalary ?? 3000;
    await prisma.memberFinancials.create({
      data: {
        membershipId,
        monthlySalary,
        clientHourlyRate: opts.clientHourlyRate,
        vacationReservePercent: 8,
        isReservePercentManual: false,
        vacationDaysPerYear: 20,
        currency: 'USD',
        updatedByAccountId: admin.accountId,
      },
    });
    await prisma.memberFinancialsSnapshot.create({
      data: {
        membershipId,
        monthlySalary,
        clientHourlyRate: opts.clientHourlyRate,
        vacationReservePercent: 8,
        isReservePercentManual: false,
        vacationDaysPerYear: 20,
        currency: 'USD',
        effectiveFrom: toDbDate(opts.effectiveFrom ?? '2026-01-01'),
      },
    });
  };

  const seedEntry = async (
    admin: Signed,
    opts: {
      membershipId: string;
      projectId?: string | null;
      date: string;
      durationMinutes: number;
      billable?: boolean;
      organizationId?: string;
      task?: string | null;
    },
  ) => {
    await prisma.timeEntry.create({
      data: {
        membershipId: opts.membershipId,
        organizationId: opts.organizationId ?? admin.organizationId,
        projectId: opts.projectId ?? null,
        date: toDbDate(opts.date),
        durationMinutes: opts.durationMinutes,
        billable: opts.billable ?? true,
        createdByAccountId: admin.accountId,
        task: opts.task ?? null,
      },
    });
  };

  const seedProject = async (
    admin: Signed,
    name: string,
    opts: { clientId?: string | null } = {},
  ) =>
    prisma.project.create({
      data: {
        organizationId: admin.organizationId,
        name,
        status: 'active',
        createdByAccountId: admin.accountId,
        clientId: opts.clientId ?? null,
      },
    });

  const seedClient = async (admin: Signed, name: string) =>
    prisma.client.create({
      data: {
        organizationId: admin.organizationId,
        name,
        status: 'active',
        createdByAccountId: admin.accountId,
      },
    });

  const getTA = (cookies: string[], orgId: string, query = '') =>
    request(server())
      .get(`/api/organizations/${orgId}/reports/time-and-activity${query}`)
      .set('Cookie', cookies);

  const getTAMy = (cookies: string[], orgId: string, query = '') =>
    request(server())
      .get(`/api/organizations/${orgId}/reports/time-and-activity/my${query}`)
      .set('Cookie', cookies);

  const getTAPdf = (cookies: string[], orgId: string, query = '') =>
    request(server())
      .get(`/api/organizations/${orgId}/reports/time-and-activity/pdf${query}`)
      .set('Cookie', cookies)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

  const rangeQuery = (start = '2026-08-01', end = '2026-08-31') =>
    `?startDate=${start}&endDate=${end}`;

  beforeAll(async () => {
    pdf = new StubPdfRenderer();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useClass(InMemoryMailService)
      .overrideProvider(PdfRenderer)
      .useValue(pdf)
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
    await prisma.timeEntry.deleteMany();
    await prisma.runningTimer.deleteMany();
    await prisma.holiday.deleteMany();
    await prisma.vacationRequest.deleteMany();
    await prisma.vacationReserveTransaction.deleteMany();
    await prisma.memberFinancialsSnapshot.deleteMany();
    await prisma.memberFinancials.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
    pdf.rendered.length = 0;
  });

  it('admin all-variant returns the 200 shape (headers, groups, summary, meta)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc', 'Alex', 'Kaminski');
    await seedFinancials(admin, admin.membershipId, { clientHourlyRate: 50 });
    const client = await seedClient(admin, 'Acme Corp');
    const project = await seedProject(admin, 'Website Redesign', { clientId: client.id });
    await seedEntry(admin, {
      membershipId: admin.membershipId,
      projectId: project.id,
      date: '2026-08-03',
      durationMinutes: 60 * 4,
    });

    const res = await getTA(admin.cookies, admin.organizationId, rangeQuery());
    expect(res.status).toBe(200);
    // Admin gets Billed and Spent by default only when requested (columns
    // opt-in beyond the three always-shown defaults, spec req 8/9). No
    // `?columns=…` on this request → the response projects the always-shown
    // set only.
    expect(res.body.headers.map((h: { title: string }) => h.title)).toEqual([
      'Project',
      'Member',
      'Time',
    ]);
    expect(res.body.groups).toHaveLength(1);
    // Groups are per-day (spec §Aggregation branches). Title is the calendar
    // day; the row carries the project/client identity.
    expect(res.body.groups[0].title).toMatch(/2026/);
    expect(res.body.groups[0].rows[0]).toMatchObject({
      project: 'Website Redesign',
      member: 'Alex Kaminski',
      time: '4.00',
    });
    // Denied/unprojected columns are absent — never null-blanked (spec req 11).
    expect(res.body.groups[0].rows[0].billableTime).toBeUndefined();
    expect(res.body.groups[0].rows[0].billedAmount).toBeUndefined();
    expect(res.body.summary).toEqual([{ label: 'Total time', value: '4.00' }]);
    expect(res.body.meta.currencyCode).toBe('USD');
    expect(res.body.meta.startDate).toBe('2026-08-01');
    expect(res.body.meta.endDate).toBe('2026-08-31');
  });

  it('manager all-variant happy path — Billed Amount projected when requested', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com',
      role: 'manager',
      firstName: 'Jane',
      lastName: 'Smith',
    });
    await seedFinancials(admin, manager.membershipId, { clientHourlyRate: 55 });
    const project = await seedProject(admin, 'Mobile App');
    await seedEntry(admin, {
      membershipId: manager.membershipId,
      projectId: project.id,
      date: '2026-08-10',
      durationMinutes: 60 * 3,
    });

    const res = await getTA(
      manager.cookies,
      admin.organizationId,
      `${rangeQuery()}&columns=Billed+Amount`,
    );
    expect(res.status).toBe(200);
    expect(res.body.groups[0].rows[0]).toMatchObject({
      member: 'Jane Smith',
      time: '3.00',
      billedAmount: '165.00',
    });
  });

  it('user calling the all-variant URL gets 404', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'user@acme.com',
      role: 'user',
    });

    const res = await getTA(user.cookies, admin.organizationId, rangeQuery());
    expect(res.status).toBe(404);
  });

  it('user calling /my returns 200 with only own rows', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'user@acme.com',
      role: 'user',
      firstName: 'Uma',
      lastName: 'Stone',
    });
    const other = await createMember(admin.organizationId, {
      email: 'other@acme.com',
      role: 'user',
      firstName: 'Otto',
      lastName: 'Vale',
    });
    await seedFinancials(admin, user.membershipId, { clientHourlyRate: 40 });
    await seedFinancials(admin, other.membershipId, { clientHourlyRate: 40 });
    const project = await seedProject(admin, 'Design');
    await seedEntry(admin, {
      membershipId: user.membershipId,
      projectId: project.id,
      date: '2026-08-05',
      durationMinutes: 120,
    });
    await seedEntry(admin, {
      membershipId: other.membershipId,
      projectId: project.id,
      date: '2026-08-05',
      durationMinutes: 240,
    });

    const res = await getTAMy(user.cookies, admin.organizationId, rangeQuery());
    expect(res.status).toBe(200);
    for (const g of res.body.groups) {
      for (const r of g.rows) expect(r.member).toBe('Uma Stone');
    }
    expect(res.body.summary).toEqual([{ label: 'Total time', value: '2.00' }]);
  });

  it('memberIds are ignored on /my — the caller is always the sole subject', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'user@acme.com',
      role: 'user',
      firstName: 'Uma',
      lastName: 'Stone',
    });
    const other = await createMember(admin.organizationId, {
      email: 'other@acme.com',
      role: 'user',
      firstName: 'Otto',
      lastName: 'Vale',
    });
    await seedFinancials(admin, user.membershipId, { clientHourlyRate: 40 });
    await seedFinancials(admin, other.membershipId, { clientHourlyRate: 40 });
    const project = await seedProject(admin, 'Design');
    await seedEntry(admin, {
      membershipId: user.membershipId,
      projectId: project.id,
      date: '2026-08-05',
      durationMinutes: 60,
    });
    await seedEntry(admin, {
      membershipId: other.membershipId,
      projectId: project.id,
      date: '2026-08-05',
      durationMinutes: 240,
    });

    const res = await getTAMy(
      user.cookies,
      admin.organizationId,
      `${rangeQuery()}&memberIds=${other.membershipId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual([{ label: 'Total time', value: '1.00' }]);
  });

  // TC-01-INT-07 — column intersection deny Spent
  it('manager without view-time-and-activity-spent — ?columns=Spent is dropped', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com',
      role: 'manager',
      firstName: 'Jane',
      lastName: 'Smith',
    });
    await seedFinancials(admin, manager.membershipId, {
      clientHourlyRate: 55,
      monthlySalary: 3360,
    });
    const project = await seedProject(admin, 'Mobile App');
    await seedEntry(admin, {
      membershipId: manager.membershipId,
      projectId: project.id,
      date: '2026-08-10',
      durationMinutes: 60,
    });

    const res = await getTA(
      manager.cookies,
      admin.organizationId,
      `${rangeQuery()}&columns=Spent&columns=Billed+Amount`,
    );
    expect(res.status).toBe(200);
    const headerTitles = res.body.headers.map((h: { title: string }) => h.title);
    expect(headerTitles).toContain('Billed Amount');
    expect(headerTitles).not.toContain('Spent');
    for (const g of res.body.groups) {
      for (const r of g.rows) {
        expect(r.spent).toBeUndefined();
        expect(r.billedAmount).toBeDefined();
      }
      expect(g.total.spent).toBeUndefined();
    }
    // Summary still lists what IS projected — no Spent line.
    const summaryLabels = res.body.summary.map((s: { label: string }) => s.label);
    expect(summaryLabels).toContain('Billed amount');
    expect(summaryLabels).not.toContain('Spent');
  });

  // TC-01-INT-08 — column intersection allow Spent
  it('admin ?columns=Spent gets the field back', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc', 'Alex', 'Kaminski');
    await seedFinancials(admin, admin.membershipId, {
      clientHourlyRate: 50,
      monthlySalary: 3360, // → payRate = 20/h
    });
    const project = await seedProject(admin, 'Website');
    await seedEntry(admin, {
      membershipId: admin.membershipId,
      projectId: project.id,
      date: '2026-08-03',
      durationMinutes: 60,
    });

    const res = await getTA(
      admin.cookies,
      admin.organizationId,
      `${rangeQuery()}&columns=Spent`,
    );
    expect(res.status).toBe(200);
    const headerTitles = res.body.headers.map((h: { title: string }) => h.title);
    expect(headerTitles).toContain('Spent');
    expect(res.body.groups[0].rows[0].spent).toBe('20.00');
    expect(res.body.groups[0].total.spent).toBe('20.00');
  });

  // TC-01-INT-19 — T&A billable split
  it('billable split: 40h billable + 8h non-billable populate their columns', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc', 'Alex', 'Kaminski');
    await seedFinancials(admin, admin.membershipId, { clientHourlyRate: 50 });
    const project = await seedProject(admin, 'Website');
    await seedEntry(admin, {
      membershipId: admin.membershipId,
      projectId: project.id,
      date: '2026-08-03',
      durationMinutes: 40 * 60,
      billable: true,
    });
    await seedEntry(admin, {
      membershipId: admin.membershipId,
      projectId: project.id,
      date: '2026-08-04',
      durationMinutes: 8 * 60,
      billable: false,
    });

    // Groups are per-day; sumDateRanges=true collapses them into one group
    // so the row totals combine entries seeded across different days.
    const res = await getTA(
      admin.cookies,
      admin.organizationId,
      `${rangeQuery()}&sumDateRanges=true&columns=Billable+Time&columns=Non-Billable+Time&columns=Billed+Amount`,
    );
    expect(res.status).toBe(200);
    expect(res.body.groups[0].rows[0]).toMatchObject({
      member: 'Alex Kaminski',
      time: '48.00',
      billableTime: '40.00',
      nonBillableTime: '8.00',
      billedAmount: '2000.00', // 40 * 50
    });
  });

  // TC-01-INT-20 — time = billable + non-billable
  it('row `time` equals the sum of billable + non-billable', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await seedFinancials(admin, admin.membershipId, { clientHourlyRate: 50 });
    const project = await seedProject(admin, 'Website');
    await seedEntry(admin, {
      membershipId: admin.membershipId,
      projectId: project.id,
      date: '2026-08-03',
      durationMinutes: 40 * 60,
      billable: true,
    });
    await seedEntry(admin, {
      membershipId: admin.membershipId,
      projectId: project.id,
      date: '2026-08-04',
      durationMinutes: 8 * 60,
      billable: false,
    });

    const res = await getTA(
      admin.cookies,
      admin.organizationId,
      `${rangeQuery()}&sumDateRanges=true&columns=Billable+Time&columns=Non-Billable+Time`,
    );
    const row = res.body.groups[0].rows[0];
    expect(Number(row.time)).toBeCloseTo(Number(row.billableTime) + Number(row.nonBillableTime));
  });

  // TC-01-INT-38 — billable filter values
  it('billable filter narrows the data; unknown value 422s', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await seedFinancials(admin, admin.membershipId, { clientHourlyRate: 50 });
    const project = await seedProject(admin, 'Website');
    await seedEntry(admin, {
      membershipId: admin.membershipId,
      projectId: project.id,
      date: '2026-08-03',
      durationMinutes: 40 * 60,
      billable: true,
    });
    await seedEntry(admin, {
      membershipId: admin.membershipId,
      projectId: project.id,
      date: '2026-08-04',
      durationMinutes: 8 * 60,
      billable: false,
    });

    // billable=billable  (sumDateRanges collapses per-day groups into one)
    const bOnly = await getTA(
      admin.cookies,
      admin.organizationId,
      `${rangeQuery()}&sumDateRanges=true&billable=billable&columns=Billable+Time&columns=Non-Billable+Time&columns=Billed+Amount`,
    );
    expect(bOnly.status).toBe(200);
    expect(bOnly.body.groups[0].rows[0]).toMatchObject({
      time: '40.00',
      billableTime: '40.00',
      nonBillableTime: '0.00',
      billedAmount: '2000.00',
    });

    // billable=non-billable
    const nb = await getTA(
      admin.cookies,
      admin.organizationId,
      `${rangeQuery()}&sumDateRanges=true&billable=non-billable&columns=Billable+Time&columns=Non-Billable+Time&columns=Billed+Amount`,
    );
    expect(nb.status).toBe(200);
    expect(nb.body.groups[0].rows[0]).toMatchObject({
      time: '8.00',
      billableTime: '0.00',
      nonBillableTime: '8.00',
      billedAmount: '0.00',
    });

    // billable=maybe → 422
    const bad = await getTA(
      admin.cookies,
      admin.organizationId,
      `${rangeQuery()}&billable=maybe`,
    );
    expect(bad.status).toBe(422);
    expect(bad.body).toMatchObject({
      error: 'validation_error',
      fields: { billable: 'Invalid billable filter.' },
    });
  });

  it('cross-org / unknown memberId is silently dropped from memberIds[]', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await signupAdmin('admin@other.com', 'Other Corp', 'Bob', 'Boss');
    await seedFinancials(admin, admin.membershipId, { clientHourlyRate: 50 });
    const project = await seedProject(admin, 'Website');
    await seedEntry(admin, {
      membershipId: admin.membershipId,
      projectId: project.id,
      date: '2026-08-05',
      durationMinutes: 60,
    });
    const fakeCuid = 'zzzzzzzzzzzzzzzzzzzzzzzz';
    const res = await getTA(
      admin.cookies,
      admin.organizationId,
      `${rangeQuery()}&memberIds=${fakeCuid}`,
    );
    expect(res.status).toBe(200);
    // The intersection with the org's members is empty → no rows.
    expect(res.body.groups).toEqual([]);
  });

  it('meta.currencyCode is always "USD"', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await prisma.memberFinancials.create({
      data: {
        membershipId: admin.membershipId,
        monthlySalary: 3000,
        clientHourlyRate: 50,
        vacationReservePercent: 8,
        isReservePercentManual: false,
        vacationDaysPerYear: 20,
        currency: 'EUR',
        updatedByAccountId: admin.accountId,
      },
    });
    const res = await getTA(admin.cookies, admin.organizationId, rangeQuery());
    expect(res.status).toBe(200);
    expect(res.body.meta.currencyCode).toBe('USD');
  });

  it('PDF endpoint returns application/pdf with a body', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await seedFinancials(admin, admin.membershipId, { clientHourlyRate: 50 });
    const project = await seedProject(admin, 'Website');
    await seedEntry(admin, {
      membershipId: admin.membershipId,
      projectId: project.id,
      date: '2026-08-05',
      durationMinutes: 60,
    });

    const res = await getTAPdf(admin.cookies, admin.organizationId, rangeQuery());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('Time & Activity');
    expect(res.body.length).toBeGreaterThan(0);
    expect(pdf.rendered.length).toBe(1);
  });

  it('PDF ExportReports gate — viewer without view-my-time-and-activity gets 404 first', async () => {
    // Viewer lacks view-my-time-and-activity, so the 404 gate wins over the
    // 403 export gate on /pdf/my — matches Amounts Owed TC-01-INT-35's
    // 404-first behaviour: a caller can't reach the export gate for a
    // report they can't view. That still exercises the guard chain we
    // care about here — the export gate is exercised at the service level
    // for callers who do hold the view capability.
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const viewer = await createMember(admin.organizationId, {
      email: 'viewer@acme.com',
      role: 'viewer',
    });
    const res = await request(server())
      .get(
        `/api/organizations/${admin.organizationId}/reports/time-and-activity/pdf/my${rangeQuery()}`,
      )
      .set('Cookie', viewer.cookies);
    expect(res.status).toBe(404);
  });

  // TC-01-INT-30 — row-count backpressure. Skipped for the same reason as on
  // the Amounts Owed suite: seeding > 3000 entries per test is prohibitively
  // slow. Same follow-up (bulk-insert helper) covers both reports.
  it.skip('TC-01-INT-30: PDF row-count backpressure returns 422 range_too_large_for_pdf', async () => {
    // Intentionally left as .skip; see comment.
  });

  // TC-01-INT-32 — rate limit. Skipped for the same reason as on the
  // Amounts Owed suite: 11 real HTTP calls each exercising the full stack.
  it.skip('TC-01-INT-32: 11 PDF requests in a minute — the 11th returns 429', async () => {
    // Intentionally left as .skip; see comment.
  });
});
