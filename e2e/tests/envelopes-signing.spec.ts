import { expect, test, type APIRequestContext, type Browser, type Page } from './fixtures';
import {
  API,
  createEnvelope,
  createTemplate,
  registerOrganization,
  signIn,
  signingLinkFor,
  uniqueEmail,
  waitForSignedPdf,
} from './helpers';

/**
 * Spec 02 — Envelopes & Signing, the E2E row of its test matrix.
 *
 * The isolation strategy is spec 01's, unchanged: every test mints its own account, and
 * signup creates a fresh organization with it, so no envelope one test writes is visible
 * to the next and the cases have no ordering between them.
 *
 * Two rules specific to this area:
 *
 *  - **Signing links are opened in a fresh browser context, never in the admin's page.**
 *    The signing surface is session-less by design (requirement 16) and authorized solely
 *    by its token. Opening a link in the tab that already holds an admin cookie would
 *    prove nothing about the surface a real counterparty sees.
 *  - **Invitations are read out of the mail sink**, `GET /api/test/mail/latest`, which is
 *    the closest a test gets to opening the email. No test reaches into the database for a
 *    token, and since the expiry case moved to the integration suite there is no direct
 *    write left here at all.
 */

const DOCUMENTS = (orgId: string) => `/org/${orgId}/documents`;

/** The smallest template that exercises both ownerships: two sender fields, one signer's. */
const FIELDS = [
  { key: 'full_name', label: 'Full name', required: true, filledBy: 'sender', order: 1 },
  { key: 'contractor_tax_id', label: 'Tax id', required: true, filledBy: 'sender', order: 2 },
  {
    key: 'contractor_bank',
    label: 'Bank details',
    type: 'multiline',
    required: true,
    filledBy: 'signer:contractor',
    order: 3,
  },
];

const BODY =
  '<p>AGREEMENT with {{full_name}}, tax id {{contractor_tax_id}}.</p>' +
  '<p>Bank details: {{contractor_bank}}</p>';

const SENDER_VALUES = { full_name: 'Alex Kaminski', contractor_tax_id: '191234567' };

const BANK = 'IBAN BY13 ALFA 3014 0000 0100 0000 0000';

interface Fixture {
  orgId: string;
  adminEmail: string;
  templateId: string;
  envelopeId: string;
  signer1: string;
  signer2: string;
}

/**
 * Registers an organization, publishes a template, and builds one envelope — all through
 * the API, because only TC-02-E2E-02 drives that flow through the screens, and it builds its
 * own envelope on the way to signing it.
 */
async function seed(
  request: APIRequestContext,
  prefix: string,
  options: { send?: boolean; body?: string; fields?: typeof FIELDS; values?: Record<string, string> } = {},
): Promise<Fixture> {
  const adminEmail = uniqueEmail(prefix);
  const { orgId } = await registerOrganization(request, adminEmail, 'Devscribed LLC');
  const templateId = await createTemplate(request, orgId, {
    name: 'Contractor agreement BY',
    bodyHtml: options.body ?? BODY,
    fields: options.fields ?? FIELDS,
    publish: true,
  });

  const signer1 = uniqueEmail(`${prefix}-company`);
  const signer2 = uniqueEmail(`${prefix}-contractor`);
  const envelope = await createEnvelope(request, orgId, {
    templateId,
    title: 'Contractor agreement — A. Kaminski',
    fieldValues: options.values ?? SENDER_VALUES,
    signers: [
      { name: 'Ivan Demchenko', email: signer1 },
      { name: 'Alex Kaminski', email: signer2 },
    ],
    send: options.send ?? true,
  });

  return { orgId, adminEmail, templateId, envelopeId: envelope.id, signer1, signer2 };
}

/** Opens a signing link the way a counterparty does: a new context, no cookies at all. */
async function openSigningLink(browser: Browser, link: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(link);
  return page;
}

/**
 * Puts real ink on the canvas with real pointer input. The API rejects a fully
 * transparent PNG and is right to (requirement 22), so a synthetic data URI would test
 * the assertion rather than the control — and the stroke deliberately crosses most of the
 * pad, which is what catches a canvas whose backing store is narrower than its box.
 */
async function drawSignature(page: Page): Promise<void> {
  const canvas = page.getByTestId('signing-signature-canvas');
  await expect(canvas).toBeVisible();
  // The document frame is 55vh, so the pad starts below the fold — and `page.mouse` works
  // in viewport coordinates, so an unscrolled box would put every stroke outside the
  // window and leave the canvas blank.
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The signature canvas has no box to draw on');

  await page.mouse.move(box.x + 20, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.2, { steps: 12 });
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.8, { steps: 12 });
  await page.mouse.move(box.x + box.width - 20, box.y + box.height * 0.35, { steps: 12 });
  await page.mouse.up();
}

/** The envelope as the API reports it — used to assert on state the screens summarize. */
async function readEnvelope(
  request: APIRequestContext,
  orgId: string,
  envelopeId: string,
): Promise<{
  status: string;
  signers: Array<{ order: number; status: string; declineReason: string | null }>;
}> {
  const response = await request.get(`${API}/api/organizations/${orgId}/envelopes/${envelopeId}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

test.describe('Envelopes and signing', () => {

  test('TC-02-E2E-02: Full two-party signing to completion', async ({
    browser,
    page,
    request,
  }) => {
    const fixture = await seed(request, 'env-sign');

    /* ---- signer 1: drawn signature, consent enforced before it counts ---- */

    const link1 = await signingLinkFor(request, fixture.signer1);
    const signer1Page = await openSigningLink(browser, link1);

    await expect(signer1Page.getByTestId('signing-page')).toBeVisible();
    await expect(signer1Page.getByTestId('signing-document-frame')).toBeVisible();

    // The frame is `sandbox=""` — no `allow-scripts`, no `allow-same-origin` — so its
    // document is as opaque to the test as it is to the page and `frameLocator` cannot
    // reach inside. The rendered document is asserted where it is readable: on the
    // `srcdoc` attribute that produced it, exactly as spec 01's preview test does.
    const srcdoc = await signer1Page.getByTestId('signing-document-frame').getAttribute('srcdoc');
    expect(srcdoc).toContain(SENDER_VALUES.full_name);
    expect(srcdoc).toContain(SENDER_VALUES.contractor_tax_id);

    // Requirement 19 — sender values are part of the document, never an input, and the
    // only fields offered are the ones this signer owns. Signer 1 owns none.
    await expect(signer1Page.getByTestId('signing-fields-form')).toHaveCount(0);
    await expect(signer1Page.getByTestId('signing-field-full_name')).toHaveCount(0);
    await expect(signer1Page.getByTestId('signing-field-contractor_bank')).toHaveCount(0);

    await drawSignature(signer1Page);

    // Requirement 21 — consent is a gate, and the button is never disabled for it:
    // clicking is how the signer learns what is missing.
    await signer1Page.getByTestId('signing-submit-btn').click();
    await expect(signer1Page.getByTestId('signing-consent-error')).toHaveText(
      'You must agree to sign electronically',
    );
    await expect(signer1Page.getByTestId('signing-state-signed')).toHaveCount(0);
    // Nothing was submitted — asserted on the server's copy, not on the page's own state.
    expect((await readEnvelope(request, fixture.orgId, fixture.envelopeId)).status).toBe('sent');

    await signer1Page.getByTestId('signing-consent-checkbox').click();
    await signer1Page.getByTestId('signing-submit-btn').click();

    await expect(signer1Page.getByTestId('toast-signing-signed')).toHaveText(
      'Thank you. Your signature has been recorded.',
    );
    await expect(signer1Page.getByTestId('signing-state-signed')).toContainText('You signed this');
    await signer1Page.context().close();

    /* ---- signer 2: their own field, a typed signature ---- */

    const link2 = await signingLinkFor(request, fixture.signer2);
    expect(link2).not.toBe(link1);
    const signer2Page = await openSigningLink(browser, link2);

    await expect(signer2Page.getByTestId('signing-fields-form')).toBeVisible();
    await signer2Page.getByTestId('signing-field-contractor_bank').fill(BANK);

    await signer2Page.getByTestId('signing-signature-mode-typed').click();
    await signer2Page.getByTestId('signing-signature-typed-input').fill('Alex Kaminski');
    await signer2Page.getByTestId('signing-consent-checkbox').click();
    await signer2Page.getByTestId('signing-submit-btn').click();

    await expect(signer2Page.getByTestId('signing-state-signed')).toBeVisible();

    // The final render is enqueued after the signing transaction commits, so the download
    // appears on the next read of the link rather than in the response that signed it.
    await waitForSignedPdf(request, fixture.orgId, fixture.envelopeId);
    await signer2Page.reload();
    await expect(signer2Page.getByTestId('signing-download-btn')).toBeVisible();
    await signer2Page.context().close();

    /* ---- and the admin's view of the same envelope ---- */

    await signIn(page, fixture.adminEmail);
    await page.goto(`${DOCUMENTS(fixture.orgId)}/${fixture.envelopeId}`);
    await expect(page.getByTestId('envelope-status')).toHaveText('Completed');

    await page.getByTestId('envelope-tab-signers').click();
    await expect(page.getByTestId('envelope-signer-status-1')).toHaveText('Signed');
    await expect(page.getByTestId('envelope-signer-status-2')).toHaveText('Signed');
  });
});
