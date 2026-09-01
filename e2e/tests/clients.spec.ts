import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { CLIENT_MESSAGES } from '@devscribed/validation';
import {
  API,
  VALID,
  createProjectViaApi,
  inviteAndAcceptViaApi,
  login,
  signupOrg,
  uniqueEmail,
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
 * Creates a client straight through the API — a precondition, not the thing under
 * test. Requires `request`'s cookie jar to be authenticated as an admin/manager.
 */
async function createClientViaApi(
  request: APIRequestContext,
  organizationId: string,
  name: string,
): Promise<{ id: string; name: string; status: 'active' | 'archived' }> {
  const response = await request.post(`${API}/api/organizations/${organizationId}/clients`, {
    data: { name },
  });
  if (response.status() !== 201) {
    throw new Error(
      `Precondition failed: could not create client "${name}" (${response.status()} ${await response.text()})`,
    );
  }
  const body = (await response.json()) as { client: { id: string; name: string; status: string } };
  return { id: body.client.id, name: body.client.name, status: body.client.status as 'active' | 'archived' };
}

/** Archives a client through the API — precondition for TC-01-E2E-05. */
async function archiveClientViaApi(
  request: APIRequestContext,
  organizationId: string,
  clientId: string,
): Promise<void> {
  const response = await request.patch(
    `${API}/api/organizations/${organizationId}/clients/${clientId}/archive`,
  );
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not archive client ${clientId} (${response.status()})`);
  }
}

/**
 * Links an existing project to a client through the API — TC-01-E2E-04 precondition.
 * The projects `PUT` validates the whole payload, so `name` must be supplied even
 * when only the client link is changing.
 */
async function setProjectClientViaApi(
  request: APIRequestContext,
  organizationId: string,
  projectId: string,
  name: string,
  clientId: string,
): Promise<void> {
  const response = await request.put(
    `${API}/api/organizations/${organizationId}/projects/${projectId}`,
    { data: { name, clientId } },
  );
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not link project ${projectId} to client ${clientId} ` +
        `(${response.status()} ${await response.text()})`,
    );
  }
}

/**
 * Opens the Clients page via the sidebar row and waits for the list frame to mount.
 * The dev-server first-compile of `/org/[orgId]/clients` on a cold worker can push
 * the initial nav past a couple of seconds, so the wait budget here is generous
 * rather than tight — a single click with a long wait, no click retry loop.
 */
async function openClientsPage(page: Page): Promise<void> {
  await page.getByTestId('nav-clients').click();
  await page.waitForURL('**/clients**', { timeout: 30000 });
  await expect(page.getByTestId('clients-page')).toBeVisible({ timeout: 30000 });
}

/**
 * Drives the DS `Select` filter: the `data-testid` is on the trigger button, and the
 * options render into a portalled listbox as `<a role="option">` — matches the pattern
 * projects.spec.ts uses for its own status filter.
 */
async function selectStatusFilter(page: Page, label: string): Promise<void> {
  await page.getByTestId('clients-status-filter').click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

/** Opens the DS `Select` used as the project client picker. Waits for the list to mount. */
async function openClientPicker(page: Page): Promise<void> {
  await page.getByTestId('project-client-select').click();
  await expect(page.getByRole('option').first()).toBeVisible();
}

// First-compile of /org/[orgId]/clients (and sibling routes) under three parallel
// workers can dwarf the default 30s budget; give every case in this file room.
test.describe.configure({ timeout: 90_000 });

test.describe('01 — Clients', () => {

  // TC-01-E2E-01 — Admin creates a client from the UI, then links it to a pre-seeded
  // project through the project edit modal; the client name appears on the project
  // detail page.
  test('admin creates a client and links it to a project', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const project = await createProjectViaApi(request, org.organizationId, 'Website Redesign');

    await signInUi(page, adminEmail);
    await openClientsPage(page);

    // Empty state on first visit (Active filter, no clients yet).
    await expect(page.getByTestId('clients-empty-state')).toBeVisible();

    // Create the client through the modal.
    await page.getByTestId('clients-new-btn').click();
    await expect(page.getByTestId('client-modal')).toBeVisible();
    await page.getByTestId('client-name-input').fill('Acme Corp');
    await page.getByTestId('client-save-btn').click();

    await expect(page.getByTestId('toast-client-created')).toBeVisible();
    await expect(page.getByTestId('client-modal')).toHaveCount(0);

    // Look up the new client's id through the API so we can hit its testid by name;
    // the list re-renders on success and the row testid embeds the id.
    const listResponse = await request.get(
      `${API}/api/organizations/${org.organizationId}/clients?status=active`,
    );
    expect(listResponse.ok(), 'clients list fetch').toBeTruthy();
    const clients = (await listResponse.json()).clients as Array<{ id: string; name: string }>;
    const acme = clients.find((c) => c.name === 'Acme Corp');
    expect(acme, 'Acme Corp in the list').toBeTruthy();
    await expect(page.getByTestId(`clients-row-${acme!.id}`)).toBeVisible();
    await expect(page.getByTestId(`clients-row-${acme!.id}`)).toContainText('Acme Corp');

    // Navigate to the project via the sidebar/list and open the edit modal.
    await page.getByTestId('nav-projects').click();
    await page.waitForURL('**/projects');
    await page.getByTestId(`projects-row-${project.id}`).click();
    await page.waitForURL(`**/projects/${project.id}`);

    await page.getByTestId('project-edit-name-btn').click();
    await expect(page.getByTestId('projects-modal')).toBeVisible();

    // Pick the new client in the DS Select. Waiting for the trigger's visible label
    // to swap to the option name is how we know the choice landed before saving.
    await openClientPicker(page);
    await page.getByRole('option', { name: 'Acme Corp', exact: true }).click();
    await expect(page.getByTestId('project-client-select')).toContainText('Acme Corp');

    await page.getByTestId('projects-save-btn').click();
    await expect(page.getByTestId('toast-project-updated')).toBeVisible();

    // Client label surfaces on the project detail header now that the link is set.
    await expect(page.getByTestId('project-detail-client-label')).toBeVisible();
    await expect(page.getByTestId('project-detail-client-label')).toContainText('Acme Corp');
  });

  // TC-01-E2E-02 — A `manager` renames a client from the list row and sees the update.
  test('manager renames a client from the list row', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    // Seed the client while the request context still holds the admin session.
    const client = await createClientViaApi(request, org.organizationId, 'Acme Corp');

    // Invite + accept a manager; the accept swaps the request jar to them, which is
    // fine — the seeding above already ran, and the UI sign-in below uses its own jar.
    const managerEmail = uniqueEmail('manager');
    await login(request, adminEmail);
    await inviteAndAcceptViaApi(request, managerEmail, 'manager', {
      firstName: 'Morgan',
      lastName: 'Lin',
    });

    await signInUi(page, managerEmail);
    await openClientsPage(page);

    await expect(page.getByTestId(`clients-row-${client.id}`)).toBeVisible();
    await page.getByTestId(`clients-row-${client.id}-rename-btn`).click();

    await expect(page.getByTestId('client-modal')).toBeVisible();
    await page.getByTestId('client-name-input').fill('Acme Corporation');
    await page.getByTestId('client-save-btn').click();

    await expect(page.getByTestId('toast-client-updated')).toBeVisible();
    await expect(page.getByTestId('client-modal')).toHaveCount(0);
    await expect(page.getByTestId(`clients-row-${client.id}`)).toContainText('Acme Corporation');
  });

  // TC-01-E2E-03 — Renaming to an existing name shows the inline `field-error-name`,
  // the modal stays open, the submit button is NOT disabled, and cancelling closes
  // the modal without persisting a change.
  test('renaming to a duplicate name shows an inline error', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    const alpha = await createClientViaApi(request, org.organizationId, 'Alpha Analytics');
    const beta = await createClientViaApi(request, org.organizationId, 'Beta Analytics');

    await signInUi(page, adminEmail);
    await openClientsPage(page);

    await page.getByTestId(`clients-row-${alpha.id}-rename-btn`).click();
    await expect(page.getByTestId('client-modal')).toBeVisible();

    // Force a case-insensitive duplicate: the server compares on LOWER(name).
    await page.getByTestId('client-name-input').fill(beta.name);
    await page.getByTestId('client-save-btn').click();

    await expect(page.getByTestId('field-error-name')).toBeVisible();
    await expect(page.getByTestId('field-error-name')).toContainText(CLIENT_MESSAGES.nameDuplicate);
    await expect(page.getByTestId('client-modal')).toBeVisible();
    // Submit is *never* disabled for validation (spec Alt Flow A + CLAUDE.md rule).
    await expect(page.getByTestId('client-save-btn')).not.toBeDisabled();

    await page.getByTestId('client-cancel-btn').click();
    await expect(page.getByTestId('client-modal')).toHaveCount(0);
    // The original name persists — cancel discarded the attempt.
    await expect(page.getByTestId(`clients-row-${alpha.id}`)).toContainText(alpha.name);
  });

  // TC-01-E2E-04 — Archiving a client with active projects goes through the
  // confirmation dialog whose message names the client and the active-project count;
  // after confirm we return to the list and the client only shows under Archived.
  test('archiving a client with active projects flows through the confirmation', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    const client = await createClientViaApi(request, org.organizationId, 'Acme Corp');
    const projectA = await createProjectViaApi(request, org.organizationId, 'Website Redesign');
    const projectB = await createProjectViaApi(request, org.organizationId, 'Mobile App v2');
    await setProjectClientViaApi(request, org.organizationId, projectA.id, projectA.name, client.id);
    await setProjectClientViaApi(request, org.organizationId, projectB.id, projectB.name, client.id);

    await signInUi(page, adminEmail);
    await page.goto(`/org/${org.organizationId}/clients/${client.id}`);
    await expect(page.getByTestId('client-detail-page')).toBeVisible();
    await expect(page.getByTestId('client-detail-title')).toContainText('Acme Corp');

    await page.getByTestId('client-detail-archive-btn').click();
    await expect(page.getByTestId('client-archive-confirm')).toBeVisible();
    await expect(page.getByTestId('client-archive-confirm-message')).toContainText('Acme Corp');
    await expect(page.getByTestId('client-archive-confirm-message')).toContainText(
      '2 active project(s)',
    );

    await page.getByTestId('client-archive-confirm-btn').click();
    await expect(page.getByTestId('toast-client-archived')).toBeVisible();
    await page.waitForURL(`**/org/${org.organizationId}/clients`);
    await expect(page.getByTestId('clients-page')).toBeVisible();

    // Under the default Active filter the archived client is gone.
    await expect(page.getByTestId(`clients-row-${client.id}`)).toHaveCount(0);

    // Switch to Archived — the row reappears with a Restore action.
    await selectStatusFilter(page, 'Archived');
    await expect(page.getByTestId(`clients-row-${client.id}`)).toBeVisible();
    await expect(page.getByTestId(`clients-row-${client.id}-restore-btn`)).toBeVisible();
  });

  // TC-01-E2E-05 — An archived client is not offered in the project client picker,
  // and a hand-crafted POST that supplies its id gets 422 `client_archived`.
  test('archived clients are not selectable on new projects', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    const activeClient = await createClientViaApi(request, org.organizationId, 'Chronos Ltd');
    const archived = await createClientViaApi(request, org.organizationId, 'Old Vendor');
    await archiveClientViaApi(request, org.organizationId, archived.id);

    await signInUi(page, adminEmail);
    await page.getByTestId('nav-projects').click();
    await page.waitForURL('**/projects');
    await expect(page.getByTestId('projects-page')).toBeVisible();

    await page.getByTestId('projects-new-btn').click();
    await expect(page.getByTestId('projects-modal')).toBeVisible();

    await openClientPicker(page);
    // The active client is offered; the archived one is not (spec req 8 / Alt Flow D).
    await expect(page.getByRole('option', { name: activeClient.name, exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: archived.name, exact: true })).toHaveCount(0);

    // Close the picker so a stray click does not select an option before the fetch below.
    await page.keyboard.press('Escape');

    // A hand-crafted POST bypassing the picker still returns 422 client_archived,
    // because the server is the authority (spec req 12 + TC-01-INT-23).
    const result = await page.evaluate(
      async ({ orgId, archivedClientId }) => {
        const response = await fetch(`/api/organizations/${orgId}/projects`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Crafted Project', clientId: archivedClientId }),
        });
        const body = await response.json().catch(() => null);
        return { status: response.status, body };
      },
      { orgId: org.organizationId, archivedClientId: archived.id },
    );
    expect(result.status).toBe(422);
    expect(result.body?.error).toBe('client_archived');
  });

  // TC-01-E2E-06 — The `user` role has no Clients sidebar row, and a direct visit to
  // /org/{orgId}/clients does not render the clients surface. The page short-circuits
  // via `notFound()` (defence-in-depth) before the API's own 404 → members redirect
  // gets a chance to run, mirroring projects.spec.ts TC-11-E2E-03.
  test('user role cannot see or reach the Clients page', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    const userEmail = uniqueEmail('user');
    await inviteAndAcceptViaApi(request, userEmail, 'user', {
      firstName: 'Uma',
      lastName: 'User',
    });

    await signInUi(page, userEmail);

    // Sidebar renders — the Clients row is omitted for this role.
    await expect(page.getByTestId('app-sidebar')).toBeVisible();
    await expect(page.getByTestId('nav-clients')).toHaveCount(0);

    // A direct URL does not render the clients page (notFound() short-circuit).
    await page.goto(`/org/${org.organizationId}/clients`);
    await expect(page.getByTestId('clients-page')).toHaveCount(0);
  });

  // TC-01-E2E-07 — Typing in the search box narrows the list live (250ms debounce).
  // The rule from spec §16 is a case-insensitive substring match, so "ac" matches
  // only "Acme Corp" across the seed set; clearing restores every row.
  test('search narrows the list live via case-insensitive substring', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    const seeds = [
      'Acme Corp',
      'Alpha Analytics',
      'Beta Analytics',
      'Chronos Ltd',
      'Delta Systems',
    ];
    for (const name of seeds) {
      await createClientViaApi(request, org.organizationId, name);
    }

    await signInUi(page, adminEmail);
    await openClientsPage(page);

    // Every seeded client shows on the Active filter. Rename buttons are a
    // one-per-row proxy — the row prefix would also match nested testids.
    const rowRenameBtns = page.locator('[data-testid^="clients-row-"][data-testid$="-rename-btn"]');
    await expect(rowRenameBtns).toHaveCount(seeds.length);

    await page.getByTestId('clients-search').fill('ac');
    // Debounce is 250ms — 300ms + the auto-wait on the count assertion is enough.
    await page.waitForTimeout(300);

    // Case-insensitive substring: only "Acme Corp" contains "ac" in this seed set
    // (spec req 16). "Alpha Analytics" and "Beta Analytics" have no "ac" substring.
    const matches = seeds.filter((n) => n.toLowerCase().includes('ac'));
    expect(matches).toEqual(['Acme Corp']);
    await expect(rowRenameBtns).toHaveCount(matches.length);

    // Clear the search — every row returns.
    await page.getByTestId('clients-search').fill('');
    await page.waitForTimeout(300);
    await expect(rowRenameBtns).toHaveCount(seeds.length);
  });
});
