import { expect, test } from '@playwright/test';
import {
  createCategory,
  createVacancy,
  registerOrganization,
  signIn,
  uniqueEmail,
} from './helpers';

/**
 * The category library (spec 06 §01 §02) — the inline path in the vacancy dialog, and
 * the settings screen that maintains what it creates.
 *
 * The criteria half of this screen arrives with its own phase.
 */
test.describe('Category library', () => {
  /**
   * TC-H06-E2E-02 — a case-insensitive duplicate is offered, never created.
   *
   * This is the rule the whole library rests on, seen from where it matters most: the
   * member typing into a vacancy, who must be given `React` rather than a second entry
   * or an error.
   */
  test('offers the existing category when a case variant is typed', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('lib-dup'));
    const react = await createCategory(request, org, 'React');
    await signIn(page, org.email);

    await page.goto(`/org/${org.organizationId}/hiring/vacancies`);
    await page.getByTestId('vacancy-new-button').click();
    await expect(page.getByTestId('vacancy-dialog')).toBeVisible();

    await page.getByTestId('vacancy-categories-input').fill('react');

    // The existing entry, under the name it was actually stored with.
    const existing = page.getByTestId(`vacancy-category-option-${react.id}`);
    await expect(existing).toBeVisible();
    await expect(existing).toHaveText('React');
    // And no create option, because `react` is `React` (06 §01.3).
    await expect(page.getByTestId('vacancy-category-create-option')).toBeHidden();

    await existing.click();
    await expect(page.getByTestId(`vacancy-category-selected-${react.id}`)).toContainText('React');
  });

  test('offers to create a name that genuinely does not exist', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('lib-new'));
    await createCategory(request, org, 'React');
    await signIn(page, org.email);

    await page.goto(`/org/${org.organizationId}/hiring/vacancies`);
    await page.getByTestId('vacancy-new-button').click();

    // `React Native` is a different name, not a case variant of `React`.
    await page.getByTestId('vacancy-categories-input').fill('React Native');
    await expect(page.getByTestId('vacancy-category-create-option')).toHaveText(
      'Create "React Native"',
    );
  });

  test('maintains the library on the settings screen', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('lib-settings'));
    const react = await createCategory(request, org, 'Reactjs');
    await createVacancy(request, org, { title: 'One', categoryIds: [react.id] });
    await createVacancy(request, org, { title: 'Two', categoryIds: [react.id] });
    await signIn(page, org.email);

    await page.getByTestId('nav-hiring-settings').click();
    await page.waitForURL('**/hiring/settings');
    await expect(page.getByTestId('hiring-settings')).toBeVisible();

    // The usage count sits beside the actions, because it is what makes deleting a
    // decision rather than a guess.
    await expect(page.getByTestId(`category-name-${react.id}`)).toHaveText('Reactjs');
    await expect(page.getByTestId(`category-usage-${react.id}`)).toHaveText('2 vacancies');

    await page.getByTestId(`category-rename-${react.id}`).click();
    await page.getByTestId('category-name-input').fill('React.js');
    await page.getByTestId('category-submit-button').click();

    await expect(page.getByTestId(`category-name-${react.id}`)).toHaveText('React.js');
    // Renaming propagates because the assignment references the row, not the string.
    await page.goto(`/org/${org.organizationId}/hiring/vacancies`);
    await expect(page.getByTestId(`vacancy-category-chip-${react.id}`).first()).toHaveText(
      'React.js',
    );
  });

  test('refuses a rename onto an existing name, and says what to do instead', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('lib-collide'));
    await createCategory(request, org, 'React');
    const reactjs = await createCategory(request, org, 'ReactJS');
    await signIn(page, org.email);

    await page.goto(`/org/${org.organizationId}/hiring/settings`);
    await page.getByTestId(`category-rename-${reactjs.id}`).click();
    await page.getByTestId('category-name-input').fill('react');
    await page.getByTestId('category-submit-button').click();

    // There is no merge in this release, so the message names the only way out.
    await expect(page.getByTestId('category-dialog')).toContainText(
      '"react" already exists. Reassign and delete one instead.',
    );
    // Nothing was renamed.
    await expect(page.getByTestId(`category-name-${reactjs.id}`)).toHaveText('ReactJS');
  });

  test('confirms a delete with its usage count, then unassigns it everywhere', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('lib-delete'));
    const senior = await createCategory(request, org, 'Senior');
    const vacancy = await createVacancy(request, org, {
      title: 'Senior Engineer',
      categoryIds: [senior.id],
    });
    await signIn(page, org.email);

    await page.goto(`/org/${org.organizationId}/hiring/settings`);
    await page.getByTestId(`category-delete-${senior.id}`).click();

    // The count is interpolated, and the singular is spelled out.
    await expect(page.getByTestId('category-delete-confirm')).toContainText(
      'Delete "Senior"? It\'s used by 1 vacancy.',
    );
    await page.getByTestId('category-delete-confirm-button').click();

    await expect(page.getByTestId('categories-empty')).toBeVisible();

    // The vacancy survives without it — a label was removed, not a record.
    await page.goto(`/org/${org.organizationId}/hiring/vacancies/${vacancy.id}`);
    await expect(page.getByTestId('vacancy-detail')).toBeVisible();
    await expect(page.getByTestId('vacancy-detail-categories')).toHaveText('No categories.');
  });

  test('points an empty library at where categories are actually created', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('lib-empty'));
    await signIn(page, org.email);

    await page.goto(`/org/${org.organizationId}/hiring/settings`);

    // Inline creation is the primary path, so the copy says so rather than pointing at
    // the button on this screen.
    await expect(page.getByTestId('categories-empty')).toHaveText(
      'No categories yet. Add one when you create a vacancy.',
    );
  });
});
