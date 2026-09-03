import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  addMember,
  archiveCriterion,
  assessCriterion,
  bookInterview,
  columnCards,
  createCategory,
  createCriterion,
  createVacancy,
  createVacancyFor,
  registerOrganization,
  signIn,
  uniqueEmail,
  type RegisteredOrganization,
  type SeededCategory,
  type SeededCriterion,
} from './helpers';

/**
 * The candidate database (spec 03) — the screen the two libraries exist to serve.
 *
 * Most of what is below is about the same thing seen from several angles: **the scope tab's
 * count is the feedback**. It is what a filter change is judged by and what a search has to
 * compose with; there is no count line under the strip and nothing stands in its place
 * while a request is in flight (03 §05.20).
 *
 * Since the filters moved into a drawer (§09), it is also what says the drawer works: the
 * panel covers a strip of the list and never the tab strip, so every case here reads the
 * effect of a filter without closing the thing that set it.
 */
test.describe('Candidate database', () => {
  interface Seed {
    org: RegisteredOrganization;
    react: SeededCategory;
    english: SeededCriterion;
    path: string;
  }

  /**
   * Three candidates: one on a React-categorised vacancy with English at B1, one on the
   * same vacancy with A1, and one on an uncategorised vacancy with no assessment at all.
   *
   * So `React` narrows three to two, and `English at least B1` narrows two to one — each
   * filter has to be doing something for the count to move.
   */
  async function seed(request: APIRequestContext, prefix: string): Promise<Seed> {
    const org = await registerOrganization(request, uniqueEmail(prefix));
    const react = await createCategory(request, org, 'React');
    const english = await createCriterion(request, org, {
      name: 'English',
      values: ['A1', 'A2', 'B1'],
    });

    const reactVacancy = await createVacancy(request, org, {
      title: 'Senior React Engineer',
      categoryIds: [react.id],
    });
    const otherVacancy = await createVacancy(request, org, { title: 'DotNet Engineer' });

    await bookInterview(request, reactVacancy.publicSlug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: uniqueEmail('jane'),
      slotIndex: 0,
    });
    await bookInterview(request, reactVacancy.publicSlug, {
      firstName: 'Ivan',
      lastName: 'Petrov',
      email: uniqueEmail('ivan'),
      slotIndex: 1,
    });
    await bookInterview(request, otherVacancy.publicSlug, {
      firstName: 'Tom',
      lastName: 'Fisher',
      email: uniqueEmail('tom'),
      slotIndex: 2,
    });

    // Application ids are generated server-side; the board is where a test can read them.
    const cards = await columnCards(request, org, reactVacancy.id, 'scheduled');
    const jane = cards.find((card) => card.name.startsWith('Jane'))!;
    const ivan = cards.find((card) => card.name.startsWith('Ivan'))!;
    const value = (label: string) => english.values.find((entry) => entry.label === label)!.id;

    await assessCriterion(request, org, jane.applicationId, english.id, { valueId: value('B1') });
    await assessCriterion(request, org, ivan.applicationId, english.id, { valueId: value('A1') });

    return { org, react, english, path: `/org/${org.orgId}/hiring/candidates` };
  }

  /** Picks an option out of a `Select`, searchable or not: both open on click. */
  async function chooseInSelect(page: Page, field: string, option: string): Promise<void> {
    await page.getByTestId(field).click();
    await page.getByTestId(option).click();
  }

  /** Every filter is behind this one button now (03 §09.45). */
  async function openFilters(page: Page): Promise<void> {
    await page.getByTestId('candidates-filters-open').click();
    await expect(page.getByTestId('candidates-filters')).toBeVisible();
  }

  /**
   * TC-H03-E2E-01 — filter by category and criterion, and read the count.
   *
   * The headline query, built one control at a time inside the drawer, with the count
   * checked after each: it is the only thing that says whether a filter did anything, and
   * it stays readable while the panel that set it is still open.
   */
  test('narrows the count with each filter and widens it when a chip is removed', async ({
    page,
    request,
  }) => {
    const { org, react, english, path } = await seed(request, 'cand-filter');
    await signIn(page, org.email);
    await page.goto(path);

    // The scope tab carries the count — there is no separate count line (03 §05.20).
    const count = page.getByTestId('candidates-scope-all');
    const filters = page.getByTestId('candidates-filters-open');
    await expect(count).toHaveText('All (3)');
    await expect(page.getByTestId('candidates-list')).toBeVisible();
    // Nothing applied, so the button is a word rather than a count (03 §09.46).
    await expect(filters).toHaveText('Filters');

    await openFilters(page);

    // The category: two of the three applied to a React-categorised vacancy.
    await chooseInSelect(
      page,
      'candidates-filter-category',
      `candidates-filter-category-option-${react.id}`,
    );
    await expect(count).toHaveText('All (2)');
    await expect(filters).toHaveText('Filters (1)');

    // The criterion: of those two, one is at B1 and one is below it. Choosing it from the
    // picker is what creates the chip, and the chip arrives with `is` already set.
    await chooseInSelect(
      page,
      'candidates-criteria-filter-add',
      `candidates-criteria-option-${english.id}`,
    );
    await expect(page.getByTestId('criteria-filter-criterion-0')).toHaveText('English');
    await chooseInSelect(page, 'criteria-filter-op-0', 'criteria-filter-op-0-option-gte');

    // A chip with no value yet is half-built, not a filter that matches nobody — it
    // narrows nothing and is not counted (03 design §Interactions).
    await expect(count).toHaveText('All (2)');
    await expect(filters).toHaveText('Filters (1)');

    const b1 = english.values.find((value) => value.label === 'B1')!.id;
    await chooseInSelect(page, 'criteria-filter-value-0', `criteria-filter-value-0-option-${b1}`);
    await expect(count).toHaveText('All (1)');
    await expect(filters).toHaveText('Filters (2)');
    await expect(page.getByTestId('candidate-name-' + (await onlyRowId(page)))).toHaveText('Jane Doe');

    // Removing the chip widens the set in place — the criterion chip still holds.
    await page.getByTestId(`candidates-filter-chip-${react.id}`).getByRole('button').click();
    await expect(count).toHaveText('All (1)');
    await expect(filters).toHaveText('Filters (1)');

    // And removing the criterion chip restores the unfiltered list.
    await page.getByTestId('criteria-filter-remove-0').click();
    await expect(count).toHaveText('All (3)');
    await expect(filters).toHaveText('Filters');
  });

  /**
   * TC-H03-E2E-02 — search debounces and composes with the filters.
   *
   * The burst must fire **nothing**: a request per keystroke would be five queries for a
   * term nobody finished typing, and the fifth answer would race the fourth.
   */
  test('fires one request after the burst, carrying the term and the filter', async ({
    page,
    request,
  }) => {
    const { org, react, path } = await seed(request, 'cand-search');
    await signIn(page, org.email);

    const queries: string[] = [];
    page.on('request', (sent) => {
      if (sent.url().includes('/hiring/candidates?')) queries.push(sent.url());
    });

    await page.goto(path);
    const count = page.getByTestId('candidates-scope-all');
    await expect(count).toHaveText('All (3)');

    await openFilters(page);
    await chooseInSelect(
      page,
      'candidates-filter-category',
      `candidates-filter-category-option-${react.id}`,
    );
    await expect(count).toHaveText('All (2)');

    const before = queries.length;
    // Faster than the 300 ms window, so the whole word is one request.
    await page.getByTestId('candidates-search-input').pressSequentially('Jane', { delay: 40 });
    expect(queries.length).toBe(before);

    await expect(count).toHaveText('All (1)');
    expect(queries.length).toBe(before + 1);

    // One request carrying both: the term narrows the already-filtered set rather than
    // replacing it (03 §03.11).
    const url = new URL(queries[queries.length - 1]);
    expect(url.searchParams.get('search')).toBe('Jane');
    expect(url.searchParams.getAll('categoryId')).toEqual([react.id]);
  });

  /**
   * The criterion picker offers the whole library — archived entries below the active
   * ones and badged, because history stays filterable and that is the whole difference
   * between archiving a criterion and deleting one (03 §04.19).
   *
   * The archived one is also the case that pins down *where* the marker goes. It is the
   * option's `hint`, not part of its label, so the badge is visible and the criterion is
   * still findable by typing its name — which is what the second half of this asserts.
   */
  test('offers every criterion, archived last and badged, and still findable by name', async ({
    page,
    request,
  }) => {
    const { org, english, path } = await seed(request, 'cand-picker');
    const zone = await createCriterion(request, org, { name: 'Zone', type: 'text' });
    const legacy = await createCriterion(request, org, { name: 'Ancient skill', type: 'text' });
    await archiveCriterion(request, org, legacy.id);

    await signIn(page, org.email);
    await page.goto(path);
    await openFilters(page);

    const picker = page.getByTestId('candidates-criteria-filter-add');
    await picker.click();

    // Alphabetically among the active ones, and the archived one last however its name
    // sorts — `Ancient skill` would lead the list if archiving did not move it.
    const options = page.locator('[data-testid^="candidates-criteria-option-"]');
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toHaveText(/English/);
    await expect(options.nth(1)).toHaveText(/Zone/);
    await expect(options.nth(2)).toHaveText(/Ancient skill/);
    await expect(
      page.getByTestId(`candidates-criteria-option-${legacy.id}`),
    ).toContainText('Archived');

    // The badge is beside the name, not inside it: typing the name still finds the row.
    await picker.pressSequentially('Ancient');
    await expect(options).toHaveCount(1);
    await page.getByTestId(`candidates-criteria-option-${legacy.id}`).click();
    await expect(page.getByTestId('criteria-filter-criterion-0')).toHaveText('Ancient skill');
    await expect(page.getByTestId('criteria-filter-archived-0')).toBeVisible();

    // A chosen criterion leaves the picker, so the same filter cannot be added twice.
    await chooseInSelect(page, 'candidates-criteria-filter-add', `candidates-criteria-option-${zone.id}`);
    await expect(page.getByTestId('criteria-filter-criterion-1')).toHaveText('Zone');
    await picker.click();
    await expect(page.locator('[data-testid^="candidates-criteria-option-"]')).toHaveCount(1);
    await expect(page.getByTestId(`candidates-criteria-option-${english.id}`)).toBeVisible();
  });

  test('opens the candidate card from a row', async ({ page, request }) => {
    const { org, path } = await seed(request, 'cand-open');
    await signIn(page, org.email);
    await page.goto(path);

    await page.getByTestId('candidates-search-input').fill('Tom');
    await expect(page.getByTestId('candidates-scope-all')).toHaveText('All (1)');

    await page.getByTestId(`candidate-row-${await onlyRowId(page)}`).click();
    await expect(page.getByTestId('candidate-card')).toBeVisible();
  });

  /**
   * TC-H03-E2E-12 — an empty database and a filter that matches nobody are told apart, and the
   * way out of the second empties the filters and the search together.
   */
  test('tells an empty database apart from a filter that matches nobody', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('cand-empty'));
    await signIn(page, org.email);
    await page.goto(`/org/${org.orgId}/hiring/candidates`);

    // Nothing has ever been booked — and the message names the only thing that would.
    await expect(page.getByTestId('candidates-empty-state')).toHaveText(
      'No candidates yet. Share a booking link to start.',
    );

    const seeded = await seed(request, 'cand-none');
    await signIn(page, seeded.org.email);
    await page.goto(seeded.path);
    await page.getByTestId('candidates-search-input').fill('nobody-by-that-name');

    await expect(page.getByTestId('candidates-no-results')).toBeVisible();
    await expect(page.getByTestId('candidates-scope-all')).toHaveText('All (0)');
    // Clearing brings the list back rather than leaving a dead end.
    await page.getByTestId('candidates-clear-all').click();
    await expect(page.getByTestId('candidates-scope-all')).toHaveText('All (3)');
  });

  /**
   * TC-H03-E2E-06 — the filters are in a drawer, and the scope is not one of them.
   *
   * Three separate claims, and each one is a rule the drawer could plausibly have broken:
   * a filter applies without an Apply, it survives a tab change, and the tab survives
   * `Clear filters`. The fourth is that `Interviewer` is **absent** in `Assigned to me`
   * rather than disabled — in that scope the interviewer is the viewer, so there is
   * nothing there to enable.
   */
  test('applies filters from the drawer, and keeps the scope out of them', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('cand-drawer'));
    const ines = await addMember(request, {
      email: uniqueEmail('ines'),
      role: 'user',
      firstName: 'Ines',
      lastName: 'Interviewer',
    });

    const mine = await createVacancy(request, org, { title: 'React Engineer' });
    const theirs = await createVacancyFor(request, org, ines.accountId, {
      title: 'Node Engineer',
    });
    await bookInterview(request, mine.publicSlug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: uniqueEmail('jane'),
      slotIndex: 0,
    });
    await bookInterview(request, theirs.publicSlug, {
      firstName: 'Tom',
      lastName: 'Fisher',
      email: uniqueEmail('tom'),
      slotIndex: 1,
    });

    await signIn(page, org.email);
    await page.goto(`/org/${org.orgId}/hiring/candidates`);

    const count = page.getByTestId('candidates-scope-all');
    const filters = page.getByTestId('candidates-filters-open');
    await expect(count).toHaveText('All (2)');
    await expect(page.getByTestId('candidates-scope-mine')).toHaveText('Assigned to me (1)');

    await openFilters(page);

    // The viewer is labelled `(me)`, so the field and the tab are visibly one person.
    await page.getByTestId('candidates-filter-interviewer').click();
    await expect(
      page.getByTestId(`candidates-filter-interviewer-option-${org.accountId}`),
    ).toHaveText('Pat Owner (me)');
    await expect(
      page.getByTestId(`candidates-filter-interviewer-option-${ines.accountId}`),
    ).toHaveText('Ines Interviewer');

    // Escape dismisses the list a control opened and **not** the panel it sits in: the
    // control answers the key first and marks it handled (decisions §21).
    await page.keyboard.press('Escape');
    await expect(
      page.getByTestId(`candidates-filter-interviewer-option-${ines.accountId}`),
    ).toHaveCount(0);
    await expect(page.getByTestId('candidates-filters')).toBeVisible();

    // A status applies at once — the count moves while the drawer is still open.
    await chooseInSelect(page, 'candidates-filter-status', 'candidates-filter-status-option-scheduled');
    await expect(count).toHaveText('All (2)');
    await expect(filters).toHaveText('Filters (1)');

    // `Show results` only dismisses; nothing is applied by it, and focus comes home.
    await page.getByTestId('candidates-filters-apply').click();
    await expect(page.getByTestId('candidates-filters')).toBeHidden();
    await expect(filters).toHaveText('Filters (1)');
    await expect(filters).toBeFocused();

    // The tab is navigation: it keeps every filter and returns to page 1. Each tab counts
    // what *it* would show under the filters that are applied, so the other one still
    // answers "and how many would that show?" before it is pressed.
    await page.getByTestId('candidates-scope-mine').click();
    await expect(page.getByTestId('candidates-scope-mine')).toHaveText('Assigned to me (1)');
    await expect(count).toHaveText('All (2)');
    await expect(filters).toHaveText('Filters (1)');

    await openFilters(page);
    await expect(page.getByTestId('candidates-filter-status')).toBeVisible();
    // Absent, not disabled — there is no interviewer to choose in this scope.
    await expect(page.getByTestId('candidates-filter-interviewer')).toHaveCount(0);

    // And `Clear filters` empties the filters while leaving the tab exactly where it is.
    await page.getByTestId('candidates-clear-filters').click();
    await expect(filters).toHaveText('Filters');
    await expect(page.getByTestId('candidates-scope-mine')).toHaveText('Assigned to me (1)');
    await expect(page.getByTestId('candidates-scope-mine')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });


  /**
   * TC-H03-E2E-10 — the whole question lives in the address (§09.53).
   *
   * The scope was already there; this is the rest of it. What makes it worth a case of its
   * own rather than a line inside the drawer test is the **round trip**: the URL is only
   * useful if the screen reads back what it wrote, and the two halves are written in
   * different places. A reload is the cheapest way to make it prove both at once.
   */
  test('carries the search, the filters and the page in the address, and reads them back', async ({
    page,
    request,
  }) => {
    const { org, react, path } = await seed(request, 'cand-address');

    await signIn(page, org.email);
    await page.goto(path);

    const count = page.getByTestId('candidates-scope-all');
    await expect(count).toHaveText('All (3)');

    await openFilters(page);
    await chooseInSelect(page, 'candidates-filter-category', `candidates-filter-category-option-${react.id}`);
    await expect(count).toHaveText('All (2)');
    await page.getByTestId('candidates-filters-apply').click();

    await page.getByTestId('candidates-search-input').fill('Jane');
    await expect(count).toHaveText('All (1)');

    // Written as they are applied, and the defaults stay out: no `scope`, no `page`.
    await expect(page).toHaveURL(new RegExp(`\\?(?=.*search=Jane)(?=.*categoryId=${react.id})`));
    await expect(page).not.toHaveURL(/scope=/);
    await expect(page).not.toHaveURL(/page=/);

    // And read back: a reload is not a reset. The field, the chip and the count all return.
    await page.reload();
    await expect(page.getByTestId('candidates-search-input')).toHaveValue('Jane');
    await expect(page.getByTestId('candidates-filters-open')).toHaveText('Filters (1)');
    await expect(count).toHaveText('All (1)');
  });

  /**
   * TC-H03-E2E-07 — the page strip.
   *
   * Reversal 1, back the other way: pagination returns, and the count it was once traded
   * for is still above the table. The case that matters is the pair of them agreeing — the
   * count says how many match and the strip says which twenty-five of them are on screen,
   * and a filter has to move both.
   */
  test('pages a list longer than one page, and disappears when it fits', async ({
    page,
    request,
  }) => {
    // Twenty-six bookings, one at a time against a real availability window — slow by
    // construction, and the only way to have more than one page of anything.
    test.setTimeout(240_000);

    const org = await registerOrganization(request, uniqueEmail('cand-pages'));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });
    for (let index = 0; index < 26; index += 1) {
      await bookInterview(request, vacancy.publicSlug, {
        firstName: 'Page',
        // One token and no space: search ANDs its terms across name and email, and a bare
        // `07` also matches the timestamp inside a generated address.
        lastName: `Candidate${String(index).padStart(2, '0')}`,
        email: uniqueEmail(`paged-${index}`),
        slotIndex: index,
      });
    }

    await signIn(page, org.email);
    await page.goto(`/org/${org.orgId}/hiring/candidates`);

    const rows = page.getByTestId('candidates-list').locator('[data-testid^="candidate-row-"]');
    await expect(page.getByTestId('candidates-scope-all')).toHaveText('All (26)');
    await expect(rows).toHaveCount(25);

    // The strip states where it is rather than only painting it.
    await expect(page.getByTestId('candidates-page-1')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('candidates-page-2')).not.toHaveAttribute('aria-current', 'page');

    await page.getByTestId('candidates-page-2').click();
    await expect(rows).toHaveCount(1);
    await expect(page.getByTestId('candidates-page-2')).toHaveAttribute('aria-current', 'page');
    // The count is what matches, not what is on the page, so it does not move with it.
    await expect(page.getByTestId('candidates-scope-all')).toHaveText('All (26)');

    // A filter is a new question: back to page 1, and the strip goes entirely when what
    // is left fits on it. A control offering one choice is not a choice.
    await page.getByTestId('candidates-search-input').fill('Candidate07');
    await expect(page.getByTestId('candidates-scope-all')).toHaveText('All (1)');
    await expect(page.getByTestId('candidates-pagination')).toHaveCount(0);
  });

  /**
   * TC-H03-E2E-08 — the row's actions.
   *
   * Four claims, and the first is the one the whole column rests on: pressing the kebab is
   * not pressing the row. The menu is a portal (decisions §55), so the row cannot decide that
   * by containment and has to be asked directly.
   */
  test('acts on a row without opening it, and confirms what it did', async ({ page, request }) => {
    const { org, path } = await seed(request, 'cand-actions');
    await signIn(page, org.email);
    await page.goto(path);

    await page.getByTestId('candidates-search-input').fill('Tom');
    await expect(page.getByTestId('candidates-scope-all')).toHaveText('All (1)');
    const id = await onlyRowId(page);

    // The kebab opens in place; the row it sits in does not navigate.
    await page.getByTestId(`candidate-actions-${id}`).click();
    await expect(page.getByTestId(`candidate-action-calendar-${id}`)).toBeVisible();
    expect(page.url()).toContain('/hiring/candidates');

    // `View in calendar` confirms and changes nothing else — no navigation, no request.
    let requests = 0;
    page.on('request', (sent) => {
      if (sent.url().includes('/hiring/')) requests += 1;
    });
    await page.getByTestId(`candidate-action-calendar-${id}`).click();
    await expect(page.getByTestId(`toast-calendar-${id}`)).toBeVisible();
    expect(page.url()).toContain('/hiring/candidates');
    expect(requests).toBe(0);

    // Cancelling names the interview, warns that the candidate is told, and leaves the
    // row in place wearing the outlined `Cancelled` badge instead of its status.
    await page.getByTestId(`candidate-actions-${id}`).click();
    await page.getByTestId(`candidate-action-cancel-${id}`).click();
    const dialog = page.locator('[data-testid^="application-cancel-dialog-"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Tom Fisher');
    await expect(dialog).toContainText('notified');
    await dialog.locator('[data-testid^="application-cancel-confirm-"]').click();

    await expect(page.getByTestId('toast-interview-cancelled')).toBeVisible();
    await expect(page.getByTestId(`candidate-status-${id}`)).toHaveText('Cancelled');

    // A cancelled interview has nothing left to move, so the three interview actions go
    // and the one about the person stays.
    await page.getByTestId(`candidate-actions-${id}`).click();
    await expect(page.getByTestId(`candidate-action-open-${id}`)).toBeVisible();
    await expect(page.getByTestId(`candidate-action-reschedule-${id}`)).toHaveCount(0);
    await expect(page.getByTestId(`candidate-action-calendar-${id}`)).toHaveCount(0);
  });

  /**
   * `Reschedule` lands on the card with the dialog already up (07 §01.5) — the team never
   * sends the candidate's own manage link, so the internal door is the card, and a row
   * action that merely opened it would be two presses for one intention.
   */
  test('opens the candidate card with the reschedule dialog already up', async ({
    page,
    request,
  }) => {
    const { org, path } = await seed(request, 'cand-resched');
    await signIn(page, org.email);
    await page.goto(path);

    await page.getByTestId('candidates-search-input').fill('Tom');
    await expect(page.getByTestId('candidates-scope-all')).toHaveText('All (1)');
    const id = await onlyRowId(page);

    await page.getByTestId(`candidate-actions-${id}`).click();
    await page.getByTestId(`candidate-action-reschedule-${id}`).click();

    await page.waitForURL('**/hiring/candidates/**');
    await expect(page.getByTestId('candidate-card')).toBeVisible();
    await expect(page.locator('[data-testid^="application-reschedule-dialog-"]')).toBeVisible();
  });

  /**
   * TC-H03-E2E-10 — deleting the person a row is about.
   *
   * Three claims. The confirmation states what goes with them and — deliberately — does
   * not claim the delete cannot be undone. The row leaves every number on the screen at
   * once, not just the table. And the menu item is drawn for a manager and **absent** for
   * an assigned interviewer, who reaches this same list through an assignment that is
   * authority over an interview and not over a record.
   */
  test('deletes a candidate from the row, and says what went with them', async ({
    page,
    request,
  }) => {
    const { org, english, path } = await seed(request, 'cand-delete');

    await signIn(page, org.email);
    await page.goto(path);

    await page.getByTestId('candidates-search-input').fill('Jane');
    await expect(page.getByTestId('candidates-scope-all')).toHaveText('All (1)');
    const id = await onlyRowId(page);

    await page.getByTestId(`candidate-actions-${id}`).click();
    await page.getByTestId(`candidate-action-delete-${id}`).click();

    const dialog = page.getByTestId('candidate-delete-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Delete Jane Doe?');
    // Both counts — one booking, and the English assessment the fixture recorded on it.
    await expect(dialog).toContainText('1 application and 1 assessment');
    // And the one thing that is true about a soft delete, said rather than withheld.
    await expect(dialog).toContainText('book again with the same email');
    await expect(dialog).not.toContainText('cannot be undone');

    await page.getByTestId(`candidate-delete-confirm-${id}`).click();

    await expect(page.getByTestId('toast-candidate-deleted')).toHaveText('Jane Doe deleted');
    // Every number moves with them, in the one place a number is now shown.
    await expect(page.getByTestId('candidates-scope-all')).toHaveText('All (0)');
    await page.getByTestId('candidates-search-input').fill('');
    await expect(page.getByTestId('candidates-scope-all')).toHaveText('All (2)');
    // Their card is gone with them, however it is reached.
    await page.goto(`/org/${org.orgId}/hiring/candidates/${id}`);
    await expect(page.getByTestId('candidate-not-found')).toBeVisible();

    // The criterion the deleted candidate was assessed on is untouched — this deletes a
    // person, not a library entry.
    await page.goto(path);
    await openFilters(page);
    await page.getByTestId('candidates-criteria-filter-add').click();
    await expect(page.getByTestId(`candidates-criteria-option-${english.id}`)).toBeVisible();
  });

  /**
   * The other half of TC-H03-E2E-10: an assigned interviewer opens this list and finds
   * every interview action on the row and no way to delete the person.
   */
  test('offers an assigned interviewer no way to delete a candidate', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('cand-del-scope'));
    const ines = await addMember(request, {
      email: uniqueEmail('ines'),
      role: 'user',
      firstName: 'Ines',
      lastName: 'Interviewer',
    });
    const theirs = await createVacancyFor(request, org, ines.accountId, {
      title: 'Node Engineer',
    });
    await bookInterview(request, theirs.publicSlug, {
      firstName: 'Tom',
      lastName: 'Fisher',
      email: uniqueEmail('tom'),
      slotIndex: 0,
    });

    await signIn(page, ines.email);
    await page.goto(`/org/${org.orgId}/hiring/candidates`);

    const id = await onlyRowId(page);
    await page.getByTestId(`candidate-actions-${id}`).click();
    // The interview actions are all there — this is their interview.
    await expect(page.getByTestId(`candidate-action-reschedule-${id}`)).toBeVisible();
    await expect(page.getByTestId(`candidate-action-open-${id}`)).toBeVisible();
    // The one about the person is not.
    await expect(page.getByTestId(`candidate-action-delete-${id}`)).toHaveCount(0);
  });

  /**
   * TC-H03-E2E-11 — a list that could not be read says so, and keeps its retry after the
   * toast has gone.
   *
   * The one E2E case for the load-failure mechanism every hiring screen shares: the toast
   * announces, the empty state stays with the way back inside it, and no card is drawn
   * around either. The libraries, the card and the board draw the same composition from the
   * same component and are not tested again for it.
   */
  test('says a list could not be read, and keeps the retry on the page', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('cand-load-failed'));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });
    await bookInterview(request, vacancy.publicSlug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: uniqueEmail('jane'),
      slotIndex: 0,
    });
    await signIn(page, org.email);

    // Only the list's API request fails — not the page navigation, whose path ends the same
    // way, and not the libraries the filters are built from.
    const isList = (url: URL) => /\/api\/organizations\/[^/]+\/hiring\/candidates$/.test(url.pathname);
    await page.route(isList, async (route) => {
      // Held for a moment, so the loader can be seen standing on the page's own ground.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });
    await page.goto(`/org/${org.orgId}/hiring/candidates`);

    // The first load: the dots, and no card drawn around them.
    await expect(page.getByTestId('candidates-loading')).toBeVisible();
    await expect(page.getByTestId('candidates-list')).toHaveCount(0);

    await expect(page.getByTestId('toast-candidates-load-failed')).toContainText(
      "We couldn't load candidates. Try again.",
    );
    const failed = page.getByTestId('candidates-error');
    await expect(failed).toContainText("We couldn't load candidates. Try again.");
    // On the page's own ground: the card is the table's, and there is no table.
    await expect(page.getByTestId('candidates-list')).toHaveCount(0);

    await page.unroute(isList);
    await page.getByTestId('candidates-retry').click();

    await expect(failed).toHaveCount(0);
    await expect(page.getByTestId('candidates-list')).toBeVisible();
    await expect(
      page.getByTestId('candidates-list').locator('[data-testid^="candidate-row-"]'),
    ).toHaveCount(1);
  });

  /** The id of the single row on screen — the tests above narrow to one before asking. */
  async function onlyRowId(page: Page): Promise<string> {
    const row = page.getByTestId('candidates-list').locator('[data-testid^="candidate-row-"]');
    await expect(row).toHaveCount(1);
    return (await row.getAttribute('data-testid'))!.replace('candidate-row-', '');
  }
});
