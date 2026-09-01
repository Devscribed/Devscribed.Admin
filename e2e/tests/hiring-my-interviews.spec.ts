import { expect, test } from '@playwright/test';
import {
  VALID,
  addMember,
  bookInterview,
  clickHiringNav,
  createVacancy,
  createVacancyFor,
  openHiringSection,
  registerOrganization,
  uniqueEmail,
} from './helpers';
import type { Page } from '@playwright/test';

/**
 * The interviewer's whole path (spec 03 §06, §08, 04 §01).
 *
 * My interviews is not a screen any more — it is the candidate list's **`Assigned to me`
 * scope**, and this file follows the same caller through the same journey to the same
 * card, by the new road. A `user` who has been assigned an interview is still the one
 * caller in the product whose permissions come from a row rather than from their role;
 * what changed is that their row and a manager's row now point at one list.
 *
 * Which puts the interesting assertions in a different place. It is no longer "they have
 * a screen nobody else has"; it is "they have the same screen, and it is narrower — with
 * no tab offering the half they may not see, and no query string that widens it".
 */
test.describe('Hiring — candidates, assigned to me', () => {
  /** Signs in and waits for the shell, which resolves the session before it renders. */
  async function signIn(page: Page, email: string): Promise<void> {
    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill(VALID.password);
    await page.getByTestId('login-submit-button').click();
    await page.waitForURL('**/members');
    await expect(page.getByTestId('app-sidebar')).toBeVisible();
  }

  /** TC-H03-E2E-03 — a `user` interviewer reaches their own candidates and nothing else. */
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

    // One hiring row, and it is the one everybody else has. The shell blocks on
    // `/api/me` before rendering, so nothing gated flashes in on the way — the
    // assertions below run against a sidebar that has already settled.
    //
    // The group is drawn, because they do have a hiring destination; opening it shows
    // exactly one row inside.
    await openHiringSection(page);
    await expect(page.getByTestId('nav-candidates')).toBeVisible();
    await expect(page.getByTestId('nav-my-interviews')).toHaveCount(0);
    await expect(page.getByTestId('nav-vacancies')).toHaveCount(0);
    await expect(page.getByTestId('nav-hiring-settings')).toHaveCount(0);

    await page.getByTestId('nav-candidates').click();
    await page.waitForURL('**/hiring/candidates');
    await expect(page.getByTestId('candidates-list')).toBeVisible();

    // No tab strip at all: not a disabled one, not a single-tab one. A control offering
    // one choice is not a choice, and a second tab would advertise a list they will
    // never be shown.
    await expect(page.getByTestId('candidates-scope-tabs')).toHaveCount(0);

    await expect(page.getByText('Ann Lee')).toBeVisible();
    // The other interviewer's candidate is absent from the page, not merely unlisted.
    expect(await page.content()).not.toContain('Jane Doe');

    // Their drawer holds Status and nothing else (03 §09.52). The other four filters read
    // libraries this role may not GET, so drawing them would be four pickers answering
    // `No options` — and Interviewer would be asking who the viewer is.
    await page.getByTestId('candidates-filters-open').click();
    await expect(page.getByTestId('candidates-filter-status')).toBeVisible();
    for (const absent of [
      'candidates-filter-position',
      'candidates-filter-category',
      'candidates-filter-interviewer',
      'candidates-criteria-filter-add',
    ]) {
      await expect(page.getByTestId(absent)).toHaveCount(0);
    }
    await page.getByTestId('candidates-filters-close').click();
    await expect(page.getByTestId('candidates-filters')).toBeHidden();

    // And asking for the whole database by hand does not produce it: the scope is
    // resolved on the server, and the screen only reflects what came back.
    await page.goto(`/org/${org.organizationId}/hiring/candidates?scope=all`);
    await expect(page.getByTestId('candidates-list')).toBeVisible();
    await expect(page.getByText('Ann Lee')).toBeVisible();
    expect(await page.content()).not.toContain('Jane Doe');

    // The row opens the card, holding their own application and not the other one —
    // which the candidate does have, and which the response simply does not carry.
    await page.getByTestId('candidates-list').getByRole('link').first().click();
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
      'hiring/vacancies',
      `hiring/vacancies/${others.id}`,
      `hiring/vacancies/${theirs.id}/board`,
    ]) {
      await page.goto(`/org/${org.organizationId}/${path}`);
      await expect(page.getByTestId('vacancies-list')).toHaveCount(0);
      await expect(page.getByTestId('vacancy-detail')).toHaveCount(0);
      await expect(page.getByTestId('board')).toHaveCount(0);
      expect(await page.content()).not.toContain('Jane Doe');
    }
  });

  /**
   * The old address still travels — in bookmarks, in chat, in the rail people used
   * yesterday — so it lands on the tab it became rather than on a dead end.
   */
  test('the old My interviews address opens the Assigned to me scope', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('owner'));
    const interviewer = await addMember(request, {
      email: uniqueEmail('interviewer'),
      role: 'user',
    });
    const theirs = await createVacancyFor(request, org, interviewer.accountId, {
      title: 'Node Engineer',
    });
    await bookInterview(request, theirs.publicSlug, {
      firstName: 'Ann',
      lastName: 'Lee',
      email: uniqueEmail('ann'),
    });

    await signIn(page, interviewer.email);
    await page.goto(`/org/${org.organizationId}/hiring/my-interviews`);

    await page.waitForURL('**/hiring/candidates?scope=mine');
    await expect(page.getByTestId('candidates-list')).toBeVisible();
    await expect(page.getByText('Ann Lee')).toBeVisible();
  });

  /** TC-H03-E2E-04 — no row and no screen for a member with no assignment. */
  test('a user who interviews for nothing has no row and no screen', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('owner'));
    const idle = await addMember(request, { email: uniqueEmail('idle'), role: 'user' });

    const vacancy = await createVacancy(request, org, { title: 'React Engineer' });
    await bookInterview(request, vacancy.publicSlug, { email: uniqueEmail('jane') });

    await signIn(page, idle.email);

    // No hiring destination at all, so no group to open in search of one — and with it
    // no Candidates row anywhere in the document.
    await expect(page.getByRole('button', { name: 'Hiring', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('nav-candidates')).toHaveCount(0);

    // The not-found state, not an empty list: the screen's existence is not advertised
    // to somebody it will never serve (03 §07.34).
    for (const path of ['hiring/candidates', 'hiring/candidates?scope=mine']) {
      await page.goto(`/org/${org.organizationId}/${path}`);
      await expect(page.getByTestId('candidates-list')).toHaveCount(0);
      await expect(page.getByTestId('candidates-scope-tabs')).toHaveCount(0);
    }
  });

  /**
   * The manager's view of the same list. Both tabs, both counts, and the scope is
   * navigation rather than a filter: it is addressable, it is remembered, and it comes
   * back from a candidate card intact.
   */
  test('an admin gets both scopes, and the chosen one survives a card and a reload', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('owner'));
    const bystander = await addMember(request, { email: uniqueEmail('other'), role: 'admin' });

    // One candidate on the owner's vacancy, one on the second admin's — so `All` holds
    // two and `Assigned to me`, for that admin, holds one.
    const ours = await createVacancy(request, org, { title: 'React Engineer' });
    await bookInterview(request, ours.publicSlug, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: uniqueEmail('jane'),
    });
    const assigned = await createVacancyFor(request, org, bystander.accountId, {
      title: 'Node Engineer',
    });
    await bookInterview(request, assigned.publicSlug, {
      firstName: 'Tom',
      lastName: 'Fisher',
      email: uniqueEmail('tom'),
    });

    await signIn(page, bystander.email);
    await clickHiringNav(page, 'nav-candidates');
    await page.waitForURL('**/hiring/candidates');

    // The count lives in the label, so a tab answers what the other one holds before it
    // is pressed. `All` is the default — a recruiter's job is the whole pipeline.
    await expect(page.getByTestId('candidates-scope-all')).toHaveText('All (2)');
    await expect(page.getByTestId('candidates-scope-mine')).toHaveText('Assigned to me (1)');
    await expect(page.getByTestId('candidates-scope-all')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('Jane Doe')).toBeVisible();

    await page.getByTestId('candidates-scope-mine').click();
    await expect(page.getByText('Tom Fisher')).toBeVisible();
    await expect(page.getByTestId('candidates-list')).not.toContainText('Jane Doe');
    // Navigation, so it is in the address — a shared link opens the tab it was sent from.
    await expect(page).toHaveURL(/scope=mine/);

    // A reload lands on the same tab, and so does a Back from a candidate card.
    await page.reload();
    await expect(page.getByTestId('candidates-scope-mine')).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByTestId('candidates-list').getByRole('link').first().click();
    await page.waitForURL('**/hiring/candidates/**');
    await expect(page.getByTestId('candidate-card')).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId('candidates-scope-mine')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('Tom Fisher')).toBeVisible();
  });
});
