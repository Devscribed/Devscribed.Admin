import { expect, test, type APIRequestContext, type Page } from './fixtures';
import { HOLIDAY_MESSAGES, HOLIDAY_SOURCING_MESSAGES } from '@devscribed/validation';
import {
  API,
  VALID,
  configureFinancials,
  createHolidayViaApi,
  findMember,
  inviteAndAcceptViaApi,
  login,
  openNavSection,
  seedReserveCredit,
  setMemberCountryViaApi,
  setMembershipRole,
  setOrganizationCountryViaApi,
  signupOrg,
  uniqueEmail,
} from './helpers';

/** Signs in through the UI and waits for the app shell to settle on the members list. */
async function signInUi(page: Page, email: string, password: string = VALID.password) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL('**/members');
}

/**
 * Invites+accepts a member at `role` and returns their email. Accepting swaps
 * `request`'s cookie jar to the new member, so this logs back in as the admin.
 */
async function addMember(
  request: APIRequestContext,
  adminEmail: string,
  role: string,
  firstName: string,
): Promise<string> {
  await login(request, adminEmail);
  const email = uniqueEmail(firstName.toLowerCase());
  await inviteAndAcceptViaApi(request, email, role, { firstName, lastName: 'Tester' });
  await login(request, adminEmail);
  return email;
}

/**
 * Opens Settings › Holidays through the sidebar row and waits for the page to mount.
 *
 * `Holidays` is a row inside the **Time off** group, and a closed disclosure holds none of
 * its contents in the document — so the group is opened first. `openNavSection` is
 * idempotent, which is why it is safe to call on every path into this page.
 */
async function openHolidaysPage(page: Page) {
  await openNavSection(page, 'Time off');
  await page.getByTestId('settings-tab-holidays').click();
  await page.waitForURL('**/settings/holidays**', { timeout: 30000 });
  await expect(page.getByTestId('holidays-page')).toBeVisible({ timeout: 30000 });
}

/** `YYYY-MM-DD` in local time — what the native date input and the API both take. */
function ymd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A weekday inside the current week, so it lands in the Weekly view's visible range. */
function weekdayThisWeek(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  // Monday of the current week (the app's default week start).
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  d.setDate(d.getDate() + 2); // Wednesday — never a weekend, never a month edge case.
  return d;
}

// First-compile of /org/[orgId]/settings/holidays under parallel workers can dwarf the
// default budget; give every case in this file room.
test.describe.configure({ timeout: 90_000 });

test.describe('organization/03 — Holidays', () => {
  // TC-03-E2E-01 — the add journey: modal → toast → the row under its month band.
  // Earns E2E: a multi-control modal, the month grouping, and the row landing in it.
  /**
   * TC-03-E2E-06 — opening the country select does not make the modal scroll.
   *
   * BUG-007: the select's list used to drop into the dialog's own scroll box, so the panel
   * grew a scrollbar and clipped the list at its bottom edge. The list has to float over the
   * dialog: the panel's scrollable height must not change when the list opens.
   */
  test('opening the country select does not scroll or clip the modal', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    await signInUi(page, adminEmail);
    await openHolidaysPage(page);

    await page.getByTestId('holidays-empty-primary-cta').click();
    const modal = page.getByTestId('holiday-modal');
    await expect(modal).toBeVisible();

    const scrollable = () =>
      modal.evaluate((panel) => ({ scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight }));
    const before = await scrollable();
    expect(before.scrollHeight, 'the closed dialog fits its own box').toBeLessThanOrEqual(before.clientHeight);

    await page.getByTestId('holiday-country-select').click();
    const list = page.getByRole('listbox', { name: 'Country' });
    await expect(list).toBeVisible();

    // The list floats over the dialog rather than extending it: nothing to scroll to.
    const after = await scrollable();
    expect(after.scrollHeight, 'the open list adds nothing to the dialog scroll box').toBeLessThanOrEqual(after.clientHeight);
    // And the whole list is on screen, not cut off at the panel's edge.
    const box = (await list.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.getByRole('option', { name: 'Afghanistan' })).toBeVisible();
  });

  test('admin adds a global holiday and sees it under its month band', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    await signInUi(page, adminEmail);
    await openHolidaysPage(page);

    const year = new Date().getFullYear();
    await expect(page.getByTestId(`holidays-year-tab-${year}`)).toBeVisible();

    // The empty card is a title plus a subtitle that explains the effect (§Screens).
    // The title sentence must appear ONCE: rendering the tabulated whole underneath the
    // title printed it twice, and a `toContainText` check cannot see that.
    const emptyCard = page.getByTestId('holidays-empty-state');
    await expect(emptyCard).toBeVisible();
    const cardText = (await emptyCard.innerText()).replace(/\s+/g, ' ');
    const title = `No holidays for ${year} yet.`;
    expect(cardText.split(title).length - 1, `"${title}" appears exactly once`).toBe(1);
    expect(cardText).toContain(
      'Add holidays so paid public days appear on Amounts Owed reports and the Time Tracking calendar.',
    );

    await page.getByTestId('holidays-empty-primary-cta').click();
    await expect(page.getByTestId('holiday-modal')).toBeVisible();

    const date = `${year}-05-01`;
    await page.getByTestId('holiday-date-input').fill(date);
    await page.getByTestId('holiday-name-input').fill('Labour Day');
    await page.getByTestId('holiday-hours-input').fill('8');
    // Country is left at the default — "All countries".
    await expect(page.getByTestId('holiday-country-select')).toContainText('All countries');

    await page.getByTestId('holiday-save-btn').click();
    await expect(page.getByTestId('toast-holiday-added')).toBeVisible();
    await expect(page.getByTestId('holiday-modal')).toHaveCount(0);

    // The row id embeds the server id, so look it up through the API.
    const list = await request.get(
      `${API}/api/organizations/${org.organizationId}/holidays?year=${year}`,
    );
    expect(list.ok(), 'holidays list fetch').toBeTruthy();
    const rows = (await list.json()).holidays as Array<{ id: string; name: string }>;
    const labour = rows.find((h) => h.name === 'Labour Day');
    expect(labour, 'Labour Day in the list').toBeTruthy();

    await expect(page.getByTestId(`holidays-row-${labour!.id}`)).toBeVisible();
    await expect(page.getByTestId(`holidays-row-${labour!.id}`)).toContainText('Labour Day');
    // …and under the May band, which is what the month grouping is for.
    await expect(page.getByTestId(`holidays-month-band-${year}-05`)).toBeVisible();
    await expect(page.getByTestId(`holidays-month-band-${year}-05`)).toContainText('May');
  });

  // TC-03-E2E-02 — a control that must not be drawn, plus the 403's exact wording.
  // Earns E2E: "the button is absent" is unreachable from an API test.
  test('a manager sees no delete button and the direct DELETE toasts the tabulated 403', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const year = new Date().getFullYear();
    const holiday = await createHolidayViaApi(request, org.organizationId, {
      date: `${year}-05-01`,
      name: 'Labour Day',
    });

    const managerEmail = await addMember(request, adminEmail, 'manager', 'Morgan');
    await setMembershipRole(request, org.organizationId, managerEmail, 'manager');

    await signInUi(page, managerEmail);
    await openHolidaysPage(page);

    await page.getByTestId(`holidays-row-${holiday.id}-edit-btn`).click();
    await expect(page.getByTestId('holiday-modal')).toBeVisible();
    // The whole point of the case: the control is not drawn for this role.
    await expect(page.getByTestId('holiday-delete-btn')).toHaveCount(0);

    // A hand-crafted DELETE from the page still answers 403 with the tabulated message,
    // and the page renders exactly that string rather than the generic forbidden.
    const status = await page.evaluate(
      async ([orgId, holidayId]) => {
        const response = await fetch(`/api/organizations/${orgId}/holidays/${holidayId}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        });
        const body = await response.json().catch(() => null);
        return { status: response.status, message: body?.message ?? null };
      },
      [org.organizationId, holiday.id],
    );
    expect(status.status).toBe(403);
    expect(status.message).toBe(HOLIDAY_MESSAGES.deleteForbidden);
  });

  // TC-03-E2E-03 — Alt Flow A: the 409 renders inline under Date and Save stays enabled.
  // Earns E2E: "the submit button is not disabled" is a rendered-state assertion.
  test('a duplicate shows the inline date error and leaves Save enabled', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const year = new Date().getFullYear();
    await createHolidayViaApi(request, org.organizationId, {
      date: `${year}-05-01`,
      name: 'Labour Day',
    });

    await signInUi(page, adminEmail);
    await openHolidaysPage(page);

    await page.getByTestId('holidays-add-btn').click();
    await expect(page.getByTestId('holiday-modal')).toBeVisible();
    await page.getByTestId('holiday-date-input').fill(`${year}-05-01`);
    await page.getByTestId('holiday-name-input').fill('May Day');
    await page.getByTestId('holiday-save-btn').click();

    await expect(page.getByTestId('field-error-date')).toBeVisible();
    await expect(page.getByTestId('field-error-date')).toHaveText(HOLIDAY_MESSAGES.duplicate);
    // The modal stays open and the submit button is never disabled for validation.
    await expect(page.getByTestId('holiday-modal')).toBeVisible();
    await expect(page.getByTestId('holiday-save-btn')).toBeEnabled();
  });

  // TC-03-E2E-04 — the calendar marker and the focus announcement.
  // Earns E2E: the request the page issues, a rendered marker, and a live region.
  test('a member sees the holiday marker on the weekly calendar', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const day = ymd(weekdayThisWeek());
    await createHolidayViaApi(request, org.organizationId, {
      date: day,
      name: 'Victory Day',
      paidHours: 8,
      countryCode: 'BY',
    });

    const memberEmail = await addMember(request, adminEmail, 'user', 'Alex');
    // Time off spec 01 REQ-01-026 — the holiday country is stated on the MEMBERSHIP now,
    // by an admin, and a phone country reaches no holiday at all.
    await login(request, adminEmail);
    const member = await findMember(request, org.organizationId, memberEmail);
    await setMemberCountryViaApi(request, org.organizationId, member.id, 'BY');

    await signInUi(page, memberEmail);

    // Match on pathname + scope, not a whole URL: the page also sends `year`.
    const holidayRead = page.waitForRequest(
      (req) =>
        req.url().includes(`/api/organizations/${org.organizationId}/holidays`) &&
        req.url().includes('scope=mine'),
    );
    await page.getByTestId('nav-time-tracking').click();
    await holidayRead;

    await page.getByTestId('tt-view-weekly').click();
    const marker = page.getByTestId(`time-cell-${day}-holiday-marker`);
    await expect(marker).toBeVisible();
    await expect(marker).toHaveAttribute(
      'title',
      HOLIDAY_MESSAGES.calendarTooltip('Victory Day'),
    );

    // §Accessibility — the polite live region announces on focus. Located by role,
    // not a test id: the spec's roster names no id for the region, and `role="status"`
    // is what a screen reader finds. The page's only other status node is a toast, and
    // none is on screen here — if one ever were, this resolves to two and fails loudly.
    await marker.focus();
    await expect(page.getByRole('status')).toHaveText(
      'Holiday: Victory Day. Paid hours: 8.',
    );
  });

  // TC-03-E2E-05 — the non-blocking vacation hint (requirement 13).
  // Earns E2E: the hint appears on a form the member fills, and does not block submit.
  test('the vacation request form hints at a holiday inside the range', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const memberEmail = await addMember(request, adminEmail, 'user', 'Alex');

    const members = await request.get(`${API}/api/organizations/${org.organizationId}/members`);
    const member = ((await members.json()).members as Array<{ id: string; email: string }>).find(
      (m) => m.email === memberEmail,
    )!;

    await request.put(
      `${API}/api/organizations/${org.organizationId}/members/${member.id}/vacation/financials`,
      {
        data: {
          monthlySalary: 3000,
          clientHourlyRate: 40,
          vacationDaysPerYear: 20,
          currency: 'USD',
          isReservePercentManual: false,
        },
      },
    );

    // Fund the reserve — the Request vacation button is disabled at a zero balance.
    await seedReserveCredit(request, memberEmail, 1400);

    // A Monday→Friday range at least a week out, with a global holiday on its Wednesday.
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    start.setDate(start.getDate() + 7);
    while (start.getDay() !== 1) start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 4);
    const wednesday = new Date(start);
    wednesday.setDate(wednesday.getDate() + 2);

    await createHolidayViaApi(request, org.organizationId, {
      date: ymd(wednesday),
      name: 'Mid-week Holiday',
      countryCode: null,
    });

    await signInUi(page, memberEmail);
    await page.goto(`/org/${org.organizationId}/members/${member.id}`);
    await page.getByTestId('member-detail-tab-vacation').click();
    await page.getByTestId('vacation-request-btn').click();
    await expect(page.getByTestId('vacation-request-modal')).toBeVisible();

    await page.getByTestId('vacation-start-date-input').fill(ymd(start));
    await page.getByTestId('vacation-end-date-input').fill(ymd(end));

    await expect(page.getByTestId('vacation-request-holiday-hint')).toBeVisible();
    await expect(page.getByTestId('vacation-request-holiday-hint')).toHaveText(
      HOLIDAY_MESSAGES.vacationHint(1),
    );
    // Requirement 12 — the working-days preview is untouched and submit is live.
    await expect(page.getByTestId('vacation-working-days-preview')).toContainText('5');
    await expect(page.getByTestId('vacation-request-submit-btn')).toBeEnabled();
  });

  // TC-03-E2E-10 (PATCH-004) — the Add holiday form's country field is searched by typing.
  // Earns E2E: focus/blur through the search input, the list filtering live, and the
  // control's own "No options" row, none of which an API test can see.
  test('the holiday form country field is searchable', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    await signInUi(page, adminEmail);
    await openHolidaysPage(page);

    await page.getByTestId('holidays-add-btn').click();
    await expect(page.getByTestId('holiday-modal')).toBeVisible();

    await page.getByTestId('holiday-country-select-input').fill('pola');
    const list = page.getByRole('listbox', { name: 'Country' });
    await expect(list).toBeVisible();
    await expect(list.getByRole('option')).toHaveCount(1);
    await expect(list.getByRole('option')).toHaveText('Poland');

    await list.getByRole('option').click();
    await expect(page.getByTestId('holiday-country-select-input')).toHaveValue('');
    await expect(page.getByTestId('holiday-country-select')).toContainText('Poland');

    await page.getByTestId('holiday-country-select-input').fill('zzzz');
    await expect(list).toBeVisible();
    await expect(list).toContainText('No options');
    await expect(page.getByTestId('holiday-country-select')).toContainText('Poland');
  });
});

/**
 * Time off spec 02 — holiday sourcing.
 *
 * The API these run against uses the `fake` holiday driver (the default outside
 * production), whose country table is the one §External Contracts measured: `PL` answers
 * 14 nationwide entries, `US` 11, `IN` refuses the connection, and a country it does not
 * name answers nothing. Nothing here reaches the network.
 */
test.describe('time-off/02 — Holiday sourcing', () => {
  const PL_DAYS = 14;
  const US_DAYS = 11;

  /** States a member's holiday country by email. Requires an admin cookie jar. */
  async function stateCountry(
    request: APIRequestContext,
    organizationId: string,
    email: string,
    countryCode: string,
  ): Promise<string> {
    const member = await findMember(request, organizationId, email);
    await setMemberCountryViaApi(request, organizationId, member.id, countryCode);
    return member.id;
  }

  // TC-02-E2E-01 — the screen syncs without being asked (REQ-02-012).
  // Earns E2E: the assertion is that a page issues a request nobody asked it to and then
  // repaints, which is not a call an API test can make.
  test('opening a year with unsourced countries fills the list without anybody clicking', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const polish = await addMember(request, adminEmail, 'user', 'Piotr');
    const american = await addMember(request, adminEmail, 'user', 'Sam');
    await stateCountry(request, org.organizationId, polish, 'PL');
    await stateCountry(request, org.organizationId, american, 'US');

    // The provider answers from memory, so the in-flight window would otherwise be a few
    // milliseconds wide. Delaying the response makes the window real rather than lucky —
    // the claim under test is that the line is up **while** the sync is, and a race here
    // would pass by accident on a fast machine and fail on a slow one.
    await page.route('**/holidays/sync', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });

    await signInUi(page, adminEmail);
    await openHolidaysPage(page);
    const year = new Date().getFullYear();
    await page.getByTestId(`holidays-year-tab-${year}`).click();

    const status = page.getByTestId('holiday-sourcing-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText(HOLIDAY_SOURCING_MESSAGES.syncing);
    await expect(status).toHaveCount(0, { timeout: 60_000 });

    // Nobody clicked a control to make this happen.
    await expect(page.getByTestId('holidays-table')).toBeVisible();
    await expect(page.getByTestId('holidays-empty-state')).toHaveCount(0);

    const list = await request.get(
      `${API}/api/organizations/${org.organizationId}/holidays?year=${year}`,
    );
    expect(list.ok(), 'holidays list fetch').toBeTruthy();
    const rows = (await list.json()).holidays as Array<{
      id: string;
      countryCode: string | null;
      source: string;
    }>;
    expect(rows.filter((r) => r.countryCode === 'PL')).toHaveLength(PL_DAYS);
    expect(rows.filter((r) => r.countryCode === 'US')).toHaveLength(US_DAYS);

    const first = rows[0];
    await expect(page.getByTestId(`holidays-row-${first.id}`)).toBeVisible();
    await expect(page.getByTestId(`holidays-row-${first.id}-source`)).toHaveText('imported');

    // Switching to the next year tab repeats it for that year.
    await page.getByTestId(`holidays-year-tab-${year + 1}`).click();
    await expect(page.getByTestId('holiday-sourcing-status')).toBeVisible();
    await expect(page.getByTestId('holiday-sourcing-status')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByTestId('holidays-table')).toBeVisible();
  });

  // TC-02-E2E-02 — the include-organization-country checkbox (REQ-02-002).
  // Earns E2E: the setting is stored rather than in-page state, which only a reload shows.
  test('the checkbox changes the country set, and the change survives a reload', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    // The organization states a country no member resolves to: every member states one of
    // their own, so only the checkbox can put GB in the set.
    await setOrganizationCountryViaApi(request, org.organizationId, 'GB');
    await stateCountry(request, org.organizationId, adminEmail, 'PL');

    await signInUi(page, adminEmail);
    await openHolidaysPage(page);

    const orgCountryRow = page.getByTestId('holiday-summary-country-GB');
    await expect(orgCountryRow).toBeVisible();

    const checkbox = page.getByTestId('holiday-sourcing-include-org-country');
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(orgCountryRow).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('holidays-page')).toBeVisible();
    // Stored, not in-page state.
    await expect(page.getByTestId('holiday-sourcing-include-org-country')).not.toBeChecked();
    await expect(page.getByTestId('holiday-summary-country-GB')).toHaveCount(0);

    await page.getByTestId('holiday-sourcing-include-org-country').check();
    await expect(page.getByTestId('holiday-summary-country-GB')).toBeVisible();

    await page.getByTestId('holiday-sourcing-refresh-btn').click();
    await expect(page.getByTestId('holiday-sourcing-status')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByTestId('holiday-summary-country-GB')).toBeVisible();
  });

  // TC-02-E2E-03 — the screen names the countries it could not source (REQ-02-009).
  // Earns E2E: a banner that must be drawn and an error banner that must not be.
  test('the screen names the countries it could not source, and does not call it an error', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const indian = await addMember(request, adminEmail, 'user', 'Ishaan');
    await stateCountry(request, org.organizationId, adminEmail, 'PL');
    // The provider does not cover India — one of the two codes the live probe recorded as
    // missing, and the reason the warning exists.
    await stateCountry(request, org.organizationId, indian, 'IN');

    await signInUi(page, adminEmail);
    await openHolidaysPage(page);

    await expect(page.getByTestId('holiday-sourcing-uncovered')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('holiday-sourcing-uncovered-IN')).toContainText(
      HOLIDAY_SOURCING_MESSAGES.countryNotCovered,
    );

    // The country that answered is in the table, and the screen is not in an error state.
    await expect(page.getByTestId('holidays-table')).toBeVisible();
    await expect(page.getByTestId('holidays-error-banner')).toHaveCount(0);
    await expect(page.getByTestId('holiday-sourcing-uncovered-PL')).toHaveCount(0);
  });

  // TC-02-E2E-04 — the summary is on the screen and readable (REQ-02-013/14/15).
  // Earns E2E only for the ordering and presence of the block; the arithmetic is asserted
  // at integration, where it costs a fraction of a second instead of eight.
  test('the per-country and per-person figures sit above the list', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const polish = await addMember(request, adminEmail, 'user', 'Piotr');
    const american = await addMember(request, adminEmail, 'user', 'Sam');
    const adminId = await stateCountry(request, org.organizationId, adminEmail, 'PL');
    const polishId = await stateCountry(request, org.organizationId, polish, 'PL');
    const americanId = await stateCountry(request, org.organizationId, american, 'US');

    const RATE = 40;
    for (const memberId of [adminId, polishId, americanId]) {
      await configureFinancials(request, org.organizationId, memberId, {
        monthlySalary: 3000,
        clientHourlyRate: RATE,
        vacationDaysPerYear: 20,
        currency: 'USD',
        isReservePercentManual: false,
      });
    }

    await signInUi(page, adminEmail);
    await openHolidaysPage(page);

    await expect(page.getByTestId('holiday-summary-country-PL-days')).toHaveText(String(PL_DAYS), {
      timeout: 60_000,
    });
    await expect(page.getByTestId('holiday-summary-country-US-days')).toHaveText(String(US_DAYS));

    await expect(page.getByTestId(`holiday-summary-member-${adminId}-days`)).toHaveText(
      String(PL_DAYS),
    );
    await expect(page.getByTestId(`holiday-summary-member-${americanId}-days`)).toHaveText(
      String(US_DAYS),
    );
    await expect(page.getByTestId(`holiday-summary-member-${polishId}-amount`)).toHaveText(
      `${(PL_DAYS * 8 * RATE).toFixed(2)} USD`,
    );
    await expect(page.getByTestId('holiday-summary-total-USD')).toHaveText(
      `${((PL_DAYS * 2 + US_DAYS) * 8 * RATE).toFixed(2)} USD`,
    );

    // The summary is the answer and the list is the evidence for it, so it sits ABOVE.
    const order = await page.evaluate(() => {
      const summary = document.querySelector('[data-testid="holiday-summary"]');
      const table = document.querySelector('[data-testid="holidays-table"]');
      if (!summary || !table) return null;
      return summary.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING
        ? 'above'
        : 'below';
    });
    expect(order).toBe('above');
  });
});
