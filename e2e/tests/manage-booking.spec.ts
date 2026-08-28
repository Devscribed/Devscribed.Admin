import { expect, test, type Page } from '@playwright/test';
import {
  CV_FILE,
  bookInterview,
  columnCards,
  createVacancy,
  latestInviteLink,
  latestManageLink,
  registerOrganization,
  setApplicationStatus,
  signIn,
  uniqueEmail,
} from './helpers';

/** The dates the grid is offering, in the order they appear. */
async function availableDates(page: Page): Promise<string[]> {
  const cells = page.locator('[data-testid^="calendar-day-"]:not([disabled])');
  await expect(cells.first()).toBeVisible();
  return (
    await cells.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-date')))
  ).filter((date): date is string => date !== null);
}

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
    // The rebooking lands on its own manage page, under a token that is not the
    // cancelled one — a new application, not a restoration of the old (07 §02.9).
    await page.waitForURL(new RegExp(`/manage/${vacancy.publicSlug}/[A-Za-z0-9_-]{22}$`));
    expect(page.url()).not.toContain(manage.token);
    await expect(page.getByTestId('manage-booking-email')).toContainText(candidate);

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

  /** TC-H07-E2E-01 */
  test('moves an interview, and the card says who moved it', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('manage-move-owner'));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });
    const candidate = uniqueEmail('manage-move-candidate');
    await bookInterview(request, vacancy.publicSlug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: candidate,
    });

    const manage = await latestManageLink(request);
    const invite = await latestInviteLink(request);

    await page.goto(manage.path);
    const before = (await page.getByTestId('manage-booking-when').textContent())!;

    await page.getByTestId('manage-reschedule-button').click();

    // The current time is stated, and never rendered as a selected date or slot:
    // pre-selecting it would make the candidate's first click a deselection.
    await expect(page.getByTestId('manage-current-time')).toHaveText(`Currently ${before}`);
    await expect(page.getByTestId('manage-booking-when')).toHaveCount(0);
    await expect(page.locator('[data-testid^="slot-option-"][aria-pressed="true"]')).toHaveCount(0);

    // The one primary action in this spec, disabled until a slot is chosen.
    const submit = page.getByTestId('manage-reschedule-submit');
    await expect(submit).toBeDisabled();

    // Keep current time restores the record with nothing altered.
    await page.getByTestId('manage-reschedule-cancel').click();
    await expect(page.getByTestId('manage-booking-when')).toHaveText(before);

    await page.getByTestId('manage-reschedule-button').click();

    // Another date, and a time on it. The interview's own slot is offered back — its own
    // event does not block its own move — so the test takes a different day to be sure
    // the assertion is about a real change.
    const dates = await availableDates(page);
    const another = dates[1] ?? dates[0];
    await page.getByTestId(`calendar-day-${another}`).click();

    const slot = page.locator('[data-testid^="slot-option-"]').first();
    await expect(slot).toBeVisible();
    const startUtc = (await slot.getAttribute('data-testid'))!.replace('slot-option-', '');
    await slot.click();
    await expect(slot).toHaveAttribute('aria-pressed', 'true');

    await expect(submit).toBeEnabled();
    await submit.click();

    // Back to the live state naming the new time. The old one is not shown.
    const when = page.getByTestId('manage-booking-when');
    await expect(when).toBeVisible();
    await expect(when).not.toHaveText(before);
    await expect(page.getByTestId('manage-booking-zone')).toContainText('UTC');
    await expect(page.getByTestId('manage-current-time')).toHaveCount(0);

    const after = (await when.textContent())!;
    expect(after).toContain(
      new Date(startUtc).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      }),
    );

    // A reload reads it back off the record, not out of this visit's state.
    await page.reload();
    await expect(page.getByTestId('manage-booking-when')).toHaveText(after);

    // And the card carries the move, attributed to the candidate, in a history that was
    // one line until now.
    await signIn(page, org.email);
    await page.goto(invite.path);
    await expect(page.getByTestId(`application-when-${invite.applicationId}`)).toContainText(
      new Date(startUtc).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      }),
    );

    const toggle = page.getByTestId(`application-history-toggle-${invite.applicationId}`);
    await expect(toggle).toContainText('Rescheduled once');
    await toggle.click();

    const history = page.getByTestId(`application-history-${invite.applicationId}`);
    await expect(history).toBeVisible();
    // New ← old, by the candidate. "The team moved this" would read the same way, with
    // the member's name (07 §11.55).
    await expect(history.getByRole('listitem').first()).toContainText('←');
    await expect(history.getByRole('listitem').first()).toContainText('Jane Doe');
    await expect(history).toContainText('Booked');
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
