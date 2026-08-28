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

    const confirmation = page.getByTestId('booking-confirmation');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('Senior React Engineer');
    await expect(confirmation).toContainText('60 minutes');
    await expect(page.getByTestId('booking-confirmation-zone')).toHaveText('UTC');
    await expect(page.getByTestId('booking-confirmation-email')).toContainText('jane@example.com');

    const when = await page.getByTestId('booking-confirmation-when').textContent();
    expect(when).toContain(
      new Date(startUtc).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC',
      }),
    );

    // The form is gone, replaced by the confirmation.
    await expect(submit).toHaveCount(0);

    /*
     * The manage link, which supersedes this test's earlier assertion that there was
     * none: 07 gives the candidate a way to fix a mistyped choice before they close the
     * tab, and 02 §10.43 puts a copy of it here. This copy is deliberately lost on
     * refresh — the durable one travels in the calendar invite.
     */
    const manageLink = page.getByTestId('booking-confirmation-manage-link');
    await expect(manageLink).toBeVisible();
    expect(await manageLink.getAttribute('href')).toMatch(
      new RegExp(`^/manage/${vacancy.publicSlug}/[A-Za-z0-9_-]{22}$`),
    );

    // Following it opens the live page for this booking, still with no session.
    await manageLink.click();
    await expect(page.getByTestId('manage-booking-email')).toContainText('jane@example.com');
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
    await expect(page.getByTestId('booking-confirmation')).toBeVisible();

    await page.goto(`/book/${vacancy.publicSlug}`);
    await expect(firstSlot(page)).toBeVisible();
    await fill();

    // A statement about the booking, not about the email field — so it lands in the
    // banner, and it names the interview they already have.
    const banner = page.getByTestId('booking-error-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('You already have an interview for this position on');
    await expect(page.getByTestId('field-error-email')).toHaveCount(0);
    await expect(page.getByTestId('booking-confirmation')).toHaveCount(0);
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
});
