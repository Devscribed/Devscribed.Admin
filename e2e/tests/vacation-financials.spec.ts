import { expect, test, type APIRequestContext, type Page } from './fixtures';
import {
  VALID,
  findMember,
  inviteAndAcceptViaApi,
  login,
  signupOrg,
  uniqueEmail,
} from './helpers';

/**
 * Signs in through the UI and waits for the app shell to settle. Mirrors the helper in
 * `member-detail.spec.ts` — sign in the same way the product does, then land on the
 * members list.
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
 * `member-detail.spec.ts`. Accepting swaps `request`'s cookie jar to the new member, so
 * this logs back in as `adminEmail` afterward, leaving the jar authenticated as the admin
 * for the next call or a direct API precondition (`findMember`).
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

/** Opens the Vacation tab on the member-detail screen and waits for the panel to load. */
async function openVacationTab(page: Page): Promise<void> {
  await page.getByTestId('member-detail-tab-vacation').click();
}

test.describe('07 — Member Financial Settings: Vacation tab', () => {
  // TC-07-E2E-01
  test('admin sets up financial settings and they persist', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const alexEmail = await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');
    const alex = await findMember(request, org.organizationId, alexEmail);

    await signInUi(page, adminEmail);
    await page.goto(`/org/${org.organizationId}/members/${alex.id}`);
    await expect(page.getByTestId('member-detail-name')).toHaveText('Alex Kaminski');

    // Vacation tab is enabled for an admin on any active member.
    const vacationTab = page.getByTestId('member-detail-tab-vacation');
    await expect(vacationTab).not.toHaveAttribute('aria-disabled', 'true');
    await openVacationTab(page);

    // Empty state — no financials configured yet.
    await expect(page.getByTestId('vacation-empty-state')).toBeVisible();
    const setupBtn = page.getByTestId('vacation-setup-btn');
    await expect(setupBtn).toBeVisible();
    await setupBtn.click();

    // Fill the modal — auto-calculate is selected by default.
    const modal = page.getByTestId('vacation-financials-modal');
    await expect(modal).toBeVisible();
    await page.getByTestId('vacation-salary-input').fill('3000');
    await page.getByTestId('vacation-rate-input').fill('40');
    // Currency defaults to USD (the spec's modal mock pre-fills it), which is the value
    // this case wants — confirm it rather than re-driving the 42-item popover.
    await expect(page.getByTestId('vacation-currency-select')).toContainText('USD');
    await page.getByTestId('vacation-days-input').fill('20');

    // Auto-calc preview reflects the entered values (3000 / 40 / 20 → 3.33%).
    await expect(page.getByTestId('vacation-reserve-preview')).toContainText('3.33');

    await page.getByTestId('vacation-financials-save-btn').click();

    // Success — toast, and the tab refreshes into the configured view.
    await expect(page.getByTestId('toast-financials-saved')).toBeVisible();

    const financialsCard = page.getByTestId('vacation-financials-card');
    await expect(financialsCard).toBeVisible();
    await expect(financialsCard).toContainText('3,000.00');
    await expect(financialsCard).toContainText('40.00');
    await expect(financialsCard).toContainText('3.33');
    await expect(financialsCard).toContainText('(auto)');

    // Balance card — zeros until spec 08 adds accrual; reserve amount present for admin.
    await expect(page.getByTestId('vacation-balance-card')).toBeVisible();
    await expect(page.getByTestId('vacation-available-days')).toHaveText('0');
    await expect(page.getByTestId('vacation-reserve-amount')).toContainText('0.00');

    // Persistence — reload defaults back to the About tab; re-open Vacation and confirm
    // the financials card (not the empty state) is shown.
    await page.reload();
    await expect(page.getByTestId('member-detail-name')).toHaveText('Alex Kaminski');
    await openVacationTab(page);
    await expect(page.getByTestId('vacation-financials-card')).toBeVisible();
    await expect(page.getByTestId('vacation-financials-card')).toContainText('3,000.00');
    await expect(page.getByTestId('vacation-empty-state')).toHaveCount(0);
  });

  // TC-07-E2E-02
  test('viewer sees the Vacation tab disabled', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const admin = await findMember(request, org.organizationId, adminEmail);
    const viewerEmail = await addMember(request, adminEmail, 'viewer', 'Val', 'Viewer');

    await signInUi(page, viewerEmail);
    await page.goto(`/org/${org.organizationId}/members/${admin.id}`);
    await expect(page.getByTestId('member-detail')).toBeVisible();

    // Disabled DS tab renders as a non-interactive <span aria-disabled="true"> — same
    // assertion member-detail.spec uses for the other placeholder tabs.
    const vacationTab = page.getByTestId('member-detail-tab-vacation');
    await expect(vacationTab).toBeVisible();
    await expect(vacationTab).toHaveAttribute('aria-disabled', 'true');
  });
});
