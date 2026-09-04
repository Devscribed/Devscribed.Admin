import { expect, test, type Page } from '@playwright/test';
import {
  addMember,
  bookInterview,
  createVacancy,
  createVacancyFor,
  latestInviteLink,
  latestManageLink,
  registerOrganization,
  signIn,
  uniqueEmail,
} from './helpers';

/** The dates the grid inside the dialog is offering, in the order they appear. */
async function availableDates(page: Page): Promise<string[]> {
  const cells = page.locator('[data-testid^="calendar-day-"]:not([disabled])');
  await expect(cells.first()).toBeVisible();
  return (
    await cells.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-date')))
  ).filter((date): date is string => date !== null);
}

/** `14:00` in UTC — what every assertion below compares a rendered time against. */
const asTime = (startUtc: string): string =>
  new Date(startUtc).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

/**
 * The team's half of manage booking (spec 07 §08–§10), through the browser.
 *
 * Two callers reach the same two actions on the same surface, and this suite covers one
 * path through each: an interviewer moving an interview on a candidate they reached
 * through **`Candidates → Assigned to me`**, which for a `user` who interviews is the
 * whole of hiring; and an `admin` cancelling from the same card, with the reason that
 * rides into the candidate's cancellation notice and onto no candidate-facing screen.
 *
 * What both are really asserting is that neither action navigates. The card is the page
 * somebody is working on during a live call — a reload in the middle of either loses what
 * they were doing.
 *
 * The interviewer's path used to start on My interviews, which is now the candidate
 * list's `Assigned to me` scope, so this walks it from the list to the card. The **row**
 * gets these two actions back in the phase that gives the table its kebab; until then the
 * card is where an interview is moved, and it is the surface that must not reload.
 *
 * The browser is pinned to UTC so the assertions can name times.
 */
test.use({ timezoneId: 'UTC' });

test.describe('Hiring — the team reschedules and cancels', () => {
  /** TC-H07-E2E-03 */
  test('an interviewer moves an interview from their own candidate, without reloading', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('team-move-owner'));
    const interviewer = await addMember(request, {
      email: uniqueEmail('team-move-interviewer'),
      role: 'user',
      firstName: 'Ivy',
      lastName: 'Interviewer',
    });
    const vacancy = await createVacancyFor(request, org, interviewer.accountId, {
      title: 'Node Engineer',
    });
    await bookInterview(request, vacancy.publicSlug, {
      firstName: 'Ann',
      lastName: 'Lee',
      email: uniqueEmail('team-move-candidate'),
    });
    const invite = await latestInviteLink(request);

    await signIn(page, interviewer.email);

    // The interviewer's own list — the scope their old screen became — and the row that
    // opens the one candidate they may see.
    await page.goto(`/org/${org.orgId}/hiring/candidates?scope=mine`);
    await expect(page.getByTestId('candidates-list')).toBeVisible();
    await page.getByTestId('candidates-list').getByRole('link').first().click();
    await page.waitForURL('**/hiring/candidates/**');

    const row = page.getByTestId(`application-section-${invite.applicationId}`);
    await expect(row).toBeVisible();
    const before = (await row.textContent())!;

    // Marked so a full navigation can be told from a client-side update. If the page
    // reloads, this is gone — which is exactly what must not happen.
    await page.evaluate(() => {
      (window as unknown as { __noReload: boolean }).__noReload = true;
    });

    // Both interview actions live in the header's kebab now (04 design §Layout).
    await page.getByTestId(`application-actions-${invite.applicationId}`).click();
    await page.getByTestId(`application-reschedule-${invite.applicationId}`).click();

    const dialog = page.getByTestId(`application-reschedule-dialog-${invite.applicationId}`);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    // The current time is stated, never pre-selected: pressing the time they came to
    // change would make the member's first click a deselection (07 design).
    await expect(page.getByTestId(`application-current-time-${invite.applicationId}`)).toContainText(
      'Currently',
    );
    await expect(dialog.locator('[data-testid^="slot-option-"][aria-pressed="true"]')).toHaveCount(
      0,
    );

    const submit = page.getByTestId(`application-reschedule-submit-${invite.applicationId}`);
    await expect(submit).toBeDisabled();

    // Another day, so the assertion is about a real change — the interview's own slot is
    // offered back, its own event not blocking its own move.
    const dates = await availableDates(page);
    await page.getByTestId(`calendar-day-${dates[1] ?? dates[0]}`).click();

    const slot = dialog.locator('[data-testid^="slot-option-"]').first();
    await expect(slot).toBeVisible();
    const startUtc = (await slot.getAttribute('data-testid'))!.replace('slot-option-', '');
    await slot.click();

    await expect(submit).toBeEnabled();
    await submit.click();

    // The dialog closes, the section states the new time, and a toast reports it.
    await expect(dialog).toBeHidden();
    await expect(row).toContainText(asTime(startUtc));
    expect(await row.textContent()).not.toBe(before);
    await expect(page.getByTestId('toast-interview-rescheduled')).toContainText(
      'Interview moved to',
    );

    // No reload: the section was replaced from what the server answered with, because
    // this is the page somebody is working on during a live call.
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload))
      .toBe(true);

    // And the history attributes the move to that member by name (07 §11.55).
    const toggle = page.getByTestId(`application-history-toggle-${invite.applicationId}`);
    await expect(toggle).toContainText('Rescheduled once');
    await toggle.click();

    const history = page.getByTestId(`application-history-${invite.applicationId}`);
    const latest = history.getByRole('listitem').first();
    await expect(latest).toContainText('←');
    await expect(latest).toContainText('Ivy Interviewer');
  });

  test('an admin cancels from the card, with a reason the candidate never sees', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('team-cancel-owner'));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });
    await bookInterview(request, vacancy.publicSlug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: uniqueEmail('team-cancel-candidate'),
    });
    const invite = await latestInviteLink(request);
    const manage = await latestManageLink(request);

    await signIn(page, org.email);
    await page.goto(invite.path);

    const section = page.getByTestId(`application-section-${invite.applicationId}`);
    await expect(section).toBeVisible();
    // Notes taken during the interview. Cancelling must not close the section over them.
    const notes = page.getByTestId('card-notes-input');
    await notes.fill('Strong on React.');

    await page.getByTestId(`application-actions-${invite.applicationId}`).click();
    await page.getByTestId(`application-cancel-${invite.applicationId}`).click();

    const dialog = page.getByTestId(`application-cancel-dialog-${invite.applicationId}`);
    await expect(dialog).toBeVisible();
    // The destructive action is never what `Enter` reaches on arrival — this is the one
    // dialog in the product where getting it wrong cannot be undone.
    await expect(page.getByTestId(`application-cancel-dismiss-${invite.applicationId}`)).toBeFocused();
    // It names the candidate as well as the interview, so nobody confirms a pronoun.
    await expect(dialog).toContainText('Jane Doe');

    // Escape closes it with nothing written.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId(`application-cancelled-${invite.applicationId}`)).toHaveCount(0);

    await page.getByTestId(`application-actions-${invite.applicationId}`).click();
    await page.getByTestId(`application-cancel-${invite.applicationId}`).click();
    await page
      .getByTestId(`application-cancel-reason-${invite.applicationId}`)
      .fill('Role filled internally.');
    await page.getByTestId(`application-cancel-confirm-${invite.applicationId}`).click();

    // The section is marked, not collapsed and not navigated away from, and the notes
    // are still on screen exactly as they were typed.
    await expect(dialog).toBeHidden();
    const badge = page.getByTestId(`application-cancelled-${invite.applicationId}`);
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Cancelled by Pat');
    await expect(badge).toHaveAttribute('aria-label', /Role filled internally\./);
    await expect(notes).toHaveValue('Strong on React.');
    await expect(page.getByTestId('toast-interview-cancelled')).toHaveText('Interview cancelled');
    expect(page.url()).toContain(invite.path);

    // Both actions are gone from a cancelled interview — absent, not disabled — and with
    // nothing left in it the kebab that held them is gone too.
    await expect(page.getByTestId(`application-actions-${invite.applicationId}`)).toHaveCount(0);
    await expect(page.getByTestId(`application-cancel-${invite.applicationId}`)).toHaveCount(0);
    await expect(page.getByTestId(`application-reschedule-${invite.applicationId}`)).toHaveCount(0);

    // The reason is on the card, with the member who gave it.
    await page.getByTestId(`application-history-toggle-${invite.applicationId}`).click();
    const history = page.getByTestId(`application-history-${invite.applicationId}`);
    await expect(history).toContainText('Role filled internally.');
    await expect(history).toContainText('Pat');

    // And on no candidate-facing surface. The candidate's own page blurs, as it does for
    // every non-live cause, and says nothing about who called it off or why.
    const candidateView = await page.context().newPage();
    await candidateView.goto(manage.path);
    await expect(candidateView.getByTestId('manage-not-found')).toBeVisible();
    await expect(candidateView.locator('body')).not.toContainText('Role filled internally.');
    await expect(candidateView.locator('body')).not.toContainText('Pat');
    await candidateView.close();
  });

  test('refuses a reason longer than the limit before anything is written', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('team-reason-owner'));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });
    await bookInterview(request, vacancy.publicSlug, {
      email: uniqueEmail('team-reason-candidate'),
    });
    const invite = await latestInviteLink(request);

    await signIn(page, org.email);
    await page.goto(invite.path);
    await page.getByTestId(`application-actions-${invite.applicationId}`).click();
    await page.getByTestId(`application-cancel-${invite.applicationId}`).click();

    const confirm = page.getByTestId(`application-cancel-confirm-${invite.applicationId}`);
    await expect(confirm).toBeEnabled();

    // Checked as it is typed, not at the moment of confirming: a correction is expensive
    // exactly there.
    await page
      .getByTestId(`application-cancel-reason-${invite.applicationId}`)
      .fill('r'.repeat(501));
    await expect(page.getByText('Please keep this under 500 characters')).toBeVisible();
    await expect(confirm).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId(`application-cancelled-${invite.applicationId}`)).toHaveCount(0);
  });
});
