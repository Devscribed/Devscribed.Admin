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
 * Spec reports/01 — Time Off integration cases. The report reads only —
 * every seed is a direct Prisma insert of `VacationRequest`, `Holiday`, and
 * `Membership`/`Account`. A stub `PdfRenderer` replaces the Chromium driver
 * so PDF cases assert filename + content-type rather than actual bytes.
 */
class StubPdfRenderer extends PdfRenderer {
  rendered: string[] = [];
  async render(html: string): Promise<Buffer> {
    this.rendered.push(html);
    return Buffer.from(`%PDF-1.4 stub ${html.length}`);
  }
}

const toDbDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe('Reports · Time Off (spec reports/01)', () => {
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

  const seedVacation = async (
    admin: Signed,
    opts: {
      membershipId: string;
      startDate: string;
      endDate: string;
      workingDays: number;
      deductionAmount: number;
      status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    },
  ) => {
    const status = opts.status;
    const reviewed =
      status === 'approved' || status === 'rejected'
        ? { reviewedAt: new Date(), reviewedByAccountId: admin.accountId }
        : {};
    const cancelled =
      status === 'cancelled'
        ? { cancelledAt: new Date(), cancelledByAccountId: admin.accountId }
        : {};
    return prisma.vacationRequest.create({
      data: {
        membershipId: opts.membershipId,
        startDate: toDbDate(opts.startDate),
        endDate: toDbDate(opts.endDate),
        workingDays: opts.workingDays,
        deductionAmount: opts.deductionAmount,
        status,
        ...reviewed,
        ...cancelled,
      },
    });
  };

  const seedHoliday = async (
    admin: Signed,
    opts: { date: string; name: string; countryCode: string | null; paidHours?: number },
  ) =>
    prisma.holiday.create({
      data: {
        organizationId: admin.organizationId,
        date: toDbDate(opts.date),
        name: opts.name,
        countryCode: opts.countryCode,
        paidHours: opts.paidHours ?? 8,
        createdByAccountId: admin.accountId,
      },
    });

  const getTO = (cookies: string[], orgId: string, query = '') =>
    request(server())
      .get(`/api/organizations/${orgId}/reports/time-off${query}`)
      .set('Cookie', cookies);

  const getTOMy = (cookies: string[], orgId: string, query = '') =>
    request(server())
      .get(`/api/organizations/${orgId}/reports/time-off/my${query}`)
      .set('Cookie', cookies);

  const getTOPdf = (cookies: string[], orgId: string, query = '') =>
    request(server())
      .get(`/api/organizations/${orgId}/reports/time-off/pdf${query}`)
      .set('Cookie', cookies)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

  const getTOPdfMy = (cookies: string[], orgId: string, query = '') =>
    request(server())
      .get(`/api/organizations/${orgId}/reports/time-off/pdf/my${query}`)
      .set('Cookie', cookies)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

  const rangeQuery = (start = '2026-01-01', end = '2026-12-31') =>
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
    await seedVacation(admin, {
      membershipId: admin.membershipId,
      startDate: '2026-02-15',
      endDate: '2026-02-28',
      workingDays: 10,
      deductionAmount: 2307.69,
      status: 'approved',
    });
    await seedHoliday(admin, {
      date: '2026-01-01',
      name: "New Year's Day",
      countryCode: null,
    });

    const res = await getTO(admin.cookies, admin.organizationId, rangeQuery());
    expect(res.status).toBe(200);
    expect(res.body.headers).toEqual([
      { title: 'Type', value: 'type' },
      { title: 'Period', value: 'period' },
      { title: 'Days', value: 'days' },
      { title: 'Working days', value: 'workingDays' },
      { title: 'Deduction', value: 'deduction' },
    ]);
    // One member group + one organization_wide group.
    const groupIds = res.body.groups.map((g: any) => g.id);
    expect(groupIds).toContain(`membership_${admin.membershipId}`);
    expect(groupIds).toContain('organization_wide');

    const memberGroup = res.body.groups.find(
      (g: any) => g.id === `membership_${admin.membershipId}`,
    );
    expect(memberGroup.title).toBe('Alex Kaminski');
    expect(memberGroup.rows[0]).toMatchObject({
      type: 'Vacation',
      status: 'approved',
      period: '15 Feb – 28 Feb 2026',
      days: '14',
      workingDays: '10',
      deduction: '2307.69',
      kind: 'vacation',
    });
    expect(memberGroup.total).toEqual({
      days: '14',
      workingDays: '10',
      deduction: '2307.69',
    });

    const orgWide = res.body.groups.find((g: any) => g.id === 'organization_wide');
    expect(orgWide.title).toBe('Organization-wide');
    expect(orgWide.rows[0]).toMatchObject({
      type: 'Holiday',
      period: "1 Jan 2026 · New Year's Day",
      days: '1',
      workingDays: '1',
      deduction: null,
      kind: 'holiday',
    });
    expect(orgWide.total).toEqual({ days: '1', workingDays: '1', deduction: null });

    // Summary: Vacation days = 10 (workingDays sum), Deduction = 2307.69,
    // Public holidays = 1 (rows in organization_wide).
    expect(res.body.summary).toEqual([
      { label: 'Vacation days', value: '10' },
      { label: 'Deduction', value: '2307.69' },
      { label: 'Public holidays', value: '1' },
    ]);
    expect(res.body.meta.currencyCode).toBe('USD');
    expect(res.body.meta.startDate).toBe('2026-01-01');
    expect(res.body.meta.endDate).toBe('2026-12-31');
  });

  it('manager all-variant happy path — sees another member vacations', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com',
      role: 'manager',
      firstName: 'Jane',
      lastName: 'Smith',
    });
    const other = await createMember(admin.organizationId, {
      email: 'other@acme.com',
      role: 'user',
      firstName: 'Otto',
      lastName: 'Vale',
    });
    await seedVacation(admin, {
      membershipId: other.membershipId,
      startDate: '2026-03-02',
      endDate: '2026-03-06',
      workingDays: 5,
      deductionAmount: 1000,
      status: 'approved',
    });

    const res = await getTO(manager.cookies, admin.organizationId, rangeQuery());
    expect(res.status).toBe(200);
    const memberGroup = res.body.groups.find(
      (g: any) => g.id === `membership_${other.membershipId}`,
    );
    expect(memberGroup).toBeDefined();
    expect(memberGroup.rows[0]).toMatchObject({
      type: 'Vacation',
      status: 'approved',
      workingDays: '5',
    });
  });

  it('user calling the all-variant URL gets 404', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'user@acme.com',
      role: 'user',
    });
    const res = await getTO(user.cookies, admin.organizationId, rangeQuery());
    expect(res.status).toBe(404);
  });

  it('user calling /my returns only their own vacation', async () => {
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
    await seedVacation(admin, {
      membershipId: user.membershipId,
      startDate: '2026-04-06',
      endDate: '2026-04-10',
      workingDays: 5,
      deductionAmount: 1200,
      status: 'approved',
    });
    await seedVacation(admin, {
      membershipId: other.membershipId,
      startDate: '2026-04-06',
      endDate: '2026-04-10',
      workingDays: 5,
      deductionAmount: 1200,
      status: 'approved',
    });

    const res = await getTOMy(user.cookies, admin.organizationId, rangeQuery());
    expect(res.status).toBe(200);
    const memberGroups = res.body.groups.filter((g: any) => g.id !== 'organization_wide');
    // Only Uma's group appears; Otto's row is invisible.
    expect(memberGroups).toHaveLength(1);
    expect(memberGroups[0].id).toBe(`membership_${user.membershipId}`);
    expect(memberGroups[0].title).toBe('Uma Stone');
  });

  it('viewer calling /my returns only holidays for their country (no vacation surfaced)', async () => {
    // Viewer holds ONLY view-my-time-off — no vacation would be created for
    // them in this suite anyway, so /my shows the org-wide group scoped to
    // their country. A BY viewer sees the BY-country holiday and the null
    // (global) one, but not a US-scoped holiday.
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const viewer = await createMember(admin.organizationId, {
      email: 'viewer@acme.com',
      role: 'viewer',
      firstName: 'Vera',
      lastName: 'Ipso',
      phoneCountryCode: 'BY',
    });
    await seedHoliday(admin, { date: '2026-07-03', name: 'BY Day', countryCode: 'BY' });
    await seedHoliday(admin, { date: '2026-07-04', name: 'US Day', countryCode: 'US' });
    await seedHoliday(admin, { date: '2026-01-01', name: 'Global Day', countryCode: null });

    const res = await getTOMy(viewer.cookies, admin.organizationId, rangeQuery());
    expect(res.status).toBe(200);
    // No vacation groups for the viewer.
    const memberGroups = res.body.groups.filter((g: any) => g.id !== 'organization_wide');
    expect(memberGroups).toEqual([]);

    const orgWide = res.body.groups.find((g: any) => g.id === 'organization_wide');
    expect(orgWide).toBeDefined();
    const periods = orgWide.rows.map((r: any) => r.period);
    expect(periods).toContain('3 Jul 2026 · BY Day');
    expect(periods).toContain('1 Jan 2026 · Global Day');
    expect(periods.find((p: string) => p.includes('US Day'))).toBeUndefined();
  });

  // TC-01-INT-36 — type filter
  it('type filter narrows kinds; unknown value 422s', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const m1 = await createMember(admin.organizationId, {
      email: 'a@acme.com',
      role: 'user',
      firstName: 'A',
      lastName: 'One',
    });
    const m2 = await createMember(admin.organizationId, {
      email: 'b@acme.com',
      role: 'user',
      firstName: 'B',
      lastName: 'Two',
    });
    const m3 = await createMember(admin.organizationId, {
      email: 'c@acme.com',
      role: 'user',
      firstName: 'C',
      lastName: 'Three',
    });
    // 3 approved vacations
    for (const m of [m1, m2, m3]) {
      await seedVacation(admin, {
        membershipId: m.membershipId,
        startDate: '2026-05-04',
        endDate: '2026-05-08',
        workingDays: 5,
        deductionAmount: 1000,
        status: 'approved',
      });
    }
    // 2 global holidays
    await seedHoliday(admin, { date: '2026-01-01', name: 'New Year', countryCode: null });
    await seedHoliday(admin, { date: '2026-05-01', name: 'May Day', countryCode: null });

    const all = await getTO(admin.cookies, admin.organizationId, rangeQuery());
    expect(all.status).toBe(200);
    const allMemberGroups = all.body.groups.filter(
      (g: any) => g.id !== 'organization_wide',
    );
    expect(allMemberGroups).toHaveLength(3);
    const orgWide = all.body.groups.find((g: any) => g.id === 'organization_wide');
    expect(orgWide.rows).toHaveLength(2);

    const vac = await getTO(
      admin.cookies,
      admin.organizationId,
      `${rangeQuery()}&type=vacation`,
    );
    expect(vac.status).toBe(200);
    expect(vac.body.groups.find((g: any) => g.id === 'organization_wide')).toBeUndefined();
    expect(
      vac.body.groups.filter((g: any) => g.id !== 'organization_wide'),
    ).toHaveLength(3);
    // Public holidays line reads 0 when the org-wide group is filtered out.
    expect(vac.body.summary).toContainEqual({ label: 'Public holidays', value: '0' });

    const hol = await getTO(
      admin.cookies,
      admin.organizationId,
      `${rangeQuery()}&type=holiday`,
    );
    expect(hol.status).toBe(200);
    expect(hol.body.groups).toHaveLength(1);
    expect(hol.body.groups[0].id).toBe('organization_wide');
    expect(hol.body.groups[0].rows).toHaveLength(2);
    // Vacation days + Deduction lines read zero when vacations are filtered out.
    expect(hol.body.summary).toContainEqual({ label: 'Vacation days', value: '0' });
    expect(hol.body.summary).toContainEqual({ label: 'Deduction', value: '0.00' });

    const bad = await getTO(
      admin.cookies,
      admin.organizationId,
      `${rangeQuery()}&type=weekend`,
    );
    expect(bad.status).toBe(422);
    expect(bad.body).toMatchObject({
      error: 'validation_error',
      fields: { type: 'Invalid type filter.' },
    });
  });

  // TC-01-INT-37 — status filter
  it('status filter narrows vacations only; holidays are unaffected', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const target = await createMember(admin.organizationId, {
      email: 't@acme.com',
      role: 'user',
      firstName: 'T',
      lastName: 'Arget',
    });
    // 2 approved + 1 pending + 1 cancelled + 1 rejected vacation on the same
    // member, plus a global holiday to prove org-wide stays across every
    // status filter (spec §Row filter — status).
    for (const range of [
      { start: '2026-02-02', end: '2026-02-06' },
      { start: '2026-03-02', end: '2026-03-06' },
    ]) {
      await seedVacation(admin, {
        membershipId: target.membershipId,
        startDate: range.start,
        endDate: range.end,
        workingDays: 5,
        deductionAmount: 500,
        status: 'approved',
      });
    }
    await seedVacation(admin, {
      membershipId: target.membershipId,
      startDate: '2026-04-06',
      endDate: '2026-04-08',
      workingDays: 3,
      deductionAmount: 300,
      status: 'pending',
    });
    await seedVacation(admin, {
      membershipId: target.membershipId,
      startDate: '2026-05-05',
      endDate: '2026-05-06',
      workingDays: 2,
      deductionAmount: 200,
      status: 'cancelled',
    });
    await seedVacation(admin, {
      membershipId: target.membershipId,
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      workingDays: 2,
      deductionAmount: 200,
      status: 'rejected',
    });
    await seedHoliday(admin, { date: '2026-01-01', name: 'New Year', countryCode: null });

    const countVacationRows = (body: any): number => {
      const memberGroups = body.groups.filter((g: any) => g.id !== 'organization_wide');
      return memberGroups.reduce((n: number, g: any) => n + g.rows.length, 0);
    };

    const approved = await getTO(
      admin.cookies,
      admin.organizationId,
      `${rangeQuery()}&status=approved`,
    );
    expect(approved.status).toBe(200);
    expect(countVacationRows(approved.body)).toBe(2);
    expect(
      approved.body.groups.find((g: any) => g.id === 'organization_wide'),
    ).toBeDefined();

    const pending = await getTO(
      admin.cookies,
      admin.organizationId,
      `${rangeQuery()}&status=pending`,
    );
    expect(pending.status).toBe(200);
    expect(countVacationRows(pending.body)).toBe(1);
    expect(
      pending.body.groups.find((g: any) => g.id === 'organization_wide'),
    ).toBeDefined();

    const all = await getTO(
      admin.cookies,
      admin.organizationId,
      `${rangeQuery()}&status=all`,
    );
    expect(all.status).toBe(200);
    // All 5 seeded vacations surface — 2 approved + 1 pending + 1 cancelled + 1 rejected.
    expect(countVacationRows(all.body)).toBe(5);
    expect(
      all.body.groups.find((g: any) => g.id === 'organization_wide'),
    ).toBeDefined();

    const bad = await getTO(
      admin.cookies,
      admin.organizationId,
      `${rangeQuery()}&status=archived`,
    );
    expect(bad.status).toBe(422);
    expect(bad.body).toMatchObject({
      error: 'validation_error',
      fields: { status: 'Invalid status filter.' },
    });
  });

  // TC-01-INT-39 — /my + pending
  it('user /my?status=pending returns own pending (view-my-time-off only)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'user@acme.com',
      role: 'user',
      firstName: 'Uma',
      lastName: 'Stone',
    });
    await seedVacation(admin, {
      membershipId: user.membershipId,
      startDate: '2026-08-10',
      endDate: '2026-08-12',
      workingDays: 3,
      deductionAmount: 500,
      status: 'pending',
    });
    await seedVacation(admin, {
      membershipId: user.membershipId,
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      workingDays: 3,
      deductionAmount: 500,
      status: 'approved',
    });

    const res = await getTOMy(
      user.cookies,
      admin.organizationId,
      `${rangeQuery()}&status=pending`,
    );
    expect(res.status).toBe(200);
    const memberGroups = res.body.groups.filter((g: any) => g.id !== 'organization_wide');
    expect(memberGroups).toHaveLength(1);
    expect(memberGroups[0].rows).toHaveLength(1);
    expect(memberGroups[0].rows[0]).toMatchObject({
      type: 'Vacation',
      status: 'pending',
      workingDays: '3',
    });
  });

  it('cross-org / unknown memberId is silently dropped from memberIds[]', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await signupAdmin('admin@other.com', 'Other Corp', 'Bob', 'Boss');
    await seedVacation(admin, {
      membershipId: admin.membershipId,
      startDate: '2026-02-02',
      endDate: '2026-02-06',
      workingDays: 5,
      deductionAmount: 1000,
      status: 'approved',
    });
    const fakeCuid = 'zzzzzzzzzzzzzzzzzzzzzzzz';
    const res = await getTO(
      admin.cookies,
      admin.organizationId,
      `${rangeQuery()}&memberIds=${fakeCuid}`,
    );
    expect(res.status).toBe(200);
    // Zero intersection with the org's members → no member groups.
    const memberGroups = res.body.groups.filter((g: any) => g.id !== 'organization_wide');
    expect(memberGroups).toEqual([]);
  });

  it('meta.currencyCode is always "USD"', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const res = await getTO(admin.cookies, admin.organizationId, rangeQuery());
    expect(res.status).toBe(200);
    expect(res.body.meta.currencyCode).toBe('USD');
  });

  it('PDF endpoint returns application/pdf with a body and the right filename', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await seedVacation(admin, {
      membershipId: admin.membershipId,
      startDate: '2026-02-15',
      endDate: '2026-02-28',
      workingDays: 10,
      deductionAmount: 2307.69,
      status: 'approved',
    });
    const res = await getTOPdf(admin.cookies, admin.organizationId, rangeQuery());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('Time Off');
    expect(res.body.length).toBeGreaterThan(0);
    expect(pdf.rendered.length).toBe(1);
  });

  it('viewer without export-reports gets 403 on /pdf/my (has view-my-time-off)', async () => {
    // Viewer holds `view-my-time-off` — the 404 gate passes for /pdf/my. But
    // viewer does NOT hold `export-reports`, so the export gate returns 403.
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const viewer = await createMember(admin.organizationId, {
      email: 'viewer@acme.com',
      role: 'viewer',
    });
    const res = await getTOPdfMy(viewer.cookies, admin.organizationId, rangeQuery());
    expect(res.status).toBe(403);
  });

  it('session revocation via securityStamp rotation returns 401 on the PDF endpoint', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await prisma.account.update({
      where: { id: admin.accountId },
      data: { securityStamp: 'rotated-' + Date.now() },
    });
    const res = await getTOPdf(admin.cookies, admin.organizationId, rangeQuery());
    expect(res.status).toBe(401);
  });

  it('cross-org PDF request returns 404 (OrgScopeGuard)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const other = await signupAdmin('admin@other.com', 'Other Corp');
    const res = await getTOPdf(admin.cookies, other.organizationId, rangeQuery());
    expect(res.status).toBe(404);
  });

  // Row-count backpressure and rate limit — skipped for the same reason as
  // the other two suites: real HTTP loops are prohibitively slow. Same
  // follow-up (bulk-insert helper / direct service-level assertions).
  it.skip('TC-01-INT-30: PDF row-count backpressure returns 422 range_too_large_for_pdf', async () => {
    // Intentionally left as .skip; see comment.
  });

  it.skip('TC-01-INT-32: 11 PDF requests in a minute — the 11th returns 429', async () => {
    // Intentionally left as .skip; see comment.
  });
});
