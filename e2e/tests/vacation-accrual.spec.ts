import { expect, test, type APIRequestContext, type Page } from './fixtures';
import {
  VALID,
  backdateFinancials,
  configureFinancials,
  findMember,
  inviteAndAcceptViaApi,
  login,
  runAccrual,
  signupOrg,
  uniqueEmail,
} from './helpers';

/**
 * Signs in through the UI and waits for the app shell to settle — copied from
 * `vacation-financials.spec.ts` so the accrual E2E signs in the same way the product does.
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
 * admin for the next call or a direct API precondition (`findMember`, `configureFinancials`).
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

/**
 * Full-month financials for the accrual scenarios: salary 3000, rate 40, 20 days, auto
 * reserve percent (3.33%). One backdated full month accrues $230.88.
 */
const FINANCIALS = {
  monthlySalary: 3000,
  clientHourlyRate: 40,
  vacationDaysPerYear: 20,
  currency: 'USD',
  isReservePercentManual: false,
} as const;

test.describe('08 — Vacation Reserve & Auto-Accrual', () => {
  // TC-08-E2E-01 & TC-08-E2E-02 — admin triggers accrual and sees the credits accumulate.
  test('admin triggers accrual and sees the auto-generated credits', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const alexEmail = await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');
    const alex = await findMember(request, org.organizationId, alexEmail);

    // Configure Alex's financials, then backdate the snapshot to before June so June and
    // July 2025 both yield a full (non-prorated) $230.88 credit.
    await configureFinancials(request, org.organizationId, alex.id, FINANCIALS);
    await backdateFinancials(request, alexEmail, '2025-05-01');

    // Run accrual for the first (safely past) billing month.
    const june = await runAccrual(request, 6, 2025);
    expect(june).toMatchObject({
      processed: 1,
      creditsCreated: 1,
      skipped: 0,
      billingPeriod: 'June 2025',
    });

    await signInUi(page, adminEmail);
    await page.goto(`/org/${org.organizationId}/members/${alex.id}`);
    await expect(page.getByTestId('member-detail-name')).toHaveText('Alex Kaminski');
    await openVacationTab(page);

    // One credit row: "June 2025 accrual", $230.88, "(auto)", created by "System".
    const table = page.getByTestId('vacation-transactions-table');
    await expect(table).toBeVisible();
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(table).toContainText('June 2025 accrual');
    await expect(table).toContainText('230.88');
    await expect(table).toContainText('(auto)');
    await expect(table).toContainText('System');

    // Balance card — one full month → 1 available day, reserve $230.88.
    await expect(page.getByTestId('vacation-balance-card')).toBeVisible();
    await expect(page.getByTestId('vacation-available-days')).toHaveText('1');
    await expect(page.getByTestId('vacation-reserve-amount')).toContainText('230.88');

    // Run a second month of accrual (API), reload, re-open Vacation (reload defaults to
    // the About tab), and confirm the ledger and balance grew.
    const july = await runAccrual(request, 7, 2025);
    expect(july.creditsCreated).toBe(1);

    await page.reload();
    await expect(page.getByTestId('member-detail-name')).toHaveText('Alex Kaminski');
    await openVacationTab(page);

    const rowsAfter = page.getByTestId('vacation-transactions-table').locator('tbody tr');
    await expect(rowsAfter).toHaveCount(2);
    await expect(page.getByTestId('vacation-transactions-table')).toContainText('July 2025 accrual');
    await expect(page.getByTestId('vacation-transactions-table')).toContainText('June 2025 accrual');
    await expect(page.getByTestId('vacation-available-days')).toHaveText('3');
    await expect(page.getByTestId('vacation-reserve-amount')).toContainText('461.76');
  });
});
