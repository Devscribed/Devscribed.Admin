import { expect, test } from '@playwright/test';
import {
  VALID,
  addMember,
  bookInterview,
  createVacancy,
  createVacancyFor,
  registerOrganization,
  uniqueEmail,
} from './helpers';
import type { Page } from '@playwright/test';

/**
 * The interviewer's whole path (spec 03 §06, 04 §01).
 *
 * A `user` who has been assigned an interview is the one caller in the product whose
 * permissions come from a row rather than from their role, and this is what that looks
 * like from the outside: one sidebar entry, one short list, and a candidate card holding
 * only their own vacancy. Everything else in Hiring is not merely disabled for them —
 * it is not there.
 */
test.describe('Hiring — my interviews', () => {
  /** Signs in and waits for the shell, which resolves the session before it renders. */
  async function signIn(page: Page, email: string): Promise<void> {
    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill(VALID.password);
    await page.getByTestId('login-submit-button').click();
    await page.waitForURL('**/members');
    await expect(page.getByTestId('app-sidebar')).toBeVisible();
  }

  /** TC-H03-E2E-03 — a `user` interviewer sees only My interviews. */
  test('an interviewer reaches their own candidate and nothing else', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('owner'));
    const interviewer = await addMember(request, {
      email: uniqueEmail('interviewer'),
      role: 'user',
      firstName: 'Ivy',
      lastName: 'Interviewer',
    });

    const theirs = await createVacancyFor(request, org, interviewer.accountId, {
      title: 'Node Engineer',
    });
    // A second vacancy interviewed by the owner. Booked by the **same** candidate, so
    // the card the interviewer opens genuinely has two application sections and only one
    // of them may travel (04 §01.2).
    const others = await createVacancy(request, org, { title: 'React Engineer' });

    const candidate = uniqueEmail('ann');
    await bookInterview(request, theirs.publicSlug, {
      firstName: 'Ann',
      lastName: 'Lee',
      email: candidate,
    });
    // A different interviewer, so their two calendars do not collide over one slot.
    await bookInterview(request, others.publicSlug, {
      firstName: 'Ann',
      lastName: 'Lee',
      email: candidate,
    });

    // Somebody else entirely, on the owner's vacancy — nothing of theirs may appear.
    await bookInterview(request, others.publicSlug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: uniqueEmail('jane'),
      slotIndex: 1,
    });

    await signIn(page, interviewer.email);

    // One hiring row, and it is theirs. The shell blocks on `/api/me` before rendering,
    // so nothing gated flashes in on the way — the assertions below run against a
    // sidebar that has already settled.
    await expect(page.getByTestId('nav-my-interviews')).toBeVisible();
    await expect(page.getByTestId('nav-vacancies')).toHaveCount(0);
    await expect(page.getByTestId('nav-candidates')).toHaveCount(0);
    await expect(page.getByTestId('nav-hiring-settings')).toHaveCount(0);

    await page.getByTestId('nav-my-interviews').click();
    await page.waitForURL('**/my-interviews');
    await expect(page.getByTestId('my-interviews-list')).toBeVisible();
    await expect(page.getByTestId('my-interviews-upcoming')).toContainText('Ann Lee');
    await expect(page.getByTestId('my-interviews-upcoming')).toContainText('Node Engineer');
    // The other interviewer's candidate is absent from the page, not merely unlisted.
    expect(await page.content()).not.toContain('Jane Doe');

    // The row opens the card, holding their own application and not the other one —
    // which the candidate does have, and which the response simply does not carry.
    await page.getByTestId('my-interviews-upcoming').getByRole('link').first().click();
    await page.waitForURL('**/hiring/candidates/**');
    await expect(page.getByTestId('candidate-card')).toBeVisible();
    await expect(page.getByTestId('candidate-name')).toHaveText('Ann Lee');
    await expect(page.getByText('Node Engineer').first()).toBeVisible();
    expect(await page.content()).not.toContain('React Engineer');

    // Criteria are read-only here: both libraries are admin/manager only, so there is
    // no autocomplete to offer somebody who may not read the list behind it.
    await expect(page.getByTestId('card-criteria-add')).toHaveCount(0);

    // And every management screen, entered by hand, renders the not-found state.
    for (const path of [
      'hiring/candidates',
      'hiring/vacancies',
      `hiring/vacancies/${others.id}`,
      `hiring/vacancies/${theirs.id}/board`,
    ]) {
      await page.goto(`/org/${org.organizationId}/${path}`);
      await expect(page.getByTestId('candidates-list')).toHaveCount(0);
      await expect(page.getByTestId('vacancies-list')).toHaveCount(0);
      await expect(page.getByTestId('vacancy-detail')).toHaveCount(0);
      await expect(page.getByTestId('board')).toHaveCount(0);
      expect(await page.content()).not.toContain('Jane Doe');
    }
  });

  /** TC-H03-E2E-04 — the row is absent for a member with no assignment. */
  test('a user who interviews for nothing has no row and no screen', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('owner'));
    const idle = await addMember(request, { email: uniqueEmail('idle'), role: 'user' });

    const vacancy = await createVacancy(request, org, { title: 'React Engineer' });
    await bookInterview(request, vacancy.publicSlug, { email: uniqueEmail('jane') });

    await signIn(page, idle.email);

    await expect(page.getByTestId('nav-my-interviews')).toHaveCount(0);

    // The not-found state, not an empty list: the screen's existence is not advertised
    // to somebody it will never serve (03 §07.34).
    await page.goto(`/org/${org.organizationId}/hiring/my-interviews`);
    await expect(page.getByTestId('my-interviews-list')).toHaveCount(0);
    await expect(page.getByTestId('my-interviews-upcoming')).toHaveCount(0);
  });

  /**
   * The manager's view of the same row: it is assignment, not seniority, that puts it
   * there (03 §06.30) — so an `admin` who interviews has it and one who does not has
   * nothing where it would be.
   */
  test('an admin sees the row only once somebody has assigned them an interview', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('owner'));
    const bystander = await addMember(request, { email: uniqueEmail('other'), role: 'admin' });

    await signIn(page, bystander.email);
    await expect(page.getByTestId('nav-vacancies')).toBeVisible();
    await expect(page.getByTestId('nav-my-interviews')).toHaveCount(0);

    // The owner assigns them a vacancy, and the row appears on the next resolve.
    const assigned = await createVacancyFor(request, org, bystander.accountId, {
      title: 'Node Engineer',
    });
    await bookInterview(request, assigned.publicSlug, {
      firstName: 'Tom',
      lastName: 'Fisher',
      email: uniqueEmail('tom'),
    });

    await page.reload();
    await expect(page.getByTestId('nav-my-interviews')).toBeVisible();
    await page.getByTestId('nav-my-interviews').click();
    await page.waitForURL('**/my-interviews');
    await expect(page.getByTestId('my-interviews-upcoming')).toContainText('Tom Fisher');
    // Both roles at once: they keep the management rows they already had.
    await expect(page.getByTestId('nav-candidates')).toBeVisible();
  });
});
