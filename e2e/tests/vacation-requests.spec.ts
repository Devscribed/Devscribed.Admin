import { expect, test, type APIRequestContext, type Page } from './fixtures';
import {
  VALID,
  configureFinancials,
  findMember,
  inviteAndAcceptViaApi,
  login,
  seedReserveCredit,
  signupOrg,
  submitVacationRequestViaApi,
  uniqueEmail,
} from './helpers';

/**
 * Signs in through the UI and waits for the app shell to settle — mirrors the helper in
 * `vacation-accrual.spec.ts` / `vacation-financials.spec.ts` (sign in the way the product
 * does, then land on the members list).
 */
async function signInUi(page: Page, email: string, password: string = VALID.password): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL('**/members');
}

/**
 * Invites+accepts a new member at `role` and returns their email — copied from
 * `vacation-financials.spec.ts`. Accepting swaps `request`'s cookie jar to the new member,
 * so this logs back in as `adminEmail` afterward, leaving the jar authenticated as the
 * admin for the next call or a direct API precondition.
 */
async function addMember(
  request: APIRequestContext,
  adminEmail: string,
  role: string,
  firstName: string,
  lastName: string,
): Promise<string> {
  await login(request, adminEmail);
  const email = uniqueEmail(firstName.toLowerCase());
  await inviteAndAcceptViaApi(request, email, role, { firstName, lastName });
  await login(request, adminEmail);
  return email;
}

/** Opens the Vacation tab on the member-detail screen. */
async function openVacationTab(page: Page): Promise<void> {
  await page.getByTestId('member-detail-tab-vacation').click();
}

/** Full-month financials matching the accrual specs: salary 3000, rate 40, 20 days, auto. */
const FINANCIALS = {
  monthlySalary: 3000,
  clientHourlyRate: 40,
  vacationDaysPerYear: 20,
  currency: 'USD',
  isReservePercentManual: false,
} as const;

/** Local-date 'YYYY-MM-DD' — the format both the native date input and the API expect. */
function ymd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * A range of exactly `workingDays` weekdays starting on a near-future Monday (≥7 days out),
 * kept within the current calendar year. The "start date must be today or later" rule is
 * enforced server-side, so the machine's 2026 date forces genuinely future dates; anchoring
 * on a Monday and counting only weekdays keeps the working-day count exact (a 5-day range is
 * Mon→Fri). Used both to fill the native date inputs and as API preconditions.
 */
function futureWorkingRange(workingDays: number): { startDate: string; endDate: string } {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() + 7);
  // Advance to the next Monday so the range never straddles a weekend at its start.
  while (start.getDay() !== 1) start.setDate(start.getDate() + 1);

  const end = new Date(start);
  let counted = 1; // Monday itself is the first working day.
  while (counted < workingDays) {
    end.setDate(end.getDate() + 1);
    const dow = end.getDay();
    if (dow !== 0 && dow !== 6) counted += 1;
  }
  return { startDate: ymd(start), endDate: ymd(end) };
}

test.describe('09 — Vacation Requests', () => {
  // TC-09-E2E-01 — a user submits a request from their own Vacation tab.
  test('user submits a vacation request', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const alexEmail = await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');
    const alex = await findMember(request, org.organizationId, alexEmail);

    await configureFinancials(request, org.organizationId, alex.id, FINANCIALS);
    await seedReserveCredit(request, alexEmail, 1400); // → 10 available days

    await signInUi(page, alexEmail);
    await page.goto(`/org/${org.organizationId}/members/${alex.id}`);
    await expect(page.getByTestId('member-detail-name')).toHaveText('Alex Kaminski');
    await openVacationTab(page);

    // Balance card shows 10 available; the user-own view carries no financials card.
    await expect(page.getByTestId('vacation-balance-card')).toBeVisible();
    await expect(page.getByTestId('vacation-available-days')).toHaveText('10');
    await expect(page.getByTestId('vacation-financials-card')).toHaveCount(0);

    // Open the request modal and fill a 5-working-day range.
    await page.getByTestId('vacation-request-btn').click();
    await expect(page.getByTestId('vacation-request-modal')).toBeVisible();
    const range = futureWorkingRange(5);
    await page.getByTestId('vacation-start-date-input').fill(range.startDate);
    await page.getByTestId('vacation-end-date-input').fill(range.endDate);
    await expect(page.getByTestId('vacation-working-days-preview')).toContainText('5');

    await page.getByTestId('vacation-request-submit-btn').click();

    // Success — toast, a pending request row appears, available days drop to 5 (pending hold).
    await expect(page.getByTestId('toast-request-submitted')).toBeVisible();
    const statusBadge = page.locator('[data-testid^="vacation-request-status-"]');
    await expect(statusBadge).toHaveText('Pending');
    await expect(page.locator('[data-testid^="vacation-request-row-"]')).toHaveCount(1);
    await expect(page.getByTestId('vacation-available-days')).toHaveText('5');
  });

  // TC-09-E2E-02 — a manager approves a member's pending request from the Vacation tab.
  test('manager approves a pending request', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const managerEmail = await addMember(request, adminEmail, 'manager', 'Morgan', 'Lee');
    const alexEmail = await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');
    const alex = await findMember(request, org.organizationId, alexEmail);

    await configureFinancials(request, org.organizationId, alex.id, FINANCIALS);
    await seedReserveCredit(request, alexEmail, 1400); // → 10 available days

    // Submit a pending request as Alex (jar swaps to Alex), then restore the admin jar.
    await login(request, alexEmail);
    const range = futureWorkingRange(5);
    const created = await submitVacationRequestViaApi(request, org.organizationId, alex.id, range);
    await login(request, adminEmail);

    await signInUi(page, managerEmail);
    await page.goto(`/org/${org.organizationId}/members/${alex.id}`);
    await expect(page.getByTestId('member-detail-name')).toHaveText('Alex Kaminski');
    await openVacationTab(page);

    // Reviewer sees Approve + Reject on the pending row.
    await expect(page.getByTestId(`vacation-request-approve-${created.id}`)).toBeVisible();
    await expect(page.getByTestId(`vacation-request-reject-${created.id}`)).toBeVisible();

    await page.getByTestId(`vacation-request-approve-${created.id}`).click();

    await expect(page.getByTestId('toast-request-approved')).toBeVisible();
    await expect(page.getByTestId(`vacation-request-status-${created.id}`)).toHaveText('Approved');
    await expect(page.getByTestId('vacation-used-days')).toHaveText('5');
    await expect(page.getByTestId('vacation-pending-days')).toHaveText('0');
  });
});
