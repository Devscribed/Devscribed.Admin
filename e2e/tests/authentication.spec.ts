import { expect, test } from './fixtures';
import {
  VALID,
  latestResetToken,
  registerAccount,
  uniqueEmail,
} from './helpers';

const focusedTestId = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);

test.describe('02 — Authentication & Login', () => {
  // TC-02-E2E-01
  test('signs in and lands on the members list', async ({ page, request }) => {
    const email = uniqueEmail('signin');
    await registerAccount(request, email);

    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill(VALID.password);
    await page.getByTestId('login-submit-button').click();

    await page.waitForURL('**/members');
    await expect(page.getByTestId('members-list')).toBeVisible();
  });

  // TC-02-E2E-02 — the one place in the suite that proves a *server* error reaches a form.
  // Every other case of that shape moved to integration; this one stays because a client
  // that swallows a 4xx and shows nothing is a failure no API test can see.
  test('wrong password shows the generic error and keeps the values', async ({ page, request }) => {
    const email = uniqueEmail('wrongpw');
    await registerAccount(request, email);

    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill('wrongpass1');
    await page.getByTestId('login-submit-button').click();

    await expect(page.getByTestId('login-error-message')).toHaveText('Invalid email or password');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('login-email-input')).toHaveValue(email);
    await expect(page.getByTestId('login-password-input')).toHaveValue('wrongpass1');
    await expect(page.getByTestId('login-submit-button')).toBeEnabled();

    // The banner clears the moment anything is edited.
    await page.getByTestId('login-password-input').fill('Passw0rd');
    await expect(page.getByTestId('login-error-message')).toHaveCount(0);
  });

  // TC-02-E2E-03
  test('forgot password → reset → sign in with the new password', async ({ page, request }) => {
    const email = uniqueEmail('reset');
    await registerAccount(request, email);

    await page.goto('/login');
    await page.getByTestId('login-forgot-link').click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByTestId('forgot-form')).toBeVisible();

    await page.getByTestId('forgot-email-input').fill(email);
    await page.getByTestId('forgot-submit-button').click();
    await expect(page.getByTestId('forgot-confirmation-message')).toHaveText(
      'If an account exists, a reset link has been sent.',
    );
    await expect(page.getByTestId('forgot-form')).toHaveCount(0);

    const token = await latestResetToken(request, email);
    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
    await expect(page.getByTestId('reset-form')).toBeVisible();
    await expect(page.getByTestId('reset-checking')).toHaveCount(0);

    await page.getByTestId('reset-password-input').fill('NewPass1');
    await page.getByTestId('reset-password-confirm-input').fill('NewPass1');
    await page.getByTestId('reset-submit-button').click();

    await expect(page.getByTestId('reset-success-message')).toHaveText(
      'Your password has been reset.',
    );
    await expect(page.getByTestId('reset-form')).toHaveCount(0);

    await page.getByTestId('reset-login-link').click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill('NewPass1');
    await page.getByTestId('login-submit-button').click();
    await page.waitForURL('**/members');

    // The old password is dead.
    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill(VALID.password);
    await page.getByTestId('login-submit-button').click();
    await expect(page.getByTestId('login-error-message')).toHaveText('Invalid email or password');
  });

  // TC-02-E2E-07
  test('submitting an invalid login shows every error and focuses the first', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/login')) posts.push(r.url());
    });

    await page.goto('/login');
    const submit = page.getByTestId('login-submit-button');
    await expect(submit).toBeEnabled();

    await submit.click();
    await expect(page.getByTestId('field-error-email')).toHaveText('Email is required');
    await expect(page.getByTestId('field-error-password')).toHaveText('Password is required');
    expect(await focusedTestId(page)).toBe('login-email-input');
    await expect(submit).toBeEnabled();

    await page.getByTestId('login-email-input').fill('not-an-email');
    await page.getByTestId('login-password-input').fill('Passw0rd');
    await submit.click();
    await expect(page.getByTestId('field-error-email')).toHaveText('Enter a valid email address');
    await expect(page.getByTestId('field-error-password')).toHaveCount(0);
    expect(await focusedTestId(page)).toBe('login-email-input');

    expect(posts).toEqual([]);
  });

  // TC-02-E2E-09
  test('password reveal toggle on login', async ({ page }) => {
    await page.goto('/login');
    const password = page.getByTestId('login-password-input');
    const toggle = page.getByTestId('login-password-toggle');

    await password.fill('Passw0rd');
    await expect(password).toHaveAttribute('type', 'password');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveValue('Passw0rd');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(await focusedTestId(page)).toBe('login-password-input');

    await toggle.click();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(password).toHaveValue('Passw0rd');
  });
});
