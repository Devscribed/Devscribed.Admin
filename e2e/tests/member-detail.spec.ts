import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  API,
  VALID,
  findMember,
  inviteAndAcceptViaApi,
  login,
  removeMember,
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
  // TC-05-E2E-01
  test('admin edits role and job title and they persist', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const targetEmail = await addMember(request, adminEmail, 'user', 'Aleksey', 'Siniakevich');
    const target = await findMember(request, org.organizationId, targetEmail);

    await signInUi(page, adminEmail);
    await page.getByTestId(`member-row-${target.id}`).click();
    await page.waitForURL(new RegExp(`/members/${target.id}$`));

    await expect(page.getByTestId('member-detail')).toBeVisible();
    await expect(page.getByTestId('member-detail-tab-about')).toBeVisible();
    await expect(page.getByTestId('member-detail-avatar')).toBeVisible();
    await expect(page.getByTestId('member-detail-name')).toHaveText('Aleksey Siniakevich');
    await expect(page.getByTestId('member-detail-role-badge')).toHaveText('user');
    await expect(page.getByTestId('member-detail-joined')).toContainText('Joined');
    await expect(page.getByTestId('member-detail-email')).toContainText(targetEmail);
    await expect(page.getByTestId('member-detail-timezone')).toBeVisible();

    await page.getByTestId(`member-role-select-${target.id}`).click();
    await page.getByRole('link', { name: 'Manager', exact: true }).click();
    await page.getByTestId('job-title-input').fill('Backend Engineer');
    await page.getByTestId('job-title-save-button').click();

    await expect(page.getByTestId('toast-member-saved')).toBeVisible();
    await expect(page.getByTestId('member-detail-role-badge')).toHaveText('manager');
    await expect(page.getByTestId('job-title-input')).toHaveValue('Backend Engineer');

    await page.reload();
    await expect(page.getByTestId('member-detail-role-badge')).toHaveText('manager');
    await expect(page.getByTestId('job-title-input')).toHaveValue('Backend Engineer');
  });

  // TC-05-E2E-02
  test('user sees a read-only About with no editor', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const admin = await findMember(request, org.organizationId, adminEmail);
    await setJobTitleViaApi(request, org.organizationId, admin.id, 'admin', 'Backend Lead');

    const viewerEmail = await addMember(request, adminEmail, 'user', 'Val', 'Viewer');

    await signInUi(page, viewerEmail);
    await page.getByTestId(`member-row-${admin.id}`).click();
    await page.waitForURL(new RegExp(`/members/${admin.id}$`));

    await expect(page.getByTestId('member-detail')).toBeVisible();
    await expect(page.getByTestId('member-detail-tab-about')).toBeVisible();
    await expect(page.getByTestId('member-detail-avatar')).toBeVisible();
    await expect(page.getByTestId('member-detail-name')).toBeVisible();
    await expect(page.getByTestId('member-detail-role-badge')).toHaveText('admin');
    await expect(page.getByTestId('member-detail-joined')).toBeVisible();
    await expect(page.getByTestId('member-detail-email')).toBeVisible();
    await expect(page.getByTestId('member-detail-timezone')).toBeVisible();

    await expect(page.getByTestId('job-title-readonly')).toHaveText('Backend Lead');
    await expect(page.getByTestId('job-title-input')).toHaveCount(0);
    await expect(page.locator('[data-testid^="member-role-select-"]')).toHaveCount(0);
    await expect(page.getByTestId('job-title-save-button')).toHaveCount(0);
  });

  // TC-05-E2E-03
  test("removed member's detail is fully read-only even for admin", async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const memberEmail = await addMember(request, adminEmail, 'user', 'Riley', 'Removed');
    const target = await findMember(request, org.organizationId, memberEmail);
    await removeMember(request, org.organizationId, target.id);

    await signInUi(page, adminEmail);
    await page.getByTestId('show-removed-checkbox').click();
    const row = page.getByTestId(`member-row-${target.id}`);
    await expect(row).toBeVisible();
    await row.click();
    await page.waitForURL(new RegExp(`/members/${target.id}$`));

    await expect(page.getByTestId('member-detail')).toBeVisible();
    await expect(page.getByTestId('member-detail-tab-about')).toBeVisible();
    await expect(page.getByTestId('member-detail-role-badge')).toHaveText('user');
    await expect(page.getByTestId('member-detail-removed-badge')).toHaveText('Removed');
    await expect(page.getByTestId('member-detail-joined')).toBeVisible();
    await expect(page.getByTestId('member-detail-email')).toBeVisible();
    await expect(page.getByTestId('member-detail-timezone')).toBeVisible();

    await expect(page.locator('[data-testid^="member-role-select-"]')).toHaveCount(0);
    await expect(page.getByTestId('job-title-input')).toHaveCount(0);
    await expect(page.getByTestId('job-title-save-button')).toHaveCount(0);
  });

  // TC-05-E2E-04
  test('admin clears job title', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const memberEmail = await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');
    const target = await findMember(request, org.organizationId, memberEmail);
    await setJobTitleViaApi(request, org.organizationId, target.id, 'user', 'Backend Engineer');

    await signInUi(page, adminEmail);
    await page.getByTestId(`member-row-${target.id}`).click();
    await page.waitForURL(new RegExp(`/members/${target.id}$`));

    const jobTitleInput = page.getByTestId('job-title-input');
    await expect(jobTitleInput).toHaveValue('Backend Engineer');
    await jobTitleInput.fill('');
    await page.getByTestId('job-title-save-button').click();

    await expect(page.getByTestId('toast-member-saved')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('job-title-input')).toHaveValue('');
    await expect(page.getByTestId('job-title-input')).toHaveAttribute('placeholder', 'Enter a job title');
  });

  // TC-05-E2E-05
  test('manager sees role picker on user/viewer detail but not on admin/manager detail', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const admin = await findMember(request, org.organizationId, adminEmail);

    const managerEmail = await addMember(request, adminEmail, 'manager', 'Mo', 'Manager');
    const manager = await findMember(request, org.organizationId, managerEmail);
    const userEmail = await addMember(request, adminEmail, 'user', 'Uma', 'User');
    const user = await findMember(request, org.organizationId, userEmail);

    await signInUi(page, managerEmail);

    // A `user` member — role picker present with manager/user/viewer, no admin.
    await page.getByTestId(`member-row-${user.id}`).click();
    await page.waitForURL(new RegExp(`/members/${user.id}$`));
    const userRoleSelect = page.getByTestId(`member-role-select-${user.id}`);
    await expect(userRoleSelect).toBeVisible();
    await userRoleSelect.click();
    await expect(page.getByRole('link', { name: 'Manager', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'User', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Viewer', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);

    await page.getByTestId('member-detail-back-link').click();
    await page.waitForURL(/\/members$/);

    // The org's admin member — role picker absent; job title input + save present.
    await page.getByTestId(`member-row-${admin.id}`).click();
    await page.waitForURL(new RegExp(`/members/${admin.id}$`));
    await expect(page.locator('[data-testid^="member-role-select-"]')).toHaveCount(0);
    await expect(page.getByTestId('job-title-input')).toBeVisible();
    await expect(page.getByTestId('job-title-save-button')).toBeVisible();

    await page.getByTestId('member-detail-back-link').click();
    await page.waitForURL(/\/members$/);

    // A manager member (the caller's own row) — same shape as the admin case.
    await page.getByTestId(`member-row-${manager.id}`).click();
    await page.waitForURL(new RegExp(`/members/${manager.id}$`));
    await expect(page.locator('[data-testid^="member-role-select-"]')).toHaveCount(0);
    await expect(page.getByTestId('job-title-input')).toBeVisible();
    await expect(page.getByTestId('job-title-save-button')).toBeVisible();
  });

  // TC-05-E2E-06
  test('placeholder tabs are visible but disabled', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const admin = await findMember(request, org.organizationId, adminEmail);

    await signInUi(page, adminEmail);
    await page.getByTestId(`member-row-${admin.id}`).click();
    await page.waitForURL(new RegExp(`/members/${admin.id}$`));

    await expect(page.getByTestId('member-detail-tab-about')).toBeVisible();
    await expect(page.getByTestId('member-detail-tab-about')).not.toHaveAttribute('aria-disabled', 'true');

    for (const tab of ['vacation', 'projects', 'roles', 'payments']) {
      const el = page.getByTestId(`member-detail-tab-${tab}`);
      await expect(el).toBeVisible();
      await expect(el).toHaveAttribute('aria-disabled', 'true');
    }
  });

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

  // TC-05-E2E-10
  test('loading skeleton shown while fetching member detail', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const memberEmail = await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');
    const target = await findMember(request, org.organizationId, memberEmail);

    await signInUi(page, adminEmail);

    // Delays only the member-detail GET (not the list's own GET) so the skeleton has
    // time to render before the real data arrives.
    await page.route(/\/api\/organizations\/[^/]+\/members\/[^/]+$/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await page.getByTestId(`member-row-${target.id}`).click();

    await expect(page.getByTestId('member-detail-loading-skeleton')).toBeVisible();
    await expect(page.getByTestId('member-detail-name')).toBeVisible();
  });

  // TC-05-E2E-11
  test('job title validation error over 100 characters, clears on correction', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const memberEmail = await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');
    const target = await findMember(request, org.organizationId, memberEmail);

    await signInUi(page, adminEmail);
    await page.getByTestId(`member-row-${target.id}`).click();
    await page.waitForURL(new RegExp(`/members/${target.id}$`));

    const jobTitleInput = page.getByTestId('job-title-input');
    await jobTitleInput.fill('a'.repeat(101));

    await expect(page.getByTestId('field-error-jobTitle')).toHaveText(
      'Job title must be at most 100 characters',
    );
    await expect(page.getByTestId('job-title-save-button')).toBeDisabled();

    await jobTitleInput.fill('a'.repeat(100));
    await expect(page.getByTestId('field-error-jobTitle')).toHaveCount(0);
    await expect(page.getByTestId('job-title-save-button')).toBeEnabled();
  });
});
