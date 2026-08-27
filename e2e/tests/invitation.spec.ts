import { expect, test, type Page } from '@playwright/test';
import {
  VALID,
  acceptInvitationViaApi,
  createBareAccount,
  expireInvitation,
  latestInvitationToken,
  sendInvitation,
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

test.describe('03 — User Invitation', () => {
  // TC-03-E2E-01
  test('admin invites, invitee accepts a new account and lands in the org', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    await signInUi(page, adminEmail);

    await page.getByTestId('invite-open-button').click();
    const inviteeEmail = uniqueEmail('new');
    await page.getByTestId('invite-email-input').fill(inviteeEmail);
    await page.getByTestId('invite-submit-button').click();

    await expect(page.getByTestId('toast-invite-sent')).toHaveText(
      `Invitation sent to ${inviteeEmail}`,
    );

    const token = await latestInvitationToken(request, inviteeEmail);
    await page.goto(`/accept-invite?token=${encodeURIComponent(token)}`);

    await expect(page.getByTestId('accept-invite-screen')).toBeVisible();
    await expect(page.getByTestId('accept-invite-org-name')).toContainText('Acme Inc');

    await page.getByTestId('accept-first-name-input').fill('New');
    await page.getByTestId('accept-last-name-input').fill('Hire');
    await page.getByTestId('accept-password-input').fill('Passw0rd');
    await page.getByTestId('accept-submit-button').click();

    await page.waitForURL('**/members');
    const list = page.getByTestId('members-list');
    await expect(list).toBeVisible();
    const newRow = list.locator('[data-testid^="member-row-"]', { hasText: 'New Hire' });
    await expect(newRow).toHaveCount(1);
    // Spec 04 renders the role as `member-role-badge-{id}`, not a bare `member-role`
    // testid, and gives active rows no status badge at all (only removed rows get one).
    await expect(newRow.locator('[data-testid^="member-role-badge-"]')).toHaveText('user');
  });

  // TC-03-E2E-02
  test('expired invitation link shows an explicit error', async ({ page, request }) => {
    await signupOrg(request, { orgName: 'Acme Inc', email: uniqueEmail('admin') });

    const inviteeEmail = uniqueEmail('late');
    await sendInvitation(request, inviteeEmail, 'user');
    await expireInvitation(request, inviteeEmail);
    const token = await latestInvitationToken(request, inviteeEmail);

    await page.goto(`/accept-invite?token=${encodeURIComponent(token)}`);

    await expect(page.getByTestId('accept-invite-screen')).toBeVisible();
    await expect(page.getByTestId('accept-invite-error')).toHaveText('This invitation has expired');
    await expect(page.getByTestId('accept-password-input')).toHaveCount(0);
    await expect(page.getByTestId('accept-first-name-input')).toHaveCount(0);
    await expect(page.getByTestId('accept-submit-button')).toHaveCount(0);
  });

  // TC-03-E2E-03
  test('manager invite shows a role picker without the admin option', async ({ page, request }) => {
    await signupOrg(request, { orgName: 'Acme Inc', email: uniqueEmail('admin') });

    const managerEmail = uniqueEmail('mgr');
    await sendInvitation(request, managerEmail, 'manager');
    const managerToken = await latestInvitationToken(request, managerEmail);
    await acceptInvitationViaApi(request, {
      token: managerToken,
      firstName: 'Mo',
      lastName: 'Manager',
      password: VALID.password,
    });

    await signInUi(page, managerEmail);

    await page.getByTestId('invite-open-button').click();
    await expect(page.getByTestId('invite-form')).toBeVisible();
    await page.getByTestId('invite-role-select').click();

    await expect(page.getByRole('link', { name: 'Manager', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'User', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Viewer', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
  });

  // TC-03-E2E-04
  test('existing account with no prior org accepts with password confirmation', async ({
    page,
    request,
  }) => {
    await signupOrg(request, { orgName: 'Acme Inc', email: uniqueEmail('admin') });

    const existingEmail = uniqueEmail('pat');
    await createBareAccount(request, existingEmail, 'Passw0rd');
    await sendInvitation(request, existingEmail, 'user');
    const token = await latestInvitationToken(request, existingEmail);

    await page.goto(`/accept-invite?token=${encodeURIComponent(token)}`);

    await expect(page.getByTestId('accept-invite-screen')).toBeVisible();
    await expect(page.getByTestId('accept-invite-org-name')).toContainText('Acme Inc');
    await expect(page.getByTestId('accept-first-name-input')).toHaveCount(0);
    await expect(page.getByTestId('accept-last-name-input')).toHaveCount(0);
    await expect(page.getByTestId('accept-password-input')).toBeVisible();
    await expect(page.getByTestId('accept-org-switch-warning')).toHaveCount(0);

    await page.getByTestId('accept-password-input').fill('Passw0rd');
    await page.getByTestId('accept-submit-button').click();

    await page.waitForURL('**/members');
    await expect(page.getByTestId('members-list')).toBeVisible();
  });

  // TC-03-E2E-05
  test('last admin accepts an invite to another org — warning and confirmation required', async ({
    page,
    request,
  }) => {
    const oldAdminEmail = uniqueEmail('oldadmin');
    await signupOrg(request, { orgName: 'Old Corp', email: oldAdminEmail });

    const newCorp = await signupOrg(request, { orgName: 'New Corp', email: uniqueEmail('newadmin') });
    await sendInvitation(request, oldAdminEmail, 'manager');
    const token = await latestInvitationToken(request, oldAdminEmail);

    await page.goto(`/accept-invite?token=${encodeURIComponent(token)}`);
    await expect(page.getByTestId('accept-invite-screen')).toBeVisible();

    await page.getByTestId('accept-password-input').fill(VALID.password);

    const warning = page.getByTestId('accept-org-switch-warning');
    await expect(warning).toContainText('Old Corp');
    await expect(warning).toContainText('last administrator');

    const submit = page.getByTestId('accept-submit-button');
    await expect(submit).toBeDisabled();

    await page.getByTestId('accept-org-switch-confirm').click();
    await expect(submit).toBeEnabled();
    await submit.click();

    await page.waitForURL(new RegExp(`/org/${newCorp.organizationId}/members`));
    await expect(page.getByTestId('members-list')).toBeVisible();
  });

  // TC-03-E2E-06
  test('org-switch for a non-last-admin shows the warning without the last-admin line', async ({
    page,
    request,
  }) => {
    await signupOrg(request, { orgName: 'Org A', email: uniqueEmail('adminA') });

    const userEmail = uniqueEmail('userA');
    await sendInvitation(request, userEmail, 'user');
    const userToken = await latestInvitationToken(request, userEmail);
    await acceptInvitationViaApi(request, {
      token: userToken,
      firstName: 'User',
      lastName: 'A',
      password: VALID.password,
    });

    const orgB = await signupOrg(request, { orgName: 'Org B', email: uniqueEmail('adminB') });
    await sendInvitation(request, userEmail, 'viewer');
    const switchToken = await latestInvitationToken(request, userEmail);

    await page.goto(`/accept-invite?token=${encodeURIComponent(switchToken)}`);
    await page.getByTestId('accept-password-input').fill(VALID.password);

    const warning = page.getByTestId('accept-org-switch-warning');
    await expect(warning).toContainText('Org A');
    await expect(warning).not.toContainText('last administrator');

    const submit = page.getByTestId('accept-submit-button');
    await expect(submit).toBeDisabled();

    await page.getByTestId('accept-org-switch-confirm').click();
    await expect(submit).toBeEnabled();
    await submit.click();

    await page.waitForURL(new RegExp(`/org/${orgB.organizationId}/members`));
    await expect(page.getByTestId('members-list')).toBeVisible();
  });

  // TC-03-E2E-07
  test('new-account accept shows inline validation errors and keeps submit disabled', async ({
    page,
    request,
  }) => {
    await signupOrg(request, { orgName: 'Acme Inc', email: uniqueEmail('admin') });

    const inviteeEmail = uniqueEmail('new');
    await sendInvitation(request, inviteeEmail, 'user');
    const token = await latestInvitationToken(request, inviteeEmail);

    await page.goto(`/accept-invite?token=${encodeURIComponent(token)}`);
    await expect(page.getByTestId('accept-invite-org-name')).toContainText('Acme Inc');

    const submit = page.getByTestId('accept-submit-button');
    await expect(submit).toBeDisabled();

    const firstName = page.getByTestId('accept-first-name-input');
    const lastName = page.getByTestId('accept-last-name-input');
    const password = page.getByTestId('accept-password-input');

    await firstName.fill('New2');
    await firstName.blur();
    await lastName.fill('Hire');
    await lastName.blur();
    await password.fill('short');
    await password.blur();

    await expect(page.getByTestId('field-error-firstName')).toHaveText(
      'First name may contain only letters, hyphens, apostrophes, and spaces',
    );
    await expect(page.getByTestId('field-error-password')).toHaveText(
      'Password must be at least 8 characters',
    );
    await expect(submit).toBeDisabled();
  });

  // TC-03-E2E-08
  test('invite modal shows the already-a-member server error and stays usable', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    const memberEmail = uniqueEmail('member');
    await sendInvitation(request, memberEmail, 'user');
    const memberToken = await latestInvitationToken(request, memberEmail);
    await acceptInvitationViaApi(request, {
      token: memberToken,
      firstName: 'Mem',
      lastName: 'Ber',
      password: VALID.password,
    });

    await signInUi(page, adminEmail);

    await page.getByTestId('invite-open-button').click();
    await page.getByTestId('invite-email-input').fill(memberEmail);
    await page.getByTestId('invite-submit-button').click();

    await expect(page.getByTestId('invite-error-message')).toHaveText(
      'This person is already a member of your organization',
    );
    await expect(page.getByTestId('invite-email-input')).toHaveValue(memberEmail);
    await expect(page.getByTestId('invite-role-select')).toBeVisible();
    await expect(page.getByTestId('invite-submit-button')).toBeEnabled();
  });

  // TC-03-E2E-09
  test('used invitation link shows an explicit error', async ({ page, request }) => {
    await signupOrg(request, { orgName: 'Acme Inc', email: uniqueEmail('admin') });

    const usedEmail = uniqueEmail('used');
    await sendInvitation(request, usedEmail, 'user');
    const token = await latestInvitationToken(request, usedEmail);
    await acceptInvitationViaApi(request, {
      token,
      firstName: 'Used',
      lastName: 'Once',
      password: VALID.password,
    });

    await page.goto(`/accept-invite?token=${encodeURIComponent(token)}`);

    await expect(page.getByTestId('accept-invite-screen')).toBeVisible();
    await expect(page.getByTestId('accept-invite-error')).toHaveText(
      'This invitation is no longer valid',
    );
    await expect(page.getByTestId('accept-password-input')).toHaveCount(0);
    await expect(page.getByTestId('accept-submit-button')).toHaveCount(0);
  });
});
