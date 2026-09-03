import { expect, test, type APIRequestContext, type Page } from './fixtures';
import {
  API,
  VALID,
  findMember,
  inviteAndAcceptViaApi,
  login,
  signupOrg,
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

/**
 * Invites+accepts a new member at `role` and returns their email. Accepting swaps the
 * `request` cookie jar to the new member (`inviteAndAcceptViaApi`'s doc comment), so
 * this logs back in as `adminEmail` both before sending the invite and after accepting
 * it — every call leaves the jar authenticated as the admin, ready for the next one or
 * for a direct API precondition call (`findMember`, `setJobTitleViaApi`).
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

/**
 * Sets a member's job title straight through `PUT /members/:id` — a precondition (spec
 * 05's save endpoint always expects both fields, so `role` must be the target's current,
 * unchanged role). Requires `request`'s cookie jar to already be an admin/manager.
 */
async function setJobTitleViaApi(
  request: APIRequestContext,
  organizationId: string,
  memberId: string,
  role: string,
  jobTitle: string,
): Promise<void> {
  const response = await request.put(
    `${API}/api/organizations/${organizationId}/members/${memberId}`,
    { data: { role, jobTitle } },
  );
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not set job title for ${memberId} (${response.status()})`);
  }
}

test.describe('05 — Member Detail: About', () => {

  // TC-05-E2E-07
  test('navigate to member detail and back', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const memberEmail = await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');
    const target = await findMember(request, org.organizationId, memberEmail);

    await signInUi(page, adminEmail);
    await page.getByTestId(`member-row-${target.id}`).click();

    await expect(page).toHaveURL(new RegExp(`/org/${org.organizationId}/members/${target.id}$`));
    await expect(page.getByTestId('member-detail')).toBeVisible();
    await expect(page.getByTestId('member-detail-name')).toHaveText('Alex Kaminski');

    await page.getByTestId('member-detail-back-link').click();

    await expect(page).toHaveURL(new RegExp(`/org/${org.organizationId}/members$`));
    await expect(page.getByTestId('members-list')).toBeVisible();
  });

  // TC-05-E2E-08
  test('zero-admin guard disables role picker on last admin', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const admin = await findMember(request, org.organizationId, adminEmail);

    await signInUi(page, adminEmail);
    await page.getByTestId(`member-row-${admin.id}`).click();
    await page.waitForURL(new RegExp(`/members/${admin.id}$`));

    const roleSelect = page.getByTestId(`member-role-select-${admin.id}`);
    await expect(roleSelect).toBeVisible();
    await expect(roleSelect).toBeDisabled();
    await expect(page.getByTestId('role-change-guard-message')).toHaveText(
      'Organization must retain at least one admin',
    );
    await expect(page.getByTestId('job-title-input')).toBeEnabled();
  });

  // TC-05-E2E-09
  test('manager edits job title of admin member (no role picker)', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const admin = await findMember(request, org.organizationId, adminEmail);
    await setJobTitleViaApi(request, org.organizationId, admin.id, 'admin', 'CTO');

    const managerEmail = await addMember(request, adminEmail, 'manager', 'Mo', 'Manager');

    await signInUi(page, managerEmail);
    await page.getByTestId(`member-row-${admin.id}`).click();
    await page.waitForURL(new RegExp(`/members/${admin.id}$`));

    await expect(page.locator('[data-testid^="member-role-select-"]')).toHaveCount(0);

    const jobTitleInput = page.getByTestId('job-title-input');
    await expect(jobTitleInput).toHaveValue('CTO');
    await jobTitleInput.fill('CEO');
    await page.getByTestId('job-title-save-button').click();

    await expect(page.getByTestId('toast-member-saved')).toBeVisible();
    await expect(jobTitleInput).toHaveValue('CEO');

    await page.reload();
    await expect(page.getByTestId('job-title-input')).toHaveValue('CEO');
    await expect(page.getByTestId('member-detail-role-badge')).toHaveText('admin');
  });
});
