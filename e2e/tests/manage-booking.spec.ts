import { expect, test, type Page } from '@playwright/test';
import {
  CV_FILE,
  REPLACEMENT_CV,
  bookInterview,
  columnCards,
  createVacancy,
  latestInviteLink,
  latestManageLink,
  registerOrganization,
  replaceCv,
  rescheduleBooking,
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
    await expect(page.getByRole('link', { name: /sign in|log in/i })).toHaveCount(0);

    // The page names nobody: the link is forwardable, so a live one withholds what the
    // blur withholds from a dead one (07 §04.21). A CV is acknowledged, never named.
    await expect(page.getByTestId('manage-cv-present')).toHaveText('CV attached');
    await expect(page.locator('body')).not.toContainText(candidate);
    await expect(page.locator('body')).not.toContainText(CV_FILE.name);
    await expect(page.locator('body')).not.toContainText('Jane');
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
    await expect(page.getByTestId('manage-booking-when')).toBeVisible();

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
    // Nothing has been done on this page yet, so there is no receipt for anything.
    await expect(page.getByTestId('manage-moved')).toHaveCount(0);

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

    // A move rewrites one line of a card the candidate was already looking at, so it is
    // the one action here that would otherwise leave no trace of itself (07 §05.27).
    await expect(page.getByTestId('manage-moved')).toHaveText(
      'Your interview has been moved. An updated calendar invite is on its way.',
    );

    const after = (await when.textContent())!;
    expect(after).toContain(
      new Date(startUtc).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      }),
    );

    // A reload reads it back off the record, not out of this visit's state — and the
    // notice does not survive it, being a receipt for an action rather than a state of
    // the record (07 §04.19).
    await page.reload();
    await expect(page.getByTestId('manage-booking-when')).toHaveText(after);
    await expect(page.getByTestId('manage-moved')).toHaveCount(0);

    // And the card carries the move, attributed to the candidate, in a history that was
    // one line until now.
    await signIn(page, org.email);
    await page.goto(invite.path);
    await expect(page.getByTestId(`application-time-${invite.applicationId}`)).toContainText(
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

  /**
   * The candidate replaces their own CV, from the page they already have (07 §07).
   *
   * Not gated behind rescheduling and not a precondition of it: nothing here moves the
   * interview, and the record beneath is the same one the candidate arrived on.
   */
  test('replaces the CV in place, naming no file at any point', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('manage-cv-owner'));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });
    const candidate = uniqueEmail('manage-cv-candidate');
    await bookInterview(request, vacancy.publicSlug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: candidate,
    });

    const manage = await latestManageLink(request);
    const invite = await latestInviteLink(request);
    await page.goto(manage.path);

    const when = page.getByTestId('manage-booking-when');
    const before = (await when.textContent())!;

    // A CV is acknowledged and never named — the link is forwardable, and the filename
    // is usually built from the candidate's own name (07 §04.21, §07.31).
    await expect(page.getByTestId('manage-cv-present')).toHaveText('CV attached');
    await expect(page.locator('body')).not.toContainText(CV_FILE.name);
    // The chooser is behind the affordance, not on screen from the start.
    await expect(page.getByTestId('manage-cv-replace-input')).toHaveCount(0);

    await page.getByTestId('manage-cv-replace-button').click();

    // The chooser expands in place and the row's Replace button hides while it is open:
    // the chooser is the control now (07 design, States).
    await expect(page.getByTestId('manage-cv-replace-input')).toBeAttached();
    await expect(page.getByTestId('manage-cv-replace-button')).toHaveCount(0);
    await expect(page.getByText('PDF, DOC, DOCX, RTF or TXT. Up to 10 MB.')).toBeVisible();

    // Choosing a file uploads immediately — there is no second Save, because a chosen
    // file with an unpressed button is a change the candidate believes they have made.
    await page.getByTestId('manage-cv-replace-input').setInputFiles(REPLACEMENT_CV);

    await expect(page.getByTestId('manage-cv-replace-button')).toBeVisible();
    await expect(page.getByTestId('manage-cv-present')).toHaveText('CV attached');
    await expect(page.getByTestId('manage-error-banner')).toHaveCount(0);
    // Still the interview it was: replacing a CV is not rescheduling one (07 §07.32).
    await expect(when).toHaveText(before);
    // The new name is no more on this page than the old one was.
    await expect(page.locator('body')).not.toContainText(REPLACEMENT_CV.name);

    await page.reload();
    await expect(page.getByTestId('manage-cv-present')).toHaveText('CV attached');
    await expect(page.locator('body')).not.toContainText(REPLACEMENT_CV.name);

    // The team's card names the current version, which is the one just uploaded, and
    // both of its actions point at the authenticated endpoint (04 §07.33).
    await signIn(page, org.email);
    await page.goto(invite.path);
    await expect(page.getByTestId('card-cv-name')).toContainText(REPLACEMENT_CV.name);
    await expect(page.getByTestId('card-cv-download')).toHaveAttribute(
      'href',
      `/api/organizations/${org.organizationId}/hiring/applications/${invite.applicationId}/cv`,
    );
  });

  /** TC-H07-E2E-04 */
  test('keeps the scheduling history team-only, and collapsed', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('manage-history-owner'));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });
    const candidate = uniqueEmail('manage-history-candidate');
    await bookInterview(request, vacancy.publicSlug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: candidate,
    });

    const manage = await latestManageLink(request);
    const invite = await latestInviteLink(request);

    // Two moves and one CV replacement, in that order, so the newest entry is the
    // replacement and the timeline has to interleave its two sources correctly.
    await rescheduleBooking(request, manage.slug, manage.token);
    await rescheduleBooking(request, manage.slug, manage.token);
    await replaceCv(request, manage.slug, manage.token);

    await signIn(page, org.email);
    await page.goto(invite.path);

    // One collapsed line, not four rows: a candidate who moved five times must not add
    // five permanent rows to a section that already needed collapsing (07 §11.54).
    const toggle = page.getByTestId(`application-history-toggle-${invite.applicationId}`);
    await expect(toggle).toContainText('Rescheduled 2 times');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId(`application-history-${invite.applicationId}`)).toHaveCount(0);
    // The summary counts moves. A CV replacement is on the list, not in the count.
    await expect(toggle).not.toContainText('CV replaced');

    await toggle.click();
    const history = page.getByTestId(`application-history-${invite.applicationId}`);
    await expect(history).toBeVisible();

    // Newest first: the replacement, both moves, then the original booking — one list
    // merged from two records (07 §11.52).
    const rows = history.getByRole('listitem');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText(`CV replaced · ${REPLACEMENT_CV.name}`);
    await expect(rows.nth(1)).toContainText('←');
    await expect(rows.nth(2)).toContainText('←');
    await expect(rows.nth(3)).toContainText('Booked');

    // Each attributed — and every one of these is the candidate's, because a member
    // cannot replace a CV from any surface (07 §07.37).
    for (const index of [0, 1, 2, 3]) {
      await expect(rows.nth(index)).toContainText('Jane Doe');
    }

    // And none of it on the candidate's own page. They already know what they did, and a
    // tally of their own reschedules reads as a reprimand (07 §11.53).
    await page.goto(manage.path);
    await expect(page.getByTestId('manage-booking-when')).toBeVisible();
    await expect(page.getByText(/scheduling history/i)).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('CV replaced');
    await expect(page.locator('body')).not.toContainText('Rescheduled');
    await expect(page.locator('body')).not.toContainText(REPLACEMENT_CV.name);
    await expect(page.locator('body')).not.toContainText(CV_FILE.name);
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
