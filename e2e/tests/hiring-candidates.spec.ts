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
  type Registered,
  type SeededCategory,
  type SeededCriterion,
} from './helpers';

/**
 * The candidate database (spec 03) — the screen the two libraries exist to serve.
 *
 * Most of what is below is about the same thing seen from several angles: **the count is
 * the feedback**. It is what a filter change is judged by, what a search has to compose
 * with, and the one thing on the page that is announced.
 *
 * Since the filters moved into a drawer (§09), it is also what says the drawer works: the
 * panel covers a strip of the list and never the count, so every case here reads the
 * effect of a filter without closing the thing that set it.
 */
test.describe('Candidate database', () => {
  interface Seed {
    org: Registered;
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

    return { org, react, english, path: `/org/${org.organizationId}/hiring/candidates` };
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

    const count = page.getByTestId('candidates-count');
    const filters = page.getByTestId('candidates-filters-open');
    await expect(count).toHaveText('3 candidates');
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
    await expect(count).toHaveText('2 of 3 candidates');
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
    await expect(count).toHaveText('2 of 3 candidates');
    await expect(filters).toHaveText('Filters (1)');

    const b1 = english.values.find((value) => value.label === 'B1')!.id;
    await chooseInSelect(page, 'criteria-filter-value-0', `criteria-filter-value-0-option-${b1}`);
    await expect(count).toHaveText('1 of 3 candidates');
    await expect(filters).toHaveText('Filters (2)');
    await expect(page.getByTestId('candidate-name-' + (await onlyRowId(page)))).toHaveText('Jane Doe');

    // Removing the chip widens the set in place — the criterion chip still holds.
    await page.getByTestId(`candidates-filter-chip-${react.id}`).getByRole('button').click();
    await expect(count).toHaveText('1 of 3 candidates');
    await expect(filters).toHaveText('Filters (1)');

    // And removing the criterion chip restores the unfiltered list.
    await page.getByTestId('criteria-filter-remove-0').click();
    await expect(count).toHaveText('3 candidates');
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
    const count = page.getByTestId('candidates-count');
    await expect(count).toHaveText('3 candidates');

    await openFilters(page);
    await chooseInSelect(
      page,
      'candidates-filter-category',
      `candidates-filter-category-option-${react.id}`,
    );
    await expect(count).toHaveText('2 of 3 candidates');

    const before = queries.length;
    // Faster than the 300 ms window, so the whole word is one request.
    await page.getByTestId('candidates-search-input').pressSequentially('Jane', { delay: 40 });
    expect(queries.length).toBe(before);

    await expect(count).toHaveText('1 of 3 candidates');
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
    await expect(page.getByTestId('candidates-count')).toHaveText('1 of 3 candidates');

    await page.getByTestId(`candidate-row-${await onlyRowId(page)}`).click();
    await expect(page.getByTestId('candidate-card')).toBeVisible();
  });

  test('tells an empty database apart from a filter that matches nobody', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('cand-empty'));
    await signIn(page, org.email);
    await page.goto(`/org/${org.organizationId}/hiring/candidates`);

    // Nothing has ever been booked — and the message names the only thing that would.
    await expect(page.getByTestId('candidates-empty-state')).toHaveText(
      'No candidates yet. Share a booking link to start.',
    );

    const seeded = await seed(request, 'cand-none');
    await signIn(page, seeded.org.email);
    await page.goto(seeded.path);
    await page.getByTestId('candidates-search-input').fill('nobody-by-that-name');

    await expect(page.getByTestId('candidates-no-results')).toBeVisible();
    await expect(page.getByTestId('candidates-count')).toHaveText('0 of 3 candidates');
    // Clearing brings the list back rather than leaving a dead end.
    await page.getByTestId('candidates-clear-all').click();
    await expect(page.getByTestId('candidates-count')).toHaveText('3 candidates');
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
    await page.goto(`/org/${org.organizationId}/hiring/candidates`);

    const count = page.getByTestId('candidates-count');
    const filters = page.getByTestId('candidates-filters-open');
    await expect(count).toHaveText('2 candidates');
    await expect(page.getByTestId('candidates-scope-all')).toHaveText('All (2)');
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
    // control answers the key first and marks it handled (ledger, the note on §21).
    await page.keyboard.press('Escape');
    await expect(
      page.getByTestId(`candidates-filter-interviewer-option-${ines.accountId}`),
    ).toHaveCount(0);
    await expect(page.getByTestId('candidates-filters')).toBeVisible();

    // A status applies at once — the count moves while the drawer is still open.
    await chooseInSelect(page, 'candidates-filter-status', 'candidates-filter-status-option-scheduled');
    await expect(count).toHaveText('2 of 2 candidates');
    await expect(filters).toHaveText('Filters (1)');

    // `Show results` only dismisses; nothing is applied by it, and focus comes home.
    await page.getByTestId('candidates-filters-apply').click();
    await expect(page.getByTestId('candidates-filters')).toBeHidden();
    await expect(filters).toHaveText('Filters (1)');
    await expect(filters).toBeFocused();

    // The tab is navigation: it keeps every filter and returns to page 1.
    await page.getByTestId('candidates-scope-mine').click();
    await expect(count).toHaveText('1 of 2 candidates');
    await expect(filters).toHaveText('Filters (1)');

    await openFilters(page);
    await expect(page.getByTestId('candidates-filter-status')).toBeVisible();
    // Absent, not disabled — there is no interviewer to choose in this scope.
    await expect(page.getByTestId('candidates-filter-interviewer')).toHaveCount(0);

    // And `Clear filters` empties the filters while leaving the tab exactly where it is.
    await page.getByTestId('candidates-clear-filters').click();
    await expect(filters).toHaveText('Filters');
    await expect(count).toHaveText('1 of 2 candidates');
    await expect(page.getByTestId('candidates-scope-mine')).toHaveAttribute(
      'aria-selected',
      'true',
    );
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
    await page.goto(`/org/${org.organizationId}/hiring/candidates`);

    const rows = page.getByTestId('candidates-list').locator('[data-testid^="candidate-row-"]');
    await expect(page.getByTestId('candidates-count')).toHaveText('26 candidates');
    await expect(rows).toHaveCount(25);

    // The strip states where it is rather than only painting it.
    await expect(page.getByTestId('candidates-page-1')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('candidates-page-2')).not.toHaveAttribute('aria-current', 'page');

    await page.getByTestId('candidates-page-2').click();
    await expect(rows).toHaveCount(1);
    await expect(page.getByTestId('candidates-page-2')).toHaveAttribute('aria-current', 'page');
    // The count is org-wide and unfiltered, so it does not move with the page.
    await expect(page.getByTestId('candidates-count')).toHaveText('26 candidates');

    // A filter is a new question: back to page 1, and the strip goes entirely when what
    // is left fits on it. A control offering one choice is not a choice.
    await page.getByTestId('candidates-search-input').fill('Candidate07');
    await expect(page.getByTestId('candidates-count')).toHaveText('1 of 26 candidates');
    await expect(page.getByTestId('candidates-pagination')).toHaveCount(0);
  });

  /**
   * TC-H03-E2E-08 — the row's actions.
   *
   * Four claims, and the first is the one the whole column rests on: pressing the kebab is
   * not pressing the row. The menu is a portal (ledger §55), so the row cannot decide that
   * by containment and has to be asked directly.
   */
  test('acts on a row without opening it, and confirms what it did', async ({ page, request }) => {
    const { org, path } = await seed(request, 'cand-actions');
    await signIn(page, org.email);
    await page.goto(path);

    await page.getByTestId('candidates-search-input').fill('Tom');
    await expect(page.getByTestId('candidates-count')).toHaveText('1 of 3 candidates');
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
    await expect(page.getByTestId('candidates-count')).toHaveText('1 of 3 candidates');
    const id = await onlyRowId(page);

    await page.getByTestId(`candidate-actions-${id}`).click();
    await page.getByTestId(`candidate-action-reschedule-${id}`).click();

    await page.waitForURL('**/hiring/candidates/**');
    await expect(page.getByTestId('candidate-card')).toBeVisible();
    await expect(page.locator('[data-testid^="application-reschedule-dialog-"]')).toBeVisible();
  });

  /** The id of the single row on screen — the tests above narrow to one before asking. */
  async function onlyRowId(page: Page): Promise<string> {
    const row = page.getByTestId('candidates-list').locator('[data-testid^="candidate-row-"]');
    await expect(row).toHaveCount(1);
    return (await row.getAttribute('data-testid'))!.replace('candidate-row-', '');
  }
});
