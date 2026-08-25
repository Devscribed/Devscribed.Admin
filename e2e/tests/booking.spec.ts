import { expect, test } from '@playwright/test';
import { CV_FILE, createVacancy, registerOrganization, uniqueEmail } from './helpers';

/**
 * TC-H02-E2E-01 — a candidate books an interview end to end.
 *
 * The calendar grid, the time-zone selector and the format toggle belong to the phase
 * that replaces the fake calendar with a real one; this asserts the flat list of start
 * times the tracer bullet ships.
 */
test.describe('Booking page', () => {
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

    // Nothing is pre-selected, so the action is unavailable until a time is chosen.
    const submit = page.getByTestId('booking-submit-button');
    await expect(submit).toBeDisabled();

    const slot = page.locator('[data-testid^="slot-option-"]').first();
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

    // No manage, reschedule or cancel affordance anywhere — there is none to offer.
    await expect(page.getByText(/reschedule|cancel booking/i)).toHaveCount(0);
    await expect(submit).toHaveCount(0);
  });

  test('rejects an unsupported CV before the form can be submitted', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('booking-cv'));
    const vacancy = await createVacancy(request, org);

    await page.goto(`/book/${vacancy.publicSlug}`);
    await page.locator('[data-testid^="slot-option-"]').first().click();
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
