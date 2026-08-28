import { expect, test } from './fixtures';
import { API, VALID, uniqueEmail } from './helpers';

/**
 * The organization id sits in the URL, so it is guessable. This is the scenario that
 * justifies validating it on the server: a signed-in member typing someone else's id
 * must get nothing back.
 */
test.describe('Organization scope', () => {
  test('another organization id in the URL yields nothing', async ({ page, request }) => {
    // Two organizations, created straight through the API — preconditions, not the subject.
    const stranger = uniqueEmail('stranger');
    const strangerSignup = await request.post(`${API}/api/signup`, {
      data: { ...VALID, email: stranger, orgName: 'Globex' },
    });
    const strangerOrgId = (await strangerSignup.json()).organization.id;

    const mine = uniqueEmail('scoped');
    await request.post(`${API}/api/signup`, {
      data: { ...VALID, email: mine, orgName: 'Acme Inc' },
    });

    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(mine);
    await page.getByTestId('login-password-input').fill(VALID.password);
    await page.getByTestId('login-submit-button').click();
    await page.waitForURL('**/members');

    // The API refuses the list outright — the boundary does not depend on the client.
    const direct = await page.request.get(
      `${API}/api/organizations/${strangerOrgId}/members`,
    );
    expect(direct.status()).toBe(404);

    // And the screen never renders for that organization.
    await page.goto(`/org/${strangerOrgId}/members`);
    await expect(page.getByTestId('members-list')).toHaveCount(0);
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0);
    expect(await page.content()).not.toContain(stranger);
  });
});
