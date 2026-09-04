import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  API,
  assessCriterion,
  bookInterview,
  createCategory,
  createCriterion,
  clickHiringNav,
  createVacancy,
  latestInviteLink,
  registerOrganization,
  signIn,
  uniqueEmail,
  type InviteLink,
  type RegisteredOrganization,
  type SeededVacancy,
} from './helpers';

/**
 * The category library (spec 06 §01 §02) — the inline path in the vacancy dialog, and
 * the settings screen that maintains what it creates.
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

    await page.goto(`/org/${org.orgId}/hiring/vacancies`);
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

    await page.goto(`/org/${org.orgId}/hiring/vacancies`);
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

    // The row reads `Libraries` and the route is still `/hiring/settings`: nothing on
    // the screen is a setting, and no bookmark had to be broken to say so.
    await clickHiringNav(page, 'nav-hiring-settings');
    await page.waitForURL('**/hiring/settings');
    await expect(page.getByTestId('hiring-settings')).toBeVisible();
    await expect(page.getByTestId('page-title')).toHaveText('Libraries');

    // The Vacancies cell prints whole titles — a truncated one names nothing — and the
    // count that makes deleting a decision rather than a guess lives in its accessible
    // name, with every folded title spelled out.
    await expect(page.getByTestId(`category-name-${react.id}`)).toHaveText('Reactjs');
    const usage = page.getByTestId(`category-usage-${react.id}`);
    await expect(usage).toHaveText('One, Two');
    await expect(usage).toHaveAttribute('aria-label', 'Used by 2 vacancies: One, Two');

    // The row acts through its kebab, as on every other list in the module.
    await page.getByTestId(`category-actions-${react.id}`).click();
    await page.getByTestId(`category-rename-${react.id}`).click();
    await page.getByTestId('category-name-input').fill('React.js');
    await page.getByTestId('category-submit-button').click();

    await expect(page.getByTestId(`category-name-${react.id}`)).toHaveText('React.js');
    // Renaming propagates because the assignment references the row, not the string.
    await page.goto(`/org/${org.orgId}/hiring/vacancies`);
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

    await page.goto(`/org/${org.orgId}/hiring/settings`);
    await page.getByTestId(`category-actions-${reactjs.id}`).click();
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

    await page.goto(`/org/${org.orgId}/hiring/settings`);
    await page.getByTestId(`category-actions-${senior.id}`).click();
    await page.getByTestId(`category-delete-${senior.id}`).click();

    // The count is interpolated, and the singular is spelled out.
    await expect(page.getByTestId('category-delete-confirm')).toContainText(
      'Delete "Senior"? It\'s used by 1 vacancy.',
    );
    await page.getByTestId('category-delete-confirm-button').click();

    await expect(page.getByTestId('categories-empty')).toBeVisible();

    // The vacancy survives without it — a label was removed, not a record. The header's
    // meta line simply loses its chips: there is no "No categories." to draw when the
    // rest of the line is still there (01 §08.28).
    await page.goto(`/org/${org.orgId}/hiring/vacancies/${vacancy.id}`);
    await expect(page.getByTestId('vacancy-detail')).toBeVisible();
    await expect(page.getByTestId('vacancy-detail-categories')).toHaveCount(0);
    await expect(page.getByTestId('vacancy-detail')).toContainText('Pat Owner');
  });

  test('splits the libraries into tabs, and searches only the one that is open', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('lib-tabs'));
    const react = await createCategory(request, org, 'React');
    const senior = await createCategory(request, org, 'Senior');
    const english = await createCriterion(request, org, { name: 'English' });
    await signIn(page, org.email);

    await page.goto(`/org/${org.orgId}/hiring/settings`);

    // Each label carries its whole library's size — these are two libraries, not two
    // slices of one list, so a search over one says nothing about the other.
    await expect(page.getByTestId('libraries-tab-categories')).toHaveText('Categories (2)');
    await expect(page.getByTestId('libraries-tab-criteria')).toHaveText('Criteria (1)');

    await page.getByTestId('categories-search-input').fill('sen');
    await expect(page.getByTestId(`category-row-${senior.id}`)).toBeVisible();
    await expect(page.getByTestId(`category-row-${react.id}`)).toBeHidden();
    // The label keeps the library's size: the search does not survive a tab switch, so
    // the number states exactly what pressing the tab shows.
    await expect(page.getByTestId('libraries-tab-categories')).toHaveText('Categories (2)');

    // A search that matched nothing must not claim the library is empty.
    await page.getByTestId('categories-search-input').fill('nothing matches this');
    await expect(page.getByTestId('categories-no-results')).toHaveText(
      'No categories match this search.',
    );

    // The term belonged to the library it was typed over; the other tab opens unfiltered.
    await page.getByTestId('libraries-tab-criteria').click();
    await expect(page.getByTestId(`criterion-row-${english.id}`)).toBeVisible();
    await page.getByTestId('libraries-tab-categories').click();
    await expect(page.getByTestId(`category-row-${react.id}`)).toBeVisible();
  });

  test('points an empty library at where categories are actually created', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('lib-empty'));
    await signIn(page, org.email);

    await page.goto(`/org/${org.orgId}/hiring/settings`);

    // Inline creation is the primary path, so the copy says so rather than pointing at
    // the button on this screen.
    await expect(page.getByTestId('categories-empty')).toHaveText(
      'No categories yet. Add one when you create a vacancy.',
    );
  });
});

/**
 * The criteria library (spec 06 §01 §03 §04) — the one with structure.
 *
 * Its inline path is not a dialog field like a category's: it is a compact form asking
 * for a type and, for a scale, its ordered values, opened from a candidate card in the
 * middle of an interview. Which is the flow the first test walks.
 */
test.describe('Criteria library', () => {
  /** An organization with one vacancy, one booked interview, and its invite link. */
  async function seed(
    request: APIRequestContext,
    prefix: string,
  ): Promise<{ org: RegisteredOrganization; vacancy: SeededVacancy; invite: InviteLink }> {
    const org = await registerOrganization(request, uniqueEmail(prefix));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });
    await bookInterview(request, vacancy.publicSlug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: uniqueEmail('candidate'),
    });
    return { org, vacancy, invite: await latestInviteLink(request) };
  }

  /** TC-H06-E2E-01 — create a scale criterion inline, mid-interview, then assess it. */
  test('creates a scale from the candidate card and assesses it in one flow', async ({
    page,
    request,
  }) => {
    const { org, vacancy, invite } = await seed(request, 'criteria-inline');
    await signIn(page, org.email);
    await page.goto(invite.path);

    await page.getByTestId('card-criteria-add').click();
    await page.getByTestId('card-criteria-autocomplete').fill('English');

    // Nothing matched, so the create row is offered — and it opens the compact form
    // rather than creating a criterion whose type nobody chose.
    await page.getByTestId('card-criteria-create-option').click();
    await expect(page.getByTestId('criterion-dialog')).toBeVisible();
    await expect(page.getByTestId('criterion-name-input')).toHaveValue('English');

    // Scale is the default, and the values field takes six labels in six returns.
    await page.getByTestId('criterion-type-scale').click();
    for (const label of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) {
      await page.getByTestId('criterion-value-add').fill(label);
      await page.getByTestId('criterion-value-add').press('Enter');
    }
    await expect(page.getByTestId('criterion-value-input-5')).toContainText('C2');

    await page.getByTestId('criterion-submit-button').click();
    await expect(page.getByTestId('criterion-dialog')).toBeHidden();

    // The criterion is in the library and on this application, waiting for a value.
    const criteria = await request.get(
      `${API}/api/organizations/${org.orgId}/hiring/criteria`,
    );
    const [english] = (await criteria.json()).criteria;
    expect(english.name).toBe('English');

    const value = page.getByTestId(`card-criterion-value-${english.id}`);
    await value.click();
    await page.getByTestId(`card-criterion-option-${english.values[3].id}`).click();
    await expect(value).toContainText('B2');

    // It persists, because the value is what writes the assessment — there is no save.
    await page.reload();
    await expect(page.getByTestId(`card-criterion-value-${english.id}`)).toContainText('B2');

    // And on the next candidate it is simply there: the common path is autocomplete-and-pick.
    await bookInterview(request, vacancy.publicSlug, {
      firstName: 'Sam',
      lastName: 'Second',
      email: uniqueEmail('candidate'),
      slotIndex: 1,
    });
    const second = await latestInviteLink(request);
    await page.goto(second.path);
    await page.getByTestId('card-criteria-add').click();
    await page.getByTestId('card-criteria-autocomplete').fill('Eng');
    await expect(page.getByTestId(`card-criteria-option-${english.id}`)).toHaveText('English');
    await expect(page.getByTestId('card-criteria-create-option')).toBeHidden();
  });

  /** TC-H06-E2E-03 — delete is replaced by archive once a criterion is used. */
  test('disables delete on an assessed criterion and offers archive instead', async ({
    page,
    request,
  }) => {
    const { org, invite } = await seed(request, 'criteria-archive');
    const english = await createCriterion(request, org, { name: 'English' });
    const unused = await createCriterion(request, org, { name: 'Unused', type: 'number' });
    await assessCriterion(request, org, invite.applicationId, english.id, {
      valueId: english.values[1].id,
    });

    await signIn(page, org.email);
    await page.goto(`/org/${org.orgId}/hiring/settings`);
    // The two libraries are the toolbar's two tabs; criteria is the second.
    await page.getByTestId('libraries-tab-criteria').click();

    // The count is what makes the decision answerable, so it is on the row.
    await expect(page.getByTestId(`criterion-usage-${english.id}`)).toHaveText('1 assessment');
    await expect(page.getByTestId(`criterion-values-${english.id}`)).toHaveText('A1 › A2 › B1');

    // Disabled rather than hidden, and the reason names archive as the alternative —
    // drawn in the menu row itself, where a keyboard can reach it.
    await page.getByTestId(`criterion-actions-${english.id}`).click();
    const blocked = page.getByTestId(`criterion-delete-${english.id}`);
    await expect(blocked).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId(`criterion-delete-guard-${english.id}`)).toHaveText(
      'Archive this instead — it has 1 assessment',
    );

    await page.getByTestId(`criterion-archive-${english.id}`).click();
    await expect(page.getByTestId('toast-criteria-archived')).toBeVisible();
    await expect(page.getByTestId(`criterion-archived-badge-${english.id}`)).toBeVisible();

    // Archived, it leaves the card's autocomplete without leaving the assessment.
    await page.goto(invite.path);
    await expect(page.getByTestId(`card-criterion-${english.id}`)).toBeVisible();
    await page.getByTestId('card-criteria-add').click();
    await page.getByTestId('card-criteria-autocomplete').fill('Eng');
    await expect(page.getByTestId(`card-criteria-option-${english.id}`)).toBeHidden();

    // Restoring returns it to the autocomplete — archiving is reversible, which is the
    // whole reason it exists instead of a delete.
    await page.goto(`/org/${org.orgId}/hiring/settings`);
    await page.getByTestId('libraries-tab-criteria').click();
    await page.getByTestId(`criterion-actions-${english.id}`).click();
    await page.getByTestId(`criterion-restore-${english.id}`).click();
    await expect(page.getByTestId('toast-criteria-restored')).toBeVisible();
    await expect(page.getByTestId(`criterion-archived-badge-${english.id}`)).toBeHidden();

    // One with no assessments is deleted outright — behind a confirmation, because there
    // is no undo, and the sentence says why this delete has no count to weigh.
    await page.getByTestId(`criterion-actions-${unused.id}`).click();
    await page.getByTestId(`criterion-delete-${unused.id}`).click();
    await expect(page.getByTestId('criterion-delete-confirm')).toContainText(
      'Delete "Unused"? No assessments are recorded against it, so nothing else is affected.',
    );
    await page.getByTestId('criterion-delete-confirm-button').click();
    await expect(page.getByTestId(`criterion-row-${unused.id}`)).toBeHidden();
  });

  /** TC-H06-E2E-04 — reordering a scale warns before it changes filter results. */
  test('confirms a reorder, and leaves the order alone when the warning is cancelled', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('criteria-reorder'));
    const english = await createCriterion(request, org, {
      name: 'English',
      values: ['A1', 'A2', 'B1'],
    });
    await signIn(page, org.email);
    await page.goto(`/org/${org.orgId}/hiring/settings`);
    await page.getByTestId('libraries-tab-criteria').click();

    await page.getByTestId(`criterion-actions-${english.id}`).click();
    await page.getByTestId(`criterion-edit-${english.id}`).click();
    await expect(page.getByTestId('criterion-dialog')).toBeVisible();
    // Type is absent from the edit dialog entirely, not disabled — it is immutable.
    await expect(page.getByTestId('criterion-type-scale')).toBeHidden();

    // Space picks a value up, arrows move it, Space drops it — the same reorder a drag
    // performs, reachable without a mouse.
    await page.getByTestId('criterion-value-handle-2').focus();
    await page.keyboard.press(' ');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press(' ');
    await expect(page.getByTestId('criterion-value-input-0')).toContainText('B1');

    await page.getByTestId('criterion-submit-button').click();

    // The confirmation goes up before the request does, so cancelling saves nothing —
    // it returns to the dialog, where abandoning the edit leaves the stored order intact.
    const confirm = page.getByTestId('criterion-reorder-confirm');
    await expect(confirm).toContainText('Reordering changes what existing filters match.');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('criterion-dialog')).toBeVisible();
    await page.getByTestId('criterion-dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId(`criterion-values-${english.id}`)).toHaveText('A1 › A2 › B1');

    // Confirming saves it.
    await page.getByTestId(`criterion-actions-${english.id}`).click();
    await page.getByTestId(`criterion-edit-${english.id}`).click();
    await page.getByTestId('criterion-value-handle-2').focus();
    await page.keyboard.press(' ');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press(' ');
    await page.getByTestId('criterion-submit-button').click();
    await page.getByTestId('criterion-reorder-confirm-button').click();

    await expect(page.getByTestId(`criterion-values-${english.id}`)).toHaveText('B1 › A1 › A2');
  });

  test('renaming a scale value needs no confirmation, because nothing compares labels', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('criteria-rename'));
    const english = await createCriterion(request, org, { name: 'English', values: ['A1', 'B1'] });
    await signIn(page, org.email);
    await page.goto(`/org/${org.orgId}/hiring/settings`);
    await page.getByTestId('libraries-tab-criteria').click();

    await page.getByTestId(`criterion-actions-${english.id}`).click();
    await page.getByTestId(`criterion-edit-${english.id}`).click();
    await page.getByTestId(`criterion-value-remove-1`).click();
    await page.getByTestId('criterion-value-add').fill('B1 (intermediate)');
    await page.getByTestId('criterion-value-add').press('Enter');
    await page.getByTestId('criterion-submit-button').click();

    // Straight through: an addition and a removal move no existing value past another.
    await expect(page.getByTestId('criterion-reorder-confirm')).toBeHidden();
    await expect(page.getByTestId(`criterion-values-${english.id}`)).toHaveText(
      'A1 › B1 (intermediate)',
    );
  });

  test('points an empty criteria library at where criteria are actually created', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('criteria-empty'));
    await signIn(page, org.email);

    await page.goto(`/org/${org.orgId}/hiring/settings`);
    await page.getByTestId('libraries-tab-criteria').click();

    // Inline creation is the primary path, so the copy points at an interview rather than
    // at the button on this screen.
    await expect(page.getByTestId('criteria-empty')).toHaveText(
      'No criteria yet. Add one during an interview.',
    );
  });
});
