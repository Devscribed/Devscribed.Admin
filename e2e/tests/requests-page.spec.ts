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
 * `vacation-requests.spec.ts`: sign in the way the product does, then land on the members
 * list. The shell mount also fires the sidebar's pending-count fetch (spec 10 badge).
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
 * `vacation-requests.spec.ts`. Accepting swaps `request`'s cookie jar to the new member,
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
 * Mon→Fri). Replicated from `vacation-requests.spec.ts` so this file stands alone. Ranges for
 * different members may share the same dates — the overlap rule only bites within one member.
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

/**
 * Clicks the sidebar Requests row and lands on the page. The row's client-nav `onClick`
 * can be missed if the click lands exactly as the badge re-renders (the pending count
 * arrives from a separate fetch after mount), so the click+URL wait is retried until it
 * takes — deterministic regardless of when the count lands.
 */
async function openRequestsPage(page: Page): Promise<void> {
  await expect(async () => {
    await page.getByTestId('sidebar-requests-link').click();
    await page.waitForURL('**/requests', { timeout: 2000 });
  }).toPass({ timeout: 15000 });
  await expect(page.getByTestId('requests-page')).toBeVisible();
}

test.describe('10 — Organization Requests Page', () => {
  // TC-10-E2E-01 — a manager reviews requests from the org-wide Requests page.
  //
  // Regression guard for the in-place-update fix: approve/reject patch the acted-on card's
  // status in local state (only the sidebar badge is refetched), so the card STAYS in view
  // with its new status even though it no longer matches the active "Pending" filter. The
  // actions therefore run on the DEFAULT Pending view — no filter switch.
  test('manager reviews requests from the Requests page', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const managerEmail = await addMember(request, adminEmail, 'manager', 'Morgan', 'Lee');
    const alexEmail = await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');
    const janeEmail = await addMember(request, adminEmail, 'user', 'Jane', 'Smith');
    const alex = await findMember(request, org.organizationId, alexEmail);
    const jane = await findMember(request, org.organizationId, janeEmail);

    await configureFinancials(request, org.organizationId, alex.id, FINANCIALS);
    await configureFinancials(request, org.organizationId, jane.id, FINANCIALS);
    await seedReserveCredit(request, alexEmail, 1400); // → 10 available days
    await seedReserveCredit(request, janeEmail, 1400);

    // R1: Alex, 5 working days. R2: Jane, 3 working days. Submit as each owner, then restore
    // the admin jar. (Different members, so the shared range never trips the overlap rule.)
    await login(request, alexEmail);
    const r1 = await submitVacationRequestViaApi(request, org.organizationId, alex.id, futureWorkingRange(5));
    await login(request, janeEmail);
    const r2 = await submitVacationRequestViaApi(request, org.organizationId, jane.id, futureWorkingRange(3));
    await login(request, adminEmail);

    await signInUi(page, managerEmail);

    // Sidebar badge seeds from the shell-mount fetch: two pending requests → "2".
    await expect(page.getByTestId('sidebar-requests-badge')).toHaveText('2');

    await openRequestsPage(page);

    // Both cards render with avatar, linked name, and Approve/Reject on the default pending view.
    await expect(page.getByTestId(`requests-card-${r1.id}`)).toBeVisible();
    await expect(page.getByTestId(`requests-card-${r2.id}`)).toBeVisible();
    await expect(page.getByTestId(`requests-card-avatar-${r1.id}`)).toBeVisible();
    await expect(page.getByTestId(`requests-card-avatar-${r2.id}`)).toBeVisible();
    await expect(page.getByTestId(`requests-card-member-name-${r1.id}`)).toHaveText('Alex Kaminski');
    await expect(page.getByTestId(`requests-card-member-name-${r2.id}`)).toHaveText('Jane Smith');
    await expect(page.getByTestId(`requests-card-approve-${r1.id}`)).toBeVisible();
    await expect(page.getByTestId(`requests-card-reject-${r2.id}`)).toBeVisible();

    // Approve R1 on the Pending view → toast, and the card stays put with its status flipped
    // to Approved in place (no refetch-drop).
    await page.getByTestId(`requests-card-approve-${r1.id}`).click();
    await expect(page.getByTestId('toast-request-approved')).toBeVisible();
    await expect(page.getByTestId(`requests-card-${r1.id}`)).toBeVisible();
    await expect(page.getByTestId(`requests-card-status-${r1.id}`)).toHaveText('Approved');

    // Reject R2 via the reused spec-09 modal → toast, card stays with status Rejected +
    // reviewer comment, still on the Pending view.
    await page.getByTestId(`requests-card-reject-${r2.id}`).click();
    await expect(page.getByTestId('vacation-reject-modal')).toBeVisible();
    await page.getByTestId('vacation-reject-comment-input').fill('Team availability conflict');
    await page.getByTestId('vacation-reject-confirm-btn').click();
    await expect(page.getByTestId('toast-request-rejected')).toBeVisible();
    await expect(page.getByTestId(`requests-card-${r2.id}`)).toBeVisible();
    await expect(page.getByTestId(`requests-card-status-${r2.id}`)).toHaveText('Rejected');
    await expect(page.getByTestId(`requests-card-reviewer-comment-${r2.id}`)).toBeVisible();
    await expect(page.getByTestId(`requests-card-reviewer-comment-${r2.id}`)).toContainText(
      'Team availability conflict',
    );

    // No pending requests left → the badge pill disappears (rendered only when count > 0).
    await expect(page.getByTestId('sidebar-requests-badge')).toHaveCount(0);
  });
});
