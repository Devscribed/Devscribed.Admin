import { expect, test } from './fixtures';
import { VALID, fillSignup, uniqueEmail } from './helpers';

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
    // Spec 04 renders the role as `member-role-badge-{id}`, not a bare `member-role`
    // testid, and gives active rows no status badge at all (only removed rows get one).
    await expect(rows.first().locator('[data-testid^="member-role-badge-"]')).toHaveText('admin');
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

  // TC-01-E2E-07 — both legs. The reverse link used to be proved by its own test in
  // authentication.spec.ts; it is three assertions on a page this test has already
  // loaded, so it costs nothing here and a whole browser there.
  test('login and signup link to each other', async ({ page }) => {
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

    await page.getByTestId('signup-login-link').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('login-form')).toBeVisible();
  });
});
