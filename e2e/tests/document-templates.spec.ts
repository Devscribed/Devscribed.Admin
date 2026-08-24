import { expect, test } from '@playwright/test';
import {
  createEnvelope,
  createTemplate,
  registerOrganization,
  setMembershipRole,
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
    await expect(page.getByTestId('template-save-state')).toHaveText('Saved', SAVED);
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

  test('TC-01-E2E-02: Publish blocked by an undefined placeholder', async ({ page, request }) => {
    const email = uniqueEmail('tpl-unknown');
    const { orgId } = await registerOrganization(request, email);
    const templateId = await createTemplate(request, orgId, { name: 'Client agreement US' });

    await signIn(page, email);
    await page.goto(`${TEMPLATES(orgId)}/${templateId}`);

    await page.getByTestId('template-body-editor').fill('<p>AGREEMENT No. {{contract_number}}</p>');
    await expect(page.getByTestId('template-save-state')).toHaveText('Saved', SAVED);

    await page.getByTestId('template-publish-btn').click();

    const banner = page.getByTestId('template-validation-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('contract_number');
    // Nothing was published, so the template is still on its first, unpublished version.
    await expect(page.getByTestId('template-version-summary')).toHaveText('Draft v1');

    await page.goto(TEMPLATES(orgId));
    await expect(page.getByTestId(`template-status-${templateId}`)).toHaveText('Draft');
  });

  test('TC-01-E2E-03: Script tags are stripped and stay stripped', async ({ page, request }) => {
    const email = uniqueEmail('tpl-script');
    const { orgId } = await registerOrganization(request, email);
    const templateId = await createTemplate(request, orgId, { name: 'Mutual NDA' });

    await signIn(page, email);
    await page.goto(`${TEMPLATES(orgId)}/${templateId}`);

    await page
      .getByTestId('template-body-editor')
      .fill('<script>window.__x=1</script><p>Clause 1</p>');
    await expect(page.getByTestId('template-save-state')).toHaveText('Saved', SAVED);

    await page.reload();

    const editor = page.getByTestId('template-body-editor');
    await expect(editor).toHaveValue(/Clause 1/);
    await expect(editor).not.toHaveValue(/script/);

    // Sanitization happened on write, so nothing can have executed — but the editor is a
    // textarea and the preview is sandboxed, and this is the assertion that says so
    // without trusting either of those facts.
    expect(await page.evaluate(() => (window as unknown as { __x?: unknown }).__x)).toBeUndefined();
  });

  test('TC-01-E2E-04: Editing a published template does not disturb the published version', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('tpl-version');
    const { orgId } = await registerOrganization(request, email);
    const templateId = await createTemplate(request, orgId, {
      name: 'Contractor agreement US',
      bodyHtml: '<p>AGREEMENT with {{contractor_full_name}}</p>',
      fields: [{ key: 'contractor_full_name', label: 'Full name', required: true }],
      publish: true,
    });

    await signIn(page, email);
    await page.goto(`${TEMPLATES(orgId)}/${templateId}`);
    await expect(page.getByTestId('template-version-summary')).toHaveText('v1 published');

    // A published version is frozen, so the editor asks before spawning draft v2 — the
    // "Edit" affordance from the spec's States table.
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByTestId('template-body-editor').fill('<p>REVISED for {{contractor_full_name}}</p>');
    await expect(page.getByTestId('template-save-state')).toHaveText('Saved', SAVED);

    await expect(page.getByTestId('template-version-summary')).toHaveText('v1 published · v2 draft');

    await page.reload();
    await expect(page.getByTestId('template-version-summary')).toHaveText('v1 published · v2 draft');
  });

  test('TC-01-E2E-05: Delete is blocked for a used template', async ({ page, request }) => {
    const email = uniqueEmail('tpl-inuse');
    const { orgId } = await registerOrganization(request, email);
    const templateId = await createTemplate(request, orgId, {
      name: 'Used agreement',
      bodyHtml: '<p>AGREEMENT with {{contractor_full_name}}</p>',
      fields: [{ key: 'contractor_full_name', label: 'Full name', required: true }],
      publish: true,
    });
    // One envelope is what makes the template "in use" (spec 02). A draft is enough —
    // the count the delete refusal reports is of envelopes pinned to a version of this
    // template, whatever became of them afterwards.
    await createEnvelope(request, orgId, {
      templateId,
      fieldValues: { contractor_full_name: 'Alex Kaminski' },
      signers: [
        { name: 'Ivan Demchenko', email: 'ivan@devscribed.io' },
        { name: 'Alex Kaminski', email: 'alex@example.com' },
      ],
    });

    await signIn(page, email);
    await page.goto(TEMPLATES(orgId));

    await page.getByTestId(`template-actions-${templateId}`).click();
    await page.getByTestId('template-delete-btn').click();

    // The DS `Modal` renders no `role="dialog"`, so the panel is located by its own copy.
    const modal = page.getByText(/cannot be deleted/);
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('1 documents');

    await page.getByTestId('template-archive-btn').click();
    await expect(page.getByTestId('toast-template-archived')).toHaveText('Template archived');
    await expect(page.getByTestId(`template-status-${templateId}`)).toHaveText('Archived');
  });

  test('TC-01-E2E-06: Manager sees templates read-only', async ({ page, request }) => {
    const email = uniqueEmail('tpl-manager');
    const { orgId } = await registerOrganization(request, email);
    // Seeded while the account is still an admin — `ManageDocumentTemplates` is what the
    // test is about losing, so it has to be spent before it is taken away.
    const templateId = await createTemplate(request, orgId, {
      name: 'Contractor agreement BY',
      bodyHtml: '<p>AGREEMENT with {{contractor_full_name}}</p>',
      fields: [{ key: 'contractor_full_name', label: 'Full name', required: true }],
      publish: true,
    });
    await setMembershipRole(request, email, 'manager');

    await signIn(page, email);
    await page.goto(TEMPLATES(orgId));

    await expect(page.getByTestId('templates-table')).toBeVisible();
    await expect(page.getByTestId(`template-row-${templateId}`)).toBeVisible();
    await expect(page.getByTestId('template-new-btn')).toHaveCount(0);

    await page.goto(`${TEMPLATES(orgId)}/${templateId}`);
    await expect(page.getByTestId('template-editor')).toBeVisible();
    await expect(page.getByTestId('template-publish-btn')).toHaveCount(0);
    await expect(page.getByTestId('template-archive-btn')).toHaveCount(0);
    await expect(page.getByTestId('template-delete-btn')).toHaveCount(0);

    // Read-only means the body cannot be typed into, not merely that it looks inert.
    await expect(page.getByTestId('template-body-editor')).toHaveAttribute('readonly', '');

    await page.getByTestId('template-tab-fields').click();
    await expect(page.getByTestId('template-fields-list')).toBeVisible();
    await expect(page.getByTestId('template-field-add-btn')).toHaveCount(0);
  });

  test('TC-01-E2E-07: Regular user has no access', async ({ page, request }) => {
    const email = uniqueEmail('tpl-user');
    const { orgId } = await registerOrganization(request, email);
    const templateId = await createTemplate(request, orgId, {
      name: 'Contractor agreement BY',
      bodyHtml: '<p>AGREEMENT with {{contractor_full_name}}</p>',
      fields: [{ key: 'contractor_full_name', label: 'Full name', required: true }],
      publish: true,
    });
    await setMembershipRole(request, email, 'user');

    await signIn(page, email);

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

  test('TC-01-E2E-08: Preview renders with sample values', async ({ page, request }) => {
    const email = uniqueEmail('tpl-preview');
    const { orgId } = await registerOrganization(request, email);
    const templateId = await createTemplate(request, orgId, {
      name: 'Contractor agreement BY',
      bodyHtml:
        '<p>AGREEMENT No. {{contract_number}} with {{contractor_full_name}}</p>',
      fields: [
        { key: 'contract_number', label: 'Contract number' },
        { key: 'contractor_full_name', label: 'Full name', required: true },
      ],
      publish: true,
    });

    await signIn(page, email);
    await page.goto(`${TEMPLATES(orgId)}/${templateId}`);

    await page.getByTestId('template-preview-btn').click();
    await expect(page.getByTestId('template-preview-modal')).toBeVisible();

    // The frame is `sandbox=""` — no `allow-same-origin` — so its document is opaque to
    // the test as it is to the page: `frameLocator` cannot reach inside it. The rendered
    // HTML is asserted where it is readable, on the `srcdoc` attribute that produced it.
    const srcdoc = await page.getByTestId('template-preview-frame').getAttribute('srcdoc');
    expect(srcdoc).toContain('[Full name]');
    expect(srcdoc).toContain('[Contract number]');
    // Synthetic values only: the signed-in admin's own name must not appear.
    expect(srcdoc).not.toContain('Pat Owner');
    // Both signer roles get a signature block, in order.
    expect(srcdoc).toContain('Company');
    expect(srcdoc).toContain('Contractor');
    // Matched on the attribute, not the bare word: the preview carries a `.signature-block`
    // CSS rule too, and counting that would report three blocks for two signers.
    expect(srcdoc?.match(/class="signature-block"/g) ?? []).toHaveLength(2);

    await page.getByTestId('template-preview-close-btn').click();
    await expect(page.getByTestId('template-preview-modal')).toHaveCount(0);
  });
});
