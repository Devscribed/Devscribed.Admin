import { expect, test, type Page } from '@playwright/test';
import {
  VALID,
  expireEmailChange,
  latestEmailChangeToken,
  requestEmailChangeViaApi,
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

/**
 * Signs in and lands on the Account Settings page with its form loaded (skeleton gone).
 * The Save button only renders once `GET /api/account/settings` has resolved.
 */
async function openSettings(page: Page, email: string, password: string = VALID.password): Promise<void> {
  await signInUi(page, email, password);
  await page.goto('/account/settings');
  await expect(page.getByTestId('account-settings')).toBeVisible();
  await expect(page.getByTestId('account-save-button')).toBeVisible();
}

/**
 * Drives the DS `Select` (a button trigger that pops a list of `<a>` option links) —
 * click the trigger by test id, then the option by its accessible name.
 */
async function selectOption(
  page: Page,
  selectTestId: string,
  optionName: string | RegExp,
): Promise<void> {
  await page.getByTestId(selectTestId).click();
  // `option`, not `link`: the design system's Select renders `role="listbox"` with
  // `role="option"` rows, and an explicit role replaces the implicit `link` an `<a href>`
  // would otherwise carry. It read as `link` while the list was a plain stack of anchors —
  // the version BUG-01/BUG-03 replaced, because a `Card` clipped it to a few pixels.
  await page.getByRole('option', { name: optionName }).click();
}

test.describe('06 — Account Settings', () => {
  // TC-06-E2E-01
  test('edit information persists across reload', async ({ page, request }) => {
    const email = uniqueEmail('settings');
    await signupOrg(request, { orgName: 'Acme Inc', email, timezone: 'America/New_York' });

    // Reach the page through the account menu, exercising the entry point.
    await signInUi(page, email);
    await page.getByTestId('topbar-account-button').click();
    await page.getByTestId('account-settings-menu-link').click();
    await page.waitForURL('**/account/settings');
    await expect(page.getByTestId('account-save-button')).toBeVisible();

    await page.getByTestId('edit-first-name-input').fill('Dima');
    await page.getByTestId('edit-last-name-input').fill('Bezzubenkov');
    await selectOption(page, 'edit-timezone-select', /America\/Los_Angeles/);
    await selectOption(page, 'edit-first-day-select', 'Monday');

    await page.getByTestId('account-save-button').click();
    await expect(page.getByTestId('toast-account-saved')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('edit-first-name-input')).toHaveValue('Dima');
    await expect(page.getByTestId('edit-last-name-input')).toHaveValue('Bezzubenkov');
    await expect(page.getByTestId('edit-timezone-select')).toContainText('America/Los_Angeles');
    await expect(page.getByTestId('edit-first-day-select')).toContainText('Monday');
  });

  // TC-06-E2E-02
  test('change-email confirmation flow lets the new email log in', async ({ page, request }) => {
    const email = uniqueEmail('changer');
    await signupOrg(request, { orgName: 'Acme Inc', email });
    const newEmail = uniqueEmail('new');

    await openSettings(page, email);
    await page.getByTestId('change-email-open-button').click();
    await page.getByTestId('change-email-new-input').fill(newEmail);
    await page.getByTestId('change-email-submit-button').click();

    await expect(page.getByTestId('change-email-confirmation-message')).toContainText(
      `A confirmation link has been sent to ${newEmail}. Please check your inbox.`,
    );

    const token = await latestEmailChangeToken(request, newEmail);
    await page.goto(`/account/confirm-email?token=${encodeURIComponent(token)}`);
    await expect(page.getByTestId('confirm-email-success-message')).toHaveText(
      'Your email has been updated',
    );

    // Log out and sign in with the freshly-confirmed address.
    await page.context().clearCookies();
    await signInUi(page, newEmail);
    await expect(page.getByTestId('members-list')).toBeVisible();
  });

  // TC-06-E2E-03
  test('change-password with a wrong current password shows the server error', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('wrongpw');
    await signupOrg(request, { orgName: 'Acme Inc', email });

    await openSettings(page, email);
    await page.getByTestId('change-password-open-button').click();
    await page.getByTestId('change-password-current-input').fill('wrong');
    await page.getByTestId('change-password-new-input').fill('NewPass1');
    await page.getByTestId('change-password-confirm-input').fill('NewPass1');
    await page.getByTestId('change-password-submit-button').click();

    await expect(page.getByTestId('change-password-error')).toHaveText(
      'Current password is incorrect',
    );
  });

  // TC-06-E2E-04
  test('edit phone number with country code persists across reload', async ({ page, request }) => {
    const email = uniqueEmail('phone');
    await signupOrg(request, { orgName: 'Acme Inc', email, timezone: 'America/New_York' });

    await openSettings(page, email);
    await selectOption(page, 'edit-phone-country-select', /United States \+1$/);
    await page.getByTestId('edit-phone-number-input').fill('(555) 123-4567');

    await page.getByTestId('account-save-button').click();
    await expect(page.getByTestId('toast-account-saved')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('edit-phone-country-select')).toContainText('United States');
    await expect(page.getByTestId('edit-phone-number-input')).toHaveValue('(555) 123-4567');
  });

  // TC-06-E2E-05
  test('first-name validation error shows inline and blocks save', async ({ page, request }) => {
    const email = uniqueEmail('validate');
    await signupOrg(request, { orgName: 'Acme Inc', email, timezone: 'America/New_York' });

    await openSettings(page, email);
    const firstName = page.getByTestId('edit-first-name-input');
    await firstName.fill('Pat2');
    await firstName.blur();

    await expect(page.getByTestId('field-error-firstName')).toHaveText(
      'First name may contain only letters, hyphens, apostrophes, and spaces',
    );
    await expect(page.getByTestId('account-save-button')).toBeDisabled();
  });

  // TC-06-E2E-06
  test('email confirmation screen — valid token', async ({ page, request }) => {
    const email = uniqueEmail('valid');
    await signupOrg(request, { orgName: 'Acme Inc', email });
    const newEmail = uniqueEmail('valid-new');
    await requestEmailChangeViaApi(request, newEmail);
    const token = await latestEmailChangeToken(request, newEmail);

    await page.goto(`/account/confirm-email?token=${encodeURIComponent(token)}`);

    await expect(page.getByTestId('confirm-email-screen')).toBeVisible();
    await expect(page.getByTestId('confirm-email-success-message')).toHaveText(
      'Your email has been updated',
    );
    await expect(page.getByTestId('confirm-email-login-link')).toBeVisible();
  });

  // TC-06-E2E-07
  test('email confirmation screen — expired token', async ({ page, request }) => {
    const email = uniqueEmail('expired');
    await signupOrg(request, { orgName: 'Acme Inc', email });
    const newEmail = uniqueEmail('expired-new');
    await requestEmailChangeViaApi(request, newEmail);
    const token = await latestEmailChangeToken(request, newEmail);
    await expireEmailChange(request, newEmail);

    await page.goto(`/account/confirm-email?token=${encodeURIComponent(token)}`);

    await expect(page.getByTestId('confirm-email-error')).toHaveText(
      'This confirmation link has expired',
    );
    await expect(page.getByTestId('confirm-email-success-message')).toHaveCount(0);
    await expect(page.getByTestId('confirm-email-login-link')).toHaveCount(0);
  });

  // TC-06-E2E-08
  test('email confirmation screen — invalid token', async ({ page }) => {
    await page.goto('/account/confirm-email?token=invalid-garbage-token');

    await expect(page.getByTestId('confirm-email-error')).toHaveText(
      'This confirmation link is no longer valid',
    );
    await expect(page.getByTestId('confirm-email-success-message')).toHaveCount(0);
    await expect(page.getByTestId('confirm-email-login-link')).toHaveCount(0);
  });

  // TC-06-E2E-09
  test('change-password happy path lets the new password log in', async ({ page, request }) => {
    const email = uniqueEmail('newpw');
    await signupOrg(request, { orgName: 'Acme Inc', email });

    await openSettings(page, email);
    await page.getByTestId('change-password-open-button').click();
    await page.getByTestId('change-password-current-input').fill(VALID.password);
    await page.getByTestId('change-password-new-input').fill('NewPass1');
    await page.getByTestId('change-password-confirm-input').fill('NewPass1');
    await page.getByTestId('change-password-submit-button').click();

    await expect(page.getByText('Your password has been changed.')).toBeVisible();

    await page.context().clearCookies();
    await signInUi(page, email, 'NewPass1');
    await expect(page.getByTestId('members-list')).toBeVisible();
  });

  // TC-06-E2E-10
  test('change-password confirmation mismatch shows inline error and disables submit', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('mismatch');
    await signupOrg(request, { orgName: 'Acme Inc', email });

    await openSettings(page, email);
    await page.getByTestId('change-password-open-button').click();
    await page.getByTestId('change-password-current-input').fill(VALID.password);
    await page.getByTestId('change-password-new-input').fill('NewPass1');
    const confirm = page.getByTestId('change-password-confirm-input');
    await confirm.fill('NewPass2');
    await confirm.blur();

    await expect(page.getByTestId('field-error-passwordConfirmation')).toHaveText(
      'Passwords do not match',
    );
    await expect(page.getByTestId('change-password-submit-button')).toBeDisabled();
  });

  // TC-06-E2E-11
  test('change-email same as current email shows the error', async ({ page, request }) => {
    const email = uniqueEmail('same');
    await signupOrg(request, { orgName: 'Acme Inc', email });

    await openSettings(page, email);
    await page.getByTestId('change-email-open-button').click();
    await page.getByTestId('change-email-new-input').fill(email);
    await page.getByTestId('change-email-submit-button').click();

    await expect(page.getByTestId('change-email-error')).toHaveText(
      'This is already your email address',
    );
  });
});
