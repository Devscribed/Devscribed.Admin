import { expect, test, type Page } from './fixtures';
import {
  VALID,
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
});
