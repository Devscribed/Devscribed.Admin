import { expect, test, type APIRequestContext, type Page } from './fixtures';
import {
  API,
  VALID,
  archiveRequestTopicViaApi,
  findMember,
  inviteAndAcceptViaApi,
  listRequestTopicsViaApi,
  login,
  openNavSection,
  requestTopicIdViaApi,
  signupOrg,
  uniqueEmail,
} from './helpers';

/**
 * The spec's Error Messages table, verbatim. Asserted literally rather than through the
 * constant the code imports, so the assertion can fail when the wording drifts.
 */
const COPY = {
  nameDuplicate: 'A topic with this name already exists for this audience',
  pickerEmpty: 'No request topics are available. An admin or manager can add one in Settings.',
} as const;

/** Signs in through the UI and waits for the app shell to settle. */
async function signInUi(page: Page, email: string, password: string = VALID.password) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL('**/members');
}

/**
 * Invites+accepts a member at `role` and returns their email. Accepting swaps the API
 * cookie jar to the new member, so this logs back in as the admin on both sides.
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

/** Picks a value from a DS `Select`: click the trigger, then the option by its label. */
async function chooseOption(page: Page, testId: string, label: string): Promise<void> {
  await page.getByTestId(testId).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

/** Raises a request straight through the API — a precondition, not the thing under test. */
async function createRequestViaApi(
  request: APIRequestContext,
  organizationId: string,
  body: Record<string, unknown>,
): Promise<{ id: string; number: number }> {
  const response = await request.post(
    `${API}/api/organizations/${organizationId}/requests`,
    { data: { assigneeKind: 'member', ...body } },
  );
  if (response.status() !== 201) {
    throw new Error(
      `Precondition failed: could not create request (${response.status()} ${await response.text()})`,
    );
  }
  return (await response.json()) as { id: string; number: number };
}

test.describe('requests/02 — Request topics & vocabulary', () => {
  // TC-02-E2E-01 — the whole catalogue screen: reach it, switch audience, add, refuse a
  // duplicate, rename, reorder, archive and restore.
  test('an admin curates the catalogue from the Settings row', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    // Already ordered by the API: sortOrder ascending, then name.
    const seeded = await listRequestTopicsViaApi(request, org.organizationId);
    const staff = seeded.filter((topic) => topic.audience === 'staff');

    await signInUi(page, adminEmail);

    // The navigation row is the way in — no typed address. It sits in the rail's
    // `Organization` group, which is opened first: a closed group holds no rows.
    await openNavSection(page, 'Organization');
    await page.getByTestId('settings-tab-request-topics').click();
    await expect(page.getByTestId('request-topics-page')).toBeVisible();

    // The seeded staff topics, in order.
    const rows = page.locator(
      '[data-testid^="request-topic-row-"]:not([data-testid$="-up-btn"])' +
        ':not([data-testid$="-down-btn"]):not([data-testid$="-rename-btn"])' +
        ':not([data-testid$="-archive-btn"]):not([data-testid$="-restore-btn"])',
    );
    await expect(rows).toHaveCount(9);
    const order = await rows.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-testid')),
    );
    expect(order).toEqual(staff.map((topic) => `request-topic-row-${topic.id}`));

    // The audience switch, there and back.
    await page.getByTestId('request-topics-audience-client').click();
    await expect(rows).toHaveCount(2);
    await page.getByTestId('request-topics-audience-staff').click();
    await expect(rows).toHaveCount(9);

    // Add a topic. Both the audience and the kind controls are drawn while adding.
    await page.getByTestId('request-topics-add-btn').click();
    await expect(page.getByTestId('request-topic-modal')).toBeVisible();
    await expect(page.getByTestId('request-topic-audience')).toBeVisible();
    await expect(page.getByTestId('request-topic-type')).toBeVisible();
    await page.getByTestId('request-topic-name').fill('Figma seat');
    await chooseOption(page, 'request-topic-type', 'Access');
    await page.getByTestId('request-topic-submit').click();
    await expect(page.getByTestId('request-topic-modal')).toHaveCount(0);
    await expect(rows).toHaveCount(10);

    // The same name in a different case keeps the modal open, with the duplicate message
    // under the field and the typed value in place.
    await page.getByTestId('request-topics-add-btn').click();
    await page.getByTestId('request-topic-name').fill('figma SEAT');
    await page.getByTestId('request-topic-submit').click();
    await expect(page.getByTestId('request-topic-error-name')).toHaveText(COPY.nameDuplicate);
    await expect(page.getByTestId('request-topic-modal')).toBeVisible();
    await expect(page.getByTestId('request-topic-name')).toHaveValue('figma SEAT');
    // Left without saving. The DS `Modal` offers no keyboard dismissal, so the way off
    // this screen is the screen itself — which is also what proves the refused create
    // wrote nothing: the count below is taken from a freshly loaded catalogue.
    await page.reload();
    await expect(page.getByTestId('request-topics-page')).toBeVisible();
    await expect(page.getByTestId('request-topic-modal')).toHaveCount(0);
    await expect(rows).toHaveCount(10);

    // The rename modal carries the row's stored name and draws neither the audience nor
    // the kind control.
    const third = staff[2];
    await page.getByTestId(`request-topic-row-${third.id}-rename-btn`).click();
    await expect(page.getByTestId('request-topic-modal')).toBeVisible();
    await expect(page.getByTestId('request-topic-name')).toHaveValue(third.name);
    await expect(page.getByTestId('request-topic-audience')).toHaveCount(0);
    await expect(page.getByTestId('request-topic-type')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('request-topics-page')).toBeVisible();
    await expect(page.getByTestId('request-topic-modal')).toHaveCount(0);

    // Every active row carries a rename control and the ordering controls, and no drag
    // handle — except that the first draws no up control and the last no down one.
    await expect(page.getByTestId(`request-topic-row-${staff[0].id}-up-btn`)).toHaveCount(0);
    await expect(page.getByTestId(`request-topic-row-${third.id}-up-btn`)).toBeVisible();
    await expect(page.getByTestId(`request-topic-row-${third.id}-down-btn`)).toBeVisible();
    await expect(page.locator('[draggable="true"]')).toHaveCount(0);

    // The up press moves that row above the one that was second, and moves no other row.
    await page.getByTestId(`request-topic-row-${third.id}-up-btn`).click();
    await expect
      .poll(async () =>
        (await rows.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-testid'))))
          .indexOf(`request-topic-row-${third.id}`),
      )
      .toBe(1);
    const afterMove = await listRequestTopicsViaApi(request, org.organizationId);
    for (const topic of staff) {
      if (topic.id === third.id) continue;
      expect(afterMove.find((t) => t.id === topic.id)!.sortOrder).toBe(topic.sortOrder);
    }

    // Archive moves the row to the archived list; restore moves it back.
    const last = staff[staff.length - 1];
    await page.getByTestId(`request-topic-row-${last.id}-archive-btn`).click();
    await expect(page.getByTestId(`request-topic-row-${last.id}-restore-btn`)).toBeVisible();
    // The archived row draws none of the three.
    await expect(page.getByTestId(`request-topic-row-${last.id}-up-btn`)).toHaveCount(0);
    await expect(page.getByTestId(`request-topic-row-${last.id}-down-btn`)).toHaveCount(0);
    await expect(page.getByTestId(`request-topic-row-${last.id}-rename-btn`)).toHaveCount(0);

    await page.getByTestId(`request-topic-row-${last.id}-restore-btn`).click();
    await expect(page.getByTestId(`request-topic-row-${last.id}-archive-btn`)).toBeVisible();
    await expect(page.getByTestId(`request-topic-row-${last.id}-restore-btn`)).toHaveCount(0);
  });

  // TC-02-E2E-02 — the topic is what a requester chooses, and no kind control is drawn.
  test('raising a request needs a topic and shows it on the row and the detail', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Sam');

    await signInUi(page, userEmail);
    await page.goto(`/org/${org.organizationId}/requests`);
    await expect(page.getByTestId('requests-page')).toBeVisible();

    await page.getByTestId('requests-new-btn').click();
    await expect(page.getByTestId('request-new-modal')).toBeVisible();

    // No control for a request kind or an access kind anywhere in the modal.
    await expect(page.getByTestId('request-new-type')).toHaveCount(0);
    await expect(page.getByTestId('request-new-access-kind')).toHaveCount(0);

    // PATCH-003 — the addressee kind is no longer defaulted, and everything below it is
    // disabled until it is chosen.
    await chooseOption(page, 'request-new-assignee-kind', 'Colleague');

    await page.getByTestId('request-new-title').fill('Claude seat for the new hire');
    await chooseOption(page, 'request-new-assignee-member', 'Pat Owner');

    // Submitted with no topic: the error is drawn, the picker takes focus, and the
    // submit control stays enabled.
    await page.getByTestId('request-new-submit').click();
    await expect(page.getByTestId('request-new-error-topic')).toBeVisible();
    await expect(page.getByTestId('request-new-topic')).toBeFocused();
    await expect(page.getByTestId('request-new-submit')).toBeEnabled();

    await chooseOption(page, 'request-new-topic', 'Claude');
    await page.getByTestId('request-new-submit').click();
    await expect(page.getByTestId('request-new-modal')).toHaveCount(0);

    const row = page
      .locator(
        '[data-testid^="request-row-"]:not([data-testid*="-status"])' +
          ':not([data-testid*="-flag"]):not([data-testid*="-topic"])',
      )
      .first();
    await expect(row).toBeVisible();
    const requestId = ((await row.getAttribute('data-testid')) ?? '').replace('request-row-', '');

    await expect(page.getByTestId(`request-row-${requestId}-topic`)).toHaveText('Claude');
    await row.click();
    await expect(page.getByTestId('request-detail-topic')).toHaveText('Claude');
  });

  // TC-02-E2E-03 — the picker and the filter answer different questions, so they read
  // the catalogue differently.
  test('an archived topic leaves the picker and stays in the list filter', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const admin = await findMember(request, org.organizationId, adminEmail);
    const vpn = await requestTopicIdViaApi(request, org.organizationId, 'VPN');

    const seeded = await createRequestViaApi(request, org.organizationId, {
      topicId: vpn,
      title: 'VPN profile for the new hire',
      assigneeMembershipId: admin.id,
    });
    await archiveRequestTopicViaApi(request, org.organizationId, vpn);

    await signInUi(page, adminEmail);
    await page.goto(`/org/${org.organizationId}/requests`);
    await expect(page.getByTestId('requests-page')).toBeVisible();

    // The picker no longer offers it: it reads `status=active`. PATCH-003 — the
    // addressee kind is chosen first, since the picker is disabled until it is.
    await page.getByTestId('requests-new-btn').click();
    await chooseOption(page, 'request-new-assignee-kind', 'Colleague');
    await page.getByTestId('request-new-topic').click();
    await expect(page.getByRole('option', { name: 'VPN', exact: true })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'Claude', exact: true })).toBeVisible();
    // Closed by leaving it: the DS `Modal` offers no keyboard dismissal.
    await page.goto(`/org/${org.organizationId}/requests`);
    await expect(page.getByTestId('requests-page')).toBeVisible();
    await expect(page.getByTestId('request-new-modal')).toHaveCount(0);

    // The filter still offers it, marked archived, and selecting it still returns the
    // request raised under it: that control reads `status=all`.
    await page.getByTestId('requests-topic-filter').click();
    await page.getByRole('option', { name: 'VPN (archived)', exact: true }).click();
    await expect(page.getByTestId(`request-row-${seeded.id}`)).toBeVisible();

    // The detail screen shows the snapshot name with the archived marker beside it.
    await page.getByTestId(`request-row-${seeded.id}`).click();
    await expect(page.getByTestId('request-detail-topic')).toHaveText('VPN (archived)');
  });

  // TC-02-E2E-04 — the four words, on every surface that shows a request's status.
  test('the list, the filter, the detail header and the history use the four words', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Sam');
    const admin = await findMember(request, org.organizationId, adminEmail);
    const vpn = await requestTopicIdViaApi(request, org.organizationId, 'VPN');

    await login(request, userEmail);
    const build = async (title: string) =>
      createRequestViaApi(request, org.organizationId, {
        topicId: vpn,
        title,
        assigneeMembershipId: admin.id,
      });
    const open = await build('Still open');
    const answered = await build('Being handled');
    const granted = await build('All done');
    const cancelled = await build('Never mind');

    const act = async (id: string, action: string, as: string) => {
      await login(request, as);
      const response = await request.post(
        `${API}/api/organizations/${org.organizationId}/requests/${id}/${action}`,
        { data: {} },
      );
      if (!response.ok()) {
        throw new Error(`Precondition failed: ${action} returned ${response.status()}`);
      }
    };
    await act(answered.id, 'answer', adminEmail);
    await act(granted.id, 'grant', userEmail);
    await act(cancelled.id, 'cancel', userEmail);
    await login(request, adminEmail);

    await signInUi(page, adminEmail);
    await page.goto(`/org/${org.organizationId}/requests`);
    await expect(page.getByTestId('requests-page')).toBeVisible();

    await expect(page.getByTestId(`request-row-${open.id}-status`)).toHaveText('Pending');
    await expect(page.getByTestId(`request-row-${answered.id}-status`)).toHaveText('In progress');
    await expect(page.getByTestId(`request-row-${granted.id}-status`)).toHaveText('Completed');
    // Containment: the closed row carries the closure reason beside the word, as the
    // Screens mock draws it (REQ-02-029).
    await expect(page.getByTestId(`request-row-${cancelled.id}-status`)).toContainText('Closed');
    await expect(page.getByTestId(`request-row-${cancelled.id}-status`)).toContainText(
      'cancelled',
    );

    // The filter offers exactly the four words plus an all-statuses entry, and no more.
    await page.getByTestId('requests-status-filter').click();
    const options = page.getByRole('option');
    await expect(options).toHaveCount(5);
    await expect(options).toHaveText([
      'All statuses',
      'Pending',
      'In progress',
      'Completed',
      'Closed',
    ]);
    await page.getByRole('option', { name: 'Closed', exact: true }).click();
    await expect(page.getByTestId(`request-row-${cancelled.id}`)).toBeVisible();
    await expect(page.getByTestId(`request-row-${open.id}`)).toHaveCount(0);

    await page.getByTestId(`request-row-${cancelled.id}`).click();
    await expect(page.getByTestId('request-detail-status')).toHaveText('Closed · cancelled');
    // The trail reads the word, not the stored value.
    await expect(page.getByTestId('request-detail-history')).toContainText('marked it Closed');
    await expect(page.getByTestId('request-detail-history')).not.toContainText(
      'marked it cancelled',
    );
  });

  // TC-02-E2E-05 — a destination a caller cannot use is not drawn, and typing it lands
  // them somewhere they can.
  test('a user sees no Request topics row and cannot reach the address', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Sam');

    await signInUi(page, userEmail);
    await expect(page.getByTestId('settings-tab-request-topics')).toHaveCount(0);

    await page.goto(`/org/${org.organizationId}/settings/request-topics`);
    await page.waitForURL('**/members');
    await expect(page.getByTestId('request-topics-page')).toHaveCount(0);
    await expect(page.getByTestId('request-topics-add-btn')).toHaveCount(0);
    await expect(page.locator('[data-testid^="request-topic-row-"]')).toHaveCount(0);
  });

  // TC-02-E2E-06 — an emptied catalogue gets a form that says so, not one that fails on
  // submit.
  test('a catalogue with no active staff topic replaces the picker and the submit control', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    // Archived through this spec's own route, one at a time — the state is reached the
    // way a curator reaches it.
    const topics = await listRequestTopicsViaApi(request, org.organizationId);
    for (const topic of topics.filter((t) => t.audience === 'staff')) {
      await archiveRequestTopicViaApi(request, org.organizationId, topic.id);
    }

    await signInUi(page, adminEmail);
    await page.goto(`/org/${org.organizationId}/requests`);
    await expect(page.getByTestId('requests-page')).toBeVisible();

    await page.getByTestId('requests-new-btn').click();
    await expect(page.getByTestId('request-new-modal')).toBeVisible();

    // PATCH-003 — the staff catalogue is not read, and the empty-catalogue substitution
    // not evaluated, until the addressee kind that reads it is chosen.
    await chooseOption(page, 'request-new-assignee-kind', 'Colleague');
    await expect(page.getByTestId('request-new-topic-empty')).toHaveText(COPY.pickerEmpty);
    await expect(page.getByTestId('request-new-topic')).toHaveCount(0);
    await expect(page.getByTestId('request-new-submit')).toHaveCount(0);
  });
});
