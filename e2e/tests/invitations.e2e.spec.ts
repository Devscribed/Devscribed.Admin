import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { expireInvitation, seedAccountOnly, seedMember } from '../support/db';

const API = 'http://localhost:4000/api';

async function adminSignup(
  request: APIRequestContext,
  email: string,
  orgName: string,
): Promise<{ token: string; orgId: string }> {
  const res = await request.post(`${API}/auth/signup`, {
    data: { orgName, firstName: 'Ad', lastName: 'Min', email, password: 'Passw0rd' },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return { token: body.token as string, orgId: body.organization.id as string };
}

function inviteApi(request: APIRequestContext, token: string, email: string, role: string) {
  return request.post(`${API}/invitations`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { email, role },
  });
}

async function inviteToken(request: APIRequestContext, email: string): Promise<string> {
  const mail = await request.get(`${API}/dev/emails/latest?to=${email}`);
  expect(mail.ok()).toBeTruthy();
  const body = await mail.json();
  const match = /token=([a-f0-9]+)/.exec(body.text as string);
  expect(match).toBeTruthy();
  return match![1];
}

async function loginUi(page: Page, email: string, password = 'Passw0rd'): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/members$/);
}

test.describe('User Invitation (spec 03)', () => {
  test('TC-03-E2E-01: admin invites, new user accepts and lands in the org', async ({
    page,
    request,
  }) => {
    await adminSignup(request, 'admin1@acme.com', 'Acme Inc');
    await loginUi(page, 'admin1@acme.com');

    await page.getByTestId('invite-open-button').click();
    await page.getByTestId('invite-email-input').fill('new1@acme.com');
    await page.getByTestId('invite-role-select').selectOption('user');
    await page.getByTestId('invite-submit-button').click();
    await expect(page.getByTestId('toast-invite-sent')).toContainText(
      'Invitation sent to new1@acme.com',
    );

    const token = await inviteToken(request, 'new1@acme.com');
    await page.goto(`/accept-invite?token=${token}`);
    await expect(page.getByTestId('accept-invite-org-name')).toContainText('Acme Inc');
    await page.getByTestId('accept-first-name-input').fill('New');
    await page.getByTestId('accept-last-name-input').fill('Hire');
    await page.getByTestId('accept-password-input').fill('Passw0rd');
    await page.getByTestId('accept-submit-button').click();

    await expect(page).toHaveURL(/\/members$/);
    await expect(page.getByTestId('members-list')).toContainText('New Hire');
  });

  test('TC-03-E2E-02: expired link shows an explicit error', async ({ page, request }) => {
    const admin = await adminSignup(request, 'admin2@acme.com', 'Acme Inc');
    await inviteApi(request, admin.token, 'late2@acme.com', 'user');
    const token = await inviteToken(request, 'late2@acme.com');
    await expireInvitation('late2@acme.com');

    await page.goto(`/accept-invite?token=${token}`);
    await expect(page.getByTestId('accept-invite-error')).toHaveText('This invitation has expired');
    await expect(page.getByTestId('accept-password-input')).toHaveCount(0);
  });

  test('TC-03-E2E-03: manager sees a non-admin role picker', async ({ page, request }) => {
    const admin = await adminSignup(request, 'admin3@acme.com', 'Acme Inc');
    await seedMember('mgr3@acme.com', admin.orgId, 'manager');
    await loginUi(page, 'mgr3@acme.com');

    await page.getByTestId('invite-open-button').click();
    const select = page.getByTestId('invite-role-select');
    await expect(select.locator('option')).toHaveText(['Manager', 'User', 'Viewer']);
  });

  test('TC-03-E2E-04: existing user accepts with password confirmation', async ({
    page,
    request,
  }) => {
    await seedAccountOnly('pat4@other.com');
    const admin = await adminSignup(request, 'admin4@acme.com', 'Acme Inc');
    await inviteApi(request, admin.token, 'pat4@other.com', 'user');
    const token = await inviteToken(request, 'pat4@other.com');

    await page.goto(`/accept-invite?token=${token}`);
    await expect(page.getByTestId('accept-invite-org-name')).toContainText('Acme Inc');
    await expect(page.getByTestId('accept-password-input')).toBeVisible();
    await expect(page.getByTestId('accept-first-name-input')).toHaveCount(0);
    await page.getByTestId('accept-password-input').fill('Passw0rd');
    await page.getByTestId('accept-submit-button').click();
    await expect(page).toHaveURL(/\/members$/);
  });

  test('TC-03-E2E-05: last admin accepts invite to another org — warning and confirmation', async ({
    page,
    request,
  }) => {
    await adminSignup(request, 'admin@old.com', 'Old Corp');
    const newCorp = await adminSignup(request, 'admin@new.com', 'New Corp');
    await inviteApi(request, newCorp.token, 'admin@old.com', 'manager');
    const token = await inviteToken(request, 'admin@old.com');

    await page.goto(`/accept-invite?token=${token}`);
    const warning = page.getByTestId('accept-org-switch-warning');
    await expect(warning).toContainText('Old Corp');
    await expect(warning).toContainText('last administrator');

    await page.getByTestId('accept-password-input').fill('Passw0rd');
    await expect(page.getByTestId('accept-submit-button')).toBeDisabled();
    await page.getByTestId('accept-org-switch-confirm').check();
    await expect(page.getByTestId('accept-submit-button')).toBeEnabled();
    await page.getByTestId('accept-submit-button').click();
    await expect(page).toHaveURL(/\/members$/);
  });

  test('TC-03-E2E-06: non-last-admin org-switch shows warning and requires confirmation', async ({
    page,
    request,
  }) => {
    const orgA = await adminSignup(request, 'admin@a.com', 'Org A');
    await seedMember('user@orgA.com', orgA.orgId, 'user');
    const orgB = await adminSignup(request, 'admin@b.com', 'Org B');
    await inviteApi(request, orgB.token, 'user@orgA.com', 'user');
    const token = await inviteToken(request, 'user@orgA.com');

    await page.goto(`/accept-invite?token=${token}`);
    const warning = page.getByTestId('accept-org-switch-warning');
    await expect(warning).toContainText('Org A');
    await expect(warning).not.toContainText('last administrator');

    await page.getByTestId('accept-password-input').fill('Passw0rd');
    await expect(page.getByTestId('accept-submit-button')).toBeDisabled();
    await page.getByTestId('accept-org-switch-confirm').check();
    await page.getByTestId('accept-submit-button').click();
    await expect(page).toHaveURL(/\/members$/);
  });

  test('TC-03-E2E-07: new-account accept with inline validation errors', async ({
    page,
    request,
  }) => {
    const admin = await adminSignup(request, 'admin7@acme.com', 'Acme Inc');
    await inviteApi(request, admin.token, 'new7@acme.com', 'user');
    const token = await inviteToken(request, 'new7@acme.com');

    await page.goto(`/accept-invite?token=${token}`);
    await expect(page.getByTestId('accept-submit-button')).toBeDisabled();

    await page.getByTestId('accept-first-name-input').fill('New2');
    await page.getByTestId('accept-last-name-input').fill('Hire');
    const password = page.getByTestId('accept-password-input');
    await password.fill('short');
    await password.blur();

    await expect(page.getByTestId('field-error-firstName')).toHaveText(
      'First name may contain only letters, hyphens, apostrophes, and spaces',
    );
    await expect(page.getByTestId('field-error-password')).toHaveText(
      'Password must be at least 8 characters',
    );
    await expect(page.getByTestId('accept-submit-button')).toBeDisabled();
  });

  test('TC-03-E2E-08: invite modal shows server error for already-a-member', async ({
    page,
    request,
  }) => {
    const admin = await adminSignup(request, 'admin8@acme.com', 'Acme Inc');
    await seedMember('member8@acme.com', admin.orgId, 'user');
    await loginUi(page, 'admin8@acme.com');

    await page.getByTestId('invite-open-button').click();
    await page.getByTestId('invite-email-input').fill('member8@acme.com');
    await page.getByTestId('invite-role-select').selectOption('user');
    await page.getByTestId('invite-submit-button').click();

    await expect(page.getByTestId('invite-error-message')).toHaveText(
      'This person is already a member of your organization',
    );
    await expect(page.getByTestId('invite-email-input')).toHaveValue('member8@acme.com');
  });

  test('TC-03-E2E-09: used invitation link shows an explicit error', async ({ page, request }) => {
    const admin = await adminSignup(request, 'admin9@acme.com', 'Acme Inc');
    await inviteApi(request, admin.token, 'new9@acme.com', 'user');
    const token = await inviteToken(request, 'new9@acme.com');

    const accepted = await request.post(`${API}/invitations/accept`, {
      data: { token, firstName: 'New', lastName: 'Hire', password: 'Passw0rd' },
    });
    expect(accepted.ok()).toBeTruthy();

    await page.goto(`/accept-invite?token=${token}`);
    await expect(page.getByTestId('accept-invite-error')).toHaveText(
      'This invitation is no longer valid',
    );
    await expect(page.getByTestId('accept-password-input')).toHaveCount(0);
  });
});
