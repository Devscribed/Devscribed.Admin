import { expect, test } from '@playwright/test';
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

    // Two titled groups, and the one holding the current route is the one that is open.
    // A group title is a button and not a link: `Hiring` has no screen behind it, so it
    // toggles its section and goes nowhere.
    const people = page.getByRole('button', { name: 'People', exact: true });
    const hiring = page.getByRole('button', { name: 'Hiring', exact: true });
    await expect(people).toHaveAttribute('aria-expanded', 'true');
    await expect(hiring).toHaveAttribute('aria-expanded', 'false');
    // Closed means gone, not merely hidden — a collapsed group holds no rows to tab into.
    await expect(page.getByTestId('nav-vacancies')).toHaveCount(0);

    // Members is where we just landed, and it is inside the group that opened itself.
    await expect(page.getByTestId('nav-members')).toHaveAttribute('aria-current', 'page');

    // The toggle is operable from the keyboard, which is the whole of §13's argument for
    // making it a real button: an `<li onClick>` is one nobody can reach or hear.
    await hiring.focus();
    await page.keyboard.press('Enter');
    await expect(hiring).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('nav-vacancies')).toBeVisible();

    // A hiring row is a real link, so its address can be copied and opened elsewhere.
    await expect(page.getByTestId('nav-vacancies')).toHaveAttribute(
      'href',
      /\/hiring\/vacancies$/,
    );
    // And the renamed row keeps its route: Libraries lives on `/hiring/settings`.
    await expect(page.getByTestId('nav-hiring-settings')).toHaveText('Libraries');
    await expect(page.getByTestId('nav-hiring-settings')).toHaveAttribute(
      'href',
      /\/hiring\/settings$/,
    );
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

    // The cookie is gone, so the guarded route bounces back to the login screen —
    // carrying `?next` now, so that signing in returns the visitor to where they were
    // headed rather than dropping them on the default screen (hiring 04 §01.5).
    await page.goto(appUrl);
    await page.waitForURL('**/login**');
    await expect(page).toHaveURL(/[?&]next=/);
    await expect(page.getByTestId('login-form')).toBeVisible();
  });
});
