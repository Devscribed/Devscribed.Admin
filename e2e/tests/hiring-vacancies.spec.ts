import { expect, test } from '@playwright/test';
import {
  addMember,
  bookInterview,
  createVacancy,
  registerOrganization,
  signIn,
  uniqueEmail,
} from './helpers';

/** TC-H01-E2E-01 — create a vacancy and copy its booking link. */
test.describe('Vacancies', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('creates a vacancy and copies its booking link', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('hiring'));
    await signIn(page, org.email);

    await page.getByTestId('nav-vacancies').click();
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

    await expect(page.getByTestId('vacancy-detail-categories')).toHaveText('React');

    const link = page.getByTestId('vacancy-booking-link');
    await expect(link).toBeVisible();
    // The title's slug plus a random suffix — the same title never collides.
    await expect(link).toHaveText(/\/book\/senior-react-engineer-[A-Za-z0-9_-]{12}$/);

    await page.getByTestId('vacancy-copy-link-button').click();
    await expect(page.getByTestId('toast-link-copied')).toHaveText('Booking link copied');

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(await link.textContent());
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
    await expect(page.getByTestId('vacancy-detail-counts')).toHaveText('1 candidates · 1 scheduled');

    await page.getByTestId('vacancy-actions-menu').click();
    await page.getByTestId('vacancy-action-close').click();

    await expect(page.getByTestId('toast-vacancy-closed')).toHaveText('Vacancy closed');
    await expect(page.getByTestId(`vacancy-status-${vacancy.id}`)).toHaveText('Closed');
    // The link stays on the page, marked — the manager still has to be able to copy it.
    await expect(page.getByTestId('vacancy-booking-link')).toBeVisible();
    await expect(page.getByTestId('vacancy-closed-link-note')).toHaveText(
      'This link is no longer accepting bookings.',
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

    // The interview that was already booked is untouched.
    await page.reload();
    await expect(page.getByTestId('vacancy-detail-counts')).toHaveText('1 candidates · 1 scheduled');

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

    // Reachable by keyboard, and the reason is its accessible description.
    await page.keyboard.press('ArrowDown');
    await expect(blocked).toBeFocused();
    const tooltip = page.getByTestId('vacancy-delete-guard-message');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText('Close this vacancy instead — it has candidates');
    expect(await blocked.getAttribute('aria-describedby')).toBe(await tooltip.getAttribute('id'));

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('vacancy-delete-confirm')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // A vacancy nobody has applied to deletes outright.
    await page.goto(`/org/${org.organizationId}/hiring/vacancies/${empty.id}`);
    await page.getByTestId('vacancy-actions-menu').click();
    await page.getByTestId('vacancy-action-delete').click();
    await page.getByTestId('vacancy-delete-confirm-button').click();

    await page.waitForURL('**/hiring/vacancies');
    await expect(page.getByTestId('vacancies-list')).not.toContainText('Empty DotNet Engineer');
    await expect(page.getByTestId('vacancies-list')).toContainText('Busy React Engineer');
  });

  /** 01 §05.16 — both filters narrow the list on the server. */
  test('searches and filters the list', async ({ page, request }) => {
    const org = await registerOrganization(request, uniqueEmail('hiring-filter'));
    await createVacancy(request, org, { title: 'Senior React Engineer' });
    await createVacancy(request, org, { title: 'DotNet Engineer' });
    const closed = await createVacancy(request, org, { title: 'React Native Engineer' });

    await signIn(page, org.email);
    await page.goto(`/org/${org.organizationId}/hiring/vacancies/${closed.id}`);
    await page.getByTestId('vacancy-actions-menu').click();
    await page.getByTestId('vacancy-action-close').click();
    await expect(page.getByTestId('toast-vacancy-closed')).toBeVisible();

    await page.goto(`/org/${org.organizationId}/hiring/vacancies`);
    const rows = page.getByTestId('vacancies-list');
    await expect(rows).toContainText('DotNet Engineer');

    // Case-insensitive, and debounced rather than one request per keystroke.
    await page.getByTestId('vacancies-search-input').fill('react');
    await expect(rows).toContainText('Senior React Engineer');
    await expect(rows).toContainText('React Native Engineer');
    await expect(rows).not.toContainText('DotNet Engineer');

    await page.getByTestId('vacancies-status-filter').click();
    await page.getByTestId('vacancies-status-option-open').click();
    await expect(rows).toContainText('Senior React Engineer');
    await expect(rows).not.toContainText('React Native Engineer');

    await page.getByTestId('vacancies-search-input').fill('nothing matches this');
    await expect(page.getByTestId('vacancies-empty-state')).toHaveText(
      'No vacancies match these filters.',
    );
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

    await page.getByTestId('vacancy-edit-button').click();
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
    await expect(page.getByTestId('vacancy-detail')).toContainText('45 minutes');
    // The slug is frozen, so the link already sent keeps working.
    await expect(page.getByTestId('vacancy-booking-link')).toHaveText(
      new RegExp(`/book/${vacancy.publicSlug}$`),
    );
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
