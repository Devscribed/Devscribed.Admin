import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  bookInterview,
  columnCards,
  createVacancy,
  registerOrganization,
  signIn,
  uniqueEmail,
  type Registered,
  type SeededVacancy,
} from './helpers';

/**
 * The board — five columns of one vacancy's candidates, dragged between and within.
 *
 * Card ids are generated server-side, so every test reads them off the API before it
 * touches the browser. That is a precondition rather than the thing under test; what is
 * under test is what a drag does to them.
 *
 * The board stopped being a route of its own (01 §08.27): it is drawn under the vacancy's
 * header, on the vacancy's own address. Every rule below is unchanged — that is the point
 * of the fold-in — and the only thing this file had to learn is where to find it.
 */
test.describe('Board', () => {
  /**
   * Wide enough for all five columns at their 220px minimum, plus the 252px sidebar and
   * the page's own padding. Below that the column group scrolls inside its own container
   * — correct, and covered by its own test at the end — but a drag across a scrolling
   * container is not what these tests are about.
   */
  test.use({ viewport: { width: 1600, height: 900 } });

  interface Seed {
    org: Registered;
    vacancy: SeededVacancy;
    path: string;
  }

  /** An organization, a vacancy, and `count` interviews booked on it. */
  async function seed(
    request: APIRequestContext,
    prefix: string,
    count = 1,
  ): Promise<Seed> {
    const org = await registerOrganization(request, uniqueEmail(prefix));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });

    for (let index = 0; index < count; index += 1) {
      await bookInterview(request, vacancy.publicSlug, {
        firstName: `Cand${index}`,
        lastName: 'Doe',
        email: uniqueEmail(`candidate${index}`),
        slotIndex: index,
      });
    }

    return {
      org,
      vacancy,
      path: `/org/${org.organizationId}/hiring/vacancies/${vacancy.id}`,
    };
  }

  /** Opens the vacancy and waits for its board to arrive. */
  async function openBoard(page: Page, seeded: Seed): Promise<void> {
    await page.goto(seeded.path);
    await expect(page.getByTestId('board')).toBeVisible();
  }

  const card = (page: Page, applicationId: string) =>
    page.getByTestId(`board-card-${applicationId}`);

  /* ---------------------------------------------------------------- *
   * TC-H05-E2E-01
   * ---------------------------------------------------------------- */

  test('drags a card to another column and back', async ({ page, request }) => {
    const seeded = await seed(request, 'board-move');
    const [only] = await columnCards(request, seeded.org, seeded.vacancy.id, 'scheduled');

    await signIn(page, seeded.org.email);
    await openBoard(page, seeded);

    await expect(page.getByTestId('board-column-count-scheduled')).toHaveText('1');
    await expect(page.getByTestId('board-column-count-maybe')).toHaveText('0');

    await card(page, only.applicationId).dragTo(page.getByTestId('board-column-maybe'));

    await expect(page.getByTestId('board-column-count-maybe')).toHaveText('1');
    await expect(page.getByTestId('board-column-count-scheduled')).toHaveText('0');
    await expect(
      page.getByTestId('board-column-maybe').getByTestId(`board-card-${only.applicationId}`),
    ).toBeVisible();

    // The change is in the database, not merely on the screen.
    await page.reload();
    await expect(
      page.getByTestId('board-column-maybe').getByTestId(`board-card-${only.applicationId}`),
    ).toBeVisible();

    // And back — no transition is blocked, in either direction.
    await card(page, only.applicationId).dragTo(page.getByTestId('board-column-scheduled'));

    await expect(page.getByTestId('board-column-count-scheduled')).toHaveText('1');
    await expect(page.getByTestId('board-column-count-maybe')).toHaveText('0');
    await page.reload();
    await expect(
      page.getByTestId('board-column-scheduled').getByTestId(`board-card-${only.applicationId}`),
    ).toBeVisible();
  });

  /* ---------------------------------------------------------------- *
   * TC-H05-E2E-02
   * ---------------------------------------------------------------- */

  test('opens the card with Conclusion focused after a drop into Didn’t pass', async ({
    page,
    request,
  }) => {
    const seeded = await seed(request, 'board-conclusion');
    const [only] = await columnCards(request, seeded.org, seeded.vacancy.id, 'scheduled');

    await signIn(page, seeded.org.email);
    await openBoard(page, seeded);

    await card(page, only.applicationId).dragTo(page.getByTestId('board-column-didnt_pass'));

    // The move completes first, and only then does the card page open.
    await page.waitForURL(`**/hiring/candidates/${only.candidateId}**`);
    await expect(page.getByTestId('card-conclusion-input')).toBeFocused();

    // Dismissed without typing: the move stands either way.
    await page.goto(seeded.path);
    await expect(
      page.getByTestId('board-column-didnt_pass').getByTestId(`board-card-${only.applicationId}`),
    ).toBeVisible();
    // And the gap it left is findable.
    await expect(
      page.getByTestId(`board-card-no-conclusion-${only.applicationId}`),
    ).toBeVisible();
  });

  test('drops the missing-conclusion marker once a conclusion is recorded', async ({
    page,
    request,
  }) => {
    const seeded = await seed(request, 'board-marker');
    const [only] = await columnCards(request, seeded.org, seeded.vacancy.id, 'scheduled');

    await signIn(page, seeded.org.email);
    await openBoard(page, seeded);
    await card(page, only.applicationId).dragTo(page.getByTestId('board-column-offer'));

    await page.waitForURL(`**/hiring/candidates/${only.candidateId}**`);
    await page.getByTestId('card-conclusion-input').fill('Offer extended.');
    await page.getByTestId('card-conclusion-save').click();
    await expect(page.getByTestId('card-conclusion-saved-at')).toHaveText(/^Saved/);

    await page.goto(seeded.path);
    await expect(
      page.getByTestId('board-column-offer').getByTestId(`board-card-${only.applicationId}`),
    ).toBeVisible();
    await expect(page.getByTestId(`board-card-no-conclusion-${only.applicationId}`)).toHaveCount(0);
  });

  test('keeps the dragged card on screen through its own dragstart', async ({
    page,
    request,
  }) => {
    const seeded = await seed(request, 'board-ghost', 2);
    const [top] = await columnCards(request, seeded.org, seeded.vacancy.id, 'scheduled');

    await signIn(page, seeded.org.email);
    await openBoard(page, seeded);

    /*
     * The browser rasterizes the drag image at the end of the dragstart dispatch, and
     * React flushes a discrete event's state update before that dispatch returns. A card
     * swapped for its placeholder inside the handler is therefore already gone when the
     * snapshot is taken, and the pointer drags nothing at all — the card looks like it
     * vanished, leaving a grey box and an insertion line behind.
     *
     * A listener on `document` runs after React's, which is attached at the root
     * container inside it — so this reads the DOM at exactly the moment that matters.
     * It has to be a real mouse drag: a `dispatchEvent` from here is untrusted, React
     * does not treat it as discrete, and it would pass whether or not the bug is present.
     */
    await page.evaluate((id) => {
      const probe = { cardPresent: false };
      (window as Window & { __dragProbe?: typeof probe }).__dragProbe = probe;
      document.addEventListener('dragstart', () => {
        probe.cardPresent = document.querySelector(`[data-testid="board-card-${id}"]`) !== null;
      });
    }, top.applicationId);

    const from = (await card(page, top.applicationId).boundingBox())!;
    await page.mouse.move(from.x + 20, from.y + 20);
    await page.mouse.down();
    await page.mouse.move(from.x + 30, from.y + 70, { steps: 5 });

    expect(
      await page.evaluate(
        () => (window as Window & { __dragProbe?: { cardPresent: boolean } }).__dragProbe!,
      ),
    ).toEqual({ cardPresent: true });

    // And the gap still opens immediately to the eye, one frame later.
    await expect(page.getByTestId('board-placeholder-scheduled')).toBeVisible();
    await page.mouse.up();
  });

  test('clears the drag when the pointer is released outside every column', async ({
    page,
    request,
  }) => {
    const seeded = await seed(request, 'board-release', 3);
    const cards = await columnCards(request, seeded.org, seeded.vacancy.id, 'scheduled');
    const [top] = cards;

    await signIn(page, seeded.org.email);
    await openBoard(page, seeded);

    /*
     * A drop inside a column is cleared by that column's own `onDrop`. A release over
     * anything else produces only `dragend` — and the card renders as its placeholder
     * for the whole drag, so a handler left on the card branch alone is not attached by
     * the time it arrives. The placeholder and the insertion line would then stay on
     * screen for good, and the next drag would find a board still holding the last one.
     */
    const from = (await card(page, top.applicationId).boundingBox())!;
    await page.mouse.move(from.x + 20, from.y + 20);
    await page.mouse.down();
    await page.mouse.move(from.x + 30, from.y + 70, { steps: 5 });
    await expect(page.getByTestId('board-placeholder-scheduled')).toBeVisible();
    // The card itself is gone while it is in flight — the placeholder is its gap.
    await expect(card(page, top.applicationId)).toHaveCount(0);

    // The page header: no drop zone anywhere near it.
    await page.mouse.move(900, 120, { steps: 10 });
    await page.mouse.up();

    await expect(card(page, top.applicationId)).toBeVisible();
    await expect(page.locator('[data-board-placeholder]')).toHaveCount(0);
    await expect(page.getByTestId('board-column-count-scheduled')).toHaveText('3');

    // And the board is usable again: the next drag moves a card rather than reviving
    // the abandoned one.
    await card(page, cards[1].applicationId).dragTo(page.getByTestId('board-column-maybe'));
    await expect(page.getByTestId('board-column-count-maybe')).toHaveText('1');
    await expect(page.getByTestId('board-column-count-scheduled')).toHaveText('2');
    await expect(page.locator('[data-board-placeholder]')).toHaveCount(0);
  });

  /* ---------------------------------------------------------------- *
   * TC-H05-E2E-03
   * ---------------------------------------------------------------- */

  test('reorders within a column, and the order survives a reload', async ({ page, request }) => {
    const seeded = await seed(request, 'board-reorder', 3);
    const before = await columnCards(request, seeded.org, seeded.vacancy.id, 'scheduled');
    const names = (page: Page) =>
      page.getByTestId('board-column-scheduled').locator('[data-board-card]');

    await signIn(page, seeded.org.email);
    await openBoard(page, seeded);
    await expect(names(page)).toHaveCount(3);

    const last = before[2];
    // Above the first card's midpoint, which is where the insertion line lands.
    await card(page, last.applicationId).dragTo(card(page, before[0].applicationId), {
      targetPosition: { x: 20, y: 2 },
    });

    const expected = [last, before[0], before[1]].map(
      (entry) => `board-card-${entry.applicationId}`,
    );
    // The order changes immediately, before any reload.
    await expect(names(page).nth(0)).toHaveAttribute('data-testid', expected[0]);

    await page.reload();
    await expect(names(page)).toHaveCount(3);
    for (const [index, testId] of expected.entries()) {
      await expect(names(page).nth(index)).toHaveAttribute('data-testid', testId);
    }
  });

  test('issues no request when a card is dropped back where it started', async ({
    page,
    request,
  }) => {
    const seeded = await seed(request, 'board-noop', 3);
    const cards = await columnCards(request, seeded.org, seeded.vacancy.id, 'scheduled');
    const middle = cards[1];

    await signIn(page, seeded.org.email);
    await openBoard(page, seeded);

    const moves: string[] = [];
    page.on('request', (event) => {
      if (event.url().includes('/placement')) moves.push(event.url());
    });

    // Onto its own place — the same gap seen from either side (05 §02.6).
    await card(page, middle.applicationId).dragTo(card(page, middle.applicationId));
    await expect(page.getByTestId('board-column-count-scheduled')).toHaveText('3');

    expect(moves).toEqual([]);
  });

  /* ---------------------------------------------------------------- *
   * TC-H05-E2E-04
   * ---------------------------------------------------------------- */

  test('is keyboard operable, announcing the pick-up, the target and the drop', async ({
    page,
    request,
  }) => {
    const seeded = await seed(request, 'board-keyboard', 2);
    const cards = await columnCards(request, seeded.org, seeded.vacancy.id, 'scheduled');
    const moving = cards[0];

    await signIn(page, seeded.org.email);
    await openBoard(page, seeded);

    const live = page.getByTestId('board-live-region');

    await card(page, moving.applicationId).focus();
    await page.keyboard.press('Space');
    await expect(live).toContainText('Picked up');
    await expect(live).toContainText('Scheduled');

    // Two columns to the right of Scheduled: Didn't pass, then Maybe.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(live).toContainText('Maybe');

    await page.keyboard.press('Space');
    await expect(live).toContainText('Dropped');

    await expect(
      page.getByTestId('board-column-maybe').getByTestId(`board-card-${moving.applicationId}`),
    ).toBeVisible();
    // Focus comes back to the card that moved, so a keyboard user keeps their place.
    await expect(card(page, moving.applicationId)).toBeFocused();

    await page.reload();
    await expect(
      page.getByTestId('board-column-maybe').getByTestId(`board-card-${moving.applicationId}`),
    ).toBeVisible();
  });

  test('returns a card to where it started when a keyboard drag is cancelled', async ({
    page,
    request,
  }) => {
    const seeded = await seed(request, 'board-escape');
    const [only] = await columnCards(request, seeded.org, seeded.vacancy.id, 'scheduled');

    await signIn(page, seeded.org.email);
    await openBoard(page, seeded);

    await card(page, only.applicationId).focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('board-live-region')).toContainText('Cancelled');
    await expect(page.getByTestId('board-column-count-scheduled')).toHaveText('1');
    await expect(page.getByTestId('board-column-count-didnt_pass')).toHaveText('0');
  });

  /* ---------------------------------------------------------------- *
   * The states either side of a board with cards on it
   * ---------------------------------------------------------------- */

  test('is the vacancy, and says so when there is nothing on it', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('board-empty'));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });

    await signIn(page, org.email);
    await page.goto(`/org/${org.organizationId}/hiring/vacancies/${vacancy.id}`);

    // One screen: the vacancy's header and its board, with no navigation between them.
    await expect(page.getByTestId('vacancy-detail')).toBeVisible();
    await expect(page.getByTestId('page-title')).toHaveText('Senior React Engineer');
    await expect(page.getByTestId('board-empty-state')).toHaveText(
      'No candidates yet. Share the booking link to start.',
    );
    // The zone is still named once, in the header, rather than on every card (05 §05).
    await expect(page.getByTestId('board-timezone')).toHaveText('Europe/Berlin');

    // Neither of the two links between the halves exists any more, because there are no
    // halves.
    await expect(page.getByTestId('vacancy-board-link')).toHaveCount(0);
    await expect(page.getByTestId('board-details-link')).toHaveCount(0);
  });

  /**
   * 01 §08.27 — the old address travelled, so it lands on the screen it became.
   *
   * The redirect is the server's, so the browser never renders the route it left: the
   * assertion is on the address bar as much as on what is drawn.
   */
  test('forwards the old board address to the vacancy', async ({ page, request }) => {
    const seeded = await seed(request, 'board-redirect');
    const [only] = await columnCards(request, seeded.org, seeded.vacancy.id, 'scheduled');

    await signIn(page, seeded.org.email);
    await page.goto(
      `/org/${seeded.org.organizationId}/hiring/vacancies/${seeded.vacancy.id}/board`,
    );

    await expect(page).toHaveURL(
      `/org/${seeded.org.organizationId}/hiring/vacancies/${seeded.vacancy.id}`,
    );
    await expect(page.getByTestId('vacancy-detail')).toBeVisible();
    await expect(card(page, only.applicationId)).toBeVisible();
  });

  test('offers one column at a time, and no drag, on a narrow viewport', async ({
    page,
    request,
  }) => {
    const seeded = await seed(request, 'board-narrow');
    const [only] = await columnCards(request, seeded.org, seeded.vacancy.id, 'scheduled');
    await page.setViewportSize({ width: 420, height: 800 });

    await signIn(page, seeded.org.email);
    await openBoard(page, seeded);

    // One column, chosen by the tab strip. Drag is not attempted at all down here: the
    // card page's own status control does the same job.
    await expect(page.getByTestId('board-column-scheduled')).toBeVisible();
    await expect(page.getByTestId('board-column-maybe')).toHaveCount(0);
    await expect(card(page, only.applicationId)).toHaveAttribute('draggable', 'false');

    await page.getByTestId('board-tab-maybe').click();
    await expect(page.getByTestId('board-column-maybe')).toBeVisible();
    await expect(page.getByTestId('board-column-scheduled')).toHaveCount(0);

    // The page body never scrolls horizontally, at any width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('opens the candidate card when a card is clicked', async ({ page, request }) => {
    const seeded = await seed(request, 'board-open');
    const [only] = await columnCards(request, seeded.org, seeded.vacancy.id, 'scheduled');

    await signIn(page, seeded.org.email);
    await openBoard(page, seeded);
    await card(page, only.applicationId).click();

    // A real page, not a modal over the board — it has to be linkable from an invite.
    await page.waitForURL(`**/hiring/candidates/${only.candidateId}**`);
    await expect(page.getByTestId('candidate-card')).toBeVisible();
  });
});
