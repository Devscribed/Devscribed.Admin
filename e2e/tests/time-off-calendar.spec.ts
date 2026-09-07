import { TIME_OFF_CALENDAR_MESSAGES } from '@devscribed/validation';
import { expect, test, type APIRequestContext, type Locator, type Page } from './fixtures';
import {
  VALID,
  assignProjectMembersViaApi,
  clickNav,
  configureFinancials,
  createHolidayViaApi,
  createProjectViaApi,
  findMember,
  inviteAndAcceptViaApi,
  login,
  openNavSection,
  reviewVacationRequestViaApi,
  seedReserveCredit,
  setMemberCountryViaApi,
  setMembershipRole,
  setOrganizationCountryViaApi,
  signupOrg,
  submitVacationRequestViaApi,
  uniqueEmail,
} from './helpers';

/**
 * Time off spec 01 — the Vacation Calendar.
 *
 * The cases name literal September 2026 dates while the suite runs on whatever day it
 * runs, so every one of them reaches that month by stepping the window from the screen's
 * own default (the caller's current month) a number of times computed from the run's date.
 * That is zero clicks inside September 2026 and correct in any other month.
 */

const FINANCIALS = {
  monthlySalary: 3000,
  clientHourlyRate: 40,
  vacationDaysPerYear: 20,
  currency: 'USD',
  isReservePercentManual: false,
} as const;

async function signInUi(page: Page, email: string, password: string = VALID.password): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL('**/members');
}

/**
 * Invites and accepts a member, then logs the admin's jar back in: accepting an invitation
 * switches the cookie jar to the new member, and the next invitation would be a 403.
 */
async function addMember(
  request: APIRequestContext,
  adminEmail: string,
  role: 'admin' | 'manager' | 'user' | 'viewer',
  firstName: string,
  lastName: string,
): Promise<string> {
  await login(request, adminEmail);
  const email = uniqueEmail(firstName.toLowerCase());
  await inviteAndAcceptViaApi(request, email, role, { firstName, lastName });
  await login(request, adminEmail);
  return email;
}

/** Opens the calendar through the sidebar row and waits for the grid's first paint. */
async function openCalendar(page: Page): Promise<void> {
  await clickNav(page, 'Time off', 'nav-time-off-calendar');
  await expect(page.getByTestId('time-off-calendar-page')).toBeVisible();
}

/** Steps the Month window from the run's own month onto September 2026. */
async function goToSeptember2026(page: Page): Promise<void> {
  const now = new Date();
  const steps = (2026 - now.getFullYear()) * 12 + (9 - (now.getMonth() + 1));
  const control = steps >= 0 ? 'calendar-next' : 'calendar-prev';
  for (let i = 0; i < Math.abs(steps); i += 1) await page.getByTestId(control).click();
  await expect(page.getByTestId('calendar-range-label')).toHaveText('September 2026');
}

const background = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((el) => getComputedStyle(el).backgroundColor);

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `n` days after an ISO day, read off the string — never a literal date in the past. */
function addDays(iso: string, n: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/**
 * The first day the open range panel offers. The panel opens on the month the window is
 * already showing, so this is that month's first day — read off the panel rather than
 * computed, because the screen reckons today in the ACCOUNT's zone and the runner's clock
 * is not it.
 */
async function firstOfferedDay(picker: Locator): Promise<string> {
  const offered = picker.locator('[data-testid^="calendar-day-"]:not([disabled])');
  await expect(offered.first()).toBeVisible();
  const date = await offered.first().getAttribute('data-date');
  if (!date) throw new Error('expected the range panel to offer a day');
  return date;
}

/**
 * The fifteenth of the month the calendar opens on. Mid-month on purpose: the screen reads
 * today in the ACCOUNT's zone and this is read in the runner's, and only the days at a month
 * boundary can disagree about which month they are in.
 */
function midMonthDay(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-15`;
}

/** Pages the open range panel forward until it renders `date`. */
async function pageToDay(picker: Locator, date: string): Promise<void> {
  for (let step = 0; step < 6; step += 1) {
    if ((await picker.getByTestId(`calendar-day-${date}`).count()) > 0) return;
    await picker.getByTestId('calendar-next-month').click();
  }
  throw new Error(`the range panel never reached ${date}`);
}

test.describe('time-off/01 — Vacation calendar', () => {
  // TC-01-E2E-01 — the wallchart itself: the nav row, the rows, the two band treatments
  // and the weekend columns. Earns E2E: one element spanning a weekend, a CSS treatment
  // per status, and an accessible name are all out of an API test's reach.
  test('a user opens the calendar and sees a row per member with both band treatments', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const ivanEmail = await addMember(request, adminEmail, 'user', 'Ivan', 'Demchenko');
    const annaEmail = await addMember(request, adminEmail, 'user', 'Anna', 'Kovalenko');
    const pavelEmail = await addMember(request, adminEmail, 'user', 'Pavel', 'Mishin');

    const ivan = await findMember(request, org.organizationId, ivanEmail);
    const anna = await findMember(request, org.organizationId, annaEmail);
    const pavel = await findMember(request, org.organizationId, pavelEmail);
    const admin = await findMember(request, org.organizationId, adminEmail);

    await configureFinancials(request, org.organizationId, ivan.id, FINANCIALS);
    await configureFinancials(request, org.organizationId, anna.id, FINANCIALS);
    await seedReserveCredit(request, ivanEmail, 1400);
    await seedReserveCredit(request, annaEmail, 1400);

    // An approved request across a weekend, and a pending one.
    await login(request, ivanEmail);
    const approved = await submitVacationRequestViaApi(request, org.organizationId, ivan.id, {
      startDate: '2026-09-11',
      endDate: '2026-09-15',
    });
    await login(request, adminEmail);
    await reviewVacationRequestViaApi(request, org.organizationId, ivan.id, approved.id, {
      decision: 'approved',
    });
    await login(request, annaEmail);
    const pending = await submitVacationRequestViaApi(request, org.organizationId, anna.id, {
      startDate: '2026-09-23',
      endDate: '2026-09-25',
    });
    await login(request, adminEmail);

    await signInUi(page, ivanEmail);
    await openCalendar(page);
    await page.getByTestId('calendar-window-month').click();
    await goToSeptember2026(page);
    await expect(page.getByTestId('calendar-grid')).toBeVisible();
    await expect(page.getByTestId('calendar-legend')).toBeVisible();

    for (const id of [admin.id, ivan.id, anna.id, pavel.id]) {
      await expect(page.getByTestId(`calendar-member-row-${id}`)).toBeVisible();
    }

    // ONE element for the approved band, spanning all five columns 11–15 including the
    // Saturday and the Sunday inside it (REQ-01-023).
    const approvedBand = page.getByTestId(`calendar-absence-${approved.id}`);
    await expect(approvedBand).toHaveCount(1);
    expect(await approvedBand.getAttribute('style')).toContain('span 5');
    // Five calendar columns, three working days: the band runs across the weekend and its
    // count is the frozen one, which is what makes REQ-01-023 and REQ-01-024 visible at once.
    await expect(approvedBand).toHaveAttribute(
      'aria-label',
      'Vacation · approved · 2026-09-11 – 2026-09-15 · 3 working days',
    );

    const pendingBand = page.getByTestId(`calendar-absence-${pending.id}`);
    await expect(pendingBand).toHaveAttribute(
      'aria-label',
      'Vacation · pending · 2026-09-23 – 2026-09-25 · 3 working days',
    );
    // Solid against hatched: the pending band is dashed, the approved one is not.
    await expect(approvedBand).toHaveCSS('border-top-style', 'solid');
    await expect(pendingBand).toHaveCSS('border-top-style', 'dashed');

    // REQ-01-032 — the Saturday and the Sunday are shaded and the Monday after is not.
    const saturday = await background(page, 'calendar-day-header-2026-09-12');
    const sunday = await background(page, 'calendar-day-header-2026-09-13');
    const monday = await background(page, 'calendar-day-header-2026-09-14');
    expect(saturday).toBe(sunday);
    expect(saturday).not.toBe(monday);
  });

  // TC-01-E2E-02 — the Teams scope, its Unassigned entry, and what an empty selection now
  // means. Earns E2E: a picker, a banner that must not be drawn, and the rows under them.
  test('picking teams draws their union, and unticking the last one widens it to everybody', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const aEmail = await addMember(request, adminEmail, 'user', 'Anna', 'Alpha');
    const bEmail = await addMember(request, adminEmail, 'user', 'Boris', 'Beta');
    const cEmail = await addMember(request, adminEmail, 'user', 'Clara', 'Gamma');
    const dEmail = await addMember(request, adminEmail, 'user', 'Dmitry', 'Delta');

    const a = await findMember(request, org.organizationId, aEmail);
    const b = await findMember(request, org.organizationId, bEmail);
    const c = await findMember(request, org.organizationId, cEmail);
    const d = await findMember(request, org.organizationId, dEmail);

    const one = await createProjectViaApi(request, org.organizationId, 'Acme Redesign');
    const two = await createProjectViaApi(request, org.organizationId, 'Internal Tools');
    await assignProjectMembersViaApi(request, org.organizationId, one.id, [a.id, b.id]);
    await assignProjectMembersViaApi(request, org.organizationId, two.id, [b.id, c.id]);

    await signInUi(page, adminEmail);
    await openCalendar(page);
    await page.getByTestId('calendar-scope-teams').click();

    await page.getByTestId('calendar-teams-picker').click();
    await page.getByRole('option', { name: 'Acme Redesign', exact: true }).click();
    await page.getByRole('option', { name: 'Internal Tools', exact: true }).click();
    await page.getByTestId('calendar-legend').click();

    for (const id of [a.id, b.id, c.id]) {
      await expect(page.getByTestId(`calendar-member-row-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId(`calendar-member-row-${d.id}`)).toHaveCount(0);

    // Untick the second project: the member who was only on it drops out.
    await page.getByRole('button', { name: 'Remove Internal Tools' }).click();
    await expect(page.getByTestId(`calendar-member-row-${c.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`calendar-member-row-${a.id}`)).toBeVisible();

    // Untick the last one: an empty selection is no narrowing at all, so the chart widens
    // to every active member and nothing is announced (REQ-03-001, REQ-03-016; Edge case 3).
    await page.getByRole('button', { name: 'Remove Acme Redesign' }).click();
    await expect(page.getByTestId('calendar-error-banner')).toHaveCount(0);
    await expect(page.getByTestId('calendar-grid')).toBeVisible();
    for (const id of [a.id, b.id, c.id, d.id]) {
      await expect(page.getByTestId(`calendar-member-row-${id}`)).toBeVisible();
    }

    // Unassigned alone is a selection, and is answered rather than refused.
    await page.getByTestId('calendar-teams-picker').click();
    await page.getByRole('option', { name: 'Unassigned', exact: true }).click();
    await expect(page.getByTestId('calendar-error-banner')).toHaveCount(0);
    await expect(page.getByTestId(`calendar-member-row-${d.id}`)).toBeVisible();
    for (const id of [a.id, b.id, c.id]) {
      await expect(page.getByTestId(`calendar-member-row-${id}`)).toHaveCount(0);
    }
  });

  // TC-01-E2E-03 — the People scope and the window navigation. Earns E2E: the presets and
  // the back/forward steps are a rendered grid and a label, not an API answer.
  test('picking four people holds through every window preset and step', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const names = ['Anna', 'Boris', 'Clara', 'Dmitry', 'Elena', 'Fyodor', 'Galina', 'Igor'];
    const picked: string[] = [];
    for (const name of names) {
      const email = await addMember(request, adminEmail, 'user', name, 'Member');
      if (picked.length < 4) picked.push(email);
    }
    const ids = [];
    for (const email of picked) ids.push((await findMember(request, org.organizationId, email)).id);

    await signInUi(page, adminEmail);
    await openCalendar(page);
    await page.getByTestId('calendar-scope-people').click();
    await page.getByTestId('calendar-people-picker').click();
    for (const name of names.slice(0, 4)) {
      await page.getByRole('option', { name: `${name} Member`, exact: true }).click();
    }
    await page.getByTestId('calendar-legend').click();

    const rows = page.locator('[data-testid^="calendar-member-row-"]');
    await expect(rows).toHaveCount(4);
    for (const id of ids) await expect(page.getByTestId(`calendar-member-row-${id}`)).toBeVisible();

    const dayHeaders = page.locator('[data-testid^="calendar-day-header-"]');

    await page.getByTestId('calendar-window-2weeks').click();
    await expect(dayHeaders).toHaveCount(14);
    const fortnight = await page.getByTestId('calendar-range-label').textContent();

    await page.getByTestId('calendar-next').click();
    const nextFortnight = await page.getByTestId('calendar-range-label').textContent();
    expect(nextFortnight).not.toBe(fortnight);
    await expect(dayHeaders).toHaveCount(14);

    await page.getByTestId('calendar-prev').click();
    await expect(page.getByTestId('calendar-range-label')).toHaveText(fortnight!);
    await page.getByTestId('calendar-prev').click();
    expect(await page.getByTestId('calendar-range-label').textContent()).not.toBe(fortnight);

    // Today returns to the window holding the caller's today (REQ-01-049).
    await page.getByTestId('calendar-today').click();
    await expect(page.getByTestId('calendar-range-label')).toHaveText(fortnight!);

    await page.getByTestId('calendar-window-week').click();
    await expect(dayHeaders).toHaveCount(7);
    await expect(rows).toHaveCount(4);
    // The window STARTS on the caller's `firstDayOfWeek` — 'Monday' for an account that
    // has never changed it — which is the half of REQ-01-019 a day count cannot see.
    const today = new Date();
    const utcToday = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const monday = new Date(utcToday);
    monday.setUTCDate(monday.getUTCDate() - ((utcToday.getUTCDay() + 6) % 7));
    await expect(dayHeaders.first()).toHaveAttribute(
      'data-testid',
      `calendar-day-header-${monday.toISOString().slice(0, 10)}`,
    );

    // Under Month a step is a whole calendar month, first day to last — never a
    // fixed-length span straddling two of them.
    await page.getByTestId('calendar-window-month').click();
    await page.getByTestId('calendar-prev').click();
    const now = new Date();
    const previous = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
    const first = previous.toISOString().slice(0, 10);
    const lastDay = new Date(Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 0));
    const last = lastDay.toISOString().slice(0, 10);
    await expect(page.getByTestId(`calendar-day-header-${first}`)).toBeVisible();
    await expect(page.getByTestId(`calendar-day-header-${last}`)).toBeVisible();
    await expect(dayHeaders).toHaveCount(lastDay.getUTCDate());
  });

  // TC-01-E2E-11 (BUG-012) — the grid used to keep whatever window last answered while the
  // range label kept moving underneath a scope refusal. Earns E2E: which of two client
  // objects a screen draws is a rendering decision, out of an API test's reach.
  test('stepping the window moves the grid with the label, under a scope change too', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    await signInUi(page, adminEmail);
    await openCalendar(page);
    await page.getByTestId('calendar-window-week').click();

    const dayHeaders = page.locator('[data-testid^="calendar-day-header-"]');
    const label = page.getByTestId('calendar-range-label');

    const firstLabel = await label.textContent();
    const firstIds = await dayHeaders.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid')),
    );

    await page.getByTestId('calendar-next').click();
    await expect(label).not.toHaveText(firstLabel!);
    await expect(dayHeaders).toHaveCount(7);
    const nextIds = await dayHeaders.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid')),
    );
    for (const id of firstIds) expect(nextIds).not.toContain(id);

    // A scope change with nothing ticked spends the request like any other (REQ-03-005),
    // and the grid keeps step with the label through it: the week that answers is the week
    // the label names, not the one before it.
    await page.getByTestId('calendar-scope-teams').click();
    await page.getByTestId('calendar-next').click();
    await expect(page.getByTestId('calendar-error-banner')).toHaveCount(0);
    await expect(page.getByTestId('calendar-grid')).toBeVisible();
    await expect(dayHeaders).toHaveCount(7);
    const thirdIds = await dayHeaders.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid')),
    );
    for (const id of nextIds) expect(thirdIds).not.toContain(id);
  });

  // TC-01-E2E-04 — the two holiday treatments. Earns E2E: a column shaded whole against a
  // cell marked alone is a rendering decision, and the header text is only on screen.
  test('a holiday for everybody shades its column; one for some marks only their cells', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const polishEmail = await addMember(request, adminEmail, 'user', 'Piotr', 'Polski');
    const noneEmail = await addMember(request, adminEmail, 'user', 'Nina', 'Nowhere');
    const polish = await findMember(request, org.organizationId, polishEmail);
    const none = await findMember(request, org.organizationId, noneEmail);

    await createHolidayViaApi(request, org.organizationId, {
      date: '2026-09-21',
      name: 'Company Day',
      countryCode: null,
    });
    await createHolidayViaApi(request, org.organizationId, {
      date: '2026-09-16',
      name: 'Polish National Day',
      countryCode: 'PL',
    });
    await setMemberCountryViaApi(request, org.organizationId, polish.id, 'PL');

    await signInUi(page, adminEmail);
    await openCalendar(page);
    await goToSeptember2026(page);

    // The global day: a whole-column marker, and the holiday named in its header.
    await expect(page.getByTestId('calendar-day-holiday-2026-09-21')).toBeVisible();
    await expect(page.getByTestId('calendar-day-header-2026-09-21')).toContainText('Company Day');

    // The PL day: no column marker, nothing named in its header, and a per-cell marker on
    // the member it reached and on nobody else.
    await expect(page.getByTestId('calendar-day-holiday-2026-09-16')).toHaveCount(0);
    await expect(page.getByTestId('calendar-day-header-2026-09-16')).not.toContainText(
      'Polish National Day',
    );
    await expect(
      page.getByTestId(`calendar-cell-holiday-${polish.id}-2026-09-16`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`calendar-cell-holiday-${none.id}-2026-09-16`),
    ).toHaveCount(0);
  });

  // TC-01-E2E-05 — the two empty answers, which are different answers.
  test('a month with no absences draws the full grid; a scope with no rows draws the empty state', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    await addMember(request, adminEmail, 'user', 'Anna', 'Alpha');
    await addMember(request, adminEmail, 'user', 'Boris', 'Beta');
    const nobody = await createProjectViaApi(request, org.organizationId, 'Nobody Here');

    await signInUi(page, adminEmail);
    await openCalendar(page);

    await expect(page.getByTestId('calendar-grid')).toBeVisible();
    await expect(page.locator('[data-testid^="calendar-member-row-"]')).toHaveCount(3);
    await expect(page.locator('[data-testid^="calendar-absence-"]')).toHaveCount(0);
    // An empty month is the answer, not the lack of one.
    await expect(page.getByTestId('calendar-empty-state')).toHaveCount(0);

    await page.getByTestId('calendar-scope-teams').click();
    await page.getByTestId('calendar-teams-picker').click();
    await page.getByRole('option', { name: nobody.name, exact: true }).click();
    await expect(page.getByTestId('calendar-empty-state')).toBeVisible();
    // The document's literal text, like the banner assertion above it: asserting the
    // constant the screen imports would certify whatever the screen happens to say.
    await expect(page.getByTestId('calendar-empty-state')).toContainText('Nobody to show');
    await expect(page.getByTestId('calendar-grid')).toHaveCount(0);
  });

  // TC-01-E2E-06 — no dead navigation, and the route behind it.
  test('a viewer is drawn no Calendar row and the route lands on not-found', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const viewerEmail = await addMember(request, adminEmail, 'user', 'Vera', 'Viewer');
    await setMembershipRole(request, org.organizationId, viewerEmail, 'viewer');

    await signInUi(page, viewerEmail);
    await openNavSection(page, 'Time off');
    await expect(page.getByTestId('nav-time-off-calendar')).toHaveCount(0);
    // The rows the group keeps follow their own gates: a viewer holds no ViewHolidays and
    // every role has a Requests inbox.
    await expect(page.getByTestId('sidebar-requests-link')).toBeVisible();

    await page.goto(`/org/${org.organizationId}/time-off/calendar`);
    await expect(page.getByTestId('time-off-calendar-page')).toHaveCount(0);
  });

  // TC-01-E2E-07 — the organization country, set by a manager, reaching the grid.
  test('a manager sets the organization country and the grid marks that holiday', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const managerEmail = await addMember(request, adminEmail, 'manager', 'Maya', 'Manager');
    const memberEmail = await addMember(request, adminEmail, 'user', 'Nina', 'Nowhere');
    const member = await findMember(request, org.organizationId, memberEmail);
    await createHolidayViaApi(request, org.organizationId, {
      date: '2026-09-16',
      name: 'Polish National Day',
      countryCode: 'PL',
    });

    await signInUi(page, managerEmail);
    await clickNav(page, 'Time off', 'settings-tab-holidays');
    await expect(page.getByTestId('holidays-page')).toBeVisible();

    // Before the save, that member's row carries no marker on the PL day.
    await openCalendar(page);
    await goToSeptember2026(page);
    await expect(
      page.getByTestId(`calendar-cell-holiday-${member.id}-2026-09-16`),
    ).toHaveCount(0);

    await clickNav(page, 'Time off', 'settings-tab-holidays');
    await expect(page.getByTestId('holidays-page')).toBeVisible();
    await page.getByTestId('org-country-select').click();
    await page.getByRole('option', { name: 'Poland', exact: true }).click();
    await page.getByTestId('org-country-save').click();
    // The save is confirmed by the value the picker paints back from the server, and the
    // holiday list on the page is unchanged by it.
    await expect(page.getByTestId('org-country-select')).toContainText('Poland');
    await expect(page.getByTestId('holidays-table')).toBeVisible();

    await openCalendar(page);
    await goToSeptember2026(page);
    await expect(
      page.getByTestId(`calendar-cell-holiday-${member.id}-2026-09-16`),
    ).toBeVisible();

    // The second save clears it, through the picker's first option — REQ-01-034 reached
    // from the only control that writes this column, which is the half no integration case
    // can observe: a single Select is cleared only by picking another option.
    await clickNav(page, 'Time off', 'settings-tab-holidays');
    await expect(page.getByTestId('holidays-page')).toBeVisible();
    await page.getByTestId('org-country-select').click();
    await page.getByRole('option', { name: 'No country — global holidays only', exact: true }).click();
    await page.getByTestId('org-country-save').click();
    await expect(page.getByTestId('org-country-select')).toContainText(
      'No country — global holidays only',
    );

    // …and the marker goes with it.
    await openCalendar(page);
    await goToSeptember2026(page);
    await expect(
      page.getByTestId(`calendar-cell-holiday-${member.id}-2026-09-16`),
    ).toHaveCount(0);
  });

  // TC-01-E2E-08 — the member's own country, saved through the form that already carries
  // the role and the job title, and drawn for nobody who cannot save it.
  test("a manager sets a member's country in the form beside their role", async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const managerEmail = await addMember(request, adminEmail, 'manager', 'Maya', 'Manager');
    const memberEmail = await addMember(request, adminEmail, 'user', 'Nina', 'Nowhere');
    const userEmail = await addMember(request, adminEmail, 'user', 'Ulrich', 'User');
    const member = await findMember(request, org.organizationId, memberEmail);
    const user = await findMember(request, org.organizationId, userEmail);
    await createHolidayViaApi(request, org.organizationId, {
      date: '2026-09-16',
      name: 'Polish National Day',
      countryCode: 'PL',
    });
    // The organization is stated elsewhere, so what the grid draws for Nina is her own
    // country winning over it — and a member left on the organization's carries the PL day
    // only if the organization's country is PL too.
    await setOrganizationCountryViaApi(request, org.organizationId, 'US');

    await signInUi(page, managerEmail);
    await page.goto(`/org/${org.organizationId}/members/${member.id}`);
    await expect(page.getByTestId('member-detail-name')).toHaveText('Nina Nowhere');

    // A stored `null` renders as the default option.
    await expect(page.getByTestId('member-country-select')).toContainText(
      "Use the organization's country",
    );
    await page.getByTestId('member-country-select').click();
    await page.getByRole('option', { name: 'Poland', exact: true }).click();
    // One save, one toast — the button the role and the job title already use.
    await page.getByTestId('job-title-save-button').click();
    await expect(page.getByTestId('toast-member-saved')).toBeVisible();

    await openCalendar(page);
    await goToSeptember2026(page);
    await expect(
      page.getByTestId(`calendar-cell-holiday-${member.id}-2026-09-16`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`calendar-cell-holiday-${user.id}-2026-09-16`),
    ).toHaveCount(0);

    // A user reaches the tab — the page is refused to nobody — and simply does not get the
    // control; nothing is drawn read-only.
    await signInUi(page, userEmail);
    await page.goto(`/org/${org.organizationId}/members/${member.id}`);
    await expect(page.getByTestId('member-detail-name')).toHaveText('Nina Nowhere');
    await expect(page.getByTestId('member-country-select')).toHaveCount(0);
  });

  // TC-01-E2E-09 (PATCH-004) — the organization country picker is searched by typing.
  // Earns E2E: the search input, the filtered list, and the value surviving a reload.
  test('the organization country picker is searchable and the choice survives a reload', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    await signInUi(page, adminEmail);
    await clickNav(page, 'Time off', 'settings-tab-holidays');
    await expect(page.getByTestId('holidays-page')).toBeVisible();

    await page.getByTestId('org-country-select-input').fill('united k');
    const list = page.getByRole('listbox', { name: 'Organization country' });
    await expect(list).toBeVisible();
    await expect(list.getByRole('option')).toHaveCount(1);
    await list.getByRole('option').click();
    await expect(page.getByTestId('org-country-select')).toContainText('United Kingdom');

    const saved = page.waitForResponse(
      (response) =>
        response.url().includes('/settings/country') && response.request().method() === 'PUT',
    );
    await page.getByTestId('org-country-save').click();
    await saved;
    // The picker repaints from what the PUT just confirmed is stored — the reload then
    // reads it from a fresh GET rather than from anything still in memory.
    await expect(page.getByTestId('org-country-select')).toContainText('United Kingdom');

    await page.reload();
    await expect(page.getByTestId('holidays-page')).toBeVisible();
    await expect(page.getByTestId('org-country-select')).toContainText('United Kingdom');
  });

  // TC-01-E2E-10 (BUG-011) — the organization country hint hangs 20px below its control
  // (§21's message slot, out of flow) and the filter row below it used to leave only 16px,
  // so the filter's opaque control painted over the hint's descenders. Earns E2E: a rendered
  // geometry — two boxes and where their edges fall — that no API test can reach.
  test('the organization country hint clears the country filter below it', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    await signInUi(page, adminEmail);
    await clickNav(page, 'Time off', 'settings-tab-holidays');
    await expect(page.getByTestId('holidays-page')).toBeVisible();

    const hint = page.getByText(TIME_OFF_CALENDAR_MESSAGES.orgCountryHint);
    await expect(hint).toBeVisible();
    const filter = page.getByTestId('holidays-country-filter');
    await expect(filter).toBeVisible();

    const hintBox = await hint.boundingBox();
    const filterBox = await filter.boundingBox();
    if (!hintBox || !filterBox) throw new Error('expected both boxes to be measurable');

    // The hint's bottom edge sits above the filter's top edge — no pixel of the two boxes
    // overlaps.
    expect(hintBox.y + hintBox.height).toBeLessThanOrEqual(filterBox.y);
  });

  // TC-03-E2E-11 — an empty Teams or People selection draws the chart. Earns E2E: a banner
  // that must NOT be drawn and a request the screen must spend are both out of an API
  // test's reach.
  test('switching Scope to Teams or People with nothing ticked draws every member', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const annaEmail = await addMember(request, adminEmail, 'user', 'Anna', 'Alpha');
    const borisEmail = await addMember(request, adminEmail, 'user', 'Boris', 'Beta');
    const anna = await findMember(request, org.organizationId, annaEmail);
    const boris = await findMember(request, org.organizationId, borisEmail);

    await signInUi(page, adminEmail);
    await openCalendar(page);

    await page.getByTestId('calendar-scope-teams').click();
    await expect(page.getByTestId('calendar-error-banner')).toHaveCount(0);
    await expect(page.getByTestId('calendar-grid')).toBeVisible();
    // REQ-03-004 — the picker says what an empty selection does.
    await expect(page.getByTestId('calendar-teams-picker')).toContainText('All');
    for (const id of [anna.id, boris.id]) {
      await expect(page.getByTestId(`calendar-member-row-${id}`)).toBeVisible();
    }

    await page.getByTestId('calendar-scope-people').click();
    await expect(page.getByTestId('calendar-error-banner')).toHaveCount(0);
    await expect(page.getByTestId('calendar-grid')).toBeVisible();
    await expect(page.getByTestId('calendar-people-picker')).toContainText('All');
    for (const id of [anna.id, boris.id]) {
      await expect(page.getByTestId(`calendar-member-row-${id}`)).toBeVisible();
    }
  });

  // TC-03-E2E-12 — the Range window: the panel, the span bound once a start is armed, and
  // the grid the two ends fetch. Earns E2E: a day the panel must render disabled and a
  // control that exists only under one window are rendering decisions.
  test('the Range window fetches the picked span and offers no end past the bound', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    await signInUi(page, adminEmail);
    await openCalendar(page);

    // REQ-03-008 — the picker belongs to the Range window and to no other.
    await expect(page.getByTestId('calendar-range-picker')).toHaveCount(0);
    await page.getByTestId('calendar-window-range').click();
    const picker = page.getByTestId('calendar-range-picker');
    await expect(picker).toBeVisible();

    await page.getByTestId('calendar-range-picker-trigger').click();
    const start = await firstOfferedDay(picker);
    await picker.getByTestId(`calendar-day-${start}`).click();

    // REQ-03-009 — with the start armed, the last day the panel offers is 91 days after
    // it, and the day after that is rendered disabled rather than merely refused later.
    const latest = addDays(start, 91);
    const beyond = addDays(start, 92);
    await pageToDay(picker, latest);
    await expect(picker.getByTestId(`calendar-day-${latest}`)).toBeEnabled();
    await pageToDay(picker, beyond);
    await expect(picker.getByTestId(`calendar-day-${beyond}`)).toBeDisabled();

    // Escape drops the half-made range; the second pass commits a 21-day span.
    await page.keyboard.press('Escape');
    await page.getByTestId('calendar-range-picker-trigger').click();
    await picker.getByTestId(`calendar-day-${start}`).click();
    const end = addDays(start, 20);
    await picker.getByTestId(`calendar-day-${end}`).click();

    // The two ends reach the request unchanged: 21 columns, the first being the armed day.
    const dayHeaders = page.locator('[data-testid^="calendar-day-header-"]');
    await expect(dayHeaders).toHaveCount(21);
    await expect(dayHeaders.first()).toHaveAttribute(
      'data-testid',
      `calendar-day-header-${start}`,
    );
    // `start` is the first of its month, so the span is the 1st to the 21st of that month.
    await expect(page.getByTestId('calendar-range-label')).toHaveText(
      `1 – 21 ${MONTH_ABBR[Number(start.slice(5, 7)) - 1]} ${start.slice(0, 4)}`,
    );

    await page.getByTestId('calendar-window-month').click();
    await expect(page.getByTestId('calendar-range-picker')).toHaveCount(0);
  });

  // TC-03-E2E-13 — the geometry: one position for the nav controls across every window,
  // and a 92-day range that scrolls rather than compressing. Earns E2E: both are rendered
  // boxes under a real font and a real viewport.
  test('the nav controls hold one position, and a 92-day range scrolls at its column floor', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    // A holiday that reaches every member in view, in the month the screen opens on: its
    // name is the widest thing any day header holds, and a day column's width must not be
    // one header's content.
    const holiday = midMonthDay();
    await createHolidayViaApi(request, org.organizationId, {
      date: holiday,
      name: 'Company Day',
      countryCode: null,
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await signInUi(page, adminEmail);
    await openCalendar(page);

    /** A custom property the screen declares, as a number. */
    const declaredPx = async (property: string): Promise<number> => {
      const raw = await page
        .getByTestId('time-off-calendar-page')
        .evaluate((el, name) => getComputedStyle(el).getPropertyValue(name).trim(), property);
      const value = Number.parseFloat(raw);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`expected ${property} to be declared on the calendar block`);
      }
      return value;
    };
    const floor = await declaredPx('--day-col-min');
    const nameCol = await declaredPx('--name-col');

    const box = async () =>
      page.getByTestId('calendar-grid').evaluate((el) => {
        const container = el.parentElement;
        if (!container) throw new Error('expected the grid to sit inside its scroll container');
        return { scrollWidth: container.scrollWidth, clientWidth: container.clientWidth };
      });
    const headers = page.locator('[data-testid^="calendar-day-header-"]');
    const headerWidths = () =>
      headers.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));

    // Edge case 13, in the SHIPPED Month window — the one this spec did not set out to
    // change and must not. The holiday is drawn in its header; the day columns are still
    // each exactly the declared floor, and the grid is exactly the sum of those floors.
    // Sized by the header's content instead, one holiday name would set the width of all
    // thirty columns and the reader would scroll for two thirds of their own month.
    await expect(page.getByTestId(`calendar-day-holiday-${holiday}`)).toBeVisible();
    const monthDays = await headers.count();
    const monthBox = await box();
    expect(monthBox.scrollWidth).toBeGreaterThan(monthBox.clientWidth);
    for (const width of await headerWidths()) expect(width).toBeCloseTo(floor, 0);
    expect(monthBox.scrollWidth).toBeLessThanOrEqual(nameCol + monthDays * floor + 2);

    const todayControl = page.getByTestId('calendar-today');
    const xs: number[] = [];
    const record = async (): Promise<void> => {
      const box = await todayControl.boundingBox();
      if (!box) throw new Error('expected calendar-today to be measurable');
      xs.push(box.x);
    };

    await record();
    for (const window of [
      'calendar-window-week',
      'calendar-window-2weeks',
      'calendar-window-month',
      'calendar-window-range',
    ]) {
      await page.getByTestId(window).click();
      if (window === 'calendar-window-week') {
        // The other half of the same rule: seven columns fit the page, so they divide what
        // is left and nothing scrolls. The floor is a minimum, not a fixed width.
        await expect(headers).toHaveCount(7);
        const weekBox = await box();
        expect(weekBox.scrollWidth).toBeLessThanOrEqual(weekBox.clientWidth + 1);
        for (const width of await headerWidths()) expect(width).toBeGreaterThan(floor);
      }
      await record();
    }

    // The widest window this screen can be asked for: 92 days, picked on the panel.
    const picker = page.getByTestId('calendar-range-picker');
    await page.getByTestId('calendar-range-picker-trigger').click();
    const start = await firstOfferedDay(picker);
    await picker.getByTestId(`calendar-day-${start}`).click();
    const last = addDays(start, 91);
    await pageToDay(picker, last);
    await picker.getByTestId(`calendar-day-${last}`).click();

    const dayHeaders = page.locator('[data-testid^="calendar-day-header-"]');
    await expect(dayHeaders).toHaveCount(92);
    await record();

    await page.getByTestId('calendar-prev').click();
    await expect(dayHeaders).toHaveCount(92);
    await record();
    for (let i = 0; i < 2; i += 1) {
      await page.getByTestId('calendar-next').click();
      await expect(dayHeaders).toHaveCount(92);
      await record();
    }

    // REQ-03-015 — one position for `‹`, Today and `›`, across every window and every step.
    for (const x of xs) expect(x).toBe(xs[0]);

    // REQ-03-014 — no day column is narrower than the minimum the screen declares, and
    // under 92 of them none is wider either: the floor is what sizes them.
    for (const width of await headerWidths()) expect(width).toBeCloseTo(floor, 0);

    // REQ-03-018 — the grid scrolls inside its own container rather than compressing, AND
    // the member column survives that scroll. The second half is what makes the first half
    // usable: 92 columns scrolled away from their names are 92 unlabelled columns, and a
    // sticky cell is pinned to its nearest scrollport, which is not always the box that
    // moves.
    const scroll = await page.getByTestId('calendar-grid').evaluate((el) => {
      const container = el.parentElement;
      if (!container) throw new Error('expected the grid to sit inside its scroll container');
      const row = el.querySelector('[data-testid^="calendar-member-row-"]');
      const name = row && row.firstElementChild;
      if (!name) throw new Error('expected a member row with a name cell');
      const before = name.getBoundingClientRect().left;
      container.scrollLeft = 400;
      return {
        scrollWidth: container.scrollWidth,
        clientWidth: container.clientWidth,
        scrolled: container.scrollLeft,
        nameLeftBefore: before,
        nameLeftAfter: name.getBoundingClientRect().left,
        containerLeft: container.getBoundingClientRect().left,
      };
    });
    expect(scroll.scrollWidth).toBeGreaterThan(scroll.clientWidth);
    expect(scroll.scrolled).toBeGreaterThan(0);
    // Pinned: the name cell is still against the container's left edge — within the
    // container's own border — rather than carried `scrolled` pixels off it.
    expect(scroll.nameLeftAfter).toBeGreaterThanOrEqual(scroll.containerLeft - 1);
    expect(scroll.nameLeftAfter).toBeLessThanOrEqual(scroll.nameLeftBefore + 1);
  });

  // TC-01-E2E-12 (BUG-013) — the range label used to be the flex row's last, unsized child
  // in a row pinned to the header's right edge, so `‹`, Today and `›` slid sideways by the
  // width the label gained or lost on every step. Earns E2E: a rendered box position under a
  // real font, out of reach of an API test and of a unit test over the label builder.
  test('the calendar navigation controls hold still while the range label changes width', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    await signInUi(page, adminEmail);
    await openCalendar(page);
    await page.getByTestId('calendar-window-month').click();

    const today = page.getByTestId('calendar-today');
    const label = page.getByTestId('calendar-range-label');

    const firstBox = await today.boundingBox();
    if (!firstBox) throw new Error('expected calendar-today to be measurable');

    const xs = [firstBox.x];
    const labels = [await label.textContent()];
    for (let i = 0; i < 11; i += 1) {
      await page.getByTestId('calendar-next').click();
      const box = await today.boundingBox();
      if (!box) throw new Error('expected calendar-today to be measurable');
      xs.push(box.x);
      labels.push(await label.textContent());
    }

    for (const x of xs) expect(x).toBe(xs[0]);
    expect(new Set(labels).size).toBeGreaterThanOrEqual(4);
  });
});
