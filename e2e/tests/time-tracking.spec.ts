import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  VALID,
  assignProjectMembersViaApi,
  createProjectViaApi,
  createTimeEntryViaApi,
  findMember,
  inviteAndAcceptViaApi,
  login,
  openTracker,
  signupOrg,
  startTimerViaApi,
  uniqueEmail,
  updateAccountSettingsViaApi,
} from './helpers';

/** Signs in through the UI and waits for the app shell to settle on the members list. */
async function signInUi(page: Page, email: string, password: string = VALID.password): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL('**/members');
}

/**
 * Invites+accepts a new member at `role` and returns their email. Accepting swaps
 * `request`'s cookie jar to the new member, so this logs back in as `adminEmail`,
 * leaving the jar authenticated as the admin (ready to seed on the member's behalf).
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

/** Opens the Time Tracking page via the sidebar row and waits for the page frame to mount. */
async function openTimeTracking(page: Page): Promise<void> {
  await expect(async () => {
    await page.getByTestId('nav-time-tracking').click();
    await page.waitForURL('**/time-tracking', { timeout: 2000 });
  }).toPass({ timeout: 15000 });
  await expect(page.getByTestId('tt-page')).toBeVisible();
}

/**
 * Picks an option from a DS `Select`: the `data-testid` sits on the trigger button, and options
 * are `<a>` elements with `role="option"` (explicit ARIA role wins over the link one), so they
 * surface via `getByRole('option', …)` — same pattern as invitation/regressions.
 */
async function selectOption(page: Page, triggerTestId: string, label: string): Promise<void> {
  await page.getByTestId(triggerTestId).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

// --- Local date helpers, matching the app's local-calendar `todayISO` / `formatMonthLabel`. ---
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** First-of-month ISO after adding `n` months to `iso` (UTC arithmetic, day pinned to 1). */
function addMonthsFirst(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** "August 2026" — mirrors `formatMonthLabel`. */
function monthLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

test.describe('12 — Time Tracking', () => {
  // TC-12-E2E-01 — start a timer, watch the topbar indicator persist across pages, stop it
  // from the topbar, and confirm the resulting entry lands in the daily view.
  test('start timer, topbar indicator persists, stop and verify entry', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');
    const user = await findMember(request, org.organizationId, userEmail);
    const alpha = await createProjectViaApi(request, org.organizationId, 'Project Alpha');
    await assignProjectMembersViaApi(request, org.organizationId, alpha.id, [user.id]);

    await signInUi(page, userEmail);
    await openTimeTracking(page);

    // 2–3. Pick the project + task, start the timer.
    await selectOption(page, 'tt-timer-project-select', 'Project Alpha');
    await page.getByTestId('tt-timer-task-input').fill('Coding');
    await page.getByTestId('tt-timer-start-btn').click();

    // 4–5. Elapsed ticks up; the bar's pill appears, and the tracker it discloses carries
    // the project name.
    await expect(page.getByTestId('tt-timer-elapsed')).toHaveText(/00:00:0[1-9]/);
    await expect(page.getByTestId('topbar-timer-indicator')).toBeVisible();
    await openTracker(page);
    await expect(page.getByTestId('topbar-timer-project')).toHaveText('Project Alpha');

    // 6. On a different page the pill is still present.
    await page.getByTestId('nav-members').click();
    await page.waitForURL('**/members');
    await expect(page.getByTestId('topbar-timer-indicator')).toBeVisible();

    // 7–8. Stop from the tracker → toast, pill gone.
    await openTracker(page);
    await page.getByTestId('topbar-timer-stop-btn').click();
    await expect(page.getByTestId('toast-timer-stopped')).toBeVisible();
    await expect(page.getByTestId('toast-timer-stopped')).toContainText('logged');
    await expect(page.getByTestId('topbar-timer-indicator')).toHaveCount(0);

    // 9–10. Back on the daily view for today, the new entry shows the project + task.
    await openTimeTracking(page);
    await page.getByTestId('tt-view-daily').click();
    const list = page.getByTestId('tt-daily-list');
    await expect(list).toBeVisible();
    await expect(list).toContainText('Coding');
    await expect(list).toContainText('Project Alpha');
  });

  // TC-12-E2E-02 — create a duration-only entry via the modal, then edit its task.
  test('create a manual time entry via the modal and edit it', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');
    const user = await findMember(request, org.organizationId, userEmail);
    const alpha = await createProjectViaApi(request, org.organizationId, 'Project Alpha');
    await assignProjectMembersViaApi(request, org.organizationId, alpha.id, [user.id]);

    await signInUi(page, userEmail);
    await openTimeTracking(page);
    await page.getByTestId('tt-view-daily').click();

    // 2–4. Add entry → project + task, duration-only 1h30m → save.
    await page.getByTestId('tt-add-entry-btn').click();
    await expect(page.getByTestId('tt-entry-modal')).toBeVisible();
    await selectOption(page, 'tt-entry-project-select', 'Project Alpha');
    await page.getByTestId('tt-entry-task-input').fill('Meeting');
    await page.getByTestId('tt-entry-mode-duration').click();
    await page.getByTestId('tt-entry-duration-hours').fill('1');
    await page.getByTestId('tt-entry-duration-minutes').fill('30');
    await page.getByTestId('tt-entry-save-btn').click();

    // 5. Toast + the entry appears. It's a duration-only entry, so it renders in the strip
    //    below the grid (same tt-entry-row testid), not as a positioned tt-daily-list block.
    await expect(page.getByTestId('toast-entry-saved')).toBeVisible();
    await expect(page.getByTestId('tt-entry-modal')).toHaveCount(0);
    const row = page.locator('[data-testid^="tt-entry-row-"]').filter({ hasText: 'Meeting' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Project Alpha');
    await expect(row).toContainText('1h 30m');

    // 6–7. Edit the entry (change task) → toast; the row now reads the new task.
    await row.locator('[data-testid^="tt-entry-edit-"]').click();
    await expect(page.getByTestId('tt-entry-modal')).toBeVisible();
    await page.getByTestId('tt-entry-task-input').fill('Standup');
    await page.getByTestId('tt-entry-save-btn').click();

    await expect(page.getByTestId('toast-entry-saved')).toBeVisible();
    await expect(
      page.locator('[data-testid^="tt-entry-row-"]').filter({ hasText: 'Standup' }),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid^="tt-entry-row-"]').filter({ hasText: 'Meeting' }),
    ).toHaveCount(0);
  });

  // TC-12-E2E-03 — monthly view is the default; navigating months moves the period label,
  // and clicking a day with hours drills into the daily view.
  test('monthly view — navigate months and drill into a day', async ({ page, request }) => {
    const today = todayISO();
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');
    const user = await findMember(request, org.organizationId, userEmail);
    // Seed the `today` entry the assertions below hinge on. A second entry on
    // the 1st of the month was originally seeded so the grid always renders
    // some non-`today` history; we now skip it when today already IS the 1st
    // (double-seed on the same day would poison the `2h 0m` cell — caught on
    // 2026-09-01 with a 6h total). The `today` entry alone still fills the
    // grid so the empty-state branch does not fire.
    const isFirstOfMonth = today.endsWith('-01');
    if (!isFirstOfMonth) {
      await createTimeEntryViaApi(request, org.organizationId, {
        membershipId: user.id, date: addMonthsFirst(today, 0), durationMinutes: 240, task: 'Kickoff',
      });
    }
    await createTimeEntryViaApi(request, org.organizationId, {
      membershipId: user.id, date: today, durationMinutes: 120, task: 'Today work',
    });

    await signInUi(page, userEmail);
    await openTimeTracking(page);

    // 1–2. Monthly is the default; the grid shows hours on today's cell.
    await expect(page.getByTestId('tt-view-monthly')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('tt-calendar-grid')).toBeVisible();
    await expect(page.getByTestId('tt-period-label')).toHaveText(monthLabel(today));
    await expect(page.getByTestId(`tt-calendar-hours-${today}`)).toHaveText('2h 0m');

    // 3. Next month.
    await page.getByTestId('tt-period-next').click();
    await expect(page.getByTestId('tt-period-label')).toHaveText(monthLabel(addMonthsFirst(today, 1)));

    // 4. Previous month twice → one month before today's.
    await page.getByTestId('tt-period-prev').click();
    await page.getByTestId('tt-period-prev').click();
    await expect(page.getByTestId('tt-period-label')).toHaveText(monthLabel(addMonthsFirst(today, -1)));

    // 5–6. Back to this month, click today's cell → daily view for that date with entries.
    await page.getByTestId('tt-period-next').click();
    await expect(page.getByTestId('tt-period-label')).toHaveText(monthLabel(today));
    await expect(page.getByTestId('tt-calendar-grid')).toBeVisible();
    await page.getByTestId(`tt-calendar-cell-${today}`).click();

    await expect(page.getByTestId('tt-view-daily')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('tt-daily-list')).toBeVisible();
    // 'Today work' is a duration-only entry → it shows in the strip below the grid.
    await expect(
      page.locator('[data-testid^="tt-entry-row-"]').filter({ hasText: 'Today work' }),
    ).toBeVisible();
  });

  // TC-12-E2E-04 — weekly view is an Outlook-style time grid: timed entries render as
  // positioned blocks, duration-only entries drop to the strip below (and never become a
  // grid block), and the per-day + week totals aggregate everything.
  test('weekly view — time-grid blocks and totals', async ({ page, request }) => {
    const today = todayISO();
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');
    const user = await findMember(request, org.organizationId, userEmail);
    const alpha = await createProjectViaApi(request, org.organizationId, 'Project Alpha');
    const beta = await createProjectViaApi(request, org.organizationId, 'Project Beta');
    await assignProjectMembersViaApi(request, org.organizationId, alpha.id, [user.id]);
    await assignProjectMembersViaApi(request, org.organizationId, beta.id, [user.id]);
    // Two timed entries across two projects (positioned grid blocks) at non-overlapping
    // times so neither obscures the other, plus one duration-only no-project entry that
    // belongs in the strip — all today, guaranteed inside the current week.
    const alphaEntry = await createTimeEntryViaApi(request, org.organizationId, {
      membershipId: user.id, projectId: alpha.id, date: today, startTime: '09:00', endTime: '13:00', task: 'A',
    });
    const betaEntry = await createTimeEntryViaApi(request, org.organizationId, {
      membershipId: user.id, projectId: beta.id, date: today, startTime: '14:00', endTime: '16:00', task: 'B',
    });
    const miscEntry = await createTimeEntryViaApi(request, org.organizationId, {
      membershipId: user.id, projectId: null, date: today, durationMinutes: 60, task: 'misc',
    });

    await signInUi(page, userEmail);
    await openTimeTracking(page);
    await page.getByTestId('tt-view-weekly').click();

    // 2. The grid renders; each timed entry is a positioned block inside it (one per id).
    const grid = page.getByTestId('tt-weekly-grid');
    await expect(grid).toBeVisible();
    await expect(grid.getByTestId(`tt-weekly-entry-${alphaEntry.id}`)).toBeVisible();
    await expect(grid.getByTestId(`tt-weekly-entry-${betaEntry.id}`)).toBeVisible();
    // Blocks carry their project name in text (colour is never the only signal).
    await expect(grid).toContainText('Project Alpha');
    await expect(grid).toContainText('Project Beta');

    // 3. The duration-only entry is NOT a grid block — it lives in the strip below the grid
    //    (still present on the page, so it counts toward the totals) but not inside the grid.
    await expect(grid.getByTestId(`tt-weekly-entry-${miscEntry.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`tt-weekly-entry-${miscEntry.id}`)).toBeVisible();

    // 4. Today's day-column total aggregates all three: 4 + 2 + 1 = 7 hours.
    await expect(page.getByTestId(`tt-weekly-day-total-${today}`)).toHaveText('7h 0m');

    // 5. Week grand total = 7 hours.
    await expect(page.getByTestId('tt-week-total')).toContainText('7h 0m');
  });

  // TC-12-E2E-05 — daily view: delete one of two entries; the row goes and the total updates.
  test('daily view — delete an entry updates the day total', async ({ page, request }) => {
    const today = todayISO();
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');
    const user = await findMember(request, org.organizationId, userEmail);
    const keep = await createTimeEntryViaApi(request, org.organizationId, {
      membershipId: user.id, date: today, durationMinutes: 120, task: 'Keeper',
    });
    const drop = await createTimeEntryViaApi(request, org.organizationId, {
      membershipId: user.id, date: today, durationMinutes: 60, task: 'Doomed',
    });

    await signInUi(page, userEmail);
    await openTimeTracking(page);
    await page.getByTestId('tt-view-daily').click();

    // Both entries present, total is 3h 0m.
    await expect(page.getByTestId(`tt-entry-row-${keep.id}`)).toBeVisible();
    await expect(page.getByTestId(`tt-entry-row-${drop.id}`)).toBeVisible();
    await expect(page.getByTestId('tt-day-total')).toContainText('3h 0m');

    // Delete the second one → confirm in the dialog.
    await page.getByTestId(`tt-entry-delete-${drop.id}`).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();

    // Toast, row gone, total recomputed to 2h 0m.
    await expect(page.getByTestId('toast-entry-deleted')).toBeVisible();
    await expect(page.getByTestId(`tt-entry-row-${drop.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`tt-entry-row-${keep.id}`)).toBeVisible();
    await expect(page.getByTestId('tt-day-total')).toContainText('2h 0m');
  });

  // TC-12-E2E-06 — admin uses the member filter to view (and edit) another member's entries.
  test('admin filters by member and edits their entry', async ({ page, request }) => {
    const today = todayISO();
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const admin = await findMember(request, org.organizationId, adminEmail);
    const alexEmail = await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');
    const alex = await findMember(request, org.organizationId, alexEmail);
    // Admin's own entry, plus Alex's entry (created on Alex's behalf).
    await createTimeEntryViaApi(request, org.organizationId, {
      membershipId: admin.id, date: today, durationMinutes: 90, task: 'Admin task',
    });
    const alexEntry = await createTimeEntryViaApi(request, org.organizationId, {
      membershipId: alex.id, date: today, durationMinutes: 120, task: 'Alex task',
    });

    await signInUi(page, adminEmail);
    await openTimeTracking(page);
    await page.getByTestId('tt-view-daily').click();

    // 1. Own entries by default. Duration-only entries render in the strip (tt-entry-row).
    await expect(
      page.locator('[data-testid^="tt-entry-row-"]').filter({ hasText: 'Admin task' }),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid^="tt-entry-row-"]').filter({ hasText: 'Alex task' }),
    ).toHaveCount(0);

    // 2–3. Filter to Alex → their entry shows, with edit/delete controls.
    await selectOption(page, 'tt-member-filter', 'Alex Kaminski');
    await expect(page.getByTestId(`tt-entry-row-${alexEntry.id}`)).toBeVisible();
    await expect(page.getByTestId(`tt-entry-row-${alexEntry.id}`)).toContainText('Alex task');
    await expect(page.getByTestId(`tt-entry-edit-${alexEntry.id}`)).toBeVisible();
    await expect(page.getByTestId(`tt-entry-delete-${alexEntry.id}`)).toBeVisible();

    // 4–5. Edit Alex's entry (change task) → toast; the row reflects the new task.
    await page.getByTestId(`tt-entry-edit-${alexEntry.id}`).click();
    await expect(page.getByTestId('tt-entry-modal')).toBeVisible();
    await page.getByTestId('tt-entry-task-input').fill('Reviewed by admin');
    await page.getByTestId('tt-entry-save-btn').click();

    await expect(page.getByTestId('toast-entry-saved')).toBeVisible();
    await expect(page.getByTestId(`tt-entry-row-${alexEntry.id}`)).toContainText('Reviewed by admin');
  });

  // TC-12-E2E-07 — a running timer survives a full page reload (server-side source of truth).
  test('timer persists across a page reload', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');
    const user = await findMember(request, org.organizationId, userEmail);
    const alpha = await createProjectViaApi(request, org.organizationId, 'Project Alpha');
    await assignProjectMembersViaApi(request, org.organizationId, alpha.id, [user.id]);

    await signInUi(page, userEmail);
    await openTimeTracking(page);

    // 1. Start a timer with a project + task.
    await selectOption(page, 'tt-timer-project-select', 'Project Alpha');
    await page.getByTestId('tt-timer-task-input').fill('Coding');
    await page.getByTestId('tt-timer-start-btn').click();
    await expect(page.getByTestId('topbar-timer-indicator')).toBeVisible();
    await expect(page.getByTestId('tt-timer-elapsed')).toHaveText(/00:00:0[1-9]/);

    // 2–4. Reload → still running (stop button in the bar), elapsed > 0, topbar present.
    await page.reload();
    await expect(page.getByTestId('tt-page')).toBeVisible();
    await expect(page.getByTestId('tt-timer-stop-btn')).toBeVisible();
    await expect(page.getByTestId('topbar-timer-indicator')).toBeVisible();
    await expect
      .poll(async () => (await page.getByTestId('tt-timer-elapsed').textContent())?.trim())
      .not.toBe('00:00:00');

    // 5. Stop → entry created (visible in the daily view for today).
    await page.getByTestId('tt-timer-stop-btn').click();
    await expect(page.getByTestId('toast-timer-stopped')).toBeVisible();
    await expect(page.getByTestId('topbar-timer-indicator')).toHaveCount(0);
    await page.getByTestId('tt-view-daily').click();
    await expect(page.getByTestId('tt-daily-list')).toContainText('Coding');
  });

  // TC-12-E2E-08 — admin edits another member's entry, changing its duration.
  test('admin edits another member\'s entry duration', async ({ page, request }) => {
    const today = todayISO();
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const alexEmail = await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');
    const alex = await findMember(request, org.organizationId, alexEmail);
    const alexEntry = await createTimeEntryViaApi(request, org.organizationId, {
      membershipId: alex.id, date: today, durationMinutes: 60, task: 'Alex task',
    });

    await signInUi(page, adminEmail);
    await openTimeTracking(page);
    await page.getByTestId('tt-view-daily').click();

    // 1. Filter to Alex.
    await selectOption(page, 'tt-member-filter', 'Alex Kaminski');
    await expect(page.getByTestId(`tt-entry-row-${alexEntry.id}`)).toContainText('1h 0m');

    // 2–3. Edit → change the duration to 3h 0m → save (duration-only entry opens in that mode).
    await page.getByTestId(`tt-entry-edit-${alexEntry.id}`).click();
    await expect(page.getByTestId('tt-entry-modal')).toBeVisible();
    await page.getByTestId('tt-entry-duration-hours').fill('3');
    await page.getByTestId('tt-entry-duration-minutes').fill('0');
    await page.getByTestId('tt-entry-save-btn').click();

    // 4. Updated entry reflects the new duration.
    await expect(page.getByTestId('toast-entry-saved')).toBeVisible();
    await expect(page.getByTestId(`tt-entry-row-${alexEntry.id}`)).toContainText('3h 0m');
  });

  // TC-12-E2E-09 — a viewer has no Time Tracking sidebar row and cannot reach the page.
  test('viewer cannot see or reach the Time Tracking page', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const viewerEmail = await addMember(request, adminEmail, 'viewer', 'Val', 'Viewer');

    await signInUi(page, viewerEmail);

    // 1. The sidebar renders, but the Time Tracking row is omitted for this role.
    await expect(page.getByTestId('app-sidebar')).toBeVisible();
    await expect(page.getByTestId('nav-time-tracking')).toHaveCount(0);

    // 2. Direct navigation does not render the page surface (notFound()).
    await page.goto(`/org/${org.organizationId}/time-tracking`);
    await expect(page.getByTestId('tt-page')).toHaveCount(0);
  });

  // TC-12-E2E-10 — discarding a running timer creates no entry.
  test('discard a running timer creates no entry', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');

    await signInUi(page, userEmail);
    await openTimeTracking(page);

    // Start a timer.
    await page.getByTestId('tt-timer-task-input').fill('Throwaway');
    await page.getByTestId('tt-timer-start-btn').click();
    await expect(page.getByTestId('topbar-timer-indicator')).toBeVisible();

    // 1–3. Discard → confirm in the dialog → toast; the bar returns to idle.
    await page.getByTestId('tt-timer-discard-btn').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(page.getByTestId('toast-timer-discarded')).toBeVisible();
    await expect(page.getByTestId('tt-timer-start-btn')).toBeVisible();

    // 4. Topbar indicator gone.
    await expect(page.getByTestId('topbar-timer-indicator')).toHaveCount(0);

    // 5. No entry created — today's daily grid still renders but holds no entry rows.
    await page.getByTestId('tt-view-daily').click();
    await expect(page.getByTestId('tt-empty-state')).toBeVisible();
    await expect(
      page.getByTestId('tt-daily-list').locator('[data-testid^="tt-entry-row-"]'),
    ).toHaveCount(0);
  });

  // TC-12-E2E-11 — the Add Entry modal surfaces field validation before it will save.
  test('validation errors in the Add Entry modal', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');

    await signInUi(page, userEmail);
    await openTimeTracking(page);

    // 1–2. Open the modal, clear the (pre-filled) date, submit → date error.
    await page.getByTestId('tt-add-entry-btn').click();
    await expect(page.getByTestId('tt-entry-modal')).toBeVisible();
    await page.getByTestId('tt-entry-date-input').fill('');
    await page.getByTestId('tt-entry-save-btn').click();
    await expect(page.getByTestId('field-error-date')).toBeVisible();

    // 3. A future date → the future-date error.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    await page.getByTestId('tt-entry-date-input').fill(tomorrowISO);
    await page.getByTestId('tt-entry-save-btn').click();
    await expect(page.getByTestId('field-error-date')).toContainText('Date cannot be in the future');

    // 4–5. Valid date, duration-only mode, 0/0 → the minimum-duration error.
    await page.getByTestId('tt-entry-date-input').fill(todayISO());
    await page.getByTestId('tt-entry-mode-duration').click();
    await page.getByTestId('tt-entry-duration-hours').fill('0');
    await page.getByTestId('tt-entry-duration-minutes').fill('0');
    await page.getByTestId('tt-entry-save-btn').click();
    await expect(page.getByTestId('field-error-durationMinutes')).toBeVisible();
    await expect(page.getByTestId('field-error-durationMinutes')).toContainText(
      'Duration must be at least 1 minute',
    );

    // 6. A valid duration saves.
    await page.getByTestId('tt-entry-duration-hours').fill('1');
    await page.getByTestId('tt-entry-duration-minutes').fill('0');
    await page.getByTestId('tt-entry-save-btn').click();
    await expect(page.getByTestId('toast-entry-saved')).toBeVisible();
    await expect(page.getByTestId('tt-entry-modal')).toHaveCount(0);
  });

  // TC-12-E2E-12 — the account's `firstDayOfWeek` preference re-orders the calendar: with
  // "Sunday" the monthly weekday header leads with Sun (Mon by default, covered elsewhere).
  test('firstDayOfWeek "Sunday" re-orders the monthly calendar header', async ({ page, request }) => {
    const today = todayISO();
    const adminEmail = uniqueEmail('admin');
    // A real timezone so PUT /api/account/settings (whole-object validation) accepts the change.
    const org = await signupOrg(request, {
      orgName: 'Acme Inc', email: adminEmail, timezone: 'Europe/Berlin',
    });
    const admin = await findMember(request, org.organizationId, adminEmail);
    // Seed an entry this month so the grid (not the empty state) renders.
    await createTimeEntryViaApi(request, org.organizationId, {
      membershipId: admin.id, date: today, durationMinutes: 120, task: 'Work',
    });
    // Flip the week start to Sunday before signing in, so the fresh session carries it.
    await updateAccountSettingsViaApi(request, { firstDayOfWeek: 'Sunday' });

    await signInUi(page, adminEmail);
    await openTimeTracking(page);

    // Monthly is the default; its weekday header now leads with Sun and ends with Sat.
    await expect(page.getByTestId('tt-view-monthly')).toHaveAttribute('aria-checked', 'true');
    const grid = page.getByTestId('tt-calendar-grid');
    await expect(grid).toBeVisible();
    const headerCells = grid.locator('> div').first().locator('> div');
    await expect(headerCells.first()).toHaveText('Sun');
    await expect(headerCells.last()).toHaveText('Sat');
  });
});
