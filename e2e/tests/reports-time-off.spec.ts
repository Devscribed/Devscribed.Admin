import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  API,
  VALID,
  clickNav,
  inviteAndAcceptViaApi,
  login,
  signupOrg,
  uniqueEmail,
} from './helpers';

/**
 * Spec reports/01 — Time Off.
 *
 * Two E2E cases cover the Time-Off-specific surfaces:
 *
 *  - **Manager runs Time Off with the Type filter**: seeds a holiday, opens
 *    the report, sees the `organization_wide` group, flips Type to
 *    "Vacation" and sees the group disappear, flips back to "All" and sees
 *    it return.
 *  - **Viewer sees only Time Off**: viewer holds ONLY `ViewMyTimeOff` (spec
 *    §Roles) — the landing shows one card, the screen renders My mode with
 *    no All/My toggle and no Members filter, and there is NO Export PDF
 *    button (viewer lacks `export-reports`).
 *
 * The T&A E2E already exercises the shared shell (columns picker,
 * PDF flow, etc.), so this file stays narrow.
 */

async function signInUi(page: Page, email: string, password: string = VALID.password): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL('**/members');
}

async function createHolidayViaApi(
  request: APIRequestContext,
  organizationId: string,
  body: { name: string; date: string; paidHours?: number; countryCode?: string | null },
): Promise<void> {
  const res = await request.post(`${API}/api/organizations/${organizationId}/holidays`, {
    data: { paidHours: 8, countryCode: null, ...body },
  });
  if (!res.ok()) {
    throw new Error(`Precondition failed: could not seed holiday ${body.name} (${res.status()})`);
  }
}

async function seedMember(
  request: APIRequestContext,
  adminEmail: string,
  organizationId: string,
  firstName: string,
  lastName: string,
  role: 'admin' | 'manager' | 'user' | 'viewer',
): Promise<{ email: string }> {
  await login(request, adminEmail);
  const email = uniqueEmail(firstName.toLowerCase());
  await inviteAndAcceptViaApi(request, email, role, { firstName, lastName });
  return { email };
}

test.describe('reports/01 — Time Off', () => {
  test('manager runs Time Off, Type filter narrows to the org-wide holiday group', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'TOCo', email: adminEmail });
    const manager = await seedMember(request, adminEmail, org.organizationId, 'Mel', 'Manager', 'manager');

    // Seed one global holiday inside our test range.
    await login(request, adminEmail);
    await createHolidayViaApi(request, org.organizationId, {
      name: 'Labor Day',
      date: '2026-09-07',
      countryCode: null,
    });

    await signInUi(page, manager.email);
    await clickNav(page, 'Reports', 'nav-reports');
    await page.waitForURL('**/reports');
    await page.getByTestId('reports-card-time-off').click();
    await page.waitForURL('**/reports/time-off**');
    await expect(page.getByTestId('reports-page-title')).toBeVisible();
    await expect(page.getByTestId('reports-loading-skeleton')).toHaveCount(0);

    // Navigate the picker to cover September so the seeded holiday lands
    // inside the range regardless of when the suite runs.
    await page.goto(
      `/org/${org.organizationId}/reports/time-off?startDate=2026-09-01&endDate=2026-09-30`,
    );
    await expect(page.getByTestId('reports-loading-skeleton')).toHaveCount(0);
    await expect(page.getByTestId('reports-group-organization_wide')).toBeVisible();
    await expect(page.getByText('Labor Day')).toBeVisible();

    // Flip Type to "Vacation" — the organization_wide group must disappear
    // (spec §Row filter — type).
    await page.getByTestId('reports-filter-type').click();
    await page.getByTestId('reports-filter-type-item-vacation').click();
    await expect(page.getByTestId('reports-loading-skeleton')).toHaveCount(0);
    await expect(page.getByTestId('reports-group-organization_wide')).toHaveCount(0);

    // Back to "All" — the holiday group comes back.
    await page.getByTestId('reports-filter-type').click();
    await page.getByTestId('reports-filter-type-item-all').click();
    await expect(page.getByTestId('reports-loading-skeleton')).toHaveCount(0);
    await expect(page.getByTestId('reports-group-organization_wide')).toBeVisible();
  });

  test('viewer sees only Time Off in Reports, opens My mode, has no All/My toggle and no Export PDF', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'ViewerTO', email: adminEmail });
    const viewer = await seedMember(request, adminEmail, org.organizationId, 'Vera', 'Viewer', 'viewer');

    await login(request, adminEmail);
    await createHolidayViaApi(request, org.organizationId, {
      name: 'National Day',
      date: '2026-09-07',
      countryCode: null,
    });

    await signInUi(page, viewer.email);
    await clickNav(page, 'Reports', 'nav-reports');
    await page.waitForURL('**/reports');

    // Landing: viewer sees ONLY the Time Off card (spec §Roles — viewer holds
    // only ViewMyTimeOff across the reports area).
    await expect(page.getByTestId('reports-card-time-off')).toBeVisible();
    await expect(page.getByTestId('reports-card-amounts-owed')).toHaveCount(0);
    await expect(page.getByTestId('reports-card-time-and-activity')).toHaveCount(0);

    await page.getByTestId('reports-card-time-off').click();
    await page.waitForURL('**/reports/time-off**');
    await page.goto(
      `/org/${org.organizationId}/reports/time-off?startDate=2026-09-01&endDate=2026-09-30`,
    );
    await expect(page.getByTestId('reports-loading-skeleton')).toHaveCount(0);

    // No All/My toggle (viewer holds only ViewMyTimeOff, not ViewTimeOff).
    await expect(page.getByTestId('reports-owner-toggle')).toHaveCount(0);
    // No Members filter (My variant hides it).
    await expect(page.getByTestId('reports-filter-members')).toHaveCount(0);
    // No Export PDF button (viewer lacks `export-reports`).
    await expect(page.getByTestId('reports-export-pdf-btn')).toHaveCount(0);

    // The organization-wide holiday group is visible (viewer's country is
    // null, so only global `countryCode: null` holidays match — which is
    // exactly what we seeded).
    await expect(page.getByTestId('reports-group-organization_wide')).toBeVisible();
    await expect(page.getByText('National Day')).toBeVisible();
  });
});
