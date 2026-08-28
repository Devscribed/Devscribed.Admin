import { expect, test, type Page } from './fixtures';
import {
  addMemberToOrganization,
  createTemplate,
  registerOrganization,
  signIn,
  uniqueEmail,
} from './helpers';

/**
 * Spec 01 — Document Templates, the E2E row of its test matrix.
 *
 * Every test mints its own account, and signup creates a fresh organization with it, so
 * the templates one test writes are invisible to the next. That is the whole isolation
 * strategy: no shared fixture, no cleanup, and no ordering between the cases below.
 *
 * Preconditions are set up through the API rather than through the editor. Driving the
 * UI to reach a published template would make five of these tests fail whenever TC-01
 * fails, and only TC-01 is actually about that flow.
 */

const TEMPLATES = (orgId: string) => `/org/${orgId}/documents/templates`;

/** The autosave debounce is 2 s, so the indicator needs a window wider than that. */
const SAVED = { timeout: 15_000 };

/**
 * Waits for an edit to have actually reached the server.
 *
 * Not `save-state` reading "Saved": the editor *starts* in that state, because on load
 * there is nothing to save. Waiting for it therefore matches the instant the assertion
 * runs and proves nothing — a race that was invisible while the suite ran one test at a
 * time and surfaced the moment it ran four.
 *
 * The success toast is the honest signal: it is shown by the save itself, only after the
 * response comes back. The indicator settling on "Saved" afterwards is then a real
 * transition rather than the initial value.
 */
async function savedToServer(page: Page): Promise<void> {
  await expect(page.getByTestId('toast-template-saved')).toBeVisible(SAVED);
  await expect(page.getByTestId('template-save-state')).toHaveText('Saved', SAVED);
}

test.describe('Document templates', () => {
  test('TC-01-E2E-01: Admin creates and publishes a template', async ({ page, request }) => {
    const email = uniqueEmail('tpl-admin');
    const { orgId } = await registerOrganization(request, email);

    await signIn(page, email);
    await page.goto(TEMPLATES(orgId));

    await expect(page.getByTestId('templates-page')).toBeVisible();
    await expect(page.getByTestId('template-empty')).toBeVisible();

    await page.getByTestId('template-new-btn').click();
    await expect(page.getByTestId('template-new-modal')).toBeVisible();
    await page.getByTestId('template-name-input').fill('Contractor agreement BY');
    await page.getByTestId('template-new-submit-btn').click();

    await expect(page.getByTestId('template-editor')).toBeVisible();
    await expect(page.getByTestId('template-version-summary')).toHaveText('Draft v1');

    await page
      .getByTestId('template-body-editor')
      .fill('<p>AGREEMENT with {{contractor_full_name}}</p>');

    // Switching tabs saves explicitly, so the field is added on top of a stored body.
    await page.getByTestId('template-tab-fields').click();
    await page.getByTestId('template-field-add-btn').click();
    await expect(page.getByTestId('template-field-modal')).toBeVisible();
    await page.getByTestId('template-field-key-input').fill('contractor_full_name');
    await page.getByTestId('template-field-label-input').fill('Full name');
    await page.getByTestId('template-field-required-checkbox').click();
    await page.getByTestId('template-field-save-btn').click();
    await expect(page.getByTestId('template-field-row-contractor_full_name')).toBeVisible();

    await page.getByTestId('template-tab-signers').click();
    await page.getByTestId('template-signer-key-1').fill('company');
    await page.getByTestId('template-signer-label-1').fill('Company');
    await page.getByTestId('template-signer-key-2').fill('contractor');
    await page.getByTestId('template-signer-label-2').fill('Contractor');

    // Publish is guarded while a save is in flight, so the test waits for the same
    // signal an author would: the indicator settling on "Saved".
    await savedToServer(page);
    await page.getByTestId('template-publish-btn').click();

    await expect(page.getByTestId('toast-template-published')).toHaveText('Template published');
    await expect(page.getByTestId('template-version-summary')).toHaveText('v1 published');

    const templateId = page.url().split('/').pop()!;
    await page.goto(TEMPLATES(orgId));
    const row = page.getByTestId(`template-row-${templateId}`);
    await expect(row).toBeVisible();
    await expect(page.getByTestId(`template-status-${templateId}`)).toHaveText('Published');
    await expect(row).toContainText('v1');
  });

  test('TC-01-E2E-07: Regular user has no access', async ({ page, request }) => {
    const adminEmail = uniqueEmail('tpl-admin');
    const { orgId } = await registerOrganization(request, adminEmail);
    const templateId = await createTemplate(request, orgId, {
      name: 'Contractor agreement BY',
      bodyHtml: '<p>AGREEMENT with {{contractor_full_name}}</p>',
      fields: [{ key: 'contractor_full_name', label: 'Full name', required: true }],
      publish: true,
    });

    // Invited as a plain user: a second admin would let the zero-admin guard pass silently,
    // and this case is about what a user without template capabilities can reach.
    const member = await addMemberToOrganization(request, orgId, {
      firstName: 'Ulad',
      lastName: 'User',
    });

    await signIn(page, member.email);

    // No dead controls: the Documents group is not drawn for a role that would only get
    // a 404 from the route behind it.
    await expect(page.getByTestId('app-sidebar')).toBeVisible();
    await expect(page.getByTestId('nav-documents')).toHaveCount(0);

    await page.goto(TEMPLATES(orgId));
    await expect(page.getByText('This page could not be found')).toBeVisible();
    await expect(page.getByTestId('templates-page')).toHaveCount(0);
    await expect(page.getByTestId('templates-table')).toHaveCount(0);
    expect(await page.content()).not.toContain('Contractor agreement BY');

    // And typing the editor's address directly is the same wall.
    await page.goto(`${TEMPLATES(orgId)}/${templateId}`);
    await expect(page.getByTestId('template-editor')).toHaveCount(0);
  });
});
