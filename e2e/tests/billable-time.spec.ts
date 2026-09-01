import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  VALID,
  assignProjectMembersViaApi,
  createProjectViaApi,
  createTimeEntryViaApi,
  findMember,
  inviteAndAcceptViaApi,
  login,
  signupOrg,
  startTimerViaApi,
  uniqueEmail,
} from './helpers';

/**
 * Spec user-management/16 — Billable Time.
 * TC-16-E2E-05 is deferred: it asserts the flag reaches the Amounts Owed report,
 * whose surface is not yet implemented (see specs/reports/01-reports.md). It is
 * present as a `test.fixme` so the tracker can find it as a known-pending case.
 */

async function signInUi(page: Page, email: string, password: string = VALID.password): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL('**/members');
}

async function openTimeTracking(page: Page): Promise<void> {
  await expect(async () => {
    await page.getByTestId('nav-time-tracking').click();
    await page.waitForURL('**/time-tracking', { timeout: 2000 });
  }).toPass({ timeout: 15000 });
  await expect(page.getByTestId('tt-page')).toBeVisible();
}

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

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.describe('16 — Billable Time', () => {
  // TC-16-E2E-01: user logs a non-billable entry via the modal, sees the dashed NB
  // rendering in the daily view and the split daily total on the weekly header.
  test('user logs a non-billable entry — dashed rendering + NB tag + split daily total', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'BillableCo', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Nb', 'User');
    const user = await findMember(request, org.organizationId, userEmail);
    const project = await createProjectViaApi(request, org.organizationId, 'Client Alpha');
    await assignProjectMembersViaApi(request, org.organizationId, project.id, [user.id]);

    await signInUi(page, userEmail);
    await openTimeTracking(page);

    // Open Add Entry, fill in a duration-only entry, toggle Billable OFF.
    await page.getByTestId('tt-add-entry-btn').click();
    await expect(page.getByTestId('tt-entry-modal')).toBeVisible();

    // Duration-only mode + 1h.
    await page.getByTestId('tt-entry-mode-duration').click();
    await page.getByTestId('tt-entry-duration-hours').fill('1');
    await page.getByTestId('tt-entry-duration-minutes').fill('0');
    await page.getByTestId('tt-entry-task-input').fill('Retro');

    // Toggle billable off and confirm the description text flips.
    const toggle = page.getByTestId('time-entry-billable-toggle');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('time-entry-billable-toggle-label')).toContainText(
      "will not appear in the client's Billed Amount",
    );

    await page.getByTestId('tt-entry-save-btn').click();

    // Toast text for a non-billable save.
    await expect(page.getByTestId('toast-entry-saved')).toContainText('Non-billable time logged.');

    // The daily view is default-monthly, so switch to weekly to see the split total.
    await page.getByTestId('tt-view-weekly').click();

    // At least one entry with data-billable="false" is visible.
    const nb = page.locator('[data-testid^="tt-weekly-entry-"][data-billable="false"]');
    await expect(nb.first()).toBeVisible();

    // Daily total on the header carries the split attributes and the +Xh nb sub-line.
    const today = todayISO();
    const dayTotal = page.getByTestId(`tt-weekly-day-total-${today}`);
    await expect(dayTotal).toBeVisible();
    await expect(dayTotal).toHaveAttribute('data-billable-minutes', '0');
    await expect(dayTotal).toHaveAttribute('data-nonbillable-minutes', '60');
    await expect(dayTotal).toContainText('nb');
  });

  // TC-16-E2E-02: mid-run flip. Start a billable timer via the API, then flip it in
  // the running-timer bar and confirm the status line renders "Non-billable ·".
  test('running timer toggles billable → status line flips', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'FlipCo', email: adminEmail });

    await login(request, adminEmail);
    const project = await createProjectViaApi(request, org.organizationId, 'Ops');
    // Start a plain billable timer as the admin.
    await startTimerViaApi(request, org.organizationId, { projectId: project.id, task: 'Standup' });

    await signInUi(page, adminEmail);
    await openTimeTracking(page);

    // Wait for the timer bar to hydrate.
    await expect(page.getByTestId('tt-timer-elapsed')).toBeVisible();

    // Status line starts without the "Non-billable · " prefix.
    const status = page.getByTestId('running-timer-status-line');
    await expect(status).toBeVisible();
    await expect(status).not.toContainText('Non-billable');
    await expect(status).toContainText('started');

    // Flip.
    const runToggle = page.getByTestId('running-timer-billable-toggle');
    await expect(runToggle).toHaveAttribute('aria-checked', 'true');
    await runToggle.click();
    await expect(runToggle).toHaveAttribute('aria-checked', 'false');

    // Status line now carries the prefix.
    await expect(status).toContainText('Non-billable ·');
  });

  // TC-16-E2E-03: a plain user cannot flip billable on another member's entry —
  // Bob's row is not offered as editable in Alice's view (Alice is a `user`).
  // The server backstop (403) is exercised in the integration suite (TC-16-INT-06).
  test('user cannot open another user’s entry as editable', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'PeerCo', email: adminEmail });
    const aliceEmail = await addMember(request, adminEmail, 'user', 'Alice', 'A');
    const bobEmail = await addMember(request, adminEmail, 'user', 'Bob', 'B');
    const bob = await findMember(request, org.organizationId, bobEmail);

    // Seed a billable entry for Bob (admin acting on Bob's behalf).
    await login(request, adminEmail);
    await createTimeEntryViaApi(request, org.organizationId, {
      membershipId: bob.id,
      date: todayISO(),
      durationMinutes: 60,
      billable: true,
    });

    // Alice signs in — her Time Tracking page shows only her own entries; there is
    // no member filter for her role. Bob's entry does not appear on her calendar.
    await signInUi(page, aliceEmail);
    await openTimeTracking(page);

    // The member-filter Select is only rendered for admin/manager (`manage-all`); a
    // plain user never sees it, so there is no way to "look at Bob".
    await expect(page.getByTestId('tt-member-filter')).toHaveCount(0);
  });

  // TC-16-E2E-04: non-billable chip filter hides non-billable entries and shrinks
  // the daily total accordingly.
  test('non-billable chip hides non-billable entries; totals shrink', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'ChipCo', email: adminEmail });

    // Seed 60m billable + 30m non-billable for the admin today.
    await login(request, adminEmail);
    await createTimeEntryViaApi(request, org.organizationId, {
      date: todayISO(),
      durationMinutes: 60,
      billable: true,
    });
    await createTimeEntryViaApi(request, org.organizationId, {
      date: todayISO(),
      durationMinutes: 30,
      billable: false,
    });

    await signInUi(page, adminEmail);
    await openTimeTracking(page);
    await page.getByTestId('tt-view-weekly').click();

    const today = todayISO();
    const dayTotal = page.getByTestId(`tt-weekly-day-total-${today}`);
    await expect(dayTotal).toHaveAttribute('data-billable-minutes', '60');
    await expect(dayTotal).toHaveAttribute('data-nonbillable-minutes', '30');

    // Turn Non-Billable OFF. Server refetches with billable=billable.
    await page.getByTestId('time-grid-filter-nonbillable').click();

    await expect(dayTotal).toHaveAttribute('data-billable-minutes', '60');
    await expect(dayTotal).toHaveAttribute('data-nonbillable-minutes', '0');
    await expect(dayTotal).not.toContainText('nb');
  });

  // TC-16-E2E-05: Reports Amounts Owed reflects the flag. Deferred — Reports (spec
  // reports/01) is not implemented yet, and the assertion depends on the
  // `reports-amounts-owed-total-{membershipId}` testid it introduces. When Reports
  // lands, flip this to a regular test and remove the fixme.
  test.fixme('reports Amounts Owed reflects the billable flag (needs reports/01)', () => {});
});
