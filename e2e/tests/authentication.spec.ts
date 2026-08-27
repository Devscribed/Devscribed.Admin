import { expect, test } from '@playwright/test';
import { API, VALID, latestResetToken, registerAccount, requestReset, uniqueEmail } from './helpers';

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

  // TC-02-E2E-02
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

  /**
   * TC-02-E2E-04 needs a member whose status is `removed`, and nothing can produce one
   * until spec 04 ships the removal endpoint. The rule itself is already covered at the
   * API level by TC-02-INT-04 and TC-02-INT-04b; only the amber banner is unproven here.
   */
  test.skip('TC-02-E2E-04 removed member sees the deactivation message — needs spec 04', () => {});

  // TC-02-E2E-05
  test('a dead reset link shows the error and hides the fields', async ({ page, request }) => {
    const email = uniqueEmail('expired');
    await registerAccount(request, email);
    await requestReset(request, email);
    const used = await latestResetToken(request, email);

    // Spend it, so the link is genuinely dead rather than merely malformed.
    await request.post(`${API}/api/reset-password`, {
      data: { token: used, password: 'NewPass1', passwordConfirmation: 'NewPass1' },
    });

    for (const url of [
      `/reset-password?token=${encodeURIComponent(used)}`,
      '/reset-password?token=not-a-real-token',
      '/reset-password',
    ]) {
      await page.goto(url);
      await expect(page.getByTestId('reset-error-message')).toHaveText(
        'This reset link is invalid or has expired',
      );
      await expect(page.getByTestId('reset-password-input')).toHaveCount(0);
      await expect(page.getByTestId('reset-password-confirm-input')).toHaveCount(0);
      await expect(page.getByTestId('reset-submit-button')).toHaveCount(0);
      await expect(page.getByTestId('reset-login-link')).toBeVisible();
    }
  });

  // TC-02-E2E-06
  test('confirmation mismatch blocks submission and marks only the confirm field', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('mismatch');
    await registerAccount(request, email);
    await requestReset(request, email);
    const token = await latestResetToken(request, email);

    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/reset-password')) posts.push(r.url());
    });

    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
    await page.getByTestId('reset-password-input').fill('NewPass1');
    await page.getByTestId('reset-password-confirm-input').fill('NewPass2');
    await page.getByTestId('reset-submit-button').click();

    await expect(page.getByTestId('field-error-password-confirm')).toHaveText(
      'Passwords do not match',
    );
    await expect(page.getByTestId('field-error-password')).toHaveCount(0);
    await expect(page.getByTestId('reset-form')).toBeVisible();
    expect(posts).toEqual([]);

    // Correcting the confirmation clears the error live.
    await page.getByTestId('reset-password-confirm-input').fill('NewPass1');
    await expect(page.getByTestId('field-error-password-confirm')).toHaveCount(0);
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

  // TC-02-E2E-08
  test('forgot-password validates the email before sending anything', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/forgot-password')) posts.push(r.url());
    });

    await page.goto('/forgot-password');
    await page.getByTestId('forgot-submit-button').click();
    await expect(page.getByTestId('field-error-email')).toHaveText('Email is required');

    await page.getByTestId('forgot-email-input').fill('pat@acme');
    await page.getByTestId('forgot-submit-button').click();
    await expect(page.getByTestId('field-error-email')).toHaveText('Enter a valid email address');
    expect(posts).toEqual([]);

    await page.getByTestId('forgot-email-input').fill(uniqueEmail('nobody'));
    await page.getByTestId('forgot-submit-button').click();
    await expect(page.getByTestId('forgot-confirmation-message')).toBeVisible();
    expect(posts).toHaveLength(1);
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

  // TC-02-E2E-10
  test('forgot-password re-entry restores the form', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/forgot-password')) posts.push(r.url());
    });

    await page.goto('/forgot-password');
    await page.getByTestId('forgot-email-input').fill(uniqueEmail('typo'));
    await page.getByTestId('forgot-submit-button').click();
    await expect(page.getByTestId('forgot-confirmation-message')).toBeVisible();
    await expect(page.getByTestId('forgot-form')).toHaveCount(0);
    expect(posts).toHaveLength(1);

    await page.getByTestId('forgot-retry-link').click();

    await expect(page.getByTestId('forgot-form')).toBeVisible();
    await expect(page.getByTestId('forgot-email-input')).toHaveValue('');
    await expect(page.getByTestId('forgot-confirmation-message')).toHaveCount(0);
    expect(posts).toHaveLength(1);
  });

  // The reflection rule: both signed-out screens put the cross-account link in the footer.
  test('login and signup link to each other', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-signup-link').click();
    await expect(page).toHaveURL(/\/signup$/);

    await page.getByTestId('signup-login-link').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('login-form')).toBeVisible();
  });
});
