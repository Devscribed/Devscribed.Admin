import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  assessCriterion,
  bookInterview,
  columnCards,
  createCategory,
  createCriterion,
  createVacancy,
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
 * Both cases below are about the same thing seen from two angles: **the count is the
 * feedback**. It is what a filter change is judged by, what a search has to compose
 * with, and the one thing on the page that is announced.
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

  /** Picks an option out of a `Combobox`, which opens on focus. */
  async function chooseInCombobox(page: Page, field: string, option: string): Promise<void> {
    await page.getByTestId(field).click();
    await page.getByTestId(option).click();
  }

  /** Picks an option out of a `Select`, which opens on click. */
  async function chooseInSelect(page: Page, field: string, option: string): Promise<void> {
    await page.getByTestId(field).click();
    await page.getByTestId(option).click();
  }

  /**
   * TC-H03-E2E-01 — filter by category and criterion, and read the count.
   *
   * The headline query, built one control at a time, with the count checked after each:
   * it is the only thing that says whether a filter did anything.
   */
  test('narrows the count with each filter and widens it when a chip is removed', async ({
    page,
    request,
  }) => {
    const { org, react, english, path } = await seed(request, 'cand-filter');
    await signIn(page, org.email);
    await page.goto(path);

    const count = page.getByTestId('candidates-count');
    await expect(count).toHaveText('3 candidates');
    await expect(page.getByTestId('candidates-list')).toBeVisible();

    // The category: two of the three applied to a React-categorised vacancy.
    await chooseInCombobox(
      page,
      'candidates-filter-category',
      `candidates-filter-category-option-${react.id}`,
    );
    await expect(count).toHaveText('2 of 3 candidates');

    // The criterion: of those two, one is at B1 and one is below it.
    await page.getByTestId('candidates-criteria-filter-add').click();
    await chooseInCombobox(
      page,
      'criteria-filter-criterion-0',
      `criteria-filter-criterion-0-option-${english.id}`,
    );
    await chooseInSelect(page, 'criteria-filter-op-0', 'criteria-filter-op-0-option-gte');

    // Choosing the criterion alone must not narrow anything: a row with no value yet is
    // half-built, not a filter that matches nobody (03 design §Interactions).
    await expect(count).toHaveText('2 of 3 candidates');

    const b1 = english.values.find((value) => value.label === 'B1')!.id;
    await chooseInSelect(page, 'criteria-filter-value-0', `criteria-filter-value-0-option-${b1}`);
    await expect(count).toHaveText('1 of 3 candidates');
    await expect(page.getByTestId('candidate-name-' + (await onlyRowId(page)))).toHaveText('Jane Doe');

    // Removing the chip widens the set in place — the criterion row still holds.
    await page.getByTestId(`candidates-filter-chip-${react.id}`).getByRole('button').click();
    await expect(count).toHaveText('1 of 3 candidates');

    // Removing a chip returns focus to the field, which reopens its option list over the
    // row below. A pointer would dismiss it on the way down; a test has to say so.
    await page.keyboard.press('Escape');

    // And removing the criterion row restores the unfiltered list.
    await page.getByTestId('criteria-filter-remove-0').click();
    await expect(count).toHaveText('3 candidates');
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

    await chooseInCombobox(
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
   * The criterion list is longer than the card it opens inside, and a `Card` clips to its
   * radius by default — which cut the popover off at the card's edge and left the options
   * below the fold unclickable. `clip={false}` is what makes this pass.
   */
  test('offers every criterion, including one whose row falls past the card edge', async ({
    page,
    request,
  }) => {
    const { org, path } = await seed(request, 'cand-popover');
    await createCriterion(request, org, { name: 'Availability', type: 'boolean' });
    const zone = await createCriterion(request, org, { name: 'Zone', type: 'text' });
    await signIn(page, org.email);
    await page.goto(path);

    await page.getByTestId('candidates-criteria-filter-add').click();
    await page.getByTestId('criteria-filter-criterion-0').click();

    // Last of the three, so its row falls below where the card ends.
    const option = page.getByTestId(`criteria-filter-criterion-0-option-${zone.id}`);
    const box = (await option.boundingBox())!;

    // Hit-testing rather than clicking, and rather than comparing boxes. A clipped
    // popover keeps its layout geometry and still scrolls into view inside the card that
    // hides it, so Playwright would click it happily either way — what actually differs
    // is whether anything is *painted* where the option appears to be.
    const painted = await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest('[data-testid]')
          ?.getAttribute('data-testid') ?? null,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    expect(painted).toBe(`criteria-filter-criterion-0-option-${zone.id}`);

    await option.click();
    await chooseInSelect(page, 'criteria-filter-op-0', 'criteria-filter-op-0-option-contains');
    await expect(page.getByTestId('criteria-filter-value-0')).toBeVisible();
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

  /** The id of the single row on screen — the tests above narrow to one before asking. */
  async function onlyRowId(page: Page): Promise<string> {
    const row = page.getByTestId('candidates-list').locator('[data-testid^="candidate-row-"]');
    await expect(row).toHaveCount(1);
    return (await row.getAttribute('data-testid'))!.replace('candidate-row-', '');
  }
});
