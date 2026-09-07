import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HOLIDAY_SOURCING_MESSAGES } from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HolidayProvider } from '../src/holidays/provider/holiday-provider';
import { HolidaySummaryService } from '../src/holidays/holiday-summary.service';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';
import { StubHolidayProvider, germanNationwideDates, polishDates } from './stub-holiday.provider';

/** Cheap in tests — the policy under bcrypt doesn't depend on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

/**
 * Every case pins its year explicitly: the sync takes one, the summary takes one, and a
 * year inferred from the machine clock would make a fixture's day counts depend on when
 * the suite ran.
 */
const YEAR = 2026;

const toDbDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/**
 * Time off spec 02 — holiday sourcing.
 *
 * The provider port is replaced with a stub through `overrideProvider(HolidayProvider)`,
 * so every case states its own precondition — Germany's shape, an empty answer, a refused
 * connection, a call that never answers — and no case touches the network.
 */
describe('Holiday sourcing (spec time-off/02)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provider: StubHolidayProvider;

  interface Signed {
    cookies: string[];
    accountId: string;
    organizationId: string;
    membershipId: string;
    role: string;
    displayName: string;
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
      displayName: `${firstName} ${lastName}`,
    };
  };

  const login = (email: string, password: string) =>
    request(server()).post('/api/login').send({ email, password });

  const createMember = async (
    organizationId: string,
    opts: {
      email: string;
      role: string;
      countryCode?: string | null;
      firstName?: string;
      lastName?: string;
    },
  ): Promise<Signed> => {
    const password = 'Passw0rd';
    const firstName = opts.firstName ?? 'Test';
    const lastName = opts.lastName ?? 'User';
    const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: {
        email: opts.email,
        passwordHash,
        firstName,
        lastName,
        timezone: 'America/New_York',
      },
    });
    const membership = await prisma.membership.create({
      data: {
        accountId: account.id,
        organizationId,
        role: opts.role,
        status: 'active',
        countryCode: opts.countryCode ?? null,
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
      displayName: `${firstName} ${lastName}`,
    };
  };

  const sync = (cookies: string[], orgId: string, body: Record<string, unknown>) =>
    request(server())
      .post(`/api/organizations/${orgId}/holidays/sync`)
      .set('Cookie', cookies)
      .send(body);

  const summary = (cookies: string[], orgId: string, query = `?year=${YEAR}`) =>
    request(server())
      .get(`/api/organizations/${orgId}/holidays/summary${query}`)
      .set('Cookie', cookies);

  const listHolidays = (cookies: string[], orgId: string, query = '') =>
    request(server()).get(`/api/organizations/${orgId}/holidays${query}`).set('Cookie', cookies);

  const createHoliday = (cookies: string[], orgId: string, body: Record<string, unknown>) =>
    request(server())
      .post(`/api/organizations/${orgId}/holidays`)
      .set('Cookie', cookies)
      .send(body);

  const deleteHoliday = (cookies: string[], orgId: string, holidayId: string) =>
    request(server())
      .delete(`/api/organizations/${orgId}/holidays/${holidayId}`)
      .set('Cookie', cookies);

  const getSourcingSetting = (cookies: string[], orgId: string) =>
    request(server())
      .get(`/api/organizations/${orgId}/settings/holiday-sourcing`)
      .set('Cookie', cookies);

  const putSourcingSetting = (cookies: string[], orgId: string, body: Record<string, unknown>) =>
    request(server())
      .put(`/api/organizations/${orgId}/settings/holiday-sourcing`)
      .set('Cookie', cookies)
      .send(body);

  const amountsOwed = (cookies: string[], orgId: string, query: string) =>
    request(server())
      .get(`/api/organizations/${orgId}/reports/amounts-owed${query}`)
      .set('Cookie', cookies);

  /** Live financials plus the snapshot the rate lookup reads, both from `effectiveFrom`. */
  const seedFinancials = async (
    admin: Signed,
    membershipId: string,
    opts: {
      clientHourlyRate: number;
      currency?: string;
      effectiveFrom?: string;
      monthlySalary?: number;
    },
  ): Promise<void> => {
    const monthlySalary = opts.monthlySalary ?? 3000;
    const currency = opts.currency ?? 'USD';
    await prisma.memberFinancials.create({
      data: {
        membershipId,
        monthlySalary,
        clientHourlyRate: opts.clientHourlyRate,
        vacationReservePercent: 8,
        isReservePercentManual: false,
        vacationDaysPerYear: 20,
        currency,
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
        currency,
        effectiveFrom: toDbDate(opts.effectiveFrom ?? `${YEAR}-01-01`),
      },
    });
  };

  /** A mid-year change — a new snapshot, and the live row moved to match it. */
  const seedRateChange = async (
    membershipId: string,
    opts: {
      clientHourlyRate: number;
      effectiveFrom: string;
      currency?: string;
      monthlySalary?: number;
    },
  ): Promise<void> => {
    const monthlySalary = opts.monthlySalary ?? 3000;
    const currency = opts.currency ?? 'USD';
    await prisma.memberFinancialsSnapshot.create({
      data: {
        membershipId,
        monthlySalary,
        clientHourlyRate: opts.clientHourlyRate,
        vacationReservePercent: 8,
        isReservePercentManual: false,
        vacationDaysPerYear: 20,
        currency,
        effectiveFrom: toDbDate(opts.effectiveFrom),
      },
    });
    await prisma.memberFinancials.update({
      where: { membershipId },
      data: { clientHourlyRate: opts.clientHourlyRate, monthlySalary, currency },
    });
  };

  beforeAll(async () => {
    provider = new StubHolidayProvider();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useClass(InMemoryMailService)
      .overrideProvider(HolidayProvider)
      .useValue(provider)
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
    provider.reset();
    provider.callBoundMs = 2000;
    await prisma.holidayImport.deleteMany();
    await prisma.organizationHolidaySourcing.deleteMany();
    await prisma.holiday.deleteMany();
    await prisma.timeEntry.deleteMany();
    await prisma.vacationRequest.deleteMany();
    await prisma.vacationReserveTransaction.deleteMany();
    await prisma.memberFinancialsSnapshot.deleteMany();
    await prisma.memberFinancials.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
  });

  /** One admin, one German member, and a provider answering Germany's shape. */
  const germanOrg = async (): Promise<Signed> => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createMember(admin.organizationId, {
      email: 'de@acme.com',
      role: 'user',
      countryCode: 'DE',
    });
    provider.answersGermany('DE');
    return admin;
  };

  // TC-02-INT-01
  it('TC-02-INT-01: a sync writes a country’s nationwide holidays and discards its regional ones', async () => {
    const admin = await germanOrg();

    const response = await sync(admin.cookies, admin.organizationId, { year: YEAR });
    expect(response.status).toBe(200);
    expect(response.body.year).toBe(YEAR);
    expect(response.body.countries).toEqual([
      { countryCode: 'DE', state: 'sourced', written: 10, skipped: 0, discarded: 10 },
    ]);

    const holidays = await prisma.holiday.findMany({
      where: { organizationId: admin.organizationId },
      orderBy: { date: 'asc' },
    });
    expect(holidays).toHaveLength(10);
    for (const holiday of holidays) {
      const date = holiday.date.toISOString().slice(0, 10);
      expect(holiday.source).toBe('imported');
      expect(holiday.paidHours.toString()).toBe('8');
      expect(holiday.countryCode).toBe('DE');
      // The driver's OWN name, never `nager` — that is the deployed driver's, and this
      // case runs against the double.
      expect(holiday.externalKey).toBe(`fake:DE:${date}`);
      expect(holiday.importedAt).not.toBeNull();
      expect(holiday.createdByAccountId).toBe(admin.accountId);
    }

    // Not one of the ten regional dates was written.
    const written = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
    const nationwide = new Set(germanNationwideDates(YEAR));
    expect([...written].every((d) => nationwide.has(d))).toBe(true);
    expect(written.size).toBe(nationwide.size);

    const imports = await prisma.holidayImport.findMany({
      where: { organizationId: admin.organizationId },
    });
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({
      countryCode: 'DE',
      year: YEAR,
      holidayCount: 10,
      // The column records the driver that answered, so under the double it reads `fake`.
      provider: 'fake',
    });
  });

  // TC-02-INT-02
  it('TC-02-INT-02: a second sync for a sourced year calls the provider zero times', async () => {
    const admin = await germanOrg();
    expect((await sync(admin.cookies, admin.organizationId, { year: YEAR })).status).toBe(200);
    const callsAfterFirst = provider.callsFor('DE');
    const first = await prisma.holidayImport.findFirstOrThrow({
      where: { organizationId: admin.organizationId },
    });

    const second = await sync(admin.cookies, admin.organizationId, { year: YEAR });
    expect(second.status).toBe(200);
    expect(provider.callsFor('DE')).toBe(callsAfterFirst);
    expect(second.body.countries[0]).toEqual({
      countryCode: 'DE',
      state: 'sourced',
      written: 0,
      skipped: 0,
      discarded: 0,
    });

    const after = await prisma.holidayImport.findFirstOrThrow({
      where: { organizationId: admin.organizationId },
    });
    expect(after.importedAt.toISOString()).toBe(first.importedAt.toISOString());
  });

  // TC-02-INT-03
  it('TC-02-INT-03: a holiday an admin deleted is not restored by a later sync', async () => {
    const admin = await germanOrg();
    await sync(admin.cookies, admin.organizationId, { year: YEAR });

    const victim = await prisma.holiday.findFirstOrThrow({
      where: { organizationId: admin.organizationId },
      orderBy: { date: 'asc' },
    });
    expect((await deleteHoliday(admin.cookies, admin.organizationId, victim.id)).status).toBe(204);
    const callsAfterFirst = provider.callsFor('DE');

    const again = await sync(admin.cookies, admin.organizationId, { year: YEAR });
    expect(again.status).toBe(200);
    expect(provider.callsFor('DE')).toBe(callsAfterFirst);

    const remaining = await prisma.holiday.findMany({
      where: { organizationId: admin.organizationId },
    });
    expect(remaining).toHaveLength(9);
    expect(remaining.some((h) => h.id === victim.id)).toBe(false);
  });

  // TC-02-INT-04
  it('TC-02-INT-04: a manual holiday on an imported holiday’s date survives the import', async () => {
    const admin = await germanOrg();
    const [firstDate] = germanNationwideDates(YEAR);

    const manual = await createHoliday(admin.cookies, admin.organizationId, {
      date: firstDate,
      name: 'Betriebsfeier',
      paidHours: 4,
      countryCode: 'DE',
    });
    expect(manual.status).toBe(201);

    const response = await sync(admin.cookies, admin.organizationId, { year: YEAR });
    expect(response.status).toBe(200);
    expect(response.body.countries[0]).toMatchObject({ written: 9, skipped: 1, discarded: 10 });

    const onThatDate = await prisma.holiday.findMany({
      where: { organizationId: admin.organizationId, date: toDbDate(firstDate) },
    });
    expect(onThatDate).toHaveLength(1);
    expect(onThatDate[0].source).toBe('manual');
    expect(onThatDate[0].name).toBe('Betriebsfeier');
    expect(onThatDate[0].paidHours.toString()).toBe('4');
  });

  // TC-02-INT-05
  it('TC-02-INT-05: a provider failure answers 200 and reports the country unsourced', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createMember(admin.organizationId, { email: 'pl@acme.com', role: 'user', countryCode: 'PL' });
    await createMember(admin.organizationId, { email: 'de@acme.com', role: 'user', countryCode: 'DE' });
    provider.answersPoland('PL');
    provider.refuses('DE');

    const response = await sync(admin.cookies, admin.organizationId, { year: YEAR });
    expect(response.status).toBe(200);
    const byCountry = Object.fromEntries(
      (response.body.countries as Array<{ countryCode: string }>).map((c) => [c.countryCode, c]),
    );
    expect(byCountry.PL).toMatchObject({ state: 'sourced', written: 14 });
    expect(byCountry.DE).toMatchObject({ state: 'unsourced', written: 0 });

    const imports = await prisma.holidayImport.findMany({
      where: { organizationId: admin.organizationId },
    });
    expect(imports).toHaveLength(1);
    expect(imports[0].countryCode).toBe('PL');

    const list = await listHolidays(admin.cookies, admin.organizationId, `?year=${YEAR}`);
    expect(list.status).toBe(200);
    const sourcing = list.body.sourcing.countries as Array<{ countryCode: string; state: string }>;
    expect(sourcing.find((c) => c.countryCode === 'DE')).toMatchObject({
      state: 'unsourced',
      holidayCount: 0,
      lastImportedAt: null,
    });
    expect(sourcing.find((c) => c.countryCode === 'PL')).toMatchObject({
      state: 'sourced',
      holidayCount: 14,
    });
  });

  // TC-02-INT-06
  it('TC-02-INT-06: a country the provider does not cover is recorded, not re-asked', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createMember(admin.organizationId, { email: 'gb@acme.com', role: 'user', countryCode: 'GB' });
    provider.answersEmpty('GB');

    const first = await sync(admin.cookies, admin.organizationId, { year: YEAR });
    expect(first.status).toBe(200);
    expect(first.body.countries[0]).toMatchObject({ countryCode: 'GB', state: 'empty', written: 0 });
    const record = await prisma.holidayImport.findFirstOrThrow({
      where: { organizationId: admin.organizationId },
    });
    expect(record.holidayCount).toBe(0);

    const callsAfterFirst = provider.callsFor('GB');
    const second = await sync(admin.cookies, admin.organizationId, { year: YEAR });
    expect(second.status).toBe(200);
    expect(provider.callsFor('GB')).toBe(callsAfterFirst);
    expect(second.body.countries[0]).toMatchObject({ state: 'empty' });
  });

  // TC-02-INT-07
  it('TC-02-INT-07: the refresh flag re-asks a sourced year, and a refresh that writes nothing stays sourced', async () => {
    const admin = await germanOrg();
    await sync(admin.cookies, admin.organizationId, { year: YEAR });
    const victim = await prisma.holiday.findFirstOrThrow({
      where: { organizationId: admin.organizationId },
      orderBy: { date: 'asc' },
    });
    await deleteHoliday(admin.cookies, admin.organizationId, victim.id);
    const survivors = await prisma.holiday.findMany({
      where: { organizationId: admin.organizationId },
      orderBy: { date: 'asc' },
    });
    expect(survivors).toHaveLength(9);
    const callsBefore = provider.callsFor('DE');

    // Edge case 9 — the one case where a deletion does not survive, because the admin
    // asked for it.
    const refreshed = await sync(admin.cookies, admin.organizationId, { year: YEAR, refresh: true });
    expect(refreshed.status).toBe(200);
    expect(provider.callsFor('DE')).toBe(callsBefore + 1);
    expect(refreshed.body.countries[0]).toMatchObject({ state: 'sourced', written: 1, skipped: 9 });

    const after = await prisma.holiday.findMany({
      where: { organizationId: admin.organizationId },
      orderBy: { date: 'asc' },
    });
    expect(after).toHaveLength(10);
    for (const survivor of survivors) {
      const same = after.find((h) => h.id === survivor.id)!;
      expect(same.name).toBe(survivor.name);
      expect(same.paidHours.toString()).toBe(survivor.paidHours.toString());
    }

    // Edge case 10 / REQ-02-023 — a refresh with nothing left to write records the
    // OFFERED count and stays `sourced`, rather than being mistaken for empty.
    const again = await sync(admin.cookies, admin.organizationId, { year: YEAR, refresh: true });
    expect(again.body.countries[0]).toMatchObject({ state: 'sourced', written: 0, skipped: 10 });
    const record = await prisma.holidayImport.findFirstOrThrow({
      where: { organizationId: admin.organizationId },
    });
    expect(record.holidayCount).toBe(10);
  });

  // TC-02-INT-08
  it('TC-02-INT-08: the summary’s day counts are right per country and per person', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc', 'Alex', 'Kaminski');
    // The admin resolves to PL too, so every country in the set has a member.
    await prisma.membership.update({ where: { id: admin.membershipId }, data: { countryCode: 'PL' } });
    const second = await createMember(admin.organizationId, {
      email: 'pl2@acme.com',
      role: 'user',
      countryCode: 'PL',
      firstName: 'Ivan',
      lastName: 'Demchenko',
    });
    const third = await createMember(admin.organizationId, {
      email: 'us@acme.com',
      role: 'user',
      countryCode: 'US',
      firstName: 'Sam',
      lastName: 'Reed',
    });
    provider.answersPoland('PL');
    provider.answersOn('US', ['01-01', '07-04', '12-25']);
    await sync(admin.cookies, admin.organizationId, { year: YEAR });

    const first = await summary(admin.cookies, admin.organizationId);
    expect(first.status).toBe(200);
    expect(first.body.year).toBe(YEAR);
    const countries = first.body.countries as Array<{
      countryCode: string | null;
      holidayCount: number;
      memberCount: number;
    }>;
    expect(countries.find((c) => c.countryCode === 'PL')).toEqual({
      countryCode: 'PL',
      holidayCount: 14,
      memberCount: 2,
    });
    expect(countries.find((c) => c.countryCode === 'US')).toEqual({
      countryCode: 'US',
      holidayCount: 3,
      memberCount: 1,
    });
    expect(countries.some((c) => c.countryCode === null)).toBe(false);

    const members = first.body.members as Array<{
      membershipId: string;
      holidayCount: number;
      paidHours: string;
    }>;
    expect(members).toHaveLength(3);
    expect(members.find((m) => m.membershipId === admin.membershipId)).toMatchObject({
      holidayCount: 14,
      paidHours: '112.00',
    });
    expect(members.find((m) => m.membershipId === second.membershipId)).toMatchObject({
      holidayCount: 14,
    });
    expect(members.find((m) => m.membershipId === third.membershipId)).toMatchObject({
      holidayCount: 3,
      paidHours: '24.00',
    });
    // Sums over MEMBERS, never over countries: 14 + 14 + 3.
    expect(first.body.totals.holidayCount).toBe(31);
    expect(first.body.totals.paidHours).toBe('248.00');

    // Edge case 22 — a global holiday is its own row, and the two arrays stop summing to
    // each other, which is correct because they count different things.
    await createHoliday(admin.cookies, admin.organizationId, {
      date: `${YEAR}-03-02`,
      name: 'Company Day',
      paidHours: 8,
      countryCode: null,
    });
    const second_ = await summary(admin.cookies, admin.organizationId);
    const withGlobal = second_.body.countries as Array<{
      countryCode: string | null;
      holidayCount: number;
      memberCount: number;
    }>;
    expect(withGlobal.find((c) => c.countryCode === null)).toEqual({
      countryCode: null,
      holidayCount: 1,
      memberCount: 3,
    });
    const raised = second_.body.members as Array<{ membershipId: string; holidayCount: number }>;
    expect(raised.find((m) => m.membershipId === admin.membershipId)!.holidayCount).toBe(15);
    expect(raised.find((m) => m.membershipId === third.membershipId)!.holidayCount).toBe(4);
    expect(second_.body.totals.holidayCount).toBe(34);
    const countrySum = withGlobal.reduce((n, c) => n + c.holidayCount, 0);
    expect(countrySum).not.toBe(second_.body.totals.holidayCount);
  });

  // TC-02-INT-09
  it('TC-02-INT-09: a person’s amount matches the Amounts Owed report’s holiday rows', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc', 'Alex', 'Kaminski');
    await prisma.membership.update({ where: { id: admin.membershipId }, data: { countryCode: 'PL' } });
    // A rate that changes part way through the year, and holidays on both sides of it.
    await seedFinancials(admin, admin.membershipId, {
      clientHourlyRate: 45,
      effectiveFrom: `${YEAR}-01-01`,
    });
    await seedRateChange(admin.membershipId, {
      clientHourlyRate: 57.5,
      effectiveFrom: `${YEAR}-07-01`,
    });
    provider.answersPoland('PL');
    await sync(admin.cookies, admin.organizationId, { year: YEAR });

    const view = await summary(admin.cookies, admin.organizationId);
    expect(view.status).toBe(200);
    const row = (view.body.members as Array<{ membershipId: string; byCurrency: Array<{ currency: string; amount: string }> }>)
      .find((m) => m.membershipId === admin.membershipId)!;
    expect(row.byCurrency).toHaveLength(1);
    expect(row.byCurrency[0].currency).toBe('USD');

    const report = await amountsOwed(
      admin.cookies,
      admin.organizationId,
      `?startDate=${YEAR}-01-01&endDate=${YEAR}-12-31&detailedReports=true`,
    );
    expect(report.status).toBe(200);
    const rows = (report.body.groups as Array<{ rows: Array<Record<string, string>> }>)
      .flatMap((g) => g.rows)
      .filter((r) => r.activity?.startsWith('Holiday · ') && r.member === admin.displayName);
    expect(rows.length).toBe(14);
    const reportTotal = rows.reduce((sum, r) => sum + Number(r.amount), 0);

    // Equal to the cent. A single-rate calculation fails this: the rate changed mid-year.
    expect(Number(row.byCurrency[0].amount)).toBeCloseTo(reportTotal, 2);
    expect(row.byCurrency[0].amount).toBe(reportTotal.toFixed(2));
  });

  // TC-02-INT-10
  it('TC-02-INT-10: totals are grouped by currency, never summed across them', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc', 'Alex', 'Kaminski');
    await prisma.membership.update({ where: { id: admin.membershipId }, data: { countryCode: 'PL' } });
    const other = await createMember(admin.organizationId, {
      email: 'eur@acme.com',
      role: 'user',
      countryCode: 'PL',
      firstName: 'Eva',
      lastName: 'Novak',
    });
    await seedFinancials(admin, admin.membershipId, { clientHourlyRate: 50, currency: 'USD' });
    await seedFinancials(admin, other.membershipId, { clientHourlyRate: 40, currency: 'EUR' });
    provider.answersPoland('PL');
    await sync(admin.cookies, admin.organizationId, { year: YEAR });

    const first = await summary(admin.cookies, admin.organizationId);
    expect(first.status).toBe(200);
    const totals = first.body.totals.byCurrency as Array<{ currency: string; amount: string }>;
    expect(totals.map((t) => t.currency).sort()).toEqual(['EUR', 'USD']);
    expect(totals.find((t) => t.currency === 'USD')!.amount).toBe((14 * 8 * 50).toFixed(2));
    expect(totals.find((t) => t.currency === 'EUR')!.amount).toBe((14 * 8 * 40).toFixed(2));
    const members = first.body.members as Array<{ membershipId: string; byCurrency: unknown[] }>;
    for (const member of members) expect(member.byCurrency).toHaveLength(1);
    // Nothing anywhere carries a total across the two.
    expect(first.body.totals).not.toHaveProperty('amount');

    // Edge case 15a — a currency that changed mid-year splits that member's holidays by
    // the currency in force on each holiday's own date, and converts nothing.
    await seedRateChange(other.membershipId, {
      clientHourlyRate: 40,
      currency: 'GBP',
      effectiveFrom: `${YEAR}-07-01`,
    });
    const second = await summary(admin.cookies, admin.organizationId);
    const changed = (second.body.members as Array<{ membershipId: string; byCurrency: Array<{ currency: string; amount: string }> }>)
      .find((m) => m.membershipId === other.membershipId)!;
    expect(changed.byCurrency.map((c) => c.currency).sort()).toEqual(['EUR', 'GBP']);
    const beforeJuly = polishDates(YEAR).filter((d) => d < `${YEAR}-07-01`).length;
    const fromJuly = polishDates(YEAR).length - beforeJuly;
    expect(changed.byCurrency.find((c) => c.currency === 'EUR')!.amount).toBe(
      (beforeJuly * 8 * 40).toFixed(2),
    );
    expect(changed.byCurrency.find((c) => c.currency === 'GBP')!.amount).toBe(
      (fromJuly * 8 * 40).toFixed(2),
    );
    const secondTotals = second.body.totals.byCurrency as Array<{ currency: string }>;
    expect(secondTotals.map((t) => t.currency).sort()).toEqual(['EUR', 'GBP', 'USD']);
  });

  // TC-02-INT-11
  it('TC-02-INT-11: a caller without view-amounts-owed receives no amount and no currency', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc', 'Alex', 'Kaminski');
    await prisma.membership.update({ where: { id: admin.membershipId }, data: { countryCode: 'PL' } });
    await seedFinancials(admin, admin.membershipId, { clientHourlyRate: 50 });
    provider.answersPoland('PL');
    await sync(admin.cookies, admin.organizationId, { year: YEAR });

    // No shipped role holds `view-holidays` without `view-amounts-owed`, so the case
    // supplies the capability set directly rather than signing a session in.
    const body = await app
      .get(HolidaySummaryService)
      .buildSummary(admin.organizationId, YEAR, { includeAmounts: false });

    expect(body.members).toHaveLength(1);
    expect(body.members[0].holidayCount).toBe(14);
    expect(body.members[0].paidHours).toBe('112.00');
    // Absent — not null, not empty and not zero.
    expect('byCurrency' in body.members[0]).toBe(false);
    expect('byCurrency' in body.totals).toBe(false);
    expect(body.totals.holidayCount).toBe(14);
  });

  // TC-02-INT-12
  it('TC-02-INT-12: a member with no financials has a day count and no amount', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc', 'Alex', 'Kaminski');
    await prisma.membership.update({ where: { id: admin.membershipId }, data: { countryCode: 'PL' } });
    const poorer = await createMember(admin.organizationId, {
      email: 'nofin@acme.com',
      role: 'user',
      countryCode: 'PL',
      firstName: 'Nina',
      lastName: 'Ovcharenko',
    });
    await seedFinancials(admin, admin.membershipId, { clientHourlyRate: 50 });
    provider.answersPoland('PL');
    await sync(admin.cookies, admin.organizationId, { year: YEAR });

    const view = await summary(admin.cookies, admin.organizationId);
    expect(view.status).toBe(200);
    const members = view.body.members as Array<Record<string, unknown>>;
    const funded = members.find((m) => m.membershipId === admin.membershipId)!;
    const unfunded = members.find((m) => m.membershipId === poorer.membershipId)!;

    expect(unfunded.holidayCount).toBe(funded.holidayCount);
    expect(unfunded.paidHours).toBe(funded.paidHours);
    expect('byCurrency' in unfunded).toBe(false);

    const totals = view.body.totals.byCurrency as Array<{ currency: string; amount: string }>;
    expect(totals).toHaveLength(1);
    expect(totals[0]).toEqual({ currency: 'USD', amount: (14 * 8 * 50).toFixed(2) });
  });

  // TC-02-INT-13
  it('TC-02-INT-13: every route answers 404 without its capability, and across organizations', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const orgId = admin.organizationId;
    const user = await createMember(orgId, { email: 'user@acme.com', role: 'user' });
    const viewer = await createMember(orgId, { email: 'viewer@acme.com', role: 'viewer' });
    const outsider = await signupAdmin('other@other.com', 'Other Inc');

    for (const caller of [user, viewer, outsider]) {
      expect((await summary(caller.cookies, orgId)).status).toBe(404);
      expect((await sync(caller.cookies, orgId, { year: YEAR })).status).toBe(404);
      expect((await getSourcingSetting(caller.cookies, orgId)).status).toBe(404);
      expect(
        (await putSourcingSetting(caller.cookies, orgId, { includeOrgCountry: false })).status,
      ).toBe(404);
    }
    // No body names a capability or confirms the organization exists.
    const refusal = await summary(user.cookies, orgId);
    expect(JSON.stringify(refusal.body)).not.toContain('view-holidays');
    expect(JSON.stringify(refusal.body)).not.toContain(orgId);

    // A manager holds both capabilities, and all four routes answer 200.
    const manager = await createMember(orgId, { email: 'mgr@acme.com', role: 'manager' });
    expect((await summary(manager.cookies, orgId)).status).toBe(200);
    expect((await sync(manager.cookies, orgId, { year: YEAR })).status).toBe(200);
    expect((await getSourcingSetting(manager.cookies, orgId)).status).toBe(200);
    expect(
      (await putSourcingSetting(manager.cookies, orgId, { includeOrgCountry: false })).status,
    ).toBe(200);
  });

  // TC-02-INT-14
  it('TC-02-INT-14: a provider that never answers is abandoned at the call bound', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createMember(admin.organizationId, { email: 'pl@acme.com', role: 'user', countryCode: 'PL' });
    await createMember(admin.organizationId, { email: 'in@acme.com', role: 'user', countryCode: 'IN' });
    provider.answersPoland('PL');
    provider.neverAnswers('IN');
    provider.callBoundMs = 300;

    const started = Date.now();
    const response = await sync(admin.cookies, admin.organizationId, { year: YEAR });
    const elapsed = Date.now() - started;

    expect(response.status).toBe(200);
    // The request comes back: the bound, plus room for one instant call and the writes.
    expect(elapsed).toBeLessThan(provider.callBoundMs + 5000);

    const byCountry = Object.fromEntries(
      (response.body.countries as Array<{ countryCode: string }>).map((c) => [c.countryCode, c]),
    );
    expect(byCountry.IN).toMatchObject({ state: 'unsourced', written: 0 });
    expect(byCountry.PL).toMatchObject({ state: 'sourced' });

    const imports = await prisma.holidayImport.findMany({
      where: { organizationId: admin.organizationId },
    });
    expect(imports.map((i) => i.countryCode)).toEqual(['PL']);
  });

  // TC-02-INT-15
  it('TC-02-INT-15: a scope=mine read carries source on each row and no sourcing block', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'user@acme.com',
      role: 'user',
      countryCode: 'PL',
    });
    const viewer = await createMember(admin.organizationId, {
      email: 'viewer@acme.com',
      role: 'viewer',
      countryCode: 'PL',
    });
    provider.answersPoland('PL');
    await sync(admin.cookies, admin.organizationId, { year: YEAR });

    for (const caller of [user, viewer]) {
      const mine = await listHolidays(
        caller.cookies,
        admin.organizationId,
        `?scope=mine&year=${YEAR}`,
      );
      expect(mine.status).toBe(200);
      expect(mine.body.holidays.length).toBe(14);
      for (const row of mine.body.holidays) expect(row.source).toBe('imported');
      // Absent, not null and not empty.
      expect('sourcing' in mine.body).toBe(false);
    }

    const all = await listHolidays(admin.cookies, admin.organizationId, `?scope=all&year=${YEAR}`);
    expect(all.status).toBe(200);
    expect(all.body.sourcing.countries).toHaveLength(1);
    expect(all.body.sourcing.countries[0]).toMatchObject({ countryCode: 'PL', state: 'sourced' });
  });

  // TC-02-INT-16
  it('TC-02-INT-16: an import writes nothing onto a date already carrying a global holiday', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc', 'Alex', 'Kaminski');
    await prisma.membership.update({ where: { id: admin.membershipId }, data: { countryCode: 'PL' } });
    await seedFinancials(admin, admin.membershipId, { clientHourlyRate: 50 });
    const [globalDate, frenchDate] = polishDates(YEAR);
    provider.answersPoland('PL');

    // Edge case 7a — the form's "All countries" option, on a date the provider returns.
    expect(
      (
        await createHoliday(admin.cookies, admin.organizationId, {
          date: globalDate,
          name: 'Company Day',
          paidHours: 8,
          countryCode: null,
        })
      ).status,
    ).toBe(201);
    // Edge case 7b — another country's holiday on another date the provider returns.
    expect(
      (
        await createHoliday(admin.cookies, admin.organizationId, {
          date: frenchDate,
          name: 'Fete Nationale',
          paidHours: 8,
          countryCode: 'FR',
        })
      ).status,
    ).toBe(201);

    const response = await sync(admin.cookies, admin.organizationId, { year: YEAR });
    expect(response.status).toBe(200);
    // 14 offered: the global date is skipped, the French date is written beside its row.
    expect(response.body.countries[0]).toMatchObject({ written: 13, skipped: 1 });

    const onGlobal = await prisma.holiday.findMany({
      where: { organizationId: admin.organizationId, date: toDbDate(globalDate) },
    });
    expect(onGlobal).toHaveLength(1);
    expect(onGlobal[0].source).toBe('manual');
    expect(onGlobal[0].countryCode).toBeNull();

    const onFrench = await prisma.holiday.findMany({
      where: { organizationId: admin.organizationId, date: toDbDate(frenchDate) },
      orderBy: { countryCode: 'asc' },
    });
    expect(onFrench).toHaveLength(2);
    expect(onFrench.map((h) => h.countryCode).sort()).toEqual(['FR', 'PL']);

    // The double payment REQ-02-006 exists to prevent: exactly one paid holiday row for
    // the member on the global date.
    const report = await amountsOwed(
      admin.cookies,
      admin.organizationId,
      `?startDate=${YEAR}-01-01&endDate=${YEAR}-12-31&detailedReports=true`,
    );
    expect(report.status).toBe(200);
    // The report groups by calendar day and the group's id IS the day, so "how many paid
    // holiday rows fall on this date" is a question about one group.
    const day = (report.body.groups as Array<{ id: string; rows: Array<Record<string, string>> }>)
      .find((g) => g.id === globalDate);
    expect(day).toBeTruthy();
    const onThatDay = day!.rows.filter(
      (r) => r.activity?.startsWith('Holiday · ') && r.member === admin.displayName,
    );
    expect(onThatDay).toHaveLength(1);
  });

  // Validation Rule 1 / Edge case 17 — the year, on both routes that take it.
  it('refuses a year outside 2000..2100 on both routes that take one', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const synced = await sync(admin.cookies, admin.organizationId, { year: 1999 });
    expect(synced.status).toBe(422);
    expect(synced.body.fields.year).toBe(HOLIDAY_SOURCING_MESSAGES.yearInvalid);
    expect(synced.body.fields.year).toBe('Choose a year between 2000 and 2100.');

    const summarised = await summary(admin.cookies, admin.organizationId, '?year=1999');
    expect(summarised.status).toBe(422);
    expect(summarised.body.fields.year).toBe('Choose a year between 2000 and 2100.');
  });

  // REQ-02-002 / Validation Rule 2 — the setting, its default and its refusal.
  it('reads the include-organization-country setting as true, stores it, and refuses a non-boolean', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const initial = await getSourcingSetting(admin.cookies, admin.organizationId);
    expect(initial.status).toBe(200);
    expect(initial.body).toEqual({ includeOrgCountry: true });

    const written = await putSourcingSetting(admin.cookies, admin.organizationId, {
      includeOrgCountry: false,
    });
    expect(written.status).toBe(200);
    expect(written.body).toEqual({ includeOrgCountry: false });
    expect((await getSourcingSetting(admin.cookies, admin.organizationId)).body).toEqual({
      includeOrgCountry: false,
    });

    for (const bad of [{ includeOrgCountry: 'false' }, {}]) {
      const refused = await putSourcingSetting(admin.cookies, admin.organizationId, bad);
      expect(refused.status).toBe(422);
      expect(refused.body.fields.includeOrgCountry).toBe(
        "Choose whether to include the organization's country.",
      );
    }
    // Refused, never coerced: the stored value is still the one that was written.
    expect((await getSourcingSetting(admin.cookies, admin.organizationId)).body).toEqual({
      includeOrgCountry: false,
    });
  });

  // REQ-02-002 — the checkbox governs the organization's country and nothing else.
  it('drops the organization’s own country from the set while the setting is off', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    // Every member states their own country, so nobody resolves to the organization's
    // through the fallback — otherwise Edge case 4 keeps GB in the set whatever the
    // checkbox says, which is the rule, not a failure.
    await prisma.membership.update({
      where: { id: admin.membershipId },
      data: { countryCode: 'PL' },
    });
    await prisma.organization.update({
      where: { id: admin.organizationId },
      data: { countryCode: 'GB' },
    });
    await createMember(admin.organizationId, { email: 'pl@acme.com', role: 'user', countryCode: 'PL' });
    provider.answersPoland('PL');
    provider.answersEmpty('GB');

    const withOrg = await sync(admin.cookies, admin.organizationId, { year: YEAR });
    expect(
      (withOrg.body.countries as Array<{ countryCode: string }>).map((c) => c.countryCode).sort(),
    ).toEqual(['GB', 'PL']);

    await putSourcingSetting(admin.cookies, admin.organizationId, { includeOrgCountry: false });
    const withoutOrg = await sync(admin.cookies, admin.organizationId, { year: YEAR });
    expect(
      (withoutOrg.body.countries as Array<{ countryCode: string }>).map((c) => c.countryCode),
    ).toEqual(['PL']);
  });
});
