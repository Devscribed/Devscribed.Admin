/**
 * Portal spec 01 — Home (`specs/portal/01-home.cases.md`, TC-01-E2E-01 through -09).
 *
 * Every selector is a `data-testid` from the contracts' §Required data-testid Attributes,
 * with the one deliberate exception this repository already carries: a navigation control
 * is reached by its accessible name (`openNavSection`, used nowhere here because
 * `Team overview` is a top-level row, not inside a group).
 */
import { request as apiContexts, expect, test, type APIRequestContext, type Page } from './fixtures';
import { expectMessageAbsent, expectMessageOnce, expectSharedEdge } from './ui-invariants';
import { PORTAL_MESSAGES, formatDurationHuman } from '@devscribed/validation';
import {
  API,
  VALID,
  configureFinancials,
  createHolidayViaApi,
  createProjectViaApi,
  createTimeEntryViaApi,
  createVacancy,
  findMember,
  inviteAndAcceptViaApi,
  login,
  registerOrganization,
  requestTopicIdViaApi,
  seedReserveCredit,
  setMemberCountryViaApi,
  todayInZone,
  uniqueEmail,
} from './helpers';

/** Signs in through the UI and waits for the app shell to settle. */
async function signInUi(page: Page, email: string, password: string = VALID.password): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL(/\/org\/[^/]+\/?$/);
}

/** The two clicks `app-shell.spec.ts` already established: the account menu, then the row. */
async function logoutUi(page: Page): Promise<void> {
  await page.getByTestId('topbar-account-button').click();
  await page.getByTestId('logout-button').click();
  await page.waitForURL('**/login');
}

/** Local-date 'YYYY-MM-DD', `offset` days from today — for a holiday seeded in the future. */
function daysFromToday(offset: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Raises a request straight through the API as whoever `request`'s cookie jar is currently
 * signed in as, assigned to `assigneeMembershipId` — a precondition, not the thing under
 * test. Mirrors `requests.spec.ts`'s own local helper; not shared, because that file owns it.
 */
async function createRequestOnMember(
  request: APIRequestContext,
  orgId: string,
  assigneeMembershipId: string,
  title: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const topicId = overrides.topicId ?? (await requestTopicIdViaApi(request, orgId));
  const response = await request.post(`${API}/api/organizations/${orgId}/requests`, {
    data: { assigneeKind: 'member', assigneeMembershipId, title, ...overrides, topicId },
  });
  if (response.status() !== 201) {
    throw new Error(
      `Precondition failed: could not raise a request (${response.status()} ${await response.text()})`,
    );
  }
  return (await response.json()) as { id: string };
}

test.describe('Portal — Home', () => {
  test('TC-01-E2E-01 — signing in lands on the portal, and Team overview leads the rail', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('portal-owner');
    const org = await registerOrganization(request, adminEmail);

    await signInUi(page, adminEmail);

    await expect(page).toHaveURL(new RegExp(`/org/${org.orgId}/?$`));
    await expect(page.getByTestId('portal-greeting')).toBeVisible();

    // A testid proves presence, never position — the row that leads the rail is proven by
    // comparing its own box against the next row's, which every staff role always has.
    const portalRow = page.getByTestId('nav-portal');
    await expect(portalRow).toBeVisible();
    const peopleToggle = page.getByRole('button', { name: 'People', exact: true });
    await expect(peopleToggle).toBeVisible();
    const portalBox = await portalRow.boundingBox();
    const peopleBox = await peopleToggle.boundingBox();
    if (!portalBox || !peopleBox) throw new Error('nav-portal or the People toggle has no box');
    expect(portalBox.y, 'nav-portal is not first in the rail').toBeLessThan(peopleBox.y);

    await logoutUi(page);

    // A deep `?next` still wins over the portal default (REQ-01-001's own edge case).
    await page.goto(`/login?next=/org/${org.orgId}/members`);
    await page.getByTestId('login-email-input').fill(adminEmail);
    await page.getByTestId('login-password-input').fill(VALID.password);
    await page.getByTestId('login-submit-button').click();
    await page.waitForURL(`**/org/${org.orgId}/members`);
    await expect(page.getByTestId('members-search-input')).toBeVisible();
  });

  test('TC-01-E2E-02 — the personal half draws the month, the reserve, the holidays and the requests', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('portal-full');
    const org = await registerOrganization(request, adminEmail);
    const admin = await findMember(request, org.orgId, adminEmail);

    // Two requests raised on the admin by somebody else — a request cannot be both raised
    // and answered by the same membership.
    const colleagueEmail = uniqueEmail('colleague');
    await inviteAndAcceptViaApi(request, colleagueEmail, 'user');
    const topicId = await requestTopicIdViaApi(request, org.orgId);
    await createRequestOnMember(request, org.orgId, admin.id, 'VPN profile', { topicId });
    await createRequestOnMember(request, org.orgId, admin.id, 'Laptop replacement', { topicId });
    await login(request, adminEmail);

    const projectA = await createProjectViaApi(request, org.orgId, 'Aurora');
    const projectB = await createProjectViaApi(request, org.orgId, 'Borealis');
    const today = todayInZone();
    await createTimeEntryViaApi(request, org.orgId, { projectId: projectA.id, date: today, durationMinutes: 60 });
    await createTimeEntryViaApi(request, org.orgId, { projectId: projectB.id, date: today, durationMinutes: 90 });

    await configureFinancials(request, org.orgId, admin.id, {
      monthlySalary: 3000,
      clientHourlyRate: 40,
      vacationDaysPerYear: 20,
      currency: 'USD',
      isReservePercentManual: false,
    });
    await seedReserveCredit(request, adminEmail, 300);

    await setMemberCountryViaApi(request, org.orgId, admin.id, 'PL');
    await createHolidayViaApi(request, org.orgId, { name: 'Constitution Day', date: daysFromToday(20), countryCode: null });
    await createHolidayViaApi(request, org.orgId, { name: 'Independence Day', date: daysFromToday(40), countryCode: null });

    await signInUi(page, adminEmail);

    await expect(page.getByTestId('portal-month-total')).toHaveText(formatDurationHuman(150));
    await expect(page.getByTestId('portal-month-project-row')).toHaveCount(2);
    await expect(page.getByTestId('portal-timeoff-available')).toBeVisible();
    await expect(page.getByTestId('portal-holiday-row')).toHaveCount(2);
    await expect(page.getByTestId('portal-request-row')).toHaveCount(2);
  });

  test('TC-01-E2E-03 — a brand-new membership draws every empty state, and no zero beside a sentence', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('portal-empty');
    await registerOrganization(request, adminEmail);

    await signInUi(page, adminEmail);

    await expect(page.getByTestId('portal-month-empty')).toBeVisible();
    await expect(page.getByTestId('portal-month-total')).toHaveCount(0);
    await expect(page.getByTestId('portal-timeoff-figures')).toHaveCount(0);
    await expect(page.getByTestId('portal-timeoff-panel')).toBeVisible();
    await expect(page.getByTestId('portal-holidays-no-country')).toBeVisible();
    await expect(page.getByTestId('portal-requests-empty')).toBeVisible();
    await expect(page.getByTestId('portal-feed-entry')).toHaveCount(1);
    await expect(page.getByTestId('portal-feed-empty')).toHaveCount(0);
  });

  test('TC-01-E2E-04 — a vacancy entry opens onto its own page and nowhere else', async ({ page, request }) => {
    const adminEmail = uniqueEmail('portal-vacancy');
    const org = await registerOrganization(request, adminEmail);
    const description = 'We are looking for an engineer to lead the front end.';
    const vacancy = await createVacancy(request, org, { title: 'Senior React Engineer', description });

    const userEmail = uniqueEmail('portal-user');
    await inviteAndAcceptViaApi(request, userEmail, 'user');

    await signInUi(page, userEmail);

    const entryCard = page.getByTestId('portal-feed-entry').filter({ hasText: vacancy.title });
    await expect(entryCard).toBeVisible();
    await entryCard.click();

    await expect(page.getByTestId('portal-entry-title')).toBeVisible();
    await expect(page.getByTestId('portal-entry-title')).toHaveText(`A vacancy is open: ${vacancy.title}.`);
    await expect(page.getByTestId('portal-entry-body')).toHaveText(description);
    await expect(page.getByTestId('portal-entry-share')).toContainText(vacancy.publicSlug);

    // The vacancy's own screen answers this `user` the app's not-found — this page is the
    // only one that reached them (REQ-01-042's premise).
    await page.goto(`/org/${org.orgId}/hiring/vacancies/${vacancy.id}`);
    await expect(page.getByTestId('vacancy-detail')).toHaveCount(0);
    expect(await page.content()).not.toContain(vacancy.publicSlug);
  });

  test('TC-01-E2E-05 — Show earlier appends without disturbing what is already first', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('portal-page');
    const org = await registerOrganization(request, adminEmail);

    // 21 project-started entries + the admin's own member-joined = 22, one more than the
    // default page of 20 — enough for a first page, a second, and no third.
    for (let i = 1; i <= 21; i += 1) {
      await createProjectViaApi(request, org.orgId, `Runner ${i}`);
    }

    await signInUi(page, adminEmail);

    await expect(page.getByTestId('portal-feed-entry')).toHaveCount(20);
    const firstEntryTextBefore = await page.getByTestId('portal-feed-entry').first().innerText();

    await page.getByTestId('portal-feed-more').click();

    await expect(page.getByTestId('portal-feed-entry')).toHaveCount(22);
    const firstEntryTextAfter = await page.getByTestId('portal-feed-entry').first().innerText();
    expect(firstEntryTextAfter, 'the first entry changed when a later page was appended').toBe(
      firstEntryTextBefore,
    );
    await expect(page.getByTestId('portal-feed-more')).toHaveCount(0);
  });

  test('TC-01-E2E-06 — the settings link is admin-only, and the heading never moves for its absence', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('portal-roles');
    await registerOrganization(request, adminEmail);

    const managerEmail = uniqueEmail('portal-manager');
    await inviteAndAcceptViaApi(request, managerEmail, 'manager');
    await login(request, adminEmail);

    const userEmail = uniqueEmail('portal-plain-user');
    await inviteAndAcceptViaApi(request, userEmail, 'user');
    await login(request, adminEmail);

    const heading = page.getByRole('heading', { name: "What's new" });

    await signInUi(page, adminEmail);
    await expect(heading).toBeVisible();
    await expect(page.getByTestId('portal-feed-settings-link')).toBeVisible();
    const adminBox = await heading.boundingBox();

    await logoutUi(page);
    await signInUi(page, managerEmail);
    await expect(heading).toBeVisible();
    await expect(page.getByTestId('portal-feed-settings-link')).toHaveCount(0);
    const managerBox = await heading.boundingBox();

    await logoutUi(page);
    await signInUi(page, userEmail);
    await expect(heading).toBeVisible();
    await expect(page.getByTestId('portal-feed-settings-link')).toHaveCount(0);
    const userBox = await heading.boundingBox();

    if (!adminBox || !managerBox || !userBox) throw new Error("the What's new heading has no box");
    expect(Math.round(managerBox.x)).toBe(Math.round(adminBox.x));
    expect(Math.round(userBox.x)).toBe(Math.round(adminBox.x));
  });

  test('TC-01-E2E-07 — every group off draws every empty message exactly once, and neither group is named', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('portal-silent');
    const org = await registerOrganization(request, adminEmail);

    const settingsUrl = `${API}/api/organizations/${org.orgId}/portal/settings`;
    const saved = await request.put(settingsUrl, {
      data: { groups: { people: false, hiring: false, work: false } },
    });
    if (!saved.ok()) throw new Error(`Precondition failed: could not switch every group off (${saved.status()})`);

    const userEmail = uniqueEmail('portal-lonely');
    await inviteAndAcceptViaApi(request, userEmail, 'user');

    await signInUi(page, userEmail);
    await expect(page.getByTestId('portal-month-empty')).toBeVisible();

    await expectMessageOnce(page, PORTAL_MESSAGES.monthEmpty);
    await expectMessageOnce(page, PORTAL_MESSAGES.requestsEmpty);
    await expectMessageOnce(page, PORTAL_MESSAGES.noCountry);
    await expectMessageOnce(page, PORTAL_MESSAGES.feedEmptyBody);

    await expectMessageAbsent(page, 'Hiring');
    await expectMessageAbsent(page, 'Work');
  });

  test('TC-01-E2E-08 — the request title holds its left edge and the minutes cell its right, regardless of length', async ({
    page,
    request,
    browser,
  }) => {
    /** Seeds one organization whose project, holiday and request names are either long or short. */
    async function seedGeometryOrg(requestCtx: APIRequestContext, long: boolean): Promise<{ orgId: string; adminEmail: string }> {
      const adminEmail = uniqueEmail(long ? 'portal-geo-long' : 'portal-geo-short');
      const org = await registerOrganization(requestCtx, adminEmail);
      const admin = await findMember(requestCtx, org.orgId, adminEmail);

      const projectName = long ? 'P'.repeat(100) : 'Proj';
      const project = await createProjectViaApi(requestCtx, org.orgId, projectName);
      await createTimeEntryViaApi(requestCtx, org.orgId, {
        projectId: project.id,
        date: todayInZone(),
        durationMinutes: 90,
      });

      await setMemberCountryViaApi(requestCtx, org.orgId, admin.id, 'PL');
      const holidayName = long ? 'H'.repeat(80) : 'Holiday';
      await createHolidayViaApi(requestCtx, org.orgId, {
        name: holidayName,
        date: daysFromToday(30),
        countryCode: null,
      });

      const colleagueEmail = uniqueEmail('portal-geo-colleague');
      await inviteAndAcceptViaApi(requestCtx, colleagueEmail, 'user');
      const topicId = await requestTopicIdViaApi(requestCtx, org.orgId);
      const requestTitle = long ? 'R'.repeat(200) : 'Req';
      await createRequestOnMember(requestCtx, org.orgId, admin.id, requestTitle, { topicId });

      return { orgId: org.orgId, adminEmail };
    }

    const longCtx = request;
    const shortCtx = await apiContexts.newContext();
    try {
      const longOrg = await seedGeometryOrg(longCtx, true);
      const shortOrg = await seedGeometryOrg(shortCtx, false);

      // Two independent browser contexts: both admins must be signed in at once, which one
      // shared context (and so one cookie jar) could not hold.
      const shortContext = await browser.newContext();
      const shortPage = await shortContext.newPage();
      try {
        await signInUi(page, longOrg.adminEmail);
        await signInUi(shortPage, shortOrg.adminEmail);

        await expect(page.getByTestId('portal-request-row')).toHaveCount(1);
        await expect(shortPage.getByTestId('portal-request-row')).toHaveCount(1);

        await expectSharedEdge(
          [
            page.getByTestId('portal-request-row').first().locator('b'),
            shortPage.getByTestId('portal-request-row').first().locator('b'),
          ],
          'left',
        );
        await expectSharedEdge(
          [
            page.getByTestId('portal-month-project-row').first().locator('span').last(),
            shortPage.getByTestId('portal-month-project-row').first().locator('span').last(),
          ],
          'right',
        );

        for (const target of [page, shortPage]) {
          const [scrollWidth, clientWidth] = await target.evaluate(() => [
            document.documentElement.scrollWidth,
            document.documentElement.clientWidth,
          ]);
          expect(scrollWidth, 'the long content forced a horizontal scrollbar').toBeLessThanOrEqual(clientWidth);
        }
      } finally {
        await shortContext.close();
      }
    } finally {
      await shortCtx.dispose();
    }
  });

  test('TC-01-E2E-09 — switching a group off from the settings screen shrinks the feed by exactly that group', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('portal-settings');
    const org = await registerOrganization(request, adminEmail);

    const colleagueEmail = uniqueEmail('portal-settings-colleague');
    await inviteAndAcceptViaApi(request, colleagueEmail, 'user');
    await login(request, adminEmail);

    await createVacancy(request, org, { title: 'Staff Engineer' });
    const project = await createProjectViaApi(request, org.orgId, 'Nimbus');

    await signInUi(page, adminEmail);
    // The seeded member, vacancy and project all draw people/hiring/work entries, so the
    // feed is never empty here — waiting for the first entry is waiting for Q2 to answer.
    await expect(page.getByTestId('portal-feed-entry').first()).toBeVisible();
    const beforeCount = await page.getByTestId('portal-feed-entry').count();

    await page.getByTestId('portal-feed-settings-link').click();
    await expect(page.getByTestId('portal-settings-group-people')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('portal-settings-group-hiring')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('portal-settings-group-work')).toHaveAttribute('aria-checked', 'true');

    await page.getByTestId('portal-settings-group-work').click();
    // Registered before the click that triggers it — the same seam `requests.spec.ts`'s
    // `badgeFetch` uses, so the assertion below waits on the save actually having landed
    // rather than on the optimistic toggle the switch already drew.
    const saved = page.waitForResponse(
      (response) => response.url().includes('/portal/settings') && response.request().method() === 'PUT',
    );
    await page.getByTestId('portal-settings-save').click();
    await saved;
    await expect(page.getByTestId('portal-settings-group-work')).toHaveAttribute('aria-checked', 'false');

    await page.goto(`/org/${org.orgId}`);
    await expect(page.getByTestId('portal-feed-entry')).toHaveCount(beforeCount - 1);
    expect(await page.content()).not.toContain(project.name);

    await page.goto(`/org/${org.orgId}/settings/portal`);
    await expect(page.getByTestId('portal-settings-group-work')).toHaveAttribute('aria-checked', 'false');
  });
});
