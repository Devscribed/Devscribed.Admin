import { expect, test } from '@playwright/test';
import {
  CV_FILE,
  bookInterview,
  columnCards,
  createVacancy,
  latestManageLink,
  registerOrganization,
  setApplicationStatus,
  uniqueEmail,
} from './helpers';

/**
 * The candidate's own page for a booking they already made (spec 07), through the
 * browser and with no session at any point.
 *
 * The browser is pinned to UTC so the assertions can name times.
 */
test.use({ timezoneId: 'UTC' });

test.describe('Manage booking', () => {
  /** TC-H07-E2E-02 */
  test('cancels an interview, then books again', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('manage-owner'));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });
    const candidate = uniqueEmail('manage-candidate');
    await bookInterview(request, vacancy.publicSlug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: candidate,
    });

    const manage = await latestManageLink(request);
    expect(manage.slug).toBe(vacancy.publicSlug);

    // The hiring manager has already formed a view and dragged the card. Cancelling
    // must not disturb that (07 §01.3).
    const [scheduled] = await columnCards(request, org, vacancy.id, 'scheduled');
    await setApplicationStatus(request, org, scheduled.applicationId, 'maybe');

    await page.goto(manage.path);

    // No session, and nothing that invites one.
    await expect(page.getByTestId('manage-page')).toBeVisible();
    await expect(page.getByTestId('manage-vacancy-title')).toHaveText('Senior React Engineer');
    await expect(page.getByTestId('manage-duration')).toHaveText('60 minutes');
    await expect(page.getByTestId('manage-org-wordmark')).toContainText('Acme Inc');
    await expect(page.getByTestId('manage-booking-email')).toContainText(candidate);
    await expect(page.getByTestId('manage-cv-filename')).toHaveText(CV_FILE.name);
    await expect(page.getByRole('link', { name: /sign in|log in/i })).toHaveCount(0);
    // Team-only, and on no candidate-facing surface (07 §11.53).
    await expect(page.getByText(/scheduling history/i)).toHaveCount(0);

    // Cancelling is destructive and irreversible, so it is confirmed — and the dialog
    // opens on the dismissive control, never on the button that cannot be undone.
    await page.getByTestId('manage-cancel-button').click();
    const dialog = page.getByTestId('manage-cancel-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByTestId('manage-cancel-dismiss')).toBeFocused();

    // Escape leaves the booking exactly where it was.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('manage-booking-when')).toBeVisible();

    await page.getByTestId('manage-cancel-button').click();
    await page.getByTestId('manage-cancel-confirm').click();

    await expect(page.getByTestId('manage-cancelled')).toContainText(
      'Your interview has been cancelled.',
    );
    await expect(page.getByTestId('manage-new-booking-button')).toBeVisible();

    // The confirmation is a receipt for an action, not a state of the record (07 §04.19).
    await page.reload();
    await expect(page.getByTestId('manage-not-found')).toContainText(
      "We couldn't find your booking.",
    );
    await expect(page.getByTestId('manage-cancelled')).toHaveCount(0);
    // Still branded, and still leading somewhere: the slug resolves even though the
    // token no longer does (07 §04.20).
    await expect(page.getByTestId('manage-org-wordmark')).toContainText('Acme Inc');
    await expect(page.getByTestId('manage-vacancy-title')).toHaveText('Senior React Engineer');

    await page.getByTestId('manage-new-booking-button').click();
    await expect(page).toHaveURL(new RegExp(`/book/${vacancy.publicSlug}$`));

    const slot = page.locator('[data-testid^="slot-option-"]').first();
    await expect(slot).toBeVisible();
    await slot.click();
    await page.getByTestId('booking-first-name-input').fill('Jane');
    await page.getByTestId('booking-last-name-input').fill('Doe');
    await page.getByTestId('booking-email-input').fill(candidate);
    await page.getByTestId('booking-cv-input').setInputFiles(CV_FILE);
    await page.getByTestId('booking-submit-button').click();

    // No `already_booked`: a cancelled candidate is still a live applicant (07 §01.2).
    await expect(page.getByTestId('booking-confirmation')).toBeVisible();

    // The cancelled card kept the column the manager put it in; the rebooking is a new
    // card at the top of Scheduled, because it is fresh intent (07 §02.9).
    const maybe = await columnCards(request, org, vacancy.id, 'maybe');
    expect(maybe).toHaveLength(1);
    expect(maybe[0]).toMatchObject({ applicationId: scheduled.applicationId, isCancelled: true });

    const rescheduled = await columnCards(request, org, vacancy.id, 'scheduled');
    expect(rescheduled).toHaveLength(1);
    expect(rescheduled[0].applicationId).not.toBe(scheduled.applicationId);
    expect(rescheduled[0].isCancelled).toBe(false);
  });

  /** The blurred state, from a link that never named anything. */
  test('tells an unknown token nothing about the booking it is not', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('manage-blur'));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });

    await page.goto(`/manage/${vacancy.publicSlug}/AAAAAAAAAAAAAAAAAAAAAA`);

    await expect(page.getByTestId('manage-not-found')).toContainText(
      "We couldn't find your booking.",
    );
    await expect(page.getByTestId('manage-vacancy-title')).toHaveText('Senior React Engineer');
    await expect(page.getByTestId('manage-new-booking-button')).toBeVisible();
    // Nothing at all about a booking, because there may not be one to describe.
    await expect(page.getByTestId('manage-booking-when')).toHaveCount(0);
    await expect(page.getByTestId('manage-cancel-button')).toHaveCount(0);
  });
});
