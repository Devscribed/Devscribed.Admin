import { expect, test, type APIRequestContext, type Page } from './fixtures';
import {
  VALID,
  inviteAndAcceptViaApi,
  login,
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
 * Invites+accepts a new member at `role` and returns their email. Accepting swaps the
 * `request` cookie jar to the new member (`inviteAndAcceptViaApi`'s doc comment), so
 * this logs back in as `adminEmail` both before sending the invite and after accepting
 * it — every call leaves the jar authenticated as the admin, ready for the next one or
 * for a direct API precondition call (`findMember`, `removeMember`).
 */
async function addMember(
  request: APIRequestContext,
  adminEmail: string,
  role: string,
  firstName: string,
  lastName: string,
): Promise<string> {
  await login(request, adminEmail);
  const email = uniqueEmail(firstName.toLowerCase());
  await inviteAndAcceptViaApi(request, email, role, { firstName, lastName });
  await login(request, adminEmail);
  return email;
}

test.describe('04 — Member List & Management', () => {
  // TC-04-E2E-01
  test('search-as-you-type narrows the list, debounced', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    await addMember(request, adminEmail, 'user', 'Alan', 'Turing');
    await addMember(request, adminEmail, 'user', 'Alexa', 'Chen');
    await addMember(request, adminEmail, 'user', 'Beth', 'Carter');

    await signInUi(page, adminEmail);
    const list = page.getByTestId('members-list');
    await expect(list).toBeVisible();
    const rows = list.locator('[data-testid^="member-row-"]:not([data-testid^="member-row-actions-"])');
    await expect(rows).toHaveCount(4); // admin + 3 invitees

    const search = page.getByTestId('members-search-input');

    await search.fill('Al');
    await expect(rows).toHaveCount(2);
    await expect(list.getByText('Alan Turing')).toBeVisible();
    await expect(list.getByText('Alexa Chen')).toBeVisible();

    await search.fill('Alex');
    await expect(rows).toHaveCount(1);
    await expect(list.getByText('Alexa Chen')).toBeVisible();

    await search.fill('');
    await expect(rows).toHaveCount(4);
  });

  // TC-04-E2E-04 — one role, not both. `user` and `viewer` are one rule with two names
  // and the API refuses both (members int: "rejects delete/restore from user and
  // viewer"). What only a browser can prove is that the menu is never drawn; one
  // read-only role proves it, and the second costs a whole browser to prove it again.
  for (const role of ['user'] as const) {
    test(`${role} sees the list but no actions menu`, async ({ page, request }) => {
      const adminEmail = uniqueEmail('admin');
      await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
      const readOnlyEmail = await addMember(request, adminEmail, role, 'Ronnie', 'Reader');
      await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');

      await signInUi(page, readOnlyEmail);
      const list = page.getByTestId('members-list');
      await expect(list).toBeVisible();

      await page.getByTestId('members-search-input').fill('Alex');
      await expect(
        list.locator('[data-testid^="member-row-"]:not([data-testid^="member-row-actions-"])', { hasText: 'Alex Kaminski' }),
      ).toBeVisible();

      await expect(page.locator('[data-testid^="member-row-actions-"]')).toHaveCount(0);
      await expect(page.getByTestId('member-action-delete')).toHaveCount(0);
      await expect(page.getByTestId('member-action-restore')).toHaveCount(0);
    });
  }

  // TC-04-E2E-09
  test('skeleton loading state shown while fetching', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });

    // Delays only the members-list GET (not the login POST or any other call) so the
    // skeleton has time to render before the real data arrives.
    await page.route(/\/api\/organizations\/[^/]+\/members(\?.*)?$/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(adminEmail);
    await page.getByTestId('login-password-input').fill(VALID.password);
    await page.getByTestId('login-submit-button').click();
    await page.waitForURL('**/members');

    await expect(page.getByTestId('members-loading-skeleton')).toBeVisible();
    await expect(page.getByTestId('members-list')).toBeVisible();
  });
});
