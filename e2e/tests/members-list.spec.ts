import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  VALID,
  findMember,
  inviteAndAcceptViaApi,
  login,
  removeMember,
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

  // TC-04-E2E-02
  test('"Show removed" adds removed rows with a distinct badge', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const removedEmail = await addMember(request, adminEmail, 'user', 'Riley', 'Removed');
    const target = await findMember(request, org.organizationId, removedEmail);
    await removeMember(request, org.organizationId, target.id);

    await signInUi(page, adminEmail);
    const list = page.getByTestId('members-list');
    await expect(list).toBeVisible();

    // Default view: the removed member is not shown at all.
    await expect(list.getByText('Riley Removed')).toHaveCount(0);

    await page.getByTestId('show-removed-checkbox').click();

    const removedRow = list.locator('[data-testid^="member-row-"]:not([data-testid^="member-row-actions-"])', { hasText: 'Riley Removed' });
    await expect(removedRow).toBeVisible();
    await expect(removedRow.getByTestId(`member-status-badge-${target.id}`)).toHaveText('Removed');

    // Active rows carry no status badge.
    const adminRow = list.locator('[data-testid^="member-row-"]:not([data-testid^="member-row-actions-"])', { hasText: 'Pat Owner' });
    await expect(adminRow.locator('[data-testid^="member-status-badge-"]')).toHaveCount(0);
  });

  // TC-04-E2E-03
  test('admin deletes an active member, then restores them', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    // A second admin keeps the zero-admin guard out of play.
    await addMember(request, adminEmail, 'admin', 'Ash', 'Admin');
    await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');

    await signInUi(page, adminEmail);
    const list = page.getByTestId('members-list');
    await expect(list).toBeVisible();

    await page.getByTestId('members-search-input').fill('Alex');
    const row = list.locator('[data-testid^="member-row-"]:not([data-testid^="member-row-actions-"])', { hasText: 'Alex Kaminski' });
    await expect(row).toHaveCount(1);

    const rowTestId = await row.getAttribute('data-testid'); // "member-row-{id}"
    const memberId = rowTestId!.replace('member-row-', '');

    await page.getByTestId(`member-row-actions-${memberId}`).click();
    await page.getByTestId('member-action-delete').click();

    const dialog = page.getByTestId('confirm-delete-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Alex Kaminski');
    await page.getByTestId('confirm-delete-button').click();

    await expect(page.getByTestId('toast-member-removed')).toBeVisible();
    await expect(
      list.locator('[data-testid^="member-row-"]:not([data-testid^="member-row-actions-"])', { hasText: 'Alex Kaminski' }),
    ).toHaveCount(0);

    await page.getByTestId('members-search-input').fill('');
    await page.getByTestId('show-removed-checkbox').click();

    const removedRow = list.locator('[data-testid^="member-row-"]:not([data-testid^="member-row-actions-"])', { hasText: 'Alex Kaminski' });
    await expect(removedRow).toBeVisible();
    await expect(removedRow.getByTestId(`member-status-badge-${memberId}`)).toHaveText('Removed');

    await page.getByTestId(`member-row-actions-${memberId}`).click();
    await expect(page.getByTestId('member-action-delete')).toHaveCount(0);
    await page.getByTestId('member-action-restore').click();

    await expect(page.getByTestId('toast-member-restored')).toBeVisible();
    await expect(removedRow.getByTestId(`member-status-badge-${memberId}`)).toHaveCount(0);

    await page.getByTestId('show-removed-checkbox').click();
    await expect(
      list.locator('[data-testid^="member-row-"]:not([data-testid^="member-row-actions-"])', { hasText: 'Alex Kaminski' }),
    ).toBeVisible();
  });

  // TC-04-E2E-04
  for (const role of ['user', 'viewer'] as const) {
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

  // TC-04-E2E-05
  test('self-delete not available in the UI', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    await addMember(request, adminEmail, 'admin', 'Ash', 'Admin');

    await signInUi(page, adminEmail);
    const list = page.getByTestId('members-list');
    await expect(list).toBeVisible();

    const self = await findMember(request, org.organizationId, adminEmail);
    const ownRow = page.getByTestId(`member-row-${self.id}`);
    await expect(ownRow).toBeVisible();
    // MembersTable never renders a menu at all for the caller's own row.
    await expect(ownRow.getByTestId(`member-row-actions-${self.id}`)).toHaveCount(0);
  });

  // TC-04-E2E-06
  test('member list shows name, role badge, and email columns', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const memberEmail = await addMember(request, adminEmail, 'manager', 'Sam', 'Manager');

    await signInUi(page, adminEmail);
    const member = await findMember(request, org.organizationId, memberEmail);

    const row = page.getByTestId(`member-row-${member.id}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId(`member-name-${member.id}`)).toHaveText('Sam Manager');
    await expect(row.getByTestId(`member-role-badge-${member.id}`)).toHaveText('manager');
    await expect(row.getByTestId(`member-email-${member.id}`)).toHaveText(memberEmail);
  });

  // TC-04-E2E-07
  test('member row links to detail page', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    const memberEmail = await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');
    const member = await findMember(request, org.organizationId, memberEmail);

    await signInUi(page, adminEmail);
    await page.getByTestId(`member-row-${member.id}`).click();

    await expect(page).toHaveURL(new RegExp(`/org/${org.organizationId}/members/${member.id}$`));
    await expect(page.getByTestId('member-detail')).toBeVisible();
  });

  // TC-04-E2E-08
  test('no role-change controls on the list page', async ({ page, request }) => {
    const adminEmail = uniqueEmail('admin');
    await signupOrg(request, { orgName: 'Acme Inc', email: adminEmail });
    await addMember(request, adminEmail, 'user', 'Alex', 'Kaminski');

    await signInUi(page, adminEmail);
    const list = page.getByTestId('members-list');
    await expect(list).toBeVisible();
    await expect(list.locator('[data-testid^="member-role-badge-"]').first()).toBeVisible();
    await expect(page.locator('[data-testid^="member-role-select-"]')).toHaveCount(0);
  });

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
