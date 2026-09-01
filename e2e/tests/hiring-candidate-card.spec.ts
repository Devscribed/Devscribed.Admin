import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  CV_FILE,
  addMember,
  bookInterview,
  createCriterion,
  createVacancy,
  createVacancyFor,
  latestInviteLink,
  registerOrganization,
  signIn,
  uniqueEmail,
  type InviteLink,
  type Registered,
} from './helpers';

/**
 * The candidate card — the page the team works on during an interview.
 *
 * Every test arrives the way the product actually sends someone here: through the deep
 * link in the calendar invite. Nothing else reaches a candidate card until the candidate
 * database lands.
 */
test.describe('Candidate card', () => {
  // The copy affordance beside the email writes to the real clipboard, which is where the
  // assertion has to look — the same grant the vacancy's booking link needs (04 §02.12).
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  /** An organization with one vacancy and one booked interview, plus its invite link. */
  async function seed(
    request: APIRequestContext,
    prefix: string,
  ): Promise<{ org: Registered; invite: InviteLink }> {
    const org = await registerOrganization(request, uniqueEmail(prefix));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });
    await bookInterview(request, vacancy.publicSlug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: uniqueEmail('candidate'),
    });
    return { org, invite: await latestInviteLink(request) };
  }

  /** TC-H04-E2E-01 — notes autosave, then survive a reload. */
  test('autosaves interview notes and keeps them across a reload', async ({ page, request }) => {
    const { org, invite } = await seed(request, 'card-autosave');
    await signIn(page, org.email);
    await page.goto(invite.path);

    const notes = page.getByTestId('card-notes-input');
    const indicator = page.getByTestId('card-notes-saved-at');
    await expect(notes).toBeVisible();
    // Reserved space, so the indicator appearing later never nudges the field.
    await expect(indicator).toHaveText('');

    const before = await notes.boundingBox();

    await notes.fill('Strong on hooks. Walked through a real migration.');
    // Nothing is written while someone is still typing.
    await expect(indicator).toHaveText('');

    // No Save pressed — the autosave fires on its own two seconds after the last key.
    await expect(indicator).toHaveText(/^Saved/, { timeout: 10_000 });

    // The indicator's row reserves its height, so the field someone is typing into does
    // not move when a save reports itself.
    expect(await notes.boundingBox()).toEqual(before);
    // A routine autosave is not announced: it would speak over the interview.
    await expect(page.getByTestId('card-notes-announcer')).toHaveText('');

    await page.reload();
    await expect(page.getByTestId('card-notes-input')).toHaveValue(
      'Strong on hooks. Walked through a real migration.',
    );
  });

  test('announces an explicit save, and writes nothing when there is nothing to write', async ({
    page,
    request,
  }) => {
    const { org, invite } = await seed(request, 'card-explicit');
    await signIn(page, org.email);
    await page.goto(invite.path);

    const conclusion = page.getByTestId('card-conclusion-input');
    await conclusion.fill('Offer.');
    await page.getByTestId('card-conclusion-save').click();

    await expect(page.getByTestId('card-conclusion-saved-at')).toHaveText(/^Saved/);
    // Explicit saves do announce — a member who pressed the button asked to be told.
    await expect(page.getByTestId('card-conclusion-announcer')).toHaveText(/^Saved at \d\d:\d\d$/);
  });

  /** TC-H04-E2E-03 — the deep link opens the right application. */
  test('expands the application the deep link names, not the most recent', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('card-deep-link'));
    const react = await createVacancy(request, org, { title: 'Senior React Engineer' });
    const dotnet = await createVacancy(request, org, { title: 'DotNet Engineer' });
    const candidate = uniqueEmail('candidate');

    // The same person, two vacancies: one candidate, two applications.
    await bookInterview(request, react.publicSlug, { email: candidate, slotIndex: 0 });
    const older = await latestInviteLink(request);
    await bookInterview(request, dotnet.publicSlug, { email: candidate, slotIndex: 1 });
    const newer = await latestInviteLink(request);

    expect(newer.candidateId).toBe(older.candidateId);

    await signIn(page, org.email);
    await page.goto(older.path);

    const olderSection = page.getByTestId(`application-section-${older.applicationId}`);
    const newerSection = page.getByTestId(`application-section-${newer.applicationId}`);

    // The named one is open, whichever is the most recent.
    await expect(olderSection.getByTestId(`application-toggle-${older.applicationId}`)).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(newerSection.getByTestId(`application-toggle-${newer.applicationId}`)).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(olderSection.getByTestId('card-notes-input')).toBeVisible();
    await expect(newerSection.getByTestId('card-notes-input')).toHaveCount(0);
  });

  /** TC-H04-E2E-04 — a failed save keeps the text and offers a retry. */
  test('keeps the typed text when a save fails, and saves it on retry', async ({
    page,
    request,
  }) => {
    const { org, invite } = await seed(request, 'card-failed-save');
    await signIn(page, org.email);
    await page.goto(invite.path);

    // Only the write fails; the read that opened the page has already happened.
    await page.route(`**/api/organizations/*/hiring/applications/${invite.applicationId}`, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );

    const conclusion = page.getByTestId('card-conclusion-input');
    await conclusion.fill('Did not pass — shaky on state management.');
    await conclusion.focus();

    await expect(page.getByTestId('card-save-error')).toBeVisible({ timeout: 10_000 });
    // The text is still there, and so is the cursor.
    await expect(conclusion).toHaveValue('Did not pass — shaky on state management.');
    await expect(conclusion).toBeFocused();
    // A failing endpoint is not retried every two seconds for the length of an interview.
    await expect(page.getByTestId('card-conclusion-saved-at')).toHaveText('');

    await page.unroute(`**/api/organizations/*/hiring/applications/${invite.applicationId}`);
    await page.getByTestId('card-save-retry').click();

    await expect(page.getByTestId('card-conclusion-saved-at')).toHaveText(/^Saved/);
    await expect(page.getByTestId('card-save-error')).toHaveCount(0);
  });

  /** TC-H04-E2E-05 — the CV downloads through the authenticated endpoint. */
  test('serves the CV by its original name through the API, never a storage URL', async ({
    page,
    request,
  }) => {
    const { org, invite } = await seed(request, 'card-cv');
    await signIn(page, org.email);
    await page.goto(invite.path);

    await expect(page.getByTestId('card-cv-name')).toContainText(CV_FILE.name);

    const download = page.getByTestId('card-cv-download');
    await expect(download).toHaveAttribute(
      'href',
      `/api/organizations/${invite.organizationId}/hiring/applications/${invite.applicationId}/cv`,
    );

    const started = page.waitForEvent('download');
    await download.click();
    const file = await started;

    expect(file.suggestedFilename()).toBe(CV_FILE.name);
    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).equals(CV_FILE.buffer)).toBe(true);
  });

  test('moves the application on a status change and prompts for a conclusion', async ({
    page,
    request,
  }) => {
    const { org, invite } = await seed(request, 'card-status');
    await signIn(page, org.email);
    await page.goto(invite.path);

    await page.getByTestId(`application-status-select-${invite.applicationId}`).click();
    await page
      .getByTestId(`application-status-option-${invite.applicationId}-didnt_pass`)
      .click();

    await expect(page.getByTestId('card-status-toast')).toHaveText("Moved to Didn't pass");
    // Prompted, never required — the field takes focus and nothing is blocked.
    await expect(page.getByTestId('card-conclusion-input')).toBeFocused();

    // The member stays on the card, and the change survives a reload.
    await page.reload();
    await expect(
      page.getByTestId(`application-status-select-${invite.applicationId}`),
    ).toContainText("Didn't pass");
  });

  test('routes a signed-out deep link through sign-in and back to the candidate', async ({
    page,
    request,
  }) => {
    const { org, invite } = await seed(request, 'card-signed-out');

    await page.goto(invite.path);
    await page.waitForURL('**/login**');

    await page.getByTestId('login-email-input').fill(org.email);
    await page.getByTestId('login-password-input').fill('Passw0rd');
    await page.getByTestId('login-submit-button').click();

    await page.waitForURL(`**${invite.path}`);
    await expect(page.getByTestId('candidate-card')).toBeVisible();
  });

  test('shows the not-found state for a candidate that does not exist', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('card-missing'));
    await signIn(page, org.email);

    await page.goto(
      `/org/${org.organizationId}/hiring/candidates/00000000-0000-4000-8000-000000000000`,
    );

    await expect(page.getByTestId('candidate-card')).toHaveCount(0);
    // The same sentence a candidate this caller may not see would get: which of the two
    // it is, is exactly what the page must not reveal.
    await expect(page.getByTestId('candidate-not-found')).toHaveText(
      "We couldn't find that candidate.",
    );
  });

  /** TC-H04-E2E-02 — add a criterion through the autocomplete and set a value. */
  test('assesses an existing criterion, and keeps it across a reload', async ({
    page,
    request,
  }) => {
    const { org, invite } = await seed(request, 'card-criteria');
    const english = await createCriterion(request, org, {
      name: 'English',
      values: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    });
    await signIn(page, org.email);
    await page.goto(invite.path);

    await expect(page.getByTestId('card-criteria-empty')).toHaveText('No criteria recorded yet.');

    await page.getByTestId('card-criteria-add').click();
    await page.getByTestId('card-criteria-autocomplete').fill('English');
    // The existing criterion, not an offer to create a second one.
    await expect(page.getByTestId('card-criteria-create-option')).toBeHidden();
    await page.getByTestId(`card-criteria-option-${english.id}`).click();

    // The chip appears before it has a value, because the value is what writes the row.
    const value = page.getByTestId(`card-criterion-value-${english.id}`);
    await expect(page.getByTestId(`card-criterion-${english.id}`)).toContainText('English');
    // A select over the scale's own ordered values, named by its criterion.
    await expect(value).toHaveAccessibleName('English');
    await value.click();
    await page.getByTestId(`card-criterion-option-${english.values[3].id}`).click();
    await expect(value).toContainText('B2');

    // Saved on change — there is no separate save for a criterion (04 §05.27).
    await page.reload();
    await expect(page.getByTestId(`card-criterion-value-${english.id}`)).toContainText('B2');

    // Choosing it again edits what is there rather than adding a second chip.
    await page.getByTestId('card-criteria-add').click();
    await page.getByTestId('card-criteria-autocomplete').fill('English');
    await page.getByTestId(`card-criteria-option-${english.id}`).click();
    await expect(page.getByTestId('card-criteria-note')).toHaveText(
      'Already assessed — edit the existing value',
    );
    await expect(page.getByTestId(`card-criterion-${english.id}`)).toHaveCount(1);

    // Removing it takes the assessment and nothing else.
    await page.getByTestId(`card-criterion-remove-${english.id}`).click();
    await expect(page.getByTestId('card-criteria-empty')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('card-criteria-empty')).toBeVisible();
  });

  /**
   * TC-H04-E2E-06 — the header's kebab deletes the person the card is about.
   *
   * The card cannot report its own outcome: it 404s the instant the flag is set. So the
   * confirmation is raised by the list it lands on, and the case that matters is the two
   * halves arriving as one thing — the member presses Delete here and reads
   * `Jane Doe deleted` there.
   */
  test('deletes the candidate from the card and confirms it on the list', async ({
    page,
    request,
  }) => {
    const { org, invite } = await seed(request, 'card-delete');
    await signIn(page, org.email);
    await page.goto(invite.path);

    await expect(page.getByTestId('candidate-card')).toBeVisible();
    await page.getByTestId('candidate-actions').click();
    await page.getByTestId('candidate-action-delete').click();

    const dialog = page.getByTestId('candidate-delete-dialog');
    await expect(dialog).toContainText('Delete Jane Doe?');
    // One booking, nothing assessed on it — and still no claim that this is permanent.
    await expect(dialog).toContainText('1 application and 0 assessments');
    await expect(dialog).not.toContainText('cannot be undone');

    await page.getByTestId('candidate-delete-confirm').click();

    await page.waitForURL('**/hiring/candidates');
    await expect(page.getByTestId('toast-candidate-deleted')).toHaveText('Jane Doe deleted');
    await expect(page.getByTestId('candidates-empty-state')).toBeVisible();

    // Read once: the confirmation belongs to the delete, not to the list.
    await page.reload();
    await expect(page.getByTestId('toast-candidate-deleted')).toHaveCount(0);
  });

  /**
   * The other half of the permission: an assigned interviewer works this card all day and
   * has no menu on it at all. An assignment is authority over an interview, never over
   * somebody's record (03 §11.60).
   */
  test('draws no actions menu for an assigned interviewer', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('card-del-scope'));
    const ines = await addMember(request, {
      email: uniqueEmail('ines'),
      role: 'user',
      firstName: 'Ines',
      lastName: 'Interviewer',
    });
    const vacancy = await createVacancyFor(request, org, ines.accountId, {
      title: 'Node Engineer',
    });
    await bookInterview(request, vacancy.publicSlug, {
      firstName: 'Tom',
      lastName: 'Fisher',
      email: uniqueEmail('tom'),
    });
    const invite = await latestInviteLink(request);

    await signIn(page, ines.email);
    await page.goto(invite.path);

    await expect(page.getByTestId('candidate-card')).toBeVisible();
    await expect(page.getByTestId('candidate-name')).toHaveText('Tom Fisher');
    await expect(page.getByTestId('candidate-actions')).toHaveCount(0);
  });

  /**
   * TC-H04-E2E-08 — the back link returns to the list as it stood, not to a fresh one.
   *
   * The whole point of §01.8 is the second half of that sentence. A link that landed on
   * `/hiring/candidates` would pass a naive reading and still throw away the scope, the
   * filter and the search the member set before opening the card — which is the state the
   * back link exists to protect.
   */
  test('goes back to the filtered list that opened the card', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('card-back-list'));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });
    await bookInterview(request, vacancy.publicSlug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: uniqueEmail('jane'),
      slotIndex: 0,
    });
    await bookInterview(request, vacancy.publicSlug, {
      firstName: 'Tom',
      lastName: 'Fisher',
      email: uniqueEmail('tom'),
      slotIndex: 1,
    });

    await signIn(page, org.email);
    await page.goto(`/org/${org.organizationId}/hiring/candidates`);

    const count = page.getByTestId('candidates-count');
    await expect(count).toHaveText('2 candidates');

    // A filter from the drawer and a search in the toolbar — two different homes, and
    // both have to survive the round trip.
    await page.getByTestId('candidates-filters-open').click();
    await page.getByTestId('candidates-filter-status').click();
    await page.getByTestId('candidates-filter-status-option-scheduled').click();
    await page.getByTestId('candidates-filters-apply').click();
    await page.getByTestId('candidates-search-input').fill('Jane');
    await expect(count).toHaveText('1 of 2 candidates');

    const row = page.getByTestId('candidates-list').locator('[data-testid^="candidate-row-"]');
    await expect(row).toHaveCount(1);
    await row.click();
    await expect(page.getByTestId('candidate-card')).toBeVisible();
    await expect(page.getByTestId('candidate-name')).toHaveText('Jane Doe');

    // It names the list, never a bare "Back", and it is a real anchor over a real address.
    const back = page.getByTestId('candidate-back-link');
    await expect(back).toHaveText('Candidates');
    await expect(back).toHaveAttribute('href', /\/hiring\/candidates\?/);

    await back.click();
    await expect(page.getByTestId('candidates-search-input')).toHaveValue('Jane');
    await expect(page.getByTestId('candidates-filters-open')).toHaveText('Filters (1)');
    await expect(page.getByTestId('candidates-count')).toHaveText('1 of 2 candidates');

    // And the list rewrites its address onto its **own** path. The screen mounts before
    // the browser's location has caught up with a client-side navigation, so a query
    // spliced onto whatever `window.location` said would have landed the filters on the
    // candidate's URL (03 §09.53).
    await expect(page).toHaveURL(/\/hiring\/candidates\?[^/]*$/);
  });

  /**
   * TC-H04-E2E-09 — the label is the list, and an arrival with no list has an answer too.
   *
   * Both halves in one case, because they are the same rule read from its two ends: the
   * card says where it came from, and when nothing came before it, it says the one place
   * every caller who can read the card can also reach.
   */
  test('says Board coming from a board, and Candidates coming from the invite', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('card-back-board'));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });
    await bookInterview(request, vacancy.publicSlug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: uniqueEmail('jane'),
    });
    const invite = await latestInviteLink(request);
    const detail = `/org/${org.organizationId}/hiring/vacancies/${vacancy.id}`;

    await signIn(page, org.email);

    // A fresh tab that has been on no list at all: the deep link's own arrival.
    await page.goto(invite.path);
    await expect(page.getByTestId('candidate-back-link')).toHaveText('Candidates');

    // And the same card reached from the board it sits on.
    await page.goto(detail);
    await expect(page.getByTestId('vacancy-detail')).toBeVisible();
    await page.getByTestId(`board-card-${invite.applicationId}`).click();

    const back = page.getByTestId('candidate-back-link');
    await expect(page.getByTestId('candidate-card')).toBeVisible();
    await expect(back).toHaveText('Board');
    await expect(back).toHaveAttribute('href', detail);

    await back.click();
    await expect(page.getByTestId('vacancy-detail')).toBeVisible();
  });

  /**
   * TC-H04-E2E-10 — copying the address confirms, and moves nothing.
   *
   * The second half is the one this screen cares about: a confirmation that pushed the
   * interview notes down would be a worse answer than no confirmation at all.
   */
  test('copies the email and confirms it without moving the page', async ({ page, request }) => {
    const { org, invite } = await seed(request, 'card-copy');
    await signIn(page, org.email);
    await page.goto(invite.path);

    const email = await page.getByTestId('candidate-email').innerText();
    const notes = page.getByTestId('card-notes-input');
    await expect(notes).toBeVisible();

    /*
      How far the field sits **below the page title**, rather than where it sits on screen.

      The two are not the same question here, and only one of them is about the product.
      The deep link opens on its own application, so the shell's scroller is already part
      way down, and pressing a control back up at the header scrolls it into view — a
      viewport-relative reading would call that a layout shift. The gap between two
      elements in the same scroller does not move when the scroller does, and it is exactly
      what a banner opening in the flow between them would change.
    */
    const gap = () =>
      page.evaluate(() => {
        const top = (id: string) =>
          document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect().top;
        return Math.round(top('card-notes-input') - top('page-title'));
      });
    const before = await gap();

    const copy = page.getByTestId('candidate-email-copy');
    await expect(copy).toHaveAttribute('aria-label', 'Copy email');
    await copy.click();

    await expect(page.getByTestId('toast-email-copied')).toHaveText('Email copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(email);

    // Nothing moved, and nothing took focus off the control that was pressed.
    expect(await gap()).toBe(before);
    await expect(copy).toBeFocused();
  });
});
