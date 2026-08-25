import { expect, test } from '@playwright/test';
import { registerOrganization, signIn, uniqueEmail } from './helpers';

/**
 * TC-H01-E2E-01 — create a vacancy and copy its booking link.
 *
 * The spec's step 3 types a category and creates it; categories belong to the library
 * spec and are not built yet, so that step is absent here and returns with them.
 */
test.describe('Vacancies', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('creates a vacancy and copies its booking link', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('hiring'));
    await signIn(page, org.email);

    await page.getByTestId('nav-vacancies').click();
    await page.waitForURL('**/hiring/vacancies');
    await expect(page.getByTestId('vacancies-empty-state')).toBeVisible();

    await page.getByTestId('vacancy-new-button').click();
    await expect(page.getByTestId('vacancy-dialog')).toBeVisible();

    await page.getByTestId('vacancy-title-input').fill('Senior React Engineer');
    await page.getByTestId('vacancy-interviewer-select').click();
    await page.getByTestId(`vacancy-interviewer-option-${org.accountId}`).click();
    await page.getByTestId('vacancy-duration-60').click();

    await page.getByTestId('vacancy-submit-button').click();

    await expect(page.getByTestId('vacancy-dialog')).toBeHidden();
    await expect(page.getByTestId('toast-vacancy-created')).toHaveText('Vacancy created');
    await expect(page.getByTestId('vacancy-detail')).toBeVisible();

    const link = page.getByTestId('vacancy-booking-link');
    await expect(link).toBeVisible();
    // The title's slug plus a random suffix — the same title never collides.
    await expect(link).toHaveText(/\/book\/senior-react-engineer-[A-Za-z0-9_-]{12}$/);

    await page.getByTestId('vacancy-copy-link-button').click();
    await expect(page.getByTestId('toast-link-copied')).toHaveText('Booking link copied');

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(await link.textContent());
  });

  test('lists the new vacancy with its interviewer, length and count', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('hiring-list'));
    await signIn(page, org.email);

    await page.goto(page.url().replace('/members', '/hiring/vacancies'));
    await page.getByTestId('vacancy-new-button').click();
    await page.getByTestId('vacancy-title-input').fill('DotNet Engineer');
    await page.getByTestId('vacancy-interviewer-select').click();
    await page.getByTestId(`vacancy-interviewer-option-${org.accountId}`).click();
    await page.getByTestId('vacancy-duration-45').click();
    await page.getByTestId('vacancy-submit-button').click();
    await expect(page.getByTestId('vacancy-detail')).toBeVisible();

    await page.goBack();
    await page.reload();

    const row = page.getByTestId('vacancies-list').getByText('DotNet Engineer');
    await expect(row).toBeVisible();
    await expect(page.getByTestId('vacancies-list')).toContainText('Pat Owner');
    await expect(page.getByTestId('vacancies-list')).toContainText('45 min');
    await expect(page.getByTestId('vacancies-list')).toContainText('Open');
  });
});
