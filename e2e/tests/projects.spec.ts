import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  API,
  VALID,
  findMember,
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
 * Invites+accepts a new member at `role` and returns their email — the same shape used by
 * members-list/requests-page. Accepting swaps `request`'s cookie jar to the new member, so
 * this logs back in as `adminEmail` afterward, leaving the jar authenticated as the admin.
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

/** Creates a project straight through the API — a precondition, not the thing under test.
 * Requires `request`'s cookie jar to be authenticated as an admin/manager of the org. */
async function createProjectViaApi(
  request: APIRequestContext,
  organizationId: string,
  name: string,
): Promise<void> {
  const response = await request.post(`${API}/api/organizations/${organizationId}/projects`, {
    data: { name },
  });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not create project "${name}" (${response.status()})`);
  }
}

/** Opens the Projects page via the sidebar row and waits for the list frame to mount. */
async function openProjectsPage(page: Page): Promise<void> {
  await expect(async () => {
    await page.getByTestId('nav-projects').click();
    await page.waitForURL('**/projects', { timeout: 2000 });
  }).toPass({ timeout: 15000 });
  await expect(page.getByTestId('projects-page')).toBeVisible();
}

/**
 * Drives the DS `Select` status filter: the `data-testid` sits on the trigger button, and
 * options render as `<a>` links inside the popover, so `getByRole('link', …)` targets the
 * option unambiguously. Mirrors `requests-page.spec.ts`'s custom-Select helper.
 */
async function selectStatusFilter(page: Page, label: string): Promise<void> {
  await page.getByTestId('projects-status-filter').click();
  await page.getByRole('link', { name: label, exact: true }).click();
}

test.describe('11 — Projects', () => {
  // TC-11-E2E-01 — admin creates a project, assigns two members, archives it, and restores it.
  test('admin creates a project, adds members, archives, and restores', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const alexEmail = await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');
    const janeEmail = await addMember(request, adminEmail, 'manager', 'Jane', 'Smith');
    const alex = await findMember(request, org.organizationId, alexEmail);
    const jane = await findMember(request, org.organizationId, janeEmail);

    await signInUi(page, adminEmail);
    await openProjectsPage(page);

    // 1. Empty state on the default Active filter (no projects yet).
    await expect(page.getByTestId('projects-empty-state')).toBeVisible();

    // 2–3. Create "Project Alpha" → toast + navigation to the detail page.
    await page.getByTestId('projects-new-btn').click();
    await expect(page.getByTestId('projects-modal')).toBeVisible();
    await page.getByTestId('projects-name-input').fill('Project Alpha');
    await page.getByTestId('projects-create-btn').click();

    await expect(page.getByTestId('toast-project-created')).toBeVisible();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
    const projectId = page.url().split('/').pop()!;
    await expect(page.getByTestId('project-detail-name')).toHaveText('Project Alpha');

    // 4–5. Add the two seeded members → toast + two roster rows.
    await page.getByTestId('project-add-member-btn').click();
    await expect(page.getByTestId('projects-add-members-modal')).toBeVisible();
    await page.getByTestId(`projects-member-checkbox-${alex.id}`).click();
    await page.getByTestId(`projects-member-checkbox-${jane.id}`).click();
    await expect(page.getByTestId('projects-add-members-btn')).toContainText('Add selected (2)');
    await page.getByTestId('projects-add-members-btn').click();

    await expect(page.getByTestId('toast-members-added')).toBeVisible();
    await expect(page.getByTestId(`project-member-row-${alex.id}`)).toBeVisible();
    await expect(page.getByTestId(`project-member-row-${jane.id}`)).toBeVisible();

    // 6–7. Archive → confirm in the dialog → toast + navigation back to the list.
    await page.getByTestId('project-archive-btn').click();
    await expect(page.getByTestId('project-archive-confirm-dialog')).toBeVisible();
    await page.getByTestId('project-archive-confirm-btn').click();

    await expect(page.getByTestId('toast-project-archived')).toBeVisible();
    await page.waitForURL('**/projects');
    await expect(page.getByTestId('projects-page')).toBeVisible();

    // 8. Switch to Archived → the archived project row appears.
    await selectStatusFilter(page, 'Archived');
    await expect(page.getByTestId(`projects-row-${projectId}`)).toBeVisible();
    await expect(page.getByTestId(`projects-row-${projectId}`)).toContainText('Project Alpha');

    // 9. Inline Restore → toast; the project leaves the Archived list and returns to Active.
    await page.getByTestId(`projects-restore-${projectId}`).click();
    await expect(page.getByTestId('toast-project-restored')).toBeVisible();
    await expect(page.getByTestId(`projects-row-${projectId}`)).toHaveCount(0);

    await selectStatusFilter(page, 'Active');
    await expect(page.getByTestId(`projects-row-${projectId}`)).toBeVisible();
    await expect(page.getByTestId(`projects-row-${projectId}`)).toContainText('Project Alpha');
  });

  // TC-11-E2E-02 — a duplicate name shows an inline error and keeps the modal open; a fresh
  // name then succeeds and closes the modal.
  test('duplicate project name shows an inline error', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    await createProjectViaApi(request, org.organizationId, 'Alpha');

    await signInUi(page, adminEmail);
    await openProjectsPage(page);

    // Case-insensitive duplicate → inline field error, modal stays open.
    await page.getByTestId('projects-new-btn').click();
    await expect(page.getByTestId('projects-modal')).toBeVisible();
    await page.getByTestId('projects-name-input').fill('alpha');
    await page.getByTestId('projects-create-btn').click();

    await expect(page.getByTestId('field-error-projectName')).toBeVisible();
    await expect(page.getByTestId('field-error-projectName')).toContainText(
      'A project with this name already exists',
    );
    await expect(page.getByTestId('projects-modal')).toBeVisible();

    // A non-colliding name → success toast, modal closes.
    await page.getByTestId('projects-name-input').fill('Beta');
    await page.getByTestId('projects-create-btn').click();

    await expect(page.getByTestId('toast-project-created')).toBeVisible();
    await expect(page.getByTestId('projects-modal')).toHaveCount(0);
  });

  // TC-11-E2E-03 — a `user` has no Projects sidebar row, and a direct navigation is refused
  // (the route calls notFound() when the role lacks manage-projects).
  test('user cannot see or reach the Projects page', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const userEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');

    await signInUi(page, userEmail);

    // The sidebar renders, but the Projects row is omitted for this role.
    await expect(page.getByTestId('app-sidebar')).toBeVisible();
    await expect(page.getByTestId('nav-projects')).toHaveCount(0);

    // Direct navigation does not render the projects surface (notFound()).
    await page.goto(`/org/${org.organizationId}/projects`);
    await expect(page.getByTestId('projects-page')).toHaveCount(0);
  });
});
