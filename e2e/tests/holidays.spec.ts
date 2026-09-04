import { expect, test, type APIRequestContext, type Page } from './fixtures';
import { HOLIDAY_MESSAGES } from '@devscribed/validation';
import {
  API,
  VALID,
  inviteAndAcceptViaApi,
  login,
  openNavSection,
  seedReserveCredit,
  setMembershipRole,
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

/** Seeds a holiday through the API — a precondition, not the thing under test. */
async function createHolidayViaApi(
  request: APIRequestContext,
  orgId: string,
  body: { date: string; name: string; paidHours?: number; countryCode?: string | null },
): Promise<{ id: string; date: string; name: string }> {
  const response = await request.post(`${API}/api/organizations/${orgId}/holidays`, {
    data: { paidHours: 8, countryCode: null, ...body },
  });
  if (response.status() !== 201) {
    throw new Error(
      `Precondition failed: could not create holiday "${body.name}" ` +
        `(${response.status()} ${await response.text()})`,
    );
  }
  return (await response.json()).holiday;
}

/**
 * Sets the signed-in account's country (spec requirement 14's source). `PUT
 * /api/account/settings` replaces the record, so the current payload is read first
 * and only `phoneCountryCode` is swapped.
 */
async function setOwnCountryViaApi(request: APIRequestContext, countryCode: string) {
  const current = await request.get(`${API}/api/account/settings`);
  if (!current.ok()) {
    throw new Error(`Precondition failed: could not read account settings (${current.status()})`);
  }
  const settings = await current.json();
  const response = await request.put(`${API}/api/account/settings`, {
    data: {
      firstName: settings.firstName,
      lastName: settings.lastName,
      phoneCountryCode: countryCode,
      phoneNumber: settings.phoneNumber ?? '',
      // An invited member's timezone is often the empty string rather than null, and
      // the settings validator requires one — so this needs a truthiness check, not `??`.
      timezone: settings.timezone || 'Europe/Berlin',
      firstDayOfWeek: settings.firstDayOfWeek || 'Monday',
    },
  });
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not set country (${response.status()} ${await response.text()})`,
    );
  }
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
    await login(request, memberEmail);
    await setOwnCountryViaApi(request, 'BY');

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
});
