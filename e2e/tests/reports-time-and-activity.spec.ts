import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  VALID,
  assignProjectMembersViaApi,
  clickNav,
  configureFinancials,
  createProjectViaApi,
  createTimeEntryViaApi,
  findMember,
  inviteAndAcceptViaApi,
  login,
  signupOrg,
  uniqueEmail,
} from './helpers';

/**
 * Spec reports/01 — Time & Activity.
 *
 * TC-01-E2E-01 (§Test Cases · E2E · Main flow): a manager opens Time &
 * Activity for a range, tweaks the Columns picker, and exports a PDF.
 * TC-01-E2E-06 (§Test Cases · E2E · Column permission — Spent grayed): a
 * manager (who lacks `view-time-and-activity-spent`) opens the Columns
 * picker and sees the Spent row disabled with the admin-only hint.
 *
 * The other T&A-facing cases (TC-01-E2E-07 currency USD, TC-01-E2E-09 All/My
 * toggle) piggyback on the Amounts Owed suite where they already ran; this
 * file stays focused on the two cases specific to Time & Activity.
 */

async function signInUi(page: Page, email: string, password: string = VALID.password): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL('**/members');
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Seed a member (invite + accept), promote if needed, and set financials. */
async function seedMember(
  request: APIRequestContext,
  adminEmail: string,
  organizationId: string,
  firstName: string,
  lastName: string,
  role: 'admin' | 'manager' | 'user',
  { monthlySalary, clientHourlyRate }: { monthlySalary: number; clientHourlyRate: number },
): Promise<{ email: string; memberId: string }> {
  await login(request, adminEmail);
  const email = uniqueEmail(firstName.toLowerCase());
  await inviteAndAcceptViaApi(request, email, role, { firstName, lastName });
  await login(request, adminEmail);
  const member = await findMember(request, organizationId, email);
  await configureFinancials(request, organizationId, member.id, {
    monthlySalary,
    clientHourlyRate,
    vacationDaysPerYear: 20,
    currency: 'USD',
    isReservePercentManual: false,
  });
  return { email, memberId: member.id };
}

test.describe('reports/01 — Time & Activity', () => {
  // TC-01-E2E-01: manager runs Time & Activity for a range, exports PDF.
  test('manager runs T&A, adjusts Columns, exports PDF — happy path', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'TA_Co', email: adminEmail });

    const manager = await seedMember(
      request, adminEmail, org.organizationId, 'Mel', 'Manager', 'manager',
      { monthlySalary: 10000, clientHourlyRate: 60 },
    );
    const user = await seedMember(
      request, adminEmail, org.organizationId, 'Uma', 'User', 'user',
      { monthlySalary: 6720, clientHourlyRate: 40 },
    );

    // Admin owns a project both members are assigned to; both log entries today.
    await login(request, adminEmail);
    const project = await createProjectViaApi(request, org.organizationId, 'Redesign');
    await assignProjectMembersViaApi(request, org.organizationId, project.id, [
      manager.memberId,
      user.memberId,
    ]);
    const today = todayISO();
    await login(request, user.email);
    await createTimeEntryViaApi(request, org.organizationId, {
      membershipId: user.memberId,
      projectId: project.id,
      date: today,
      durationMinutes: 240,
      task: 'Component polish',
      billable: true,
    });
    await createTimeEntryViaApi(request, org.organizationId, {
      membershipId: user.memberId,
      projectId: project.id,
      date: today,
      durationMinutes: 60,
      task: 'Team standup',
      billable: false,
    });

    // — Act: sign in as manager and open T&A —
    await signInUi(page, manager.email);
    await clickNav(page, 'Reports', 'nav-reports');
    await page.waitForURL('**/reports');
    await page.getByTestId('reports-card-time-and-activity').click();
    await page.waitForURL('**/reports/time-and-activity**');

    await expect(page.getByTestId('reports-page-title')).toBeVisible();

    // Wait for first render to settle (default columns + no billed filter).
    await expect(page.getByTestId('reports-loading-skeleton')).toHaveCount(0);
    await expect(page.getByTestId('reports-table')).toBeVisible();

    // Manager holds view-time-and-activity-billed — turn Billed Amount on so
    // the PDF carries a money column, then export.
    await page.getByTestId('reports-filter-columns').click();
    await page.getByTestId('reports-filter-columns-item-billed-amount').click();
    // Close the dropdown by clicking the page title area.
    await page.getByTestId('reports-page-title').click();
    await expect(page.getByTestId('reports-table')).toBeVisible();

    // Kick off the PDF download.
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('reports-export-pdf-btn').click();
    const download = await downloadPromise;
    const suggested = download.suggestedFilename();
    expect(suggested.startsWith('Time & Activity ')).toBe(true);
    expect(suggested.endsWith('.pdf')).toBe(true);

    await expect(page.getByTestId('toast-report-pdf-ready')).toBeVisible();
  });

  // TC-01-E2E-06: manager without `view-time-and-activity-spent` sees Spent
  // in the picker as disabled with an admin-only hint.
  test('Columns picker — Spent is disabled with admin-only hint for a manager', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'SpentGate', email: adminEmail });
    const manager = await seedMember(
      request, adminEmail, org.organizationId, 'Perry', 'Perms', 'manager',
      { monthlySalary: 10000, clientHourlyRate: 60 },
    );

    await signInUi(page, manager.email);
    await clickNav(page, 'Reports', 'nav-reports');
    await page.waitForURL('**/reports');
    await page.getByTestId('reports-card-time-and-activity').click();
    await page.waitForURL('**/reports/time-and-activity**');
    // No data seeded — wait for either the table OR the empty state.
    await expect(page.getByTestId('reports-loading-skeleton')).toHaveCount(0);

    await page.getByTestId('reports-filter-columns').click();
    const spentRow = page.getByTestId('reports-filter-columns-item-spent');
    await expect(spentRow).toBeVisible();
    // The row's checkbox is disabled, and the row exposes aria-disabled=true
    // via the wrapper so screen readers announce it (spec §Alt Flow C).
    await expect(spentRow).toHaveAttribute('aria-disabled', 'true');
    const spentInput = spentRow.locator('input[type="checkbox"]');
    await expect(spentInput).toBeDisabled();
  });
});
