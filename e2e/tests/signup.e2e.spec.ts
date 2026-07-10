import { APIRequestContext, expect, Page, test } from '@playwright/test';

const API = 'http://localhost:4000/api';

async function seedAccount(request: APIRequestContext, email: string): Promise<void> {
  const res = await request.post(`${API}/auth/signup`, {
    data: { orgName: 'Acme Inc', firstName: 'Pat', lastName: 'Owner', email, password: 'Passw0rd' },
  });
  expect(res.ok()).toBeTruthy();
}

async function fillBlur(page: Page, testId: string, value: string): Promise<void> {
  const input = page.getByTestId(testId);
  await input.fill(value);
  await input.blur();
}

test.describe('Organization Creation (spec 01)', () => {
  test('TC-01-E2E-01: sign up and land in the new organization as sole admin', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByTestId('signup-form')).toBeVisible();

    await page.getByTestId('signup-org-name-input').fill('Acme Inc');
    await page.getByTestId('signup-first-name-input').fill('Pat');
    await page.getByTestId('signup-last-name-input').fill('Owner');
    await page.getByTestId('signup-email-input').fill('owner@acme.com');
    await page.getByTestId('signup-password-input').fill('Passw0rd');
    await page.getByTestId('signup-submit-button').click();

    await expect(page).toHaveURL(/\/members$/);
    const list = page.getByTestId('members-list');
    await expect(list).toBeVisible();
    const rows = list.locator('[data-testid^="member-row-"]');
    await expect(rows).toHaveCount(1);
    await expect(list).toContainText('Pat Owner');
    await expect(list.locator('[data-testid^="member-role-badge-"]')).toHaveText('admin');
  });

  test('TC-01-E2E-02: validation errors show inline with specific messages', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByTestId('signup-submit-button')).toBeDisabled();

    await fillBlur(page, 'signup-org-name-input', 'Acme');
    await fillBlur(page, 'signup-first-name-input', 'Pat2'); // invalid: digit
    await fillBlur(page, 'signup-last-name-input', 'Owner');
    await fillBlur(page, 'signup-email-input', 'not-an-email');
    await fillBlur(page, 'signup-password-input', 'short');

    await expect(page.getByTestId('field-error-firstName')).toHaveText(
      'First name may contain only letters, hyphens, apostrophes, and spaces',
    );
    await expect(page.getByTestId('field-error-email')).toHaveText('Enter a valid email address');
    await expect(page.getByTestId('field-error-password')).toHaveText(
      'Password must be at least 8 characters',
    );
    await expect(page.getByTestId('signup-submit-button')).toBeDisabled();
  });

  test('TC-01-E2E-03: inline validation fires on blur and clears on correction', async ({
    page,
  }) => {
    await page.goto('/signup');
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

  test('TC-01-E2E-04: password show/hide toggle', async ({ page }) => {
    await page.goto('/signup');
    const password = page.getByTestId('signup-password-input');
    await password.fill('Passw0rd');

    await expect(password).toHaveAttribute('type', 'password');
    await page.getByTestId('signup-password-toggle').click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveValue('Passw0rd');
    await page.getByTestId('signup-password-toggle').click();
    await expect(password).toHaveAttribute('type', 'password');
  });

  test('TC-01-E2E-05: duplicate email shows server error in banner', async ({ page, request }) => {
    await seedAccount(request, 'dupe@acme.com');

    await page.goto('/signup');
    await page.getByTestId('signup-org-name-input').fill('Acme Inc');
    await page.getByTestId('signup-first-name-input').fill('Pat');
    await page.getByTestId('signup-last-name-input').fill('Owner');
    await page.getByTestId('signup-email-input').fill('dupe@acme.com');
    await page.getByTestId('signup-password-input').fill('Passw0rd');
    await page.getByTestId('signup-submit-button').click();

    await expect(page.getByTestId('signup-error-banner')).toHaveText(
      'This email is already registered',
    );
    await expect(page.getByTestId('signup-email-input')).toHaveValue('dupe@acme.com');
    await expect(page).toHaveURL(/\/signup$/);
  });

  test('TC-01-E2E-06: submit button disabled until all fields valid', async ({ page }) => {
    await page.goto('/signup');
    const submit = page.getByTestId('signup-submit-button');
    await expect(submit).toBeDisabled();

    await page.getByTestId('signup-org-name-input').fill('Acme Inc');
    await expect(submit).toBeDisabled();

    await page.getByTestId('signup-first-name-input').fill('Pat');
    await page.getByTestId('signup-last-name-input').fill('Owner');
    await page.getByTestId('signup-email-input').fill('valid@acme.com');
    await page.getByTestId('signup-password-input').fill('Passw0rd');
    await expect(submit).toBeEnabled();

    await page.getByTestId('signup-email-input').fill('');
    await expect(submit).toBeDisabled();
  });

  test('TC-01-E2E-07: navigation from login page to signup', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-signup-link').click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByTestId('signup-form')).toBeVisible();
  });
});
