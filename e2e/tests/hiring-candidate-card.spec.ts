import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  CV_FILE,
  bookInterview,
  createVacancy,
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
});

