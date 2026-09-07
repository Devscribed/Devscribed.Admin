import { expect, test, type Page } from '@playwright/test';
import { CV_FILE, createVacancy, registerOrganization, uniqueEmail } from './helpers';

/**
 * The public booking page against real availability: the month grid, the slot list, the
 * zone selector and the format toggle.
 *
 * The browser is pinned to UTC so the assertions can name times. The zone selector is
 * what the candidate would use to change that, and it has its own test below.
 */
test.use({ timezoneId: 'UTC' });

/** The dates the grid is offering, in the order they appear. */
async function availableDates(page: Page): Promise<string[]> {
  const cells = page.locator('[data-testid^="calendar-day-"]:not([disabled])');
  await expect(cells.first()).toBeVisible();
  return (await cells.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-date')))).filter(
    (date): date is string => date !== null,
  );
}

const firstSlot = (page: Page) => page.locator('[data-testid^="slot-option-"]').first();

test.describe('Booking page', () => {
  /** TC-H02-E2E-01 */
  test('books an interview with no session', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('booking-owner'));
    const vacancy = await createVacancy(request, org, {
      title: 'Senior React Engineer',
      description: "We're looking for an engineer who ships.",
    });

    await page.goto(`/book/${vacancy.publicSlug}`);

    // No session, and nothing that invites one.
    await expect(page.getByTestId('booking-page')).toBeVisible();
    await expect(page.getByTestId('booking-vacancy-title')).toHaveText('Senior React Engineer');
    await expect(page.getByTestId('booking-duration')).toHaveText('60 minutes');
    await expect(page.getByTestId('booking-org-wordmark')).toContainText('Acme Inc');
    await expect(page.getByTestId('booking-description')).toBeVisible();
    await expect(page.getByRole('link', { name: /sign in|log in/i })).toHaveCount(0);

    // The first available date is selected on load; no slot ever is.
    await expect(page.getByTestId('calendar-control')).toBeVisible();
    const dates = await availableDates(page);
    const selected = page.locator('[data-testid^="calendar-day-"][aria-selected="true"]');
    await expect(selected).toHaveCount(1);
    expect(await selected.getAttribute('data-date')).toBe(dates[0]);
    await expect(page.locator('[data-testid^="slot-option-"][aria-pressed="true"]')).toHaveCount(0);

    const submit = page.getByTestId('booking-submit-button');
    await expect(submit).toBeDisabled();

    const slot = firstSlot(page);
    await expect(slot).toBeVisible();
    const startUtc = (await slot.getAttribute('data-testid'))!.replace('slot-option-', '');
    await slot.click();
    await expect(slot).toHaveAttribute('aria-pressed', 'true');

    // A time alone is not enough.
    await expect(submit).toBeDisabled();

    await page.getByTestId('booking-first-name-input').fill('Jane');
    await page.getByTestId('booking-last-name-input').fill('Doe');
    await page.getByTestId('booking-email-input').fill('jane@example.com');
    await page.getByTestId('booking-cv-input').setInputFiles(CV_FILE);

    await expect(submit).toBeEnabled();
    await submit.click();

    /*
     * No confirmation view: booking navigates to the manage link, which is a URL the
     * candidate can reload, bookmark, and come back to. The confirmation it replaces was
     * component state, and a refresh put an empty booking form in front of somebody who
     * had already booked (02 §10.41).
     */
    await page.waitForURL(new RegExp(`/manage/${vacancy.publicSlug}/[A-Za-z0-9_-]{22}$`));
    const durable = page.url();

    // Still public, still no session, and the record states everything the confirmation
    // used to — with Reschedule and Cancel on it, which the confirmation never had.
    await expect(page.getByTestId('manage-page')).toBeVisible();
    await expect(page.getByTestId('manage-vacancy-title')).toHaveText('Senior React Engineer');
    await expect(page.getByTestId('manage-duration')).toHaveText('60 minutes');
    await expect(page.getByTestId('manage-booking-zone')).toContainText('UTC');
    // It names nobody — not even the person who just booked. The link is forwardable
    // (07 §04.21), and a CV is acknowledged rather than named.
    await expect(page.getByTestId('manage-cv-present')).toHaveText('CV attached');
    await expect(page.locator('body')).not.toContainText('jane@example.com');
    await expect(page.getByRole('link', { name: /sign in|log in/i })).toHaveCount(0);

    const when = await page.getByTestId('manage-booking-when').textContent();
    expect(when).toContain(
      new Date(startUtc).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC',
      }),
    );

    // The one fact the record cannot state for itself. It matters because the product
    // sends no mail of its own — Microsoft's invite is all the candidate ever gets. It
    // does not name the address, because the page names nobody.
    await expect(page.getByTestId('manage-booked')).toHaveText(
      'A calendar invite is on its way to the address you gave.',
    );

    // The flag comes off the address bar, so what they are left holding is the link
    // their invite carries — not a variant of it.
    expect(durable).not.toContain('?');

    /*
     * The whole reason this navigates. A refresh used to discard the confirmation and
     * render an empty booking form; now it re-reads the record.
     */
    await page.reload();
    await expect(page.getByTestId('manage-booking-when')).toHaveText(when!);
    await expect(page.getByTestId('booking-submit-button')).toHaveCount(0);
    // The notice is a receipt for an action, not a state of the record (07 §04.19).
    await expect(page.getByTestId('manage-booked')).toHaveCount(0);

    await expect(page.getByTestId('manage-cancel-button')).toBeVisible();
  });

  /** TC-H02-E2E-02 */
  test('times are 24-hour by default and the toggle is remembered', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('booking-format'));
    const vacancy = await createVacancy(request, org);

    await page.goto(`/book/${vacancy.publicSlug}`);
    const slot = firstSlot(page);
    await expect(slot).toBeVisible();

    // `14:00`, never `2:00 PM`.
    await expect(slot).toHaveText(/^\d{2}:\d{2}$/);

    await slot.click();
    let availabilityCalls = 0;
    page.on('request', (request) => {
      if (request.url().includes('/availability')) availabilityCalls += 1;
    });

    await page.getByTestId('booking-timeformat-toggle').getByText('12h').click();
    await expect(slot).toHaveText(/^\d{1,2}:\d{2} (AM|PM)$/);
    // Labels only: nothing is refetched and nothing is deselected.
    expect(availabilityCalls).toBe(0);
    await expect(slot).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('slot-list-timezone')).toContainText('UTC');

    await page.reload();
    await expect(firstSlot(page)).toHaveText(/^\d{1,2}:\d{2} (AM|PM)$/);
  });

  /** TC-H02-E2E-03 */
  test('changing the time zone re-renders both controls', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('booking-zone'));
    const vacancy = await createVacancy(request, org);

    await page.goto(`/book/${vacancy.publicSlug}`);
    const slot = firstSlot(page);
    await expect(slot).toBeVisible();
    const beforeLabel = await slot.textContent();
    const beforeDates = await availableDates(page);
    await slot.click();

    await page.getByTestId('booking-timezone-select').click();
    await page.getByTestId('timezone-option-Pacific/Auckland').click();

    // The header names the new zone and the list is expressed in it — twelve hours from
    // UTC, so the same instants read as entirely different times of day.
    await expect(page.getByTestId('slot-list-timezone')).toContainText('Pacific/Auckland');
    await expect(firstSlot(page)).not.toHaveText(beforeLabel!);
    // The grid re-buckets too: a working day in UTC straddles two dates in Auckland.
    expect(await availableDates(page)).not.toEqual(beforeDates);

    // A selection that survives is still one instant; one that does not leaves Book
    // disabled rather than booking a time the candidate never saw.
    const stillSelected = page.locator('[data-testid^="slot-option-"][aria-pressed="true"]');
    if ((await stillSelected.count()) === 0) {
      await expect(page.getByTestId('booking-submit-button')).toBeDisabled();
    }
  });

  /** TC-HSLOT-E2E-02 */
  test('the format and zone controls are independent', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('booking-controls'));
    const vacancy = await createVacancy(request, org);

    await page.goto(`/book/${vacancy.publicSlug}`);
    await expect(firstSlot(page)).toBeVisible();

    await page.getByTestId('booking-timeformat-toggle').getByText('12h').click();
    await expect(firstSlot(page)).toHaveText(/(AM|PM)$/);
    await expect(page.getByTestId('slot-list-timezone')).toContainText('UTC');

    await page.getByTestId('booking-timezone-select').click();
    await page.getByTestId('timezone-option-Europe/Minsk').click();

    await expect(page.getByTestId('slot-list-timezone')).toContainText('Europe/Minsk');
    // Still 12-hour: changing one control never changes the other.
    await expect(firstSlot(page)).toHaveText(/(AM|PM)$/);
  });

  /** TC-HCAL-E2E-01 */
  test('keyboard navigation lands only on available dates', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('booking-keyboard'));
    const vacancy = await createVacancy(request, org);

    await page.goto(`/book/${vacancy.publicSlug}`);
    const dates = await availableDates(page);
    expect(dates.length).toBeGreaterThan(1);

    await page.getByTestId(`calendar-day-${dates[0]}`).focus();

    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press('ArrowRight');
      const landed = await page.evaluate(() => {
        const active = document.activeElement as HTMLButtonElement | null;
        return {
          date: active?.getAttribute('data-date') ?? null,
          disabled: active?.hasAttribute('disabled') ?? true,
        };
      });
      // Never an unavailable, past, or blank cell — those are out of the tab order.
      expect(landed.date).not.toBeNull();
      expect(landed.disabled).toBe(false);
      expect(dates).toContain(landed.date);
    }

    await page.keyboard.press('Enter');
    const selected = page.locator('[data-testid^="calendar-day-"][aria-selected="true"]');
    await expect(selected).toHaveCount(1);
    await expect(page.getByTestId('slot-list')).toBeVisible();
  });

  /** TC-HCAL-UNIT-02's bounds, and §02.9–10, as the control actually wires them. */
  test('month navigation is bounded by the window and keeps the selection', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('booking-months'));
    const vacancy = await createVacancy(request, org);

    await page.goto(`/book/${vacancy.publicSlug}`);
    await expect(firstSlot(page)).toBeVisible();

    const label = page.getByTestId('calendar-month-label');
    const opening = await label.textContent();
    const selected = page.locator('[data-testid^="calendar-day-"][aria-selected="true"]');
    const chosen = await selected.getAttribute('data-date');

    // The window opens today, so there is no earlier month to reach.
    await expect(page.getByTestId('calendar-prev-month')).toBeDisabled();
    await expect(page.getByTestId('calendar-next-month')).toBeEnabled();

    await page.getByTestId('calendar-next-month').click();
    await expect(label).not.toHaveText(opening!);
    // One calendar month ahead is the end of it.
    await expect(page.getByTestId('calendar-next-month')).toBeDisabled();
    await expect(page.getByTestId('calendar-prev-month')).toBeEnabled();

    await page.getByTestId('calendar-prev-month').click();
    await expect(label).toHaveText(opening!);
    // Navigating away and back changes nothing about what was chosen.
    expect(await selected.getAttribute('data-date')).toBe(chosen);
  });

  /** TC-HCAL-E2E-02 */
  test('an availability failure is distinguishable from an empty month', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('booking-failure'));
    const vacancy = await createVacancy(request, org);

    await page.route('**/availability**', (route) => route.abort());
    await page.goto(`/book/${vacancy.publicSlug}`);

    await expect(page.getByTestId('calendar-error')).toBeVisible();
    await expect(page.getByTestId('slot-list-error')).toBeVisible();
    // Not a month of unavailable dates — the grid is not rendered at all.
    await expect(page.getByTestId('calendar-grid')).toHaveCount(0);
    await expect(page.locator('[data-testid^="calendar-day-"]')).toHaveCount(0);
    await expect(page.getByTestId('booking-submit-button')).toBeDisabled();

    await page.unroute('**/availability**');
    await page.getByTestId('calendar-retry').click();

    await expect(page.getByTestId('calendar-grid')).toBeVisible();
    await expect(page.locator('[data-testid^="calendar-day-"][aria-selected="true"]')).toHaveCount(1);
  });

  /** TC-H02-E2E-05 */
  test('booking twice for the same vacancy is refused with the existing time', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('booking-repeat'));
    const vacancy = await createVacancy(request, org);

    const fill = async () => {
      await firstSlot(page).click();
      await page.getByTestId('booking-first-name-input').fill('Jane');
      await page.getByTestId('booking-last-name-input').fill('Doe');
      await page.getByTestId('booking-email-input').fill('jane@example.com');
      await page.getByTestId('booking-cv-input').setInputFiles(CV_FILE);
      await page.getByTestId('booking-submit-button').click();
    };

    await page.goto(`/book/${vacancy.publicSlug}`);
    await expect(firstSlot(page)).toBeVisible();
    await fill();
    await page.waitForURL(/\/manage\//);

    await page.goto(`/book/${vacancy.publicSlug}`);
    await expect(firstSlot(page)).toBeVisible();
    await fill();

    // A statement about the booking, not about the email field — so it lands in the
    // banner, and it names the interview they already have.
    const banner = page.getByTestId('booking-error-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('You already have an interview for this position on');
    await expect(page.getByTestId('field-error-email')).toHaveCount(0);
    // A refused booking does not navigate: only a 201 leaves this page.
    await expect(page).toHaveURL(new RegExp(`/book/${vacancy.publicSlug}$`));
    // The form keeps what was typed — there is nothing to retype.
    await expect(page.getByTestId('booking-first-name-input')).toHaveValue('Jane');
    await expect(page.getByTestId('booking-email-input')).toHaveValue('jane@example.com');
  });

  /** TC-H02-E2E-04, in the part that runs before submission. */
  test('rejects an unsupported CV before the form can be submitted', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('booking-cv'));
    const vacancy = await createVacancy(request, org);

    await page.goto(`/book/${vacancy.publicSlug}`);
    await firstSlot(page).click();
    await page.getByTestId('booking-first-name-input').fill('Jane');
    await page.getByTestId('booking-last-name-input').fill('Doe');
    await page.getByTestId('booking-email-input').fill('jane@example.com');

    await page.getByTestId('booking-cv-input').setInputFiles({
      name: 'cv.pages',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('not a cv we accept'),
    });

    await expect(page.getByTestId('field-error-cv')).toHaveText(
      'Unsupported file type. Accepted: .pdf, .doc, .docx, .rtf, .txt',
    );
    await expect(page.getByTestId('booking-submit-button')).toBeDisabled();

    await page.getByTestId('booking-cv-input').setInputFiles(CV_FILE);

    await expect(page.getByTestId('field-error-cv')).toHaveCount(0);
    await expect(page.getByTestId('booking-cv-filename')).toHaveText(CV_FILE.name);
    await expect(page.getByTestId('booking-submit-button')).toBeEnabled();
  });

  /** TC-H02-E2E-07 in substance: an unknown link reveals nothing. */
  test('an unknown link reveals nothing', async ({ page }) => {
    await page.goto('/book/does-not-exist-AAAAAAAAAAAA');

    await expect(page.getByTestId('booking-not-found')).toBeVisible();
    await expect(page.getByTestId('booking-vacancy-title')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Acme Inc');
  });

  /**
   * TC-H02-E2E-08 — the page folds at 880 and at `sm`, and the date grid keeps its target at 360.
   *
   * Read at the boundaries rather than in the middle of a band: 880 and 879 are the same pixel
   * from either side, and so are 576 and 575. A case at 360 and 1440 would pass against any pair
   * of numbers, which is the whole thing being asserted.
   *
   * Polled rather than measured after a pause — a resize is applied asynchronously, and this file
   * runs beside four other workers (`responsive.spec.ts:107`).
   */
  test('folds at 880 and at sm, and the date grid keeps its target at 360', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('booking-ladder'));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });

    await page.goto(`/book/${vacancy.publicSlug}`);
    await expect(page.getByTestId('calendar-control')).toBeVisible();
    await expect(page.getByTestId('slot-list-options')).toBeVisible();

    /** Two elements are side by side when they share a top edge and differ in `x`. */
    const sideBySide = (first: string, second: string) => () =>
      page.evaluate((ids: { first: string; second: string }) => {
        const one = document.querySelector(`[data-testid="${ids.first}"]`)!.getBoundingClientRect();
        const two = document.querySelector(`[data-testid="${ids.second}"]`)!.getBoundingClientRect();
        return Math.abs(one.top - two.top) < 2 && Math.abs(one.left - two.left) > 2;
      }, { first, second });

    /* `slot-list`, not `slot-list-options`: the options are below the Time panel's own date
       heading, so their top is never the calendar's even when the two panels are side by side.
       Both of these are the sole child of their Card's body, so their tops agree exactly when the
       Cards are on one row. */
    const panelsSplit = sideBySide('calendar-control', 'slot-list');
    const namesSplit = sideBySide('booking-first-name-input', 'booking-last-name-input');

    const slotCap = () =>
      page.getByTestId('slot-list-options').evaluate((el) => getComputedStyle(el).maxHeight);

    // — The picker's own fold. 880 is the one number in the system off the ladder, and the
    //   measurement that keeps it is in 02 design §Responsive.
    await page.setViewportSize({ width: 880, height: 900 });
    await expect.poll(panelsSplit, { message: 'Date beside Time at 880' }).toBe(true);
    await expect.poll(namesSplit, { message: 'the name row at 880' }).toBe(true);

    await page.setViewportSize({ width: 879, height: 900 });
    await expect.poll(panelsSplit, { message: 'Date above Time at 879' }).toBe(false);
    await expect.poll(namesSplit, { message: 'the name row survives the fold' }).toBe(true);

    // — `sm`, where the `599` used to be. The name row is the rule that moved.
    await page.setViewportSize({ width: 576, height: 900 });
    await expect.poll(namesSplit, { message: 'two name columns at 576' }).toBe(true);
    await expect.poll(slotCap, { message: 'the slot region is uncapped at 576' }).toBe('none');

    await page.setViewportSize({ width: 575, height: 900 });
    await expect.poll(namesSplit, { message: 'one name column at 575' }).toBe(false);
    // 60vh of 900. The region scrolls inside itself rather than growing the page.
    await expect.poll(slotCap, { message: 'the slot region caps at 575' }).toBe('540px');

    // — The narrowest supported width. Every cell, not the first: the first is the one the
    //   arithmetic that ignored the grid's own gutters happened to get right.
    await page.setViewportSize({ width: 360, height: 900 });
    const grid = () =>
      page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('[data-testid^="calendar-day-"]'));
        const boxes = cells.map((cell) => cell.getBoundingClientRect());
        return {
          cells: cells.length,
          minWidth: Math.floor(Math.min(...boxes.map((box) => box.width))),
          minHeight: Math.floor(Math.min(...boxes.map((box) => box.height))),
          over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
    // The width is what the phase moved — 35.9 before the grid was bled and its gutters
    // collapsed, 46.9 after — so it is the one polled, and its own value is what a failure prints.
    await expect
      .poll(async () => (await grid()).minWidth, { message: 'the narrowest day cell at 360' })
      .toBeGreaterThanOrEqual(44);

    const measured = await grid();
    expect(measured.minHeight, 'and every cell is at least that tall').toBeGreaterThanOrEqual(44);
    expect(measured.cells, 'a whole month of dates is on the page').toBeGreaterThan(27);
    expect(measured.over, 'the page does not scroll horizontally at 360').toBe(0);
  });
});
