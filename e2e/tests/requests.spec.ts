import { expect, test, type APIRequestContext, type Page } from './fixtures';
import {
  API,
  VALID,
  assignProjectMembersViaApi,
  configureFinancials,
  createProjectViaApi,
  findMember,
  inviteAndAcceptViaApi,
  login,
  removeMember,
  seedReserveCredit,
  setMembershipRole,
  requestTopicIdViaApi,
  signupOrg,
  submitVacationRequestViaApi,
  uniqueEmail,
} from './helpers';

/** Signs in through the UI and waits for the app shell to settle. */
async function signInUi(page: Page, email: string, password: string = VALID.password): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL('**/members');
}

/** Switches the browser to another account: drop the cookie, sign in again. */
async function switchUi(page: Page, email: string): Promise<void> {
  await page.context().clearCookies();
  await signInUi(page, email);
}

/**
 * Invites+accepts a member at `role` and returns their email. Accepting swaps the API
 * cookie jar to the new member, so this logs back in as the admin on both sides — every
 * call leaves the jar authenticated as the admin, ready for the next precondition.
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

/** Full-month financials matching the vacation specs: salary 3000, rate 40, 20 days. */
const FINANCIALS = {
  monthlySalary: 3000,
  clientHourlyRate: 40,
  vacationDaysPerYear: 20,
  currency: 'USD',
  isReservePercentManual: false,
} as const;

/** A range of exactly `workingDays` weekdays starting on a near-future Monday. */
function futureWorkingRange(workingDays: number): { startDate: string; endDate: string } {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() + 7);
  while (start.getDay() !== 1) start.setDate(start.getDate() + 1);
  const end = new Date(start);
  let counted = 1;
  while (counted < workingDays) {
    end.setDate(end.getDate() + 1);
    const dow = end.getDay();
    if (dow !== 0 && dow !== 6) counted += 1;
  }
  return { startDate: ymd(start), endDate: ymd(end) };
}

/** Local-date 'YYYY-MM-DD' — the format the native date input and the API both expect. */
function ymd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysFromToday(offset: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return ymd(date);
}

interface SeededRequest {
  id: string;
  number: number;
  status: string;
}

/**
 * Raises a request straight through the API as whoever the jar is signed in as — a
 * precondition, not the thing under test.
 */
async function createRequestViaApi(
  request: APIRequestContext,
  organizationId: string,
  body: Record<string, unknown>,
): Promise<SeededRequest> {
  // Requests spec 02: the topic is the only classifier a caller supplies, and the route
  // refuses a body carrying `type` or `accessKind`. The seeded `VPN` topic is the default
  // unless the caller names another.
  const topicId = body.topicId ?? (await requestTopicIdViaApi(request, organizationId));
  const response = await request.post(`${API}/api/organizations/${organizationId}/requests`, {
    data: { assigneeKind: 'member', ...body, topicId },
  });
  if (response.status() !== 201) {
    throw new Error(
      `Precondition failed: could not create request (${response.status()} ${await response.text()})`,
    );
  }
  return (await response.json()) as SeededRequest;
}

/** Moves a request through one of its transitions straight through the API. */
async function actOnRequestViaApi(
  request: APIRequestContext,
  organizationId: string,
  requestId: string,
  action: string,
  body: Record<string, unknown> = {},
): Promise<void> {
  const response = await request.post(
    `${API}/api/organizations/${organizationId}/requests/${requestId}/${action}`,
    { data: body },
  );
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: ${action} returned ${response.status()} ${await response.text()}`,
    );
  }
}

/** Edits a request straight through the API (the only route to a past needed-by date). */
async function patchRequestViaApi(
  request: APIRequestContext,
  organizationId: string,
  requestId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const response = await request.patch(
    `${API}/api/organizations/${organizationId}/requests/${requestId}`,
    { data: body },
  );
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: patch returned ${response.status()} ${await response.text()}`,
    );
  }
}

/** Clicks the sidebar Requests row and lands on the page. */
async function openRequestsPage(page: Page): Promise<void> {
  await expect(async () => {
    await page.getByTestId('sidebar-requests-link').click();
    await page.waitForURL('**/requests', { timeout: 2000 });
  }).toPass({ timeout: 15000 });
  await expect(page.getByTestId('requests-page')).toBeVisible();
}

/**
 * A promise for the shell's badge fetch — the un-parameterised `GET …/requests` the
 * badge provider makes on mount, which is what the sidebar count is computed from. The
 * list page's own call carries a query string and so does not match.
 *
 * Registered *before* the navigation that triggers it, and awaited before any assertion
 * about the badge being absent: the badge starts at 0 and is not rendered at 0, so an
 * absence asserted before the response has arrived passes whatever the server said.
 */
function badgeFetch(page: Page, organizationId: string): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/organizations/${organizationId}/requests`) &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  );
}

/** Picks a value from a DS `Select`: click the trigger, then the option by its label. */
async function chooseOption(page: Page, testId: string, label: string): Promise<void> {
  await page.getByTestId(testId).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

test.describe('requests/01 — Requests', () => {
  // TC-01-E2E-01 — the whole happy path, end to end, through two accounts.
  test('a user raises an access request, the admin answers it, the user grants it', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Sam', 'Dev');
    const sam = await findMember(request, org.organizationId, userEmail);
    const project = await createProjectViaApi(request, org.organizationId, 'Acme redesign');
    // A `user` sees only the projects they are assigned to, so the picker needs this.
    await assignProjectMembersViaApi(request, org.organizationId, project.id, [sam.id]);
    const admin = await findMember(request, org.organizationId, adminEmail);

    await signInUi(page, userEmail);
    await openRequestsPage(page);

    await page.getByTestId('requests-new-btn').click();
    await expect(page.getByTestId('request-new-modal')).toBeVisible();

    // The two retired controls are gone entirely; About is the only classifier.
    await expect(page.getByTestId('request-new-type')).toHaveCount(0);
    await expect(page.getByTestId('request-new-access-kind')).toHaveCount(0);
    await chooseOption(page, 'request-new-topic', 'Claude');
    await page.getByTestId('request-new-title').fill('Claude seat for the new hire');
    await page.getByTestId('request-new-description').fill('We need one more seat.');
    await chooseOption(page, 'request-new-project', 'Acme redesign');
    await chooseOption(page, 'request-new-assignee-member', 'Pat Owner');
    await chooseOption(page, 'request-new-priority', 'High');
    await page.getByTestId('request-new-needed-by').fill(daysFromToday(3));
    await page.getByTestId('request-new-blocking').click();

    await page.getByTestId('request-new-submit').click();
    await expect(page.getByTestId('request-new-modal')).toHaveCount(0);

    const row = page
      .locator(
        '[data-testid^="request-row-"]:not([data-testid*="-status"])' +
          ':not([data-testid*="-flag"]):not([data-testid*="-topic"])',
      )
      .first();
    await expect(row).toBeVisible();
    const rowTestId = await row.getAttribute('data-testid');
    const requestId = (rowTestId ?? '').replace('request-row-', '');
    expect(requestId.length).toBeGreaterThan(0);

    await expect(page.getByTestId(`request-row-${requestId}-status`)).toHaveText('Pending');
    await expect(page.getByTestId(`request-row-${requestId}-blocking-flag`)).toBeVisible();

    // The admin's inbox carries the same row, and the admin answers it.
    await switchUi(page, adminEmail);
    await openRequestsPage(page);
    await expect(page.getByTestId(`request-row-${requestId}`)).toBeVisible();
    await page.getByTestId(`request-row-${requestId}`).click();

    await expect(page.getByTestId('request-detail-page')).toBeVisible();
    await expect(page.getByTestId('request-detail-title')).toHaveText(
      'Claude seat for the new hire',
    );
    await page.getByTestId('request-detail-composer').fill('Buying it now.');
    await page.getByTestId('request-detail-composer-submit').click();
    await expect(page.getByTestId('request-detail-thread')).toContainText('Buying it now.');

    await page.getByTestId('request-detail-answer-btn').click();
    await expect(page.getByTestId('request-detail-status')).toHaveText('In progress');
    await expect(page.getByTestId('request-detail-history')).toContainText('created the request');

    // Only the requester can confirm that the access works.
    await switchUi(page, userEmail);
    await page.goto(`/org/${org.organizationId}/requests/${requestId}`);
    await expect(page.getByTestId('request-detail-status')).toHaveText('In progress');
    await page.getByTestId('request-detail-grant-btn').click();
    await expect(page.getByTestId('request-detail-status')).toHaveText('Completed');

    // A terminal request draws no composer and no action at all.
    await expect(page.getByTestId('request-detail-composer')).toHaveCount(0);
    await expect(page.getByTestId('request-detail-grant-btn')).toHaveCount(0);

    expect(admin.id.length).toBeGreaterThan(0);
  });

  // TC-01-E2E-02 — an invalid submission shows every error and never disables the CTA.
  test('an invalid new-request form shows every error and focuses the first field', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    await signInUi(page, adminEmail);
    await openRequestsPage(page);

    await page.getByTestId('requests-new-btn').click();
    await expect(page.getByTestId('request-new-modal')).toBeVisible();
    await expect(page.getByTestId('request-new-topic')).toBeVisible();

    // The submit control is enabled before the click — validation never disables it.
    await expect(page.getByTestId('request-new-submit')).toBeEnabled();
    await page.getByTestId('request-new-submit').click();

    // Every error at once, and the topic is now the first field in reading order, so it
    // is the one that takes focus.
    await expect(page.getByTestId('request-new-error-title')).toBeVisible();
    await expect(page.getByTestId('request-new-error-topic')).toBeVisible();
    await expect(page.getByTestId('request-new-topic')).toBeFocused();
    await expect(page.getByTestId('request-new-submit')).toBeEnabled();
  });

  // TC-01-E2E-03 — a viewer has an inbox, and no control they cannot use.
  test('a viewer sees the page and their own request, and no create or scope control', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const viewerEmail = await addMember(request, adminEmail, 'user', 'Vi', 'Reader');
    await setMembershipRole(request, org.organizationId, viewerEmail, 'viewer');
    const viewer = await findMember(request, org.organizationId, viewerEmail);

    const seeded = await createRequestViaApi(request, org.organizationId, {
      title: 'Read access to the wiki',
      assigneeMembershipId: viewer.id,
    });

    await signInUi(page, viewerEmail);
    await expect(page.getByTestId('sidebar-requests-link')).toBeVisible();
    await openRequestsPage(page);

    await expect(page.getByTestId(`request-row-${seeded.id}`)).toBeVisible();
    await expect(page.getByTestId('requests-new-btn')).toHaveCount(0);
    await expect(page.getByTestId('requests-scope-toggle')).toHaveCount(0);
  });

  // TC-01-E2E-04 — the default order: blocking first, then overdue, then the rest.
  test('the list orders blocking above overdue above an ordinary request', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const admin = await findMember(request, org.organizationId, adminEmail);

    const ordinary = await createRequestViaApi(request, org.organizationId, {
      title: 'Ordinary request',
      assigneeMembershipId: admin.id,
    });
    const overdue = await createRequestViaApi(request, org.organizationId, {
      title: 'Overdue request',
      assigneeMembershipId: admin.id,
      neededBy: daysFromToday(2),
    });
    // Requirement 8 scopes the past-date rule to creation: a date may become past
    // afterwards, and that is exactly what makes a request overdue.
    await patchRequestViaApi(request, org.organizationId, overdue.id, { neededBy: '2020-01-01' });
    const blocking = await createRequestViaApi(request, org.organizationId, {
      title: 'Blocking request',
      assigneeMembershipId: admin.id,
      blocking: true,
    });

    await signInUi(page, adminEmail);
    await openRequestsPage(page);

    // The row containers only: the status badge, the two flags and — since requests
    // spec 02 — the About cell all carry ids that begin with the same prefix.
    const rows = page.locator(
      '[data-testid^="request-row-"]:not([data-testid*="-status"])' +
        ':not([data-testid*="-flag"]):not([data-testid*="-topic"])',
    );
    await expect(rows).toHaveCount(3);
    const order = await rows.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-testid')),
    );
    expect(order).toEqual([
      `request-row-${blocking.id}`,
      `request-row-${overdue.id}`,
      `request-row-${ordinary.id}`,
    ]);

    await expect(page.getByTestId(`request-row-${blocking.id}-blocking-flag`)).toBeVisible();
    await expect(page.getByTestId(`request-row-${overdue.id}-overdue-flag`)).toBeVisible();
  });

  // TC-01-E2E-05 — a decline needs a reason, and the reason lands in the thread.
  test('declining requires a reason and records it as the last message', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Sam', 'Dev');
    const admin = await findMember(request, org.organizationId, adminEmail);

    await login(request, userEmail);
    const seeded = await createRequestViaApi(request, org.organizationId, {
      title: 'Production database access',
      assigneeMembershipId: admin.id,
    });
    await login(request, adminEmail);

    await signInUi(page, adminEmail);
    await page.goto(`/org/${org.organizationId}/requests/${seeded.id}`);
    await expect(page.getByTestId('request-detail-page')).toBeVisible();

    await page.getByTestId('request-detail-decline-btn').click();
    await page.getByTestId('request-detail-decline-confirm').click();
    // An empty reason renders the field error and changes nothing at all. Asserting that the
    // reason field is still visible would pass for a modal rendering no error whatsoever; the
    // status code and the message text are TC-01-INT-12's.
    await expect(page.getByTestId('request-detail-decline-error')).toBeVisible();
    await expect(page.getByTestId('request-detail-status')).toHaveText('Pending');

    await page.getByTestId('request-detail-decline-reason').fill('Nobody gets production.');
    await page.getByTestId('request-detail-decline-confirm').click();

    // The four words, with the closure reason beside the one that closed (REQ-02-029).
    await expect(page.getByTestId('request-detail-status')).toHaveText('Closed · declined');
    await expect(page.getByTestId('request-detail-thread')).toContainText(
      'Nobody gets production.',
    );
    await expect(page.getByTestId('request-detail-composer')).toHaveCount(0);
  });

  // TC-01-E2E-06 — a cancelled request offers the addressee nothing.
  test('a cancelled request leaves the addressee no action and no composer', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Sam', 'Dev');
    const admin = await findMember(request, org.organizationId, adminEmail);

    await login(request, userEmail);
    const seeded = await createRequestViaApi(request, org.organizationId, {
      title: 'A request that will be withdrawn',
      assigneeMembershipId: admin.id,
    });
    await login(request, adminEmail);

    await signInUi(page, userEmail);
    await page.goto(`/org/${org.organizationId}/requests/${seeded.id}`);
    await page.getByTestId('request-detail-cancel-btn').click();
    await expect(page.getByTestId('request-detail-status')).toHaveText('Closed · cancelled');

    await switchUi(page, adminEmail);
    await page.goto(`/org/${org.organizationId}/requests/${seeded.id}`);
    await expect(page.getByTestId('request-detail-status')).toHaveText('Closed · cancelled');
    await expect(page.getByTestId('request-detail-answer-btn')).toHaveCount(0);
    await expect(page.getByTestId('request-detail-composer')).toHaveCount(0);
  });

  // TC-01-E2E-07 — the history is the trail, and a reassignment names both people.
  test('the history lists creation, the status change and the reassignment', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const patEmail = await addMember(request, adminEmail, 'user', 'Pat', 'Member');
    const robinEmail = await addMember(request, adminEmail, 'user', 'Robin', 'Ops');
    const pat = await findMember(request, org.organizationId, patEmail);
    const robin = await findMember(request, org.organizationId, robinEmail);

    const seeded = await createRequestViaApi(request, org.organizationId, {
      title: 'VPN access',
      assigneeMembershipId: pat.id,
    });
    await login(request, patEmail);
    await actOnRequestViaApi(request, org.organizationId, seeded.id, 'answer');
    await login(request, adminEmail);

    await signInUi(page, adminEmail);
    await page.goto(`/org/${org.organizationId}/requests/${seeded.id}`);
    await expect(page.getByTestId('request-detail-assignee')).toContainText('Pat Member');
    // The control the spec names is offered to an admin on a non-terminal request.
    await expect(page.getByTestId('request-detail-reassign-btn')).toBeVisible();

    await actOnRequestViaApi(request, org.organizationId, seeded.id, 'reassign', {
      assigneeKind: 'member',
      assigneeMembershipId: robin.id,
    });
    await page.reload();

    await expect(page.getByTestId('request-detail-assignee')).toContainText('Robin Ops');
    const history = page.getByTestId('request-detail-history');
    await expect(history).toContainText('created the request');
    // The four words in the trail too: the entry used to print the raw stored value.
    await expect(history).toContainText('marked it In progress');
    await expect(history).toContainText('Pat Member');
    await expect(history).toContainText('Robin Ops');
  });

  // TC-01-E2E-08 — the vacation section and the scope control are the two inner gates.
  test('an admin sees the vacation section and the scope control; a user sees neither', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Sam', 'Dev');
    const sam = await findMember(request, org.organizationId, userEmail);

    await configureFinancials(request, org.organizationId, sam.id, FINANCIALS);
    await seedReserveCredit(request, userEmail, 1400);
    await login(request, userEmail);
    await submitVacationRequestViaApi(request, org.organizationId, sam.id, futureWorkingRange(3));
    await login(request, adminEmail);

    await signInUi(page, adminEmail);
    await openRequestsPage(page);
    await expect(page.getByTestId('requests-vacation-section')).toBeVisible();
    await expect(page.getByTestId('requests-scope-toggle')).toBeVisible();

    await switchUi(page, userEmail);
    await openRequestsPage(page);
    // `requests-page` is the outer div and is drawn before any fetch, so an absence
    // asserted straight after it holds while the list request is still in flight. The
    // empty state renders only from a response that has arrived, and the vacation
    // section is drawn from `data.vacation` in that same render — so once this is on
    // screen, a vacation block wrongly returned to a `user` would be on screen with it.
    await expect(page.getByTestId('requests-empty-state')).toBeVisible();
    await expect(page.getByTestId('requests-vacation-section')).toHaveCount(0);
    await expect(page.getByTestId('requests-scope-toggle')).toHaveCount(0);
  });

  // TC-01-E2E-09 — a removed addressee cancels nothing and asks to be reassigned.
  test('a removed addressee leaves the request open behind an inactive banner', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const patEmail = await addMember(request, adminEmail, 'user', 'Pat', 'Member');
    const pat = await findMember(request, org.organizationId, patEmail);

    const seeded = await createRequestViaApi(request, org.organizationId, {
      title: 'Server access',
      assigneeMembershipId: pat.id,
    });

    await signInUi(page, adminEmail);
    await page.goto(`/org/${org.organizationId}/members`);
    await removeMember(request, org.organizationId, pat.id);

    await page.goto(`/org/${org.organizationId}/requests/${seeded.id}`);
    await expect(page.getByTestId('request-detail-assignee-inactive-banner')).toBeVisible();
    await expect(page.getByTestId('request-detail-reassign-btn')).toBeVisible();
    await expect(page.getByTestId('request-detail-status')).toHaveText('Pending');
  });

  // TC-01-E2E-10 — the nav row, for every role. The regression witness for requirement 38:
  // before this spec a `user` counted zero of them.
  test('the sidebar Requests row is present for all four roles', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const managerEmail = await addMember(request, adminEmail, 'manager', 'Morgan', 'Lee');
    const userEmail = await addMember(request, adminEmail, 'user', 'Sam', 'Dev');
    const viewerEmail = await addMember(request, adminEmail, 'user', 'Vi', 'Reader');
    await setMembershipRole(request, org.organizationId, viewerEmail, 'viewer');

    for (const email of [adminEmail, managerEmail, userEmail, viewerEmail]) {
      await switchUi(page, email);
      await expect(page.getByTestId('sidebar-requests-link')).toHaveCount(1);
    }
  });

  // TC-01-E2E-11 — the badge counts the work waiting on the caller, and nothing else.
  test('the badge appears at two and goes away once both are granted', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Sam', 'Dev');
    const admin = await findMember(request, org.organizationId, adminEmail);

    const firstCount = badgeFetch(page, org.organizationId);
    await signInUi(page, adminEmail);
    await firstCount;
    await expect(page.getByTestId('sidebar-requests-link')).toBeVisible();
    await expect(page.getByTestId('sidebar-requests-badge')).toHaveCount(0);

    await login(request, userEmail);
    const first = await createRequestViaApi(request, org.organizationId, {
      title: 'First ask',
      assigneeMembershipId: admin.id,
    });
    const second = await createRequestViaApi(request, org.organizationId, {
      title: 'Second ask',
      assigneeMembershipId: admin.id,
    });

    await page.reload();
    await expect(page.getByTestId('sidebar-requests-badge')).toHaveText('2');

    // Only the requester grants — the badge empties because the work is done, not
    // because the view changed.
    await actOnRequestViaApi(request, org.organizationId, first.id, 'grant');
    await actOnRequestViaApi(request, org.organizationId, second.id, 'grant');
    await login(request, adminEmail);

    const finalCount = badgeFetch(page, org.organizationId);
    await page.reload();
    await finalCount;
    await expect(page.getByTestId('sidebar-requests-link')).toBeVisible();
    // The list is opened as a second anchor: its rows come from a response issued after
    // the count response above had already arrived, so the badge has been given its
    // value by the time they are on screen. A server that still counted the two granted
    // requests as waiting would have drawn the badge into this same DOM.
    await openRequestsPage(page);
    await expect(page.getByTestId(`request-row-${first.id}-status`)).toHaveText('Completed');
    await expect(page.getByTestId(`request-row-${second.id}-status`)).toHaveText('Completed');
    await expect(page.getByTestId('sidebar-requests-badge')).toHaveCount(0);
  });

  // TC-01-E2E-12 — a failed reload keeps the last good list on screen behind the banner.
  test('a failed list request shows the error banner and keeps the rows', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const admin = await findMember(request, org.organizationId, adminEmail);
    const seeded = await createRequestViaApi(request, org.organizationId, {
      title: 'A request that stays on screen',
      assigneeMembershipId: admin.id,
    });

    await signInUi(page, adminEmail);
    await openRequestsPage(page);
    await expect(page.getByTestId(`request-row-${seeded.id}`)).toBeVisible();
    await expect(page.getByTestId('requests-loading-skeleton')).toHaveCount(0);

    // Fail the list request in the browser rather than by stopping the API: the retry
    // has to reach a server that is still there.
    let failing = true;
    await page.route(/\/api\/organizations\/[^/]+\/requests(\?.*)?$/, async (route) => {
      // Aborted rather than answered 500: the page treats both the same way, and a 5xx
      // reaching the browser is what the suite's page-error guard is there to catch.
      if (failing) {
        await route.abort('aborted');
        return;
      }
      await route.continue();
    });

    await page.getByTestId('requests-status-filter').click();
    await page.getByRole('option', { name: 'Pending', exact: true }).click();

    await expect(page.getByTestId('requests-error-banner')).toBeVisible();
    await expect(page.getByTestId('requests-error-retry-btn')).toBeVisible();
    await expect(page.getByTestId(`request-row-${seeded.id}`)).toBeVisible();

    failing = false;
    await page.getByTestId('requests-error-retry-btn').click();
    await expect(page.getByTestId('requests-error-banner')).toHaveCount(0);
    await expect(page.getByTestId(`request-row-${seeded.id}`)).toBeVisible();
  });

  // TC-01-E2E-13 — the two empty states say different things, and the counter is what
  // tells them apart.
  test('an empty filtered list and an empty inbox use different copy', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Sam', 'Dev');
    const admin = await findMember(request, org.organizationId, adminEmail);
    await createRequestViaApi(request, org.organizationId, {
      title: 'The only request there is',
      assigneeMembershipId: admin.id,
    });

    await signInUi(page, adminEmail);
    await openRequestsPage(page);

    await page.getByTestId('requests-status-filter').click();
    await page.getByRole('option', { name: 'Completed', exact: true }).click();
    await expect(page.getByTestId('requests-empty-state')).toHaveText(
      /No requests match these filters\./,
    );

    // An account with no requests at all gets the other message, unfiltered.
    await switchUi(page, userEmail);
    await openRequestsPage(page);
    await expect(page.getByTestId('requests-empty-state')).toHaveText(
      /Nothing is waiting on you\./,
    );
  });
});
