import { expect, test, type Page } from '@playwright/test';
import {
  addMember,
  bookInterview,
  clickHiringNav,
  createVacancy,
  registerOrganization,
  signIn,
  uniqueEmail,
} from './helpers';

/**
 * Whether an element is cutting its own content off — the only way to tell a clamp that
 * fired from one that had nothing to cut, since both look identical in the markup.
 */
const clipped = (page: Page, testId: string): Promise<boolean> =>
  page.evaluate((id) => {
    const node = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    return node !== null && node.scrollHeight - node.clientHeight > 2;
  }, testId);

/** TC-H01-E2E-01 — create a vacancy and copy its booking link. */
test.describe('Vacancies', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('creates a vacancy and copies its booking link', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('hiring'));
    await signIn(page, org.email);

    await clickHiringNav(page, 'nav-vacancies');
    await page.waitForURL('**/hiring/vacancies');
    await expect(page.getByTestId('vacancies-empty-state')).toBeVisible();

    await page.getByTestId('vacancy-new-button').click();
    await expect(page.getByTestId('vacancy-dialog')).toBeVisible();

    await page.getByTestId('vacancy-title-input').fill('Senior React Engineer');
    await page.getByTestId('vacancy-interviewer-select').click();
    await page.getByTestId(`vacancy-interviewer-option-${org.accountId}`).click();
    await page.getByTestId('vacancy-duration-60').click();

    // The library is empty, so typing a name offers to create it — and the category is
    // written by the same submit that writes the vacancy (06 §04.22).
    await page.getByTestId('vacancy-categories-input').fill('React');
    await page.getByTestId('vacancy-category-create-option').click();

    await page.getByTestId('vacancy-submit-button').click();

    await expect(page.getByTestId('vacancy-dialog')).toBeHidden();
    await expect(page.getByTestId('toast-vacancy-created')).toHaveText('Vacancy created');
    await expect(page.getByTestId('vacancy-detail')).toBeVisible();

    // The four cards this screen used to be are one meta line now, and the board has the
    // rest of the height (01 §08.28).
    await expect(page.getByTestId('vacancy-detail-categories')).toHaveText('React');
    await expect(page.getByTestId('vacancy-detail')).toContainText('60 min');
    await expect(page.getByTestId('vacancy-detail')).toContainText('Pat Owner');
    await expect(page.getByTestId('board-empty-state')).toBeVisible();

    // The link is a button rather than a field: nothing on the page to read, so the
    // clipboard is where the assertion has to look.
    await page.getByTestId('vacancy-copy-link-button').click();
    await expect(page.getByTestId('toast-link-copied')).toHaveText('Booking link copied');

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    // The title's slug plus a random suffix — the same title never collides.
    expect(clipboard).toMatch(/\/book\/senior-react-engineer-[A-Za-z0-9_-]{12}$/);
  });

  /**
   * The rail is answered by the route, not by the click that got there. Arriving at a
   * nested hiring screen cold — a bookmark, a calendar invite, a reload — has to open the
   * section that owns it, or the reader lands on a screen whose own navigation is shut.
   */
  test('a deep link opens the group that owns it, and lights the right row', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('hiring-deep'));
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });
    await signIn(page, org.email);

    // Not the list route — one nested beneath it, so the match is prefix and not equality.
    await page.goto(`/org/${org.organizationId}/hiring/vacancies/${vacancy.id}`);
    await expect(page.getByTestId('vacancy-detail')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Hiring', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(page.getByTestId('nav-vacancies')).toHaveAttribute('aria-current', 'page');
    // People is not the current group, so it is shut and Members is not in the document.
    await expect(page.getByRole('button', { name: 'People', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(page.getByTestId('nav-members')).toHaveCount(0);

    // And the sibling row is a row, not the current one — one `aria-current` in the rail.
    await expect(page.getByTestId('nav-candidates')).not.toHaveAttribute('aria-current', 'page');
  });

  test('lists the new vacancy with its interviewer, length and count', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('hiring-list'));
    await signIn(page, org.email);

    await page.goto(page.url().replace('/members', '/hiring/vacancies'));
    await page.getByTestId('vacancy-new-button').click();
    await page.getByTestId('vacancy-title-input').fill('DotNet Engineer');
    await page.getByTestId('vacancy-interviewer-select').click();
    await page.getByTestId(`vacancy-interviewer-option-${org.accountId}`).click();
    await page.getByTestId('vacancy-duration-45').click();
    await page.getByTestId('vacancy-submit-button').click();
    await expect(page.getByTestId('vacancy-detail')).toBeVisible();

    await page.goBack();
    await page.reload();

    const row = page.getByTestId('vacancies-list').getByText('DotNet Engineer');
    await expect(row).toBeVisible();
    await expect(page.getByTestId('vacancies-list')).toContainText('Pat Owner');
    await expect(page.getByTestId('vacancies-list')).toContainText('45 min');
    await expect(page.getByTestId('vacancies-list')).toContainText('Open');
  });

  /**
   * TC-H01-E2E-03 — closing takes the link out of service and changes nothing else.
   *
   * The spec's last step opens the board; the board arrives with its own phase, so the
   * candidate counts on the detail page stand in for it here.
   */
  test('closes a vacancy without touching its candidates', async ({ page, request, browser }) => {
    const org = await registerOrganization(request, uniqueEmail('hiring-close'));
    const vacancy = await createVacancy(request, org, { title: 'Closing React Engineer' });
    await bookInterview(request, vacancy.publicSlug);

    await signIn(page, org.email);
    await page.goto(`/org/${org.organizationId}/hiring/vacancies/${vacancy.id}`);
    // The count the detail page used to print is the board's own, one screen down.
    await expect(page.getByTestId('board-column-count-scheduled')).toHaveText('1');

    await page.getByTestId('vacancy-actions-menu').click();
    await page.getByTestId('vacancy-action-close').click();
    await page.getByTestId('vacancy-close-confirm-button').click();

    await expect(page.getByTestId('toast-vacancy-closed')).toHaveText('Vacancy closed');
    await expect(page.getByTestId(`vacancy-status-${vacancy.id}`)).toHaveText('Closed');
    // The button stays and is refused, and the note says what closing did and did not do
    // — with the board it did not touch directly underneath it (01 §08.31).
    await expect(page.getByTestId('vacancy-copy-link-button')).toBeDisabled();
    await expect(page.getByTestId('vacancy-closed-link-note')).toHaveText(
      'This link is no longer accepting bookings. Scheduled interviews stand and the board keeps working.',
    );

    // The link itself, opened by someone with no session at all.
    const anonymous = await browser.newContext();
    const visitor = await anonymous.newPage();
    await visitor.goto(`/book/${vacancy.publicSlug}`);
    await expect(visitor.getByTestId('booking-org-wordmark')).toContainText('Acme Inc');
    await expect(visitor.getByTestId('booking-vacancy-title')).toHaveText('Closing React Engineer');
    await expect(visitor.getByTestId('booking-closed-message')).toHaveText(
      'This position is no longer accepting applications.',
    );
    // No calendar, no slots, no form.
    await expect(visitor.getByTestId('calendar-control')).toHaveCount(0);
    await expect(visitor.getByTestId('booking-submit-button')).toHaveCount(0);
    await expect(visitor.getByTestId('booking-first-name-input')).toHaveCount(0);
    await anonymous.close();

    // The interview that was already booked is untouched, and the board still holds it.
    await page.reload();
    await expect(page.getByTestId('board-column-count-scheduled')).toHaveText('1');

    // And it goes back, freely.
    await page.getByTestId('vacancy-actions-menu').click();
    await page.getByTestId('vacancy-action-reopen').click();
    await expect(page.getByTestId('toast-vacancy-reopened')).toHaveText('Vacancy reopened');
    await expect(page.getByTestId(`vacancy-status-${vacancy.id}`)).toHaveText('Open');
  });

  /** TC-H01-E2E-04 — delete is disabled, not hidden, and says why. */
  test('disables delete once a vacancy has candidates', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('hiring-delete'));
    const withCandidates = await createVacancy(request, org, { title: 'Busy React Engineer' });
    const empty = await createVacancy(request, org, { title: 'Empty DotNet Engineer' });
    await bookInterview(request, withCandidates.publicSlug);

    await signIn(page, org.email);
    await page.goto(`/org/${org.organizationId}/hiring/vacancies/${withCandidates.id}`);

    await page.getByTestId('vacancy-actions-menu').click();
    const blocked = page.getByTestId('vacancy-action-delete');
    await expect(blocked).toBeVisible();
    await expect(blocked).toHaveAttribute('aria-disabled', 'true');

    // Reachable by keyboard, and the reason is its accessible description. The menu opens
    // on Edit and the three rows are Edit · Close · Delete, so Delete is two down.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(blocked).toBeFocused();
    const tooltip = page.getByTestId('vacancy-delete-guard-message');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText('Close this vacancy instead — it has candidates');
    expect(await blocked.getAttribute('aria-describedby')).toBe(await tooltip.getAttribute('id'));

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('vacancy-delete-confirm')).toBeHidden();
    await page.keyboard.press('Escape');

    // A vacancy nobody has applied to deletes outright.
    await page.goto(`/org/${org.organizationId}/hiring/vacancies/${empty.id}`);
    await page.getByTestId('vacancy-actions-menu').click();
    await page.getByTestId('vacancy-action-delete').click();
    await expect(page.getByTestId('vacancy-delete-confirm')).toContainText(
      'Empty DotNet Engineer has no candidates, so nothing is lost. This cannot be undone.',
    );
    await page.getByTestId('vacancy-delete-confirm-button').click();

    await page.waitForURL('**/hiring/vacancies');
    await expect(page.getByTestId('vacancies-list')).not.toContainText('Empty DotNet Engineer');
    await expect(page.getByTestId('vacancies-list')).toContainText('Busy React Engineer');
  });

  /**
   * 01 §05.16, §07.18–20 — both filters narrow the list on the server, and the status
   * filter is now a tab strip whose labels carry their own counts.
   *
   * The counts follow the **search** and ignore the **tab**, which is the whole reason
   * they can be trusted: a label narrowed by the tab it sits on would read `Closed (0)`
   * while standing on `Open`, and pressing it would then show a row.
   */
  test('searches, and switches status by a tab that says how many it holds', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('hiring-filter'));
    await createVacancy(request, org, { title: 'Senior React Engineer' });
    await createVacancy(request, org, { title: 'DotNet Engineer' });
    const closed = await createVacancy(request, org, { title: 'React Native Engineer' });

    await signIn(page, org.email);
    await page.goto(`/org/${org.organizationId}/hiring/vacancies/${closed.id}`);
    await page.getByTestId('vacancy-actions-menu').click();
    await page.getByTestId('vacancy-action-close').click();
    await page.getByTestId('vacancy-close-confirm-button').click();
    await expect(page.getByTestId('toast-vacancy-closed')).toBeVisible();

    await page.goto(`/org/${org.organizationId}/hiring/vacancies`);
    const rows = page.getByTestId('vacancies-list');
    await expect(rows).toContainText('DotNet Engineer');

    // The split is readable before anything is pressed.
    await expect(page.getByTestId('vacancies-status-all')).toHaveText('All (3)');
    await expect(page.getByTestId('vacancies-status-open')).toHaveText('Open (2)');
    await expect(page.getByTestId('vacancies-status-closed')).toHaveText('Closed (1)');

    // Case-insensitive, and debounced rather than one request per keystroke.
    await page.getByTestId('vacancies-search-input').fill('react');
    await expect(rows).toContainText('Senior React Engineer');
    await expect(rows).toContainText('React Native Engineer');
    await expect(rows).not.toContainText('DotNet Engineer');
    // Every count moved with the search, because the search applies to every tab.
    await expect(page.getByTestId('vacancies-status-all')).toHaveText('All (2)');
    await expect(page.getByTestId('vacancies-status-open')).toHaveText('Open (1)');
    await expect(page.getByTestId('vacancies-status-closed')).toHaveText('Closed (1)');

    await page.getByTestId('vacancies-status-open').click();
    await expect(rows).toContainText('Senior React Engineer');
    await expect(rows).not.toContainText('React Native Engineer');
    // Standing on a tab does not narrow its siblings' labels.
    await expect(page.getByTestId('vacancies-status-closed')).toHaveText('Closed (1)');

    await page.getByTestId('vacancies-search-input').fill('nothing matches this');
    // Not "No vacancies yet." — this organization has three, and the empty state reads
    // the unfiltered total rather than a count the search already emptied.
    await expect(page.getByTestId('vacancies-empty-state')).toHaveText(
      'No vacancies match these filters.',
    );
  });

  /**
   * 01 §07.22 — the row acts without being opened.
   *
   * Two blocked items are the point of this one: `Copy booking link` on a closed vacancy
   * and `Delete` on one with candidates are both **disabled and drawn**, with the reason
   * in the row. A missing action is indistinguishable from a bug.
   */
  test('acts on a vacancy from its row without opening it', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('hiring-row'));
    const open = await createVacancy(request, org, { title: 'Row React Engineer' });
    const busy = await createVacancy(request, org, { title: 'Busy DotNet Engineer' });
    await bookInterview(request, busy.publicSlug);

    await signIn(page, org.email);
    await page.goto(`/org/${org.organizationId}/hiring/vacancies`);
    await expect(page.getByTestId(`vacancy-row-${open.id}`)).toBeVisible();

    // Opening the menu is not opening the row.
    await page.getByTestId(`vacancy-actions-menu-${open.id}`).click();
    await expect(page).toHaveURL(/\/hiring\/vacancies$/);

    // The link is copied from the row, and the confirmation is a toast rather than a
    // banner on a page nobody navigated to.
    await page.getByTestId(`vacancy-action-copy-link-${open.id}`).click();
    await expect(page.getByTestId('toast-link-copied')).toHaveText('Booking link copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      `/book/${open.publicSlug}`,
    );

    // Delete on a vacancy with candidates: present, disabled, and saying why.
    await page.getByTestId(`vacancy-actions-menu-${busy.id}`).click();
    const blocked = page.getByTestId(`vacancy-action-delete-${busy.id}`);
    await expect(blocked).toBeVisible();
    await expect(blocked).toHaveAttribute('aria-disabled', 'true');
    const reason = page.getByTestId(`vacancy-delete-guard-message-${busy.id}`);
    await expect(reason).toHaveText('Close this vacancy instead — it has candidates');
    expect(await blocked.getAttribute('aria-describedby')).toBe(await reason.getAttribute('id'));
    await page.keyboard.press('Escape');

    // Closing from the row confirms with what it leaves alone, and the counts follow.
    await page.getByTestId(`vacancy-actions-menu-${busy.id}`).click();
    await page.getByTestId(`vacancy-action-close-${busy.id}`).click();
    const confirm = page.getByTestId('vacancy-close-confirm');
    await expect(confirm).toContainText(
      'The booking link stops accepting new candidates. 1 scheduled interview stands, and the board keeps working.',
    );
    await page.getByTestId('vacancy-close-confirm-button').click();
    await expect(page.getByTestId('toast-vacancy-closed')).toHaveText('Vacancy closed');
    await expect(page.getByTestId(`vacancy-status-${busy.id}`)).toHaveText('Closed');
    await expect(page.getByTestId('vacancies-status-closed')).toHaveText('Closed (1)');

    // A closed vacancy still has a link; the row says why it cannot be handed out.
    await page.getByTestId(`vacancy-actions-menu-${busy.id}`).click();
    const copy = page.getByTestId(`vacancy-action-copy-link-${busy.id}`);
    await expect(copy).toBeVisible();
    await expect(copy).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId(`vacancy-copy-guard-message-${busy.id}`)).toHaveText(
      'This link is no longer accepting bookings.',
    );
    await page.keyboard.press('Escape');

    // Editing opens the same dialog the detail page mounts, over the row it was opened on.
    await page.getByTestId(`vacancy-actions-menu-${open.id}`).click();
    await page.getByTestId(`vacancy-action-edit-${open.id}`).click();
    await expect(page.getByTestId('vacancy-dialog')).toBeVisible();
    await page.getByTestId('vacancy-title-input').fill('Renamed From The Row');
    await page.getByTestId('vacancy-submit-button').click();
    await expect(page.getByTestId('toast-vacancy-updated')).toHaveText('Vacancy updated');
    // The list refetched rather than being left behind — and stayed the list.
    await expect(page.getByTestId('vacancies-list')).toContainText('Renamed From The Row');
    await expect(page).toHaveURL(/\/hiring\/vacancies$/);

    // And the row itself still opens the vacancy.
    await page.getByTestId(`vacancy-title-${open.id}`).click();
    await expect(page.getByTestId('vacancy-detail')).toBeVisible();
  });

  /** 01 §07.22 — deleting from a row leaves the list, and says so. */
  test('deletes an unapplied vacancy from its row', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('hiring-row-delete'));
    const doomed = await createVacancy(request, org, { title: 'Empty QA Engineer' });
    await createVacancy(request, org, { title: 'Kept React Engineer' });

    await signIn(page, org.email);
    await page.goto(`/org/${org.organizationId}/hiring/vacancies`);

    await page.getByTestId(`vacancy-actions-menu-${doomed.id}`).click();
    await page.getByTestId(`vacancy-action-delete-${doomed.id}`).click();
    await expect(page.getByTestId('vacancy-delete-confirm')).toContainText(
      'Empty QA Engineer has no candidates, so nothing is lost. This cannot be undone.',
    );
    await page.getByTestId('vacancy-delete-confirm-button').click();

    await expect(page.getByTestId('toast-vacancy-deleted')).toHaveText('Vacancy deleted');
    await expect(page.getByTestId('vacancies-list')).not.toContainText('Empty QA Engineer');
    await expect(page.getByTestId('vacancies-list')).toContainText('Kept React Engineer');
    // The count went with the row.
    await expect(page.getByTestId('vacancies-status-all')).toHaveText('All (1)');
  });

  /**
   * 01 §04.14 — changing the interview length confirms with what it leaves alone.
   * Reassigning the interviewer opens the same confirmation; it needs a second member,
   * which arrives with the invitation endpoint of user-management spec 03.
   */
  test('confirms a duration change against the interviews already booked', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('hiring-edit'));
    const vacancy = await createVacancy(request, org, { title: 'Editable Engineer' });
    await bookInterview(request, vacancy.publicSlug);

    await signIn(page, org.email);
    await page.goto(`/org/${org.organizationId}/hiring/vacancies/${vacancy.id}`);

    // Edit lives in the menu now — the header's one button is the booking link, because
    // copying it is the reason to open a vacancy (01 §08.28).
    await page.getByTestId('vacancy-actions-menu').click();
    await page.getByTestId('vacancy-action-edit').click();
    await expect(page.getByTestId('vacancy-dialog')).toBeVisible();
    await page.getByTestId('vacancy-title-input').fill('Renamed Engineer');
    await page.getByTestId('vacancy-duration-45').click();
    await page.getByTestId('vacancy-submit-button').click();

    const confirm = page.getByTestId('vacancy-reassign-confirm');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(
      '1 scheduled interview keeps its current time and interviewer.',
    );
    await page.getByTestId('vacancy-reassign-confirm-button').click();

    await expect(page.getByTestId('toast-vacancy-updated')).toHaveText('Vacancy updated');
    await expect(page.getByTestId('page-title')).toHaveText('Renamed Engineer');
    await expect(page.getByTestId('vacancy-detail')).toContainText('45 min');
    // The slug is frozen, so the link already sent keeps working. It is copied rather
    // than read: the header draws a button, not the URL.
    await page.getByTestId('vacancy-copy-link-button').click();
    await expect(page.getByTestId('toast-link-copied')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      `/book/${vacancy.publicSlug}`,
    );
  });

  /**
   * 01 §08.27–32 — the header the four cards became, and the board underneath it.
   *
   * The description is the part with a rule that cannot be read off the markup: `View
   * more` is drawn only when the three-line clamp actually cuts the text, which depends
   * on the width the header ended up with and not on the string.
   */
  test('draws one screen: a header, a clamped description, and the board', async ({
    page,
    request,
  }) => {
    const org = await registerOrganization(request, uniqueEmail('hiring-detail'));
    const short = await createVacancy(request, org, { title: 'Short Engineer' });
    const long = await createVacancy(request, org, {
      title: 'Wordy Engineer',
      description: 'We are looking for somebody. '.repeat(40),
    });
    await bookInterview(request, long.publicSlug);

    await signIn(page, org.email);
    await page.goto(`/org/${org.organizationId}/hiring/vacancies/${long.id}`);

    // The board is on this route, under the header, with the candidate on it.
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('board-column-count-scheduled')).toHaveText('1');

    // Clamped: the element is shorter than the text inside it, and the control says so.
    const description = page.getByTestId('vacancy-description');
    const toggle = page.getByTestId('vacancy-description-toggle');
    await expect(toggle).toHaveText('View more');
    expect(await clipped(page, 'vacancy-description')).toBe(true);

    await toggle.click();
    await expect(toggle).toHaveText('View less');
    // Expanded, it scrolls inside its own share of the screen rather than pushing the
    // board off the bottom of a page that does not scroll to reach it (01 §08.29).
    const box = (await description.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(page.viewportSize()!.height / 5 + 1);
    await expect(page.getByTestId('board')).toBeVisible();

    // A vacancy with no description offers to write one, and opens the same dialog.
    await page.goto(`/org/${org.organizationId}/hiring/vacancies/${short.id}`);
    await expect(page.getByTestId('vacancy-description')).toHaveCount(0);
    await expect(page.getByTestId('vacancy-description-toggle')).toHaveCount(0);
    await page.getByTestId('vacancy-add-description').click();
    await expect(page.getByTestId('vacancy-dialog')).toBeVisible();
    await page.getByTestId('vacancy-description-input').fill('Now it has one.');
    await page.getByTestId('vacancy-submit-button').click();
    await expect(page.getByTestId('vacancy-description')).toHaveText('Now it has one.');
    // One line is not three, so nothing was cut and there is nothing to expand.
    await expect(page.getByTestId('vacancy-description-toggle')).toHaveCount(0);

    // Back goes to the list, and it is a real link rather than a button that navigates.
    await expect(page.getByTestId('vacancy-back-link')).toHaveAttribute(
      'href',
      `/org/${org.organizationId}/hiring/vacancies`,
    );
    await page.getByTestId('vacancy-back-link').click();
    await expect(page).toHaveURL(/\/hiring\/vacancies$/);
    await expect(page.getByTestId('vacancies-list')).toBeVisible();
  });

  /**
   * TC-H01-E2E-05 — `user` and `viewer` never see the Hiring section.
   *
   * Two assertions, and the second is the one that matters: the row is absent, *and*
   * typing the URL renders nothing. A sidebar that hides a link its API would still
   * serve is decoration, not a permission.
   */
  test.describe('for a role with no hiring access', () => {
    for (const role of ['user', 'viewer']) {
      test(`a ${role} sees no Hiring section and no vacancies`, async ({ page, request }) => {
        const org = await registerOrganization(request, uniqueEmail('owner'));
        const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer' });
        const member = await addMember(request, { email: uniqueEmail(role), role });

        await signIn(page, member.email);

        // The shell resolves the session before rendering anything, which is what stops
        // a gated row appearing and being taken away again.
        await expect(page.getByTestId('app-sidebar')).toBeVisible();
        await expect(page.getByTestId('nav-members')).toBeVisible();
        // Not a Hiring group with nothing in it — no Hiring group. A titled section that
        // opens onto nothing reads as a permission error; an absent one reads as a part
        // of the product they are not in.
        await expect(page.getByRole('button', { name: 'Hiring', exact: true })).toHaveCount(0);
        for (const row of ['nav-vacancies', 'nav-candidates', 'nav-hiring-settings']) {
          await expect(page.getByTestId(row)).toHaveCount(0);
        }

        // The not-found state, not a permission error and not any vacancy data.
        await page.goto(`/org/${org.organizationId}/hiring/vacancies`);
        await expect(page.getByTestId('vacancies-list')).toHaveCount(0);
        await expect(page.getByTestId('vacancies-empty-state')).toHaveCount(0);
        expect(await page.content()).not.toContain('Senior React Engineer');

        await page.goto(`/org/${org.organizationId}/hiring/vacancies/${vacancy.id}`);
        await expect(page.getByTestId('vacancy-detail')).toHaveCount(0);
        expect(await page.content()).not.toContain(vacancy.publicSlug);
      });
    }
  });
});
