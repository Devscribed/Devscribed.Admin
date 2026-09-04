import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  VALID,
  assignProjectMembersViaApi,
  configureFinancials,
  createProjectViaApi,
  createTimeEntryViaApi,
  findMember,
  openNavSection,
  inviteAndAcceptViaApi,
  login,
  signupOrg,
  uniqueEmail,
} from './helpers';

/**
 * Spec reports/01 — Amounts Owed.
 *
 * TC-01-E2E-02 (from spec §Test Cases · E2E): a regular user opens their My
 * Amounts Owed report. The sidebar shows only the Amounts Owed sub-row (the
 * user holds only one View* capability across the reports area), the report
 * screen renders in My mode with no All/My toggle and no Members filter, and
 * only the caller's rows are visible. The other two E2E cases (TC-01-E2E-01
 * manager PDF, TC-01-E2E-08 vacation frozen amount, etc.) belong to later
 * vertical slices in the reports area — this file covers only the case whose
 * backend and frontend landed together in the first slice.
 */

async function signInUi(page: Page, email: string, password: string = VALID.password): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL('**/members');
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Seed a member (via invite/accept) and set their client hourly rate + monthly salary. */
async function seedMemberWithFinancials(
  request: APIRequestContext,
  adminEmail: string,
  organizationId: string,
  firstName: string,
  lastName: string,
  { monthlySalary, clientHourlyRate }: { monthlySalary: number; clientHourlyRate: number },
): Promise<{ email: string; memberId: string }> {
  await login(request, adminEmail);
  const email = uniqueEmail(firstName.toLowerCase());
  await inviteAndAcceptViaApi(request, email, 'user', { firstName, lastName });
  await login(request, adminEmail);
  const member = await findMember(request, organizationId, email);
  await configureFinancials(request, organizationId, member.id, {
    monthlySalary,
    clientHourlyRate,
    vacationDaysPerYear: 20,
    currency: 'USD',
    isReservePercentManual: false,
  });
  return { email, memberId: member.id };
}

test.describe('reports/01 — Amounts Owed', () => {
  // TC-01-E2E-02: User opens My Amounts Owed — restricted-role flow.
  test('user sees only Amounts Owed in the sidebar, opens My mode, sees only own rows', async ({
    page,
    request,
  }) => {
    // — Seed —
    const adminEmail = uniqueEmail('admin');
    const org = await signupOrg(request, { orgName: 'ReportsCo', email: adminEmail });

    // Alice: the caller under test.
    const alice = await seedMemberWithFinancials(request, adminEmail, org.organizationId, 'Alice', 'Kaminski', {
      monthlySalary: 8400,
      clientHourlyRate: 50,
    });
    // Bob: another regular user whose rows must NOT leak into Alice's `/my` report.
    const bob = await seedMemberWithFinancials(request, adminEmail, org.organizationId, 'Bob', 'Marley', {
      monthlySalary: 6720,
      clientHourlyRate: 40,
    });

    // Admin owns a project both members are assigned to.
    await login(request, adminEmail);
    const project = await createProjectViaApi(request, org.organizationId, 'Website Redesign');
    await assignProjectMembersViaApi(request, org.organizationId, project.id, [alice.memberId, bob.memberId]);

    // Two billable entries today: Alice 4h, Bob 3h. Only Alice's should show in her /my.
    const today = todayISO();
    await login(request, alice.email);
    await createTimeEntryViaApi(request, org.organizationId, {
      membershipId: alice.memberId,
      projectId: project.id,
      date: today,
      durationMinutes: 240,
      task: 'Design review',
      billable: true,
    });
    await login(request, bob.email);
    await createTimeEntryViaApi(request, org.organizationId, {
      membershipId: bob.memberId,
      projectId: project.id,
      date: today,
      durationMinutes: 180,
      task: 'API wiring',
      billable: true,
    });

    // — Act: log in as Alice and open Amounts Owed —
    await signInUi(page, alice.email);

    // Sidebar: the "Reports" group opens and carries its "All reports" row, which is
    // `nav-reports` (spec §Sidebar integration, as amended by the design-system merge's E4 —
    // the group and its sub-rows are the system's). The three reports are still landing cards.
    await openNavSection(page, 'Reports');
    await expect(page.getByTestId('nav-reports')).toBeVisible();
    await page.getByTestId('nav-reports').click();
    await page.waitForURL('**/reports');

    // Landing: the Amounts Owed card is present (user holds ViewMyAmountsOwed).
    await expect(page.getByTestId('reports-card-amounts-owed')).toBeVisible();
    await page.getByTestId('reports-card-amounts-owed').click();
    await page.waitForURL('**/reports/amounts-owed');

    // The report shell renders.
    await expect(page.getByTestId('reports-page')).toBeVisible();
    await expect(page.getByTestId('reports-page-title')).toBeVisible();

    // My-only user must NOT see the All/My segmented control (holds a single
    // View* pair — ViewMyAmountsOwed only, per spec §Roles & Permission Matrix).
    await expect(page.getByTestId('reports-owner-toggle')).toHaveCount(0);

    // The Members filter is hidden on the My variant (spec §Screens · Report
    // screen — My variant: "Members filter hidden").
    await expect(page.getByTestId('reports-filter-members')).toHaveCount(0);

    // Table renders (loading skeleton has resolved) and only Alice's row shows.
    await expect(page.getByTestId('reports-loading-skeleton')).toHaveCount(0);
    await expect(page.getByTestId('reports-table')).toBeVisible();
    const tableText = await page.getByTestId('reports-table').innerText();
    expect(tableText).toContain('Alice');
    expect(tableText).not.toContain('Bob');
  });
});
