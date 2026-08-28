import { expect, test } from './fixtures';
import { VALID, registerAccount, uniqueEmail } from './helpers';

/** Signs in through the UI and waits for the app shell to settle. */
async function signIn(page: import('@playwright/test').Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(VALID.password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL('**/members');
}

test.describe('App shell', () => {
  test('renders the sidebar and the signed-in account', async ({ page, request }) => {
    const email = uniqueEmail('shell');
    await registerAccount(request, email);

    await signIn(page, email);

    await expect(page.getByTestId('app-sidebar')).toBeVisible();
    // Members is the only real destination today, and it is where we just landed.
    await expect(page.getByTestId('nav-members')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('topbar-account-name')).toHaveText(
      `${VALID.firstName} ${VALID.lastName}`,
    );
  });

  test('logging out ends the session and bars the way back', async ({ page, request }) => {
    const email = uniqueEmail('logout');
    await registerAccount(request, email);
    await signIn(page, email);
    const appUrl = page.url();

    await page.getByTestId('topbar-account-button').click();
    await page.getByTestId('logout-button').click();

    await page.waitForURL('**/login');

    // The cookie is gone, so the guarded route bounces back to the login screen.
    await page.goto(appUrl);
    await page.waitForURL('**/login');
    await expect(page.getByTestId('login-form')).toBeVisible();
  });
});
