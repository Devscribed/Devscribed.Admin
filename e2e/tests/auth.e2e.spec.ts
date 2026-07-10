import { APIRequestContext, expect, test } from '@playwright/test';
import { deactivateMember } from '../support/db';

const API = 'http://localhost:4000/api';

async function seedAccount(
  request: APIRequestContext,
  email: string,
  password = 'Passw0rd',
): Promise<void> {
  const res = await request.post(`${API}/auth/signup`, {
    data: { orgName: 'Acme Inc', firstName: 'Pat', lastName: 'Owner', email, password },
  });
  expect(res.ok()).toBeTruthy();
}

/** Trigger a reset email via the API and read the token from the dev mail sink. */
async function requestResetToken(request: APIRequestContext, email: string): Promise<string> {
  const forgot = await request.post(`${API}/auth/forgot-password`, { data: { email } });
  expect(forgot.ok()).toBeTruthy();
  const mail = await request.get(`${API}/dev/emails/latest?to=${email}`);
  expect(mail.ok()).toBeTruthy();
  const body = await mail.json();
  const match = /token=([^\s"&]+)/.exec(body.text as string);
  expect(match).toBeTruthy();
  return match![1];
}

test.describe('Authentication & Login (spec 02)', () => {
  test('TC-02-E2E-01: login happy path', async ({ page, request }) => {
    const email = 'login1@acme.com';
    await seedAccount(request, email);

    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill('Passw0rd');
    await page.getByTestId('login-submit-button').click();

    await expect(page).toHaveURL(/\/members$/);
    await expect(page.getByTestId('members-list')).toBeVisible();
  });

  test('TC-02-E2E-02: wrong-password error message', async ({ page, request }) => {
    const email = 'login2@acme.com';
    await seedAccount(request, email);

    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill('wrong');
    await page.getByTestId('login-submit-button').click();

    await expect(page.getByTestId('login-error-message')).toHaveText('Invalid email or password');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('TC-02-E2E-03: forgot password -> reset -> login with new password', async ({
    page,
    request,
  }) => {
    const email = 'reset@acme.com';
    await seedAccount(request, email, 'Passw0rd');

    await page.goto('/login');
    await page.getByTestId('login-forgot-link').click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByTestId('forgot-email-input').fill(email);
    await page.getByTestId('forgot-submit-button').click();
    await expect(page.getByTestId('forgot-confirmation-message')).toBeVisible();

    const mail = await request.get(`${API}/dev/emails/latest?to=${email}`);
    const body = await mail.json();
    const token = /token=([^\s"&]+)/.exec(body.text as string)?.[1];
    expect(token).toBeTruthy();

    await page.goto(`/reset-password?token=${token}`);
    await expect(page.getByTestId('reset-form')).toBeVisible();
    await page.getByTestId('reset-password-input').fill('NewPass1');
    await page.getByTestId('reset-password-confirm-input').fill('NewPass1');
    await page.getByTestId('reset-submit-button').click();

    await expect(page.getByTestId('reset-success-message')).toBeVisible();
    await page.getByTestId('reset-login-link').click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill('NewPass1');
    await page.getByTestId('login-submit-button').click();
    await expect(page).toHaveURL(/\/members$/);

    // Old password no longer works.
    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill('Passw0rd');
    await page.getByTestId('login-submit-button').click();
    await expect(page.getByTestId('login-error-message')).toHaveText('Invalid email or password');
  });

  test('TC-02-E2E-04: removed member login shows deactivation message', async ({
    page,
    request,
  }) => {
    const email = 'ex@acme.com';
    await seedAccount(request, email);
    await deactivateMember(email);

    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill('Passw0rd');
    await page.getByTestId('login-submit-button').click();

    await expect(page.getByTestId('login-error-message')).toHaveText(
      'Your account has been deactivated, contact your administrator',
    );
  });

  test('TC-02-E2E-05: expired/invalid reset link shows an error and hides the form', async ({
    page,
  }) => {
    await page.goto('/reset-password?token=not-a-real-token');

    await expect(page.getByTestId('reset-error-message')).toHaveText(
      'This reset link is invalid or has expired',
    );
    await expect(page.getByTestId('reset-password-input')).toHaveCount(0);
    await expect(page.getByTestId('reset-submit-button')).toHaveCount(0);
    await expect(page.getByTestId('reset-login-link')).toBeVisible();
  });

  test('TC-02-E2E-06: reset password with confirmation mismatch', async ({ page, request }) => {
    const email = 'mismatch@acme.com';
    await seedAccount(request, email);
    const token = await requestResetToken(request, email);

    await page.goto(`/reset-password?token=${token}`);
    await expect(page.getByTestId('reset-form')).toBeVisible();
    await page.getByTestId('reset-password-input').fill('NewPass1');
    await page.getByTestId('reset-password-confirm-input').fill('NewPass2');

    await expect(page.getByTestId('field-error-password-confirm')).toHaveText(
      'Passwords do not match',
    );
    await expect(page.getByTestId('reset-submit-button')).toBeDisabled();
  });
});
