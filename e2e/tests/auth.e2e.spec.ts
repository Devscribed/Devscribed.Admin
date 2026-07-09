import { APIRequestContext, expect, test } from '@playwright/test';

const API = 'http://localhost:4000/api';

/** Create an active account (with its org + admin membership) via the signup API. */
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

    await expect(page.getByTestId('login-error-message')).toHaveText('invalid email or password');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('TC-02-E2E-03: forgot password -> reset -> login with new password', async ({
    page,
    request,
  }) => {
    const email = 'reset@acme.com';
    await seedAccount(request, email, 'Passw0rd');

    // 1. From the login screen, follow "Forgot password?" and submit the email.
    await page.goto('/login');
    await page.getByTestId('login-forgot-link').click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByTestId('forgot-email-input').fill(email);
    await page.getByTestId('forgot-submit-button').click();
    await expect(page.getByTestId('forgot-confirmation-message')).toBeVisible();

    // 2. Read the reset link from the test mail sink.
    const mail = await request.get(`${API}/dev/emails/latest?to=${email}`);
    expect(mail.ok()).toBeTruthy();
    const body = await mail.json();
    const token = /token=([a-f0-9]+)/.exec(body.text as string)?.[1];
    expect(token).toBeTruthy();

    // 3. Open the reset link and set a new password.
    await page.goto(`/reset-password?token=${token}`);
    await page.getByTestId('reset-password-input').fill('NewPass1');
    await page.getByTestId('reset-password-confirm-input').fill('NewPass1');
    await page.getByTestId('reset-submit-button').click();
    await expect(page.getByRole('heading', { name: /password updated/i })).toBeVisible();

    // 4. Sign in with the new password.
    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill('NewPass1');
    await page.getByTestId('login-submit-button').click();
    await expect(page).toHaveURL(/\/members$/);

    // 5. The old password no longer works.
    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill('Passw0rd');
    await page.getByTestId('login-submit-button').click();
    await expect(page.getByTestId('login-error-message')).toHaveText('invalid email or password');
    await expect(page).toHaveURL(/\/login$/);
  });
});
