import { expect, test } from '@playwright/test';

test.describe('Organization Creation (spec 01)', () => {
  test('TC-01-E2E-01: sign up and land in the new organization as sole admin', async ({ page }) => {
    // 1. Open the signup form.
    await page.goto('/signup');
    await expect(page.getByTestId('signup-form')).toBeVisible();

    // 2. Fill organization name, name, email, and a valid password.
    await page.getByTestId('signup-org-name-input').fill('Acme Inc');
    await page.getByTestId('signup-first-name-input').fill('Pat');
    await page.getByTestId('signup-last-name-input').fill('Owner');
    await page.getByTestId('signup-email-input').fill('owner@acme.com');
    await page.getByTestId('signup-password-input').fill('Passw0rd');

    // 3. Submit the form.
    await page.getByTestId('signup-submit-button').click();

    // Lands authenticated in the "Acme Inc" context (the Members list).
    await expect(page).toHaveURL(/\/members$/);

    // 4. The Members list shows exactly one active member, "Pat Owner", role admin.
    const list = page.getByTestId('members-list');
    await expect(list).toBeVisible();

    const rows = list.locator('[data-testid^="member-row-"]');
    await expect(rows).toHaveCount(1);
    await expect(list).toContainText('Pat Owner');
    await expect(list.locator('[data-testid^="member-role-badge-"]')).toHaveText('admin');
  });

  test('keeps submit disabled until the form is valid and surfaces field errors', async ({
    page,
  }) => {
    await page.goto('/signup');

    const submit = page.getByTestId('signup-submit-button');
    // Submit is disabled while required fields are empty/invalid.
    await expect(submit).toBeDisabled();

    await page.getByTestId('signup-org-name-input').fill('Acme Inc');
    await page.getByTestId('signup-first-name-input').fill('Pat');
    await page.getByTestId('signup-last-name-input').fill('Owner');

    // Invalid email → inline field error, submit stays disabled.
    const email = page.getByTestId('signup-email-input');
    await email.fill('not-an-email');
    await email.blur();
    await expect(page.getByTestId('field-error-email')).toBeVisible();
    await expect(submit).toBeDisabled();

    // Fix the email and provide a policy-compliant password → submit enables.
    await email.fill('owner2@acme.com');
    await page.getByTestId('signup-password-input').fill('Passw0rd');
    await expect(submit).toBeEnabled();
  });
});
