import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { TIME_TRACKING_MESSAGES } from '@devscribed/validation';
import {
  API,
  VALID,
  assignProjectMembersViaApi,
  findMember,
  inviteAndAcceptViaApi,
  login,
  signupOrg,
  startTimerViaApi,
  uniqueEmail,
} from './helpers';

/**
 * Spec 15 — Time Tracking ↔ Tasks Integration. Eleven E2E cases covering the shared
 * task selector on the Timer panel and the Add Entry modal, the Time Logged section
 * on the task detail page, and the Start Timer shortcut on the task detail page.
 *
 * Preconditions (org / member / project / task / time-entry-with-taskId) are built
 * straight through the API — the tests exercise only the UI paths the spec's TCs
 * name. Backend + validation live in specs 12/13/15 integration + unit suites.
 */

async function signInUi(page: Page, email: string, password: string = VALID.password): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL('**/members');
}

/** Invites+accepts a fresh member at `role`, then re-logs in as `adminEmail`. */
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

/** Creates a project — with an optional board `key` (spec 13). */
async function createProject(
  request: APIRequestContext,
  orgId: string,
  name: string,
  key?: string,
): Promise<{ id: string; name: string; key: string | null }> {
  const response = await request.post(`${API}/api/organizations/${orgId}/projects`, {
    data: key ? { name, key } : { name },
  });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not create project ${name} (${response.status()})`);
  }
  return (await response.json()) as { id: string; name: string; key: string | null };
}

/** Creates a task through the API (spec 13). Returns id + key so tests can target testids. */
async function createTaskViaApi(
  request: APIRequestContext,
  orgId: string,
  projectId: string,
  body: Record<string, unknown>,
): Promise<{ id: string; key: string; taskNumber: number; columnId: string; title: string }> {
  const response = await request.post(
    `${API}/api/organizations/${orgId}/projects/${projectId}/tasks`,
    { data: body },
  );
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not create task ${JSON.stringify(body)} (${response.status()} ${await response.text()})`,
    );
  }
  return (await response.json()) as {
    id: string; key: string; taskNumber: number; columnId: string; title: string;
  };
}

/**
 * Creates a time entry with an optional `taskId` (spec 15). The shared
 * `createTimeEntryViaApi` helper predates spec 15 and does not type `taskId`;
 * this local variant posts the field so seeds can materialize the task-linked
 * entries the Time Logged section reads back.
 */
async function createTaskLinkedEntryViaApi(
  request: APIRequestContext,
  orgId: string,
  body: {
    membershipId?: string;
    projectId: string;
    taskId?: string | null;
    date: string;
    durationMinutes: number;
    description?: string;
  },
): Promise<{ id: string; date: string; durationMinutes: number }> {
  const response = await request.post(
    `${API}/api/organizations/${orgId}/time-entries`,
    { data: body },
  );
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not create task-linked entry (${response.status()} ${await response.text()})`,
    );
  }
  return (await response.json()) as { id: string; date: string; durationMinutes: number };
}

/** Local-clock today (YYYY-MM-DD) — matches the app's own `todayISO`. */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** DS `Select` helper — trigger is data-testid, options render as `<a role="option">`. */
async function selectOption(page: Page, triggerTestId: string, label: string): Promise<void> {
  await page.getByTestId(triggerTestId).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

/** Opens the Time Tracking page via the sidebar row and waits for the frame. */
async function openTimeTracking(page: Page): Promise<void> {
  await expect(async () => {
    await page.getByTestId('nav-time-tracking').click();
    await page.waitForURL('**/time-tracking', { timeout: 2000 });
  }).toPass({ timeout: 15000 });
  await expect(page.getByTestId('tt-page')).toBeVisible();
}

test.describe('15 — Time Tracking ↔ Tasks Integration', () => {
  // -----------------------------------------------------------------------------------
  // TC-15-E2E-01 — Select a task in the Timer panel and start a timer.
  // -----------------------------------------------------------------------------------
  test('TC-15-E2E-01: select a task in the Timer panel and start a timer', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');
    const user = await findMember(request, org.organizationId, userEmail);
    const mob = await createProject(request, org.organizationId, 'Mobile App', 'MOB');
    await assignProjectMembersViaApi(request, org.organizationId, mob.id, [user.id]);
    const task = await createTaskViaApi(request, org.organizationId, mob.id, {
      type: 'task', title: 'Fix login bug',
    });
    const expectedLabel = `${task.key}: Fix login bug`;

    await signInUi(page, userEmail);
    await openTimeTracking(page);

    // 2. Project selection reveals the task selector.
    await selectOption(page, 'tt-timer-project-select', 'Mobile App');
    await expect(page.getByTestId('tt-timer-task-selector')).toBeVisible();

    // 3–5. Focus the search input, type "login", pick the matching task option.
    await page.getByTestId('tt-timer-task-search-input').click();
    await page.getByTestId('tt-timer-task-search-input').fill('login');
    await expect(page.getByTestId(`tt-timer-task-option-${task.id}`)).toBeVisible();
    await page.getByTestId(`tt-timer-task-option-${task.id}`).click();

    // 6. Free-text `task` input auto-fills with the computed label and is read-only.
    await expect(page.getByTestId('tt-timer-task-input')).toHaveValue(expectedLabel);
    await expect(page.getByTestId('tt-timer-task-input')).toHaveAttribute('readonly', '');

    // 7. Start the timer.
    await page.getByTestId('tt-timer-start-btn').click();

    // 8. Running state — elapsed ticks and the topbar chip appears.
    await expect(page.getByTestId('tt-timer-elapsed')).toHaveText(/00:00:0[1-9]/);
    await expect(page.getByTestId('topbar-timer-indicator')).toBeVisible();
    // The chip in the running state carries the task label (from the taskId snapshot).
    await expect(page.getByTestId('tt-timer-task-selector')).toContainText('Fix login bug');
  });

  // -----------------------------------------------------------------------------------
  // TC-15-E2E-02 — Clear task selection in Timer panel (idle state).
  // -----------------------------------------------------------------------------------
  test('TC-15-E2E-02: clear task selection in Timer panel', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');
    const user = await findMember(request, org.organizationId, userEmail);
    const mob = await createProject(request, org.organizationId, 'Mobile App', 'MOB');
    await assignProjectMembersViaApi(request, org.organizationId, mob.id, [user.id]);
    const task = await createTaskViaApi(request, org.organizationId, mob.id, {
      type: 'task', title: 'Fix login bug',
    });
    const expectedLabel = `${task.key}: Fix login bug`;

    await signInUi(page, userEmail);
    await openTimeTracking(page);

    // Select project + task (mirrors TC-15-E2E-01 steps 1–6).
    await selectOption(page, 'tt-timer-project-select', 'Mobile App');
    await page.getByTestId('tt-timer-task-search-input').click();
    await page.getByTestId('tt-timer-task-search-input').fill('login');
    await page.getByTestId(`tt-timer-task-option-${task.id}`).click();
    await expect(page.getByTestId('tt-timer-task-input')).toHaveValue(expectedLabel);

    // 1. Click the ✕ clear affordance.
    await page.getByTestId('tt-timer-task-clear-btn').click();

    // 2. Selector reverts to search mode; the search input is back on screen.
    await expect(page.getByTestId('tt-timer-task-search-input')).toBeVisible();

    // 3. Free-text task field is editable and retains the previously-auto-filled label.
    const taskInput = page.getByTestId('tt-timer-task-input');
    await expect(taskInput).toHaveValue(expectedLabel);
    await expect(taskInput).not.toHaveAttribute('readonly', '');

    // 4. Replace with free-text "Custom note".
    await taskInput.fill('Custom note');

    // 5–6. Start the timer with free-text label + no link.
    await page.getByTestId('tt-timer-start-btn').click();
    await expect(page.getByTestId('tt-timer-elapsed')).toHaveText(/00:00:0[1-9]/);
    await expect(page.getByTestId('tt-timer-task-input')).toHaveValue('Custom note');
    // No task chip → the selector shows the search input, not a chip with a clear button.
    await expect(page.getByTestId('tt-timer-task-clear-btn')).toHaveCount(0);
  });

  // -----------------------------------------------------------------------------------
  // TC-15-E2E-03 — Select a task in the Add Time Entry modal.
  // -----------------------------------------------------------------------------------
  test('TC-15-E2E-03: select a task in the Add Time Entry modal', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');
    const user = await findMember(request, org.organizationId, userEmail);
    const mob = await createProject(request, org.organizationId, 'Mobile App', 'MOB');
    await assignProjectMembersViaApi(request, org.organizationId, mob.id, [user.id]);
    const task = await createTaskViaApi(request, org.organizationId, mob.id, {
      type: 'bug', title: 'API 500 error',
    });
    const expectedLabel = `${task.key}: API 500 error`;

    await signInUi(page, userEmail);
    await openTimeTracking(page);
    await page.getByTestId('tt-view-daily').click();

    // 1–3. Open the modal, pick project → task selector appears.
    await page.getByTestId('tt-add-entry-btn').click();
    await expect(page.getByTestId('tt-entry-modal')).toBeVisible();
    await selectOption(page, 'tt-entry-project-select', 'Mobile App');
    await expect(page.getByTestId('tt-entry-task-selector')).toBeVisible();

    // 4. Search and select the task.
    await page.getByTestId('tt-entry-task-search-input').click();
    await page.getByTestId('tt-entry-task-search-input').fill('500');
    await expect(page.getByTestId(`tt-entry-task-option-${task.id}`)).toBeVisible();
    await page.getByTestId(`tt-entry-task-option-${task.id}`).click();
    // Chip renders the task label; the plain free-text input is hidden while linked.
    await expect(page.getByTestId('tt-entry-task-selector')).toContainText('API 500 error');
    await expect(page.getByTestId('tt-entry-task-input')).toHaveCount(0);

    // 5. Duration-only 1h 0m.
    await page.getByTestId('tt-entry-mode-duration').click();
    await page.getByTestId('tt-entry-duration-hours').fill('1');
    await page.getByTestId('tt-entry-duration-minutes').fill('0');

    // 6–7. Save → toast + modal closes.
    await page.getByTestId('tt-entry-save-btn').click();
    await expect(page.getByTestId('toast-entry-saved')).toBeVisible();
    // Spec 16 changed the create toast to a differentiated string; a billable
    // create surfaces `toastEntryBillableLogged` ("Time logged.").
    await expect(page.getByTestId('toast-entry-saved')).toHaveText(TIME_TRACKING_MESSAGES.toastEntryBillableLogged);
    await expect(page.getByTestId('tt-entry-modal')).toHaveCount(0);

    // 8. The entry (duration-only → strip row) shows the computed task label.
    const row = page.locator('[data-testid^="tt-entry-row-"]').filter({ hasText: expectedLabel });
    await expect(row).toBeVisible();
  });

  // -----------------------------------------------------------------------------------
  // TC-15-E2E-04 — Changing project after selecting a task clears the task.
  // -----------------------------------------------------------------------------------
  test('TC-15-E2E-04: changing project after selecting a task clears the task', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');
    const user = await findMember(request, org.organizationId, userEmail);
    const mob = await createProject(request, org.organizationId, 'Mobile App', 'MOB');
    const web = await createProject(request, org.organizationId, 'Website Redesign', 'WEB');
    await assignProjectMembersViaApi(request, org.organizationId, mob.id, [user.id]);
    await assignProjectMembersViaApi(request, org.organizationId, web.id, [user.id]);
    const mobTask = await createTaskViaApi(request, org.organizationId, mob.id, {
      type: 'task', title: 'Fix login bug',
    });
    const expectedLabel = `${mobTask.key}: Fix login bug`;

    await signInUi(page, userEmail);
    await openTimeTracking(page);

    // Open modal, pick Mobile App, select the MOB task.
    await page.getByTestId('tt-add-entry-btn').click();
    await expect(page.getByTestId('tt-entry-modal')).toBeVisible();
    await selectOption(page, 'tt-entry-project-select', 'Mobile App');
    await page.getByTestId('tt-entry-task-search-input').click();
    await page.getByTestId('tt-entry-task-search-input').fill('login');
    await expect(page.getByTestId(`tt-entry-task-option-${mobTask.id}`)).toBeVisible();
    await page.getByTestId(`tt-entry-task-option-${mobTask.id}`).click();
    await expect(page.getByTestId('tt-entry-task-selector')).toContainText('Fix login bug');

    // 1. Change the project to Website Redesign.
    await selectOption(page, 'tt-entry-project-select', 'Website Redesign');

    // 2. Task selection cleared → the new project's selector renders in search mode.
    await expect(page.getByTestId('tt-entry-task-search-input')).toBeVisible();
    await expect(page.getByTestId('tt-entry-task-clear-btn')).toHaveCount(0);

    // 3. The previously-auto-filled `task` free-text is editable now (input reappears).
    //    FR-14 preserves the current text — the modal keeps whatever `task` string was
    //    in state (empty in the picker path since selecting a task doesn't type into it).
    await expect(page.getByTestId('tt-entry-task-input')).toBeVisible();
    await expect(page.getByTestId('tt-entry-task-input')).not.toHaveAttribute('readonly', '');
    // Prove it is editable by typing a free-text label.
    await page.getByTestId('tt-entry-task-input').fill('Editable after clear');
    await expect(page.getByTestId('tt-entry-task-input')).toHaveValue('Editable after clear');
    void expectedLabel;
  });

  // -----------------------------------------------------------------------------------
  // TC-15-E2E-05 — View Time Logged section on task detail page.
  // -----------------------------------------------------------------------------------
  test('TC-15-E2E-05: view Time Logged section on task detail page', async ({ page, request }) => {
    const today = todayISO();
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const admin = await findMember(request, org.organizationId, adminEmail);
    const mob = await createProject(request, org.organizationId, 'Mobile App', 'MOB');
    const task = await createTaskViaApi(request, org.organizationId, mob.id, {
      type: 'task', title: 'Fix login bug',
    });
    // Two entries by the admin totalling 2h 30m → 90 + 60.
    const first = await createTaskLinkedEntryViaApi(request, org.organizationId, {
      membershipId: admin.id, projectId: mob.id, taskId: task.id, date: today,
      durationMinutes: 90,
    });
    await createTaskLinkedEntryViaApi(request, org.organizationId, {
      membershipId: admin.id, projectId: mob.id, taskId: task.id, date: today,
      durationMinutes: 60,
    });

    await signInUi(page, adminEmail);
    await page.goto(`/org/${org.organizationId}/projects/${mob.id}/tasks/${task.id}`);
    await expect(page.getByTestId('task-detail')).toBeVisible();

    // 2. Section renders total 2h 30m.
    await expect(page.getByTestId('task-time-logged-section')).toBeVisible();
    await expect(page.getByTestId('task-time-logged-total')).toHaveText('2h 30m');

    // 3. Two entry rows with the logging member's name.
    const rows = page.locator('[data-testid^="task-time-logged-entry-"]');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Pat Owner');

    // 4–5. Click the most recent entry's date → daily view for that date.
    await page.getByTestId(`task-time-logged-entry-${first.id}`).click();
    await page.waitForURL(new RegExp(`/time-tracking\\?.*date=${today}`));
    await expect(page.getByTestId('tt-page')).toBeVisible();
  });

  // -----------------------------------------------------------------------------------
  // TC-15-E2E-06 — Time Logged section empty state.
  // -----------------------------------------------------------------------------------
  test('TC-15-E2E-06: Time Logged section empty state', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const mob = await createProject(request, org.organizationId, 'Mobile App', 'MOB');
    const task = await createTaskViaApi(request, org.organizationId, mob.id, {
      type: 'task', title: 'Empty task',
    });

    await signInUi(page, adminEmail);
    await page.goto(`/org/${org.organizationId}/projects/${mob.id}/tasks/${task.id}`);
    await expect(page.getByTestId('task-detail')).toBeVisible();

    await expect(page.getByTestId('task-time-logged-section')).toBeVisible();
    await expect(page.getByTestId('task-time-logged-empty')).toBeVisible();
    await expect(page.getByTestId('task-time-logged-empty')).toHaveText(
      TIME_TRACKING_MESSAGES.emptyTimeLogged,
    );
    // No entry rows exist in the empty state.
    await expect(page.locator('[data-testid^="task-time-logged-entry-"]')).toHaveCount(0);
  });

  // -----------------------------------------------------------------------------------
  // TC-15-E2E-07 — Start timer from task detail page.
  // -----------------------------------------------------------------------------------
  test('TC-15-E2E-07: start timer from task detail page', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');
    const user = await findMember(request, org.organizationId, userEmail);
    const mob = await createProject(request, org.organizationId, 'Mobile App', 'MOB');
    await assignProjectMembersViaApi(request, org.organizationId, mob.id, [user.id]);
    const task = await createTaskViaApi(request, org.organizationId, mob.id, {
      type: 'task', title: 'Fix login bug',
    });

    await signInUi(page, userEmail);
    await page.goto(`/org/${org.organizationId}/projects/${mob.id}/tasks/${task.id}`);
    await expect(page.getByTestId('task-detail')).toBeVisible();

    // 1. Start Timer button visible; click it.
    await expect(page.getByTestId('task-start-timer-btn')).toBeVisible();
    await page.getByTestId('task-start-timer-btn').click();

    // 2. Toast "Timer started".
    await expect(page.getByTestId('toast-timer-started')).toBeVisible();
    await expect(page.getByTestId('toast-timer-started')).toHaveText(
      TIME_TRACKING_MESSAGES.toastTimerStarted,
    );

    // 3. Topbar indicator appears.
    await expect(page.getByTestId('topbar-timer-indicator')).toBeVisible();

    // 4. The Start Timer button swaps for the "Timer running →" link.
    await expect(page.getByTestId('task-start-timer-btn')).toHaveCount(0);
    await expect(page.getByTestId('task-timer-running-link')).toBeVisible();

    // 5–6. Navigate to Time Tracking → timer panel shows the running state with the
    //      task pre-filled (chip in the task selector carries the linked task title).
    await openTimeTracking(page);
    await expect(page.getByTestId('tt-timer-elapsed')).toHaveText(/00:00:0[1-9]/);
    await expect(page.getByTestId('tt-timer-task-selector')).toContainText('Fix login bug');
  });

  // -----------------------------------------------------------------------------------
  // TC-15-E2E-08 — Start Timer replaced by "Timer running" when a timer is running.
  // -----------------------------------------------------------------------------------
  test('TC-15-E2E-08: Start Timer disabled when a timer is already running', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');
    const user = await findMember(request, org.organizationId, userEmail);
    const mob = await createProject(request, org.organizationId, 'Mobile App', 'MOB');
    await assignProjectMembersViaApi(request, org.organizationId, mob.id, [user.id]);
    const other = await createTaskViaApi(request, org.organizationId, mob.id, {
      type: 'task', title: 'Different task',
    });

    // Start a running timer for the user via the API — the specifics are irrelevant,
    // only that the caller has one active when the task page loads.
    await login(request, userEmail);
    await startTimerViaApi(request, org.organizationId, { task: 'Something else' });

    await signInUi(page, userEmail);
    await page.goto(`/org/${org.organizationId}/projects/${mob.id}/tasks/${other.id}`);
    await expect(page.getByTestId('task-detail')).toBeVisible();

    // 2. Start Timer is absent; "Timer running →" link is shown instead.
    await expect(page.getByTestId('task-start-timer-btn')).toHaveCount(0);
    await expect(page.getByTestId('task-timer-running-link')).toBeVisible();

    // 3–4. Clicking the link navigates to the Time Tracking page.
    await page.getByTestId('task-timer-running-link').click();
    await page.waitForURL('**/time-tracking');
    await expect(page.getByTestId('tt-page')).toBeVisible();
  });

  // -----------------------------------------------------------------------------------
  // TC-15-E2E-09 — Admin sees all members' time logged on a task.
  // -----------------------------------------------------------------------------------
  test('TC-15-E2E-09: admin sees all members\' time logged on a task', async ({ page, request }) => {
    const today = todayISO();
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const alexEmail = await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');
    const janeEmail = await addMember(request, adminEmail, 'user', 'Jane', 'Doe');
    const alex = await findMember(request, org.organizationId, alexEmail);
    const jane = await findMember(request, org.organizationId, janeEmail);
    const mob = await createProject(request, org.organizationId, 'Mobile App', 'MOB');
    await assignProjectMembersViaApi(request, org.organizationId, mob.id, [alex.id, jane.id]);
    const task = await createTaskViaApi(request, org.organizationId, mob.id, {
      type: 'task', title: 'Fix login bug',
    });
    // Admin creates one entry per member on their behalf — total 60 + 90 = 150 = "2h 30m".
    await createTaskLinkedEntryViaApi(request, org.organizationId, {
      membershipId: alex.id, projectId: mob.id, taskId: task.id, date: today,
      durationMinutes: 60,
    });
    await createTaskLinkedEntryViaApi(request, org.organizationId, {
      membershipId: jane.id, projectId: mob.id, taskId: task.id, date: today,
      durationMinutes: 90,
    });

    await signInUi(page, adminEmail);
    await page.goto(`/org/${org.organizationId}/projects/${mob.id}/tasks/${task.id}`);
    await expect(page.getByTestId('task-detail')).toBeVisible();

    // Combined total, both member names in the list.
    await expect(page.getByTestId('task-time-logged-total')).toHaveText('2h 30m');
    const rows = page.locator('[data-testid^="task-time-logged-entry-"]');
    await expect(rows).toHaveCount(2);
    const section = page.getByTestId('task-time-logged-section');
    await expect(section).toContainText('Alex Kaminski');
    await expect(section).toContainText('Jane Doe');
  });

  // -----------------------------------------------------------------------------------
  // TC-15-E2E-10 — `user` role sees only their own time logged on a task.
  // -----------------------------------------------------------------------------------
  test('TC-15-E2E-10: user sees only their own time logged on a task', async ({ page, request }) => {
    const today = todayISO();
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const umaEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');
    const alexEmail = await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');
    const uma = await findMember(request, org.organizationId, umaEmail);
    const alex = await findMember(request, org.organizationId, alexEmail);
    const mob = await createProject(request, org.organizationId, 'Mobile App', 'MOB');
    await assignProjectMembersViaApi(request, org.organizationId, mob.id, [uma.id, alex.id]);
    const task = await createTaskViaApi(request, org.organizationId, mob.id, {
      type: 'task', title: 'Fix login bug',
    });
    // Uma: 60 min (own). Alex: 90 min (other member) — Uma must not see Alex's.
    await createTaskLinkedEntryViaApi(request, org.organizationId, {
      membershipId: uma.id, projectId: mob.id, taskId: task.id, date: today,
      durationMinutes: 60,
    });
    await createTaskLinkedEntryViaApi(request, org.organizationId, {
      membershipId: alex.id, projectId: mob.id, taskId: task.id, date: today,
      durationMinutes: 90,
    });

    await signInUi(page, umaEmail);
    await page.goto(`/org/${org.organizationId}/projects/${mob.id}/tasks/${task.id}`);
    await expect(page.getByTestId('task-detail')).toBeVisible();

    // 60 minutes only → "1h 0m". Only one entry row, no reference to Alex.
    await expect(page.getByTestId('task-time-logged-total')).toHaveText('1h 0m');
    const rows = page.locator('[data-testid^="task-time-logged-entry-"]');
    await expect(rows).toHaveCount(1);
    const section = page.getByTestId('task-time-logged-section');
    await expect(section).not.toContainText('Alex Kaminski');
  });

  // -----------------------------------------------------------------------------------
  // TC-15-E2E-11 — Task selector hidden for projects without a board key.
  // -----------------------------------------------------------------------------------
  test('TC-15-E2E-11: task selector hidden for projects without a board key', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    // Legacy Ops — deliberately created WITHOUT a `key`. Spec 15 FR-15 requires that the
    // task selector never renders for a project without a board.
    await createProject(request, org.organizationId, 'Legacy Ops');

    await signInUi(page, adminEmail);
    await openTimeTracking(page);

    // 1–3. Open modal, pick Legacy Ops — no task selector.
    await page.getByTestId('tt-add-entry-btn').click();
    await expect(page.getByTestId('tt-entry-modal')).toBeVisible();
    await selectOption(page, 'tt-entry-project-select', 'Legacy Ops');
    await expect(page.getByTestId('tt-entry-task-selector')).toHaveCount(0);
    await expect(page.getByTestId('tt-entry-task-search-input')).toHaveCount(0);

    // Plain free-text `task` input is present and usable (spec 12 behavior).
    await expect(page.getByTestId('tt-entry-task-input')).toBeVisible();
    await page.getByTestId('tt-entry-task-input').fill('Legacy maintenance');

    // 4–5. Save (duration-only 30 min today) → entry saved successfully.
    await page.getByTestId('tt-entry-mode-duration').click();
    await page.getByTestId('tt-entry-duration-hours').fill('0');
    await page.getByTestId('tt-entry-duration-minutes').fill('30');
    await page.getByTestId('tt-entry-save-btn').click();
    await expect(page.getByTestId('toast-entry-saved')).toBeVisible();
    // Spec 16 changed the create toast to a differentiated string; a billable
    // create surfaces `toastEntryBillableLogged` ("Time logged.").
    await expect(page.getByTestId('toast-entry-saved')).toHaveText(TIME_TRACKING_MESSAGES.toastEntryBillableLogged);
    await expect(page.getByTestId('tt-entry-modal')).toHaveCount(0);

    // The entry is present in the daily view with the free-text task.
    await page.getByTestId('tt-view-daily').click();
    const row = page.locator('[data-testid^="tt-entry-row-"]').filter({ hasText: 'Legacy maintenance' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Legacy Ops');
  });
});
