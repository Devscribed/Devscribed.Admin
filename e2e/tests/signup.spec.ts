import { expect, test } from '@playwright/test';
import { VALID, fillSignup, registerAccount, uniqueEmail } from './helpers';

const focusedTestId = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);

test.describe('01 — Organization Creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByTestId('signup-form')).toBeVisible();
  });

  // TC-01-E2E-01
  test('signs up and lands in the new organization as sole admin', async ({ page }) => {
    const email = uniqueEmail();
    await fillSignup(page, { ...VALID, email });
    await page.getByTestId('signup-submit-button').click();

    await page.waitForURL('**/members');
    const list = page.getByTestId('members-list');
    await expect(list).toBeVisible();

    const rows = list.locator('[data-testid^="member-row-"]');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Pat Owner');
    await expect(rows.first().getByTestId('member-role')).toHaveText('admin');
    await expect(rows.first()).toContainText('active');
  });

  // TC-01-E2E-02
  test('shows inline errors with the exact spec messages', async ({ page }) => {
    await expect(page.getByTestId('signup-submit-button')).toBeEnabled();

    await fillSignup(page, {
      orgName: 'Acme',
      firstName: 'Pat2',
      lastName: 'Owner',
      email: 'not-an-email',
      password: 'short',
    });
    // Blur the last field so every field's validation has run.
    await page.getByTestId('signup-password-input').blur();

    await expect(page.getByTestId('field-error-firstName')).toHaveText(
      'First name may contain only letters, hyphens, apostrophes, and spaces',
    );
    await expect(page.getByTestId('field-error-email')).toHaveText('Enter a valid email address');
    await expect(page.getByTestId('field-error-password')).toHaveText(
      'Password must be at least 8 characters',
    );
    await expect(page.getByTestId('field-error-orgName')).toHaveCount(0);
    await expect(page.getByTestId('field-error-lastName')).toHaveCount(0);
  });

  // TC-01-E2E-03
  test('validates on blur and clears the error on correction', async ({ page }) => {
    const email = page.getByTestId('signup-email-input');

    await email.click();
    await email.blur();
    await expect(page.getByTestId('field-error-email')).toHaveText('Email is required');

    await email.fill('bad');
    await email.blur();
    await expect(page.getByTestId('field-error-email')).toHaveText('Enter a valid email address');

    await email.fill('user@example.com');
    await email.blur();
    await expect(page.getByTestId('field-error-email')).toHaveCount(0);
  });

  // TC-01-E2E-04
  test('password show/hide toggle', async ({ page }) => {
    const password = page.getByTestId('signup-password-input');
    const toggle = page.getByTestId('signup-password-toggle');

    await password.fill('Passw0rd');
    await expect(password).toHaveAttribute('type', 'password');
    await expect(toggle).toHaveAttribute('aria-label', 'Show password');

    await toggle.click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveValue('Passw0rd');
    await expect(toggle).toHaveAttribute('aria-label', 'Hide password');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await toggle.click();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(password).toHaveValue('Passw0rd');
  });

  // TC-01-E2E-05
  test('duplicate email shows the server error in the banner', async ({ page, request }) => {
    const email = uniqueEmail('taken');
    await registerAccount(request, email);

    await page.reload();
    await fillSignup(page, { ...VALID, email });
    await page.getByTestId('signup-submit-button').click();

    await expect(page.getByTestId('signup-error-banner')).toHaveText(
      'This email is already registered',
    );

    // Values are retained and the button is usable again.
    await expect(page.getByTestId('signup-org-name-input')).toHaveValue(VALID.orgName);
    await expect(page.getByTestId('signup-first-name-input')).toHaveValue(VALID.firstName);
    await expect(page.getByTestId('signup-last-name-input')).toHaveValue(VALID.lastName);
    await expect(page.getByTestId('signup-email-input')).toHaveValue(email);
    await expect(page.getByTestId('signup-password-input')).toHaveValue(VALID.password);
    await expect(page.getByTestId('signup-submit-button')).toBeEnabled();

    // The banner clears as soon as the visitor edits a field.
    await page.getByTestId('signup-email-input').fill(uniqueEmail());
    await expect(page.getByTestId('signup-error-banner')).toHaveCount(0);
  });

  // TC-01-E2E-06
  test('submitting an invalid form surfaces every error and focuses the first', async ({ page }) => {
    const submit = page.getByTestId('signup-submit-button');
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/signup')) requests.push(request.url());
    });

    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByTestId('field-error-orgName')).toHaveText('Organization name is required');
    await expect(page.getByTestId('field-error-firstName')).toHaveText('First name is required');
    await expect(page.getByTestId('field-error-lastName')).toHaveText('Last name is required');
    await expect(page.getByTestId('field-error-email')).toHaveText('Email is required');
    await expect(page.getByTestId('field-error-password')).toHaveText('Password is required');
    expect(await focusedTestId(page)).toBe('signup-org-name-input');

    await fillSignup(page, { orgName: 'Acme Inc' });
    await submit.click();
    await expect(page.getByTestId('field-error-orgName')).toHaveCount(0);
    await expect(page.getByTestId('field-error-firstName')).toHaveText('First name is required');
    await expect(page.getByTestId('field-error-lastName')).toHaveText('Last name is required');
    await expect(page.getByTestId('field-error-email')).toHaveText('Email is required');
    await expect(page.getByTestId('field-error-password')).toHaveText('Password is required');
    expect(await focusedTestId(page)).toBe('signup-first-name-input');

    await fillSignup(page, { ...VALID, email: '' });
    await submit.click();
    await expect(page.getByTestId('field-error-email')).toHaveText('Email is required');
    await expect(page.getByTestId('field-error-orgName')).toHaveCount(0);
    await expect(page.getByTestId('field-error-firstName')).toHaveCount(0);
    await expect(page.getByTestId('field-error-lastName')).toHaveCount(0);
    await expect(page.getByTestId('field-error-password')).toHaveCount(0);
    expect(await focusedTestId(page)).toBe('signup-email-input');

    expect(requests).toEqual([]);
  });

  // TC-01-E2E-07
  test('navigates from the login page to signup', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-signup-link').click();

    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByTestId('signup-form')).toBeVisible();
    for (const testId of [
      'signup-org-name-input',
      'signup-first-name-input',
      'signup-last-name-input',
      'signup-email-input',
      'signup-password-input',
      'signup-submit-button',
    ]) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
  });
});
