import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HOLIDAY_MESSAGES } from '@devscribed/validation';
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
 * The `year` query defaults to the caller's current year, so every seeded holiday is
 * pinned to an explicit year and every list call passes one. Nothing here depends on
 * the machine clock except the vacation range in TC-03-INT-15, which the vacation
 * spec requires to be future-dated.
 */
const YEAR = 2026;

describe('Holidays (spec organization/03)', () => {
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

  const signupAdmin = async (email: string, orgName: string): Promise<Signed> => {
    const response = await request(server()).post('/api/signup').send({
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
    request(server()).post('/api/login').send({ email, password });

  const createMember = async (
    organizationId: string,
    opts: { email: string; role: string; phoneCountryCode?: string | null; timezone?: string },
  ): Promise<Signed> => {
    const password = 'Passw0rd';
    const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: {
        email: opts.email,
        passwordHash,
        firstName: 'Test',
        lastName: 'User',
        timezone: opts.timezone ?? 'America/New_York',
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
    };
  };

  const listHolidays = (cookies: string[], orgId: string, query = '') =>
    request(server()).get(`/api/organizations/${orgId}/holidays${query}`).set('Cookie', cookies);

  const createHoliday = (cookies: string[], orgId: string, body: Record<string, unknown>) =>
    request(server())
      .post(`/api/organizations/${orgId}/holidays`)
      .set('Cookie', cookies)
      .send(body);

  const updateHoliday = (
    cookies: string[],
    orgId: string,
    holidayId: string,
    body: Record<string, unknown>,
  ) =>
    request(server())
      .patch(`/api/organizations/${orgId}/holidays/${holidayId}`)
      .set('Cookie', cookies)
      .send(body);

  const deleteHoliday = (cookies: string[], orgId: string, holidayId: string) =>
    request(server())
      .delete(`/api/organizations/${orgId}/holidays/${holidayId}`)
      .set('Cookie', cookies);

  /** A holiday body with the spec's defaults; override what the case is about. */
  const body = (over: Record<string, unknown> = {}) => ({
    date: `${YEAR}-05-01`,
    name: 'Labour Day',
    paidHours: 8,
    countryCode: null,
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

  // TC-03-INT-01
  it('admin creates a holiday (happy path) and a later GET returns it', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const created = await createHoliday(admin.cookies, admin.organizationId, body());
    expect(created.status).toBe(201);
    expect(created.body.holiday).toMatchObject({
      date: `${YEAR}-05-01`,
      name: 'Labour Day',
      paidHours: 8,
      countryCode: null,
    });
    // A Prisma Decimal reaching res.json would arrive as the string "8".
    expect(typeof created.body.holiday.paidHours).toBe('number');

    const list = await listHolidays(admin.cookies, admin.organizationId, `?year=${YEAR}`);
    expect(list.status).toBe(200);
    expect(list.body.holidays).toHaveLength(1);
    expect(list.body.holidays[0].id).toBe(created.body.holiday.id);
  });

  // TC-03-INT-02
  it('manager creates a holiday', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com',
      role: 'manager',
    });

    const created = await createHoliday(manager.cookies, admin.organizationId, body());
    expect(created.status).toBe(201);
  });

  // TC-03-INT-03
  it('a user cannot create a holiday, and gets 404 rather than 403', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const user = await createMember(admin.organizationId, {
      email: 'user@acme.com',
      role: 'user',
    });

    const created = await createHoliday(user.cookies, admin.organizationId, body());
    expect(created.status).toBe(404);

    // The default scope (and an explicit scope=all) is equally invisible to them.
    expect((await listHolidays(user.cookies, admin.organizationId)).status).toBe(404);
    expect(
      (await listHolidays(user.cookies, admin.organizationId, '?scope=all')).status,
    ).toBe(404);
  });

  // TC-03-INT-04
  it('rejects a duplicate on the same date when both are global', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    expect((await createHoliday(admin.cookies, admin.organizationId, body())).status).toBe(201);
    const second = await createHoliday(
      admin.cookies,
      admin.organizationId,
      body({ name: 'May Day' }),
    );
    expect(second.status).toBe(409);
    expect(second.body).toEqual({
      error: 'holiday_duplicate',
      message: HOLIDAY_MESSAGES.duplicate,
    });
  });

  // TC-03-INT-05
  it('rejects a duplicate on the same date for the same country', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    expect(
      (await createHoliday(admin.cookies, admin.organizationId, body({ countryCode: 'BY' })))
        .status,
    ).toBe(201);
    const second = await createHoliday(
      admin.cookies,
      admin.organizationId,
      body({ countryCode: 'BY', name: 'May Day' }),
    );
    expect(second.status).toBe(409);
  });

  // TC-03-INT-06
  it('allows the same date for two different countries', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    expect(
      (await createHoliday(admin.cookies, admin.organizationId, body({ countryCode: 'BY' })))
        .status,
    ).toBe(201);
    expect(
      (await createHoliday(admin.cookies, admin.organizationId, body({ countryCode: 'US' })))
        .status,
    ).toBe(201);
  });

  // TC-03-INT-07
  it('allows the same date for a global and a country-scoped holiday', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    expect(
      (await createHoliday(admin.cookies, admin.organizationId, body({ countryCode: null })))
        .status,
    ).toBe(201);
    expect(
      (await createHoliday(admin.cookies, admin.organizationId, body({ countryCode: 'US' })))
        .status,
    ).toBe(201);
  });

  // TC-03-INT-08
  it('edits a holiday and moves updatedAt', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const created = await createHoliday(admin.cookies, admin.organizationId, body());
    const id = created.body.holiday.id as string;

    const patched = await updateHoliday(admin.cookies, admin.organizationId, id, {
      name: 'Labour Day (Observed)',
    });
    expect(patched.status).toBe(200);
    expect(patched.body.holiday.name).toBe('Labour Day (Observed)');
    expect(new Date(patched.body.holiday.updatedAt).getTime()).toBeGreaterThan(
      new Date(created.body.holiday.updatedAt).getTime(),
    );

    const list = await listHolidays(admin.cookies, admin.organizationId, `?year=${YEAR}`);
    expect(list.body.holidays[0].name).toBe('Labour Day (Observed)');
  });

  // TC-03-INT-09
  it('rejects an edit that moves a holiday onto an occupied date', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createHoliday(admin.cookies, admin.organizationId, body({ date: `${YEAR}-05-01` }));
    const second = await createHoliday(
      admin.cookies,
      admin.organizationId,
      body({ date: `${YEAR}-05-09`, name: 'Victory Day' }),
    );

    const patched = await updateHoliday(
      admin.cookies,
      admin.organizationId,
      second.body.holiday.id,
      { date: `${YEAR}-05-01` },
    );
    expect(patched.status).toBe(409);
    expect(patched.body.message).toBe(HOLIDAY_MESSAGES.duplicate);
  });

  // TC-03-INT-10
  it('admin deletes a holiday and it leaves the list', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const created = await createHoliday(admin.cookies, admin.organizationId, body());
    const id = created.body.holiday.id as string;

    const removed = await deleteHoliday(admin.cookies, admin.organizationId, id);
    expect(removed.status).toBe(204);

    const list = await listHolidays(admin.cookies, admin.organizationId, `?year=${YEAR}`);
    expect(list.body.holidays).toHaveLength(0);
  });

  // TC-03-INT-11
  it('a manager cannot delete: 403 carrying the tabulated message, not the generic one', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const manager = await createMember(admin.organizationId, {
      email: 'mgr@acme.com',
      role: 'manager',
    });
    const created = await createHoliday(admin.cookies, admin.organizationId, body());

    const removed = await deleteHoliday(
      manager.cookies,
      admin.organizationId,
      created.body.holiday.id,
    );
    expect(removed.status).toBe(403);
    expect(removed.body.message).toBe(HOLIDAY_MESSAGES.deleteForbidden);

    // And the row survives.
    const list = await listHolidays(admin.cookies, admin.organizationId, `?year=${YEAR}`);
    expect(list.body.holidays).toHaveLength(1);
  });

  // TC-03-INT-12
  it('filters by year', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createHoliday(admin.cookies, admin.organizationId, body({ date: '2025-05-01' }));
    await createHoliday(admin.cookies, admin.organizationId, body({ date: '2026-05-01' }));

    const list = await listHolidays(admin.cookies, admin.organizationId, '?year=2026');
    expect(list.status).toBe(200);
    expect(list.body.holidays.map((h: { date: string }) => h.date)).toEqual(['2026-05-01']);
  });

  // TC-03-INT-13
  it('filters by country, keeping the global rows', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createHoliday(
      admin.cookies,
      admin.organizationId,
      body({ date: `${YEAR}-01-01`, name: 'New Year', countryCode: null }),
    );
    await createHoliday(
      admin.cookies,
      admin.organizationId,
      body({ date: `${YEAR}-05-09`, name: 'Victory Day', countryCode: 'BY' }),
    );
    await createHoliday(
      admin.cookies,
      admin.organizationId,
      body({ date: `${YEAR}-07-04`, name: 'Independence Day', countryCode: 'US' }),
    );

    const list = await listHolidays(
      admin.cookies,
      admin.organizationId,
      `?year=${YEAR}&country=BY`,
    );
    expect(list.status).toBe(200);
    expect(list.body.holidays.map((h: { name: string }) => h.name)).toEqual([
      'New Year',
      'Victory Day',
    ]);
  });

  // TC-03-INT-14
  it('scope=mine resolves the caller country server-side and ignores ?country', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await createHoliday(
      admin.cookies,
      admin.organizationId,
      body({ date: `${YEAR}-05-01`, name: 'Labour Day', countryCode: null }),
    );
    await createHoliday(
      admin.cookies,
      admin.organizationId,
      body({ date: `${YEAR}-05-09`, name: 'Victory Day', countryCode: 'BY' }),
    );
    await createHoliday(
      admin.cookies,
      admin.organizationId,
      body({ date: `${YEAR}-07-04`, name: 'Independence Day', countryCode: 'US' }),
    );

    const belarusian = await createMember(admin.organizationId, {
      email: 'by@acme.com',
      role: 'user',
      phoneCountryCode: 'BY',
    });
    const mine = await listHolidays(
      belarusian.cookies,
      admin.organizationId,
      `?year=${YEAR}&scope=mine`,
    );
    expect(mine.status).toBe(200);
    expect(mine.body.holidays.map((h: { name: string }) => h.name)).toEqual([
      'Labour Day',
      'Victory Day',
    ]);

    // country=all alongside scope=mine still returns mine's result.
    const withCountry = await listHolidays(
      belarusian.cookies,
      admin.organizationId,
      `?year=${YEAR}&scope=mine&country=US`,
    );
    expect(withCountry.body.holidays.map((h: { name: string }) => h.name)).toEqual([
      'Labour Day',
      'Victory Day',
    ]);

    const stateless = await createMember(admin.organizationId, {
      email: 'none@acme.com',
      role: 'user',
      phoneCountryCode: null,
    });
    const globalOnly = await listHolidays(
      stateless.cookies,
      admin.organizationId,
      `?year=${YEAR}&scope=mine`,
    );
    expect(globalOnly.status).toBe(200);
    expect(globalOnly.body.holidays.map((h: { name: string }) => h.name)).toEqual([
      'Labour Day',
    ]);
  });

  // TC-03-INT-15
  it('vacation math is unaffected by an overlapping holiday (requirement 12)', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    /** A Monday at least a week out, so the range is future-dated and in-year. */
    const futureMonday = (weekOffset: number): Date => {
      const now = new Date();
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      d.setUTCDate(d.getUTCDate() + 7);
      while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
      d.setUTCDate(d.getUTCDate() + weekOffset * 7);
      return d;
    };
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    const weekRange = (weekOffset: number) => {
      const start = futureMonday(weekOffset);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 4); // Mon–Fri
      return { startDate: ymd(start), endDate: ymd(end), start, end };
    };

    const configure = async (member: Signed) => {
      await request(server())
        .put(
          `/api/organizations/${admin.organizationId}/members/${member.membershipId}/vacation/financials`,
        )
        .set('Cookie', admin.cookies)
        .send({
          monthlySalary: 3000,
          clientHourlyRate: 40,
          vacationDaysPerYear: 20,
          currency: 'USD',
          isReservePercentManual: false,
        });
      await prisma.vacationReserveTransaction.create({
        data: {
          membershipId: member.membershipId,
          type: 'credit',
          amount: 3000,
          billingPeriodMonth: 1,
          billingPeriodYear: new Date().getUTCFullYear(),
          description: 'seed',
          isAutoGenerated: true,
        },
      });
    };

    const submit = (member: Signed, range: { startDate: string; endDate: string }) =>
      request(server())
        .post(
          `/api/organizations/${admin.organizationId}/members/${member.membershipId}/vacation/requests`,
        )
        .set('Cookie', member.cookies)
        .send(range);

    const control = await createMember(admin.organizationId, {
      email: 'control@acme.com',
      role: 'user',
    });
    const treated = await createMember(admin.organizationId, {
      email: 'treated@acme.com',
      role: 'user',
    });
    await configure(control);
    await configure(treated);

    const plainWeek = weekRange(0);
    const holidayWeek = weekRange(1);
    // A Wednesday holiday inside the treated member's week.
    const wednesday = new Date(holidayWeek.start);
    wednesday.setUTCDate(wednesday.getUTCDate() + 2);
    const seeded = await createHoliday(admin.cookies, admin.organizationId, {
      date: ymd(wednesday),
      name: 'Mid-week Holiday',
      paidHours: 8,
      countryCode: null,
    });
    expect(seeded.status).toBe(201);

    const withoutHoliday = await submit(control, plainWeek);
    const withHoliday = await submit(treated, holidayWeek);
    expect(withoutHoliday.status).toBe(201);
    expect(withHoliday.status).toBe(201);
    expect(withHoliday.body.workingDays).toBe(withoutHoliday.body.workingDays);
    expect(withHoliday.body.workingDays).toBe(5);
    expect(String(withHoliday.body.deductionAmount)).toBe(
      String(withoutHoliday.body.deductionAmount),
    );
  });

  // TC-03-INT-19
  it('cross-org access is a 404, not a delete', async () => {
    const orgA = await signupAdmin('a@acme.com', 'Acme Inc');
    const orgB = await signupAdmin('b@globex.com', 'Globex');
    const created = await createHoliday(orgB.cookies, orgB.organizationId, body());
    const id = created.body.holiday.id as string;

    // Org A's admin, using their OWN org in the path (OrgScopeGuard 404s the other URL).
    const removed = await deleteHoliday(orgA.cookies, orgA.organizationId, id);
    expect(removed.status).toBe(404);

    const patched = await updateHoliday(orgA.cookies, orgA.organizationId, id, {
      name: 'Hijacked',
    });
    expect(patched.status).toBe(404);

    // Using org B's id in the path is refused by the guard before the service runs.
    expect(
      (await deleteHoliday(orgA.cookies, orgB.organizationId, id)).status,
    ).toBe(404);

    const stillThere = await listHolidays(orgB.cookies, orgB.organizationId, `?year=${YEAR}`);
    expect(stillThere.body.holidays).toHaveLength(1);
    expect(stillThere.body.holidays[0].name).toBe('Labour Day');
  });

  // TC-03-INT-20
  it('a rotated securityStamp 401s the next mutation', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const created = await createHoliday(admin.cookies, admin.organizationId, body());
    expect(created.status).toBe(201);

    await prisma.account.update({
      where: { id: admin.accountId },
      data: { securityStamp: 'rotated-stamp' },
    });

    const next = await createHoliday(
      admin.cookies,
      admin.organizationId,
      body({ date: `${YEAR}-05-09`, name: 'Victory Day' }),
    );
    expect(next.status).toBe(401);
  });

  // §Validation Rules, re-run server-side — the 422 field map the modal keys on.
  it('returns 422 with per-field messages for every broken rule', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const invalid = await createHoliday(admin.cookies, admin.organizationId, {
      date: 'not-a-date',
      name: '',
      paidHours: 25,
      countryCode: 'by',
    });
    expect(invalid.status).toBe(422);
    expect(invalid.body).toEqual({
      error: 'validation_error',
      fields: {
        date: HOLIDAY_MESSAGES.dateInvalid,
        name: HOLIDAY_MESSAGES.nameRequired,
        paidHours: HOLIDAY_MESSAGES.paidHoursOutOfRange,
        countryCode: HOLIDAY_MESSAGES.countryCodeInvalid,
      },
    });

    const missing = await createHoliday(admin.cookies, admin.organizationId, {});
    expect(missing.status).toBe(422);
    expect(missing.body.fields).toMatchObject({
      date: HOLIDAY_MESSAGES.dateRequired,
      name: HOLIDAY_MESSAGES.nameRequired,
      paidHours: HOLIDAY_MESSAGES.paidHoursRequired,
    });
  });

  // §Security — the body cannot carry organizationId, and a half-day is storable.
  it('ignores an organizationId in the body and stores a fractional paidHours', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    const other = await signupAdmin('b@globex.com', 'Globex');

    const created = await createHoliday(admin.cookies, admin.organizationId, {
      ...body({ paidHours: 4.5 }),
      organizationId: other.organizationId,
    });
    expect(created.status).toBe(201);
    expect(created.body.holiday.paidHours).toBe(4.5);

    const row = await prisma.holiday.findUniqueOrThrow({
      where: { id: created.body.holiday.id },
    });
    expect(row.organizationId).toBe(admin.organizationId);
  });
});
