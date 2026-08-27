import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import {
  API,
  addMemberToOrganization,
  createEnvelope,
  createTemplate,
  expireEnvelope,
  latestMail,
  registerOrganization,
  setMembershipRole,
  signIn,
  signViaApi,
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
 *    token; the one direct write in the suite is the expiry in TC-02-E2E-07, and it says
 *    why at the call site.
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
 * the API, because only TC-02-E2E-01 is about driving that flow through the screens.
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
  test('TC-02-E2E-01: Admin creates and sends a document', async ({ page, request }) => {
    const adminEmail = uniqueEmail('env-create');
    const { orgId } = await registerOrganization(request, adminEmail, 'Devscribed LLC');
    await createTemplate(request, orgId, {
      name: 'Contractor agreement BY',
      bodyHtml: BODY,
      fields: FIELDS,
      publish: true,
    });
    const signer1 = uniqueEmail('env-create-company');
    const signer2 = uniqueEmail('env-create-contractor');

    await signIn(page, adminEmail);
    await page.goto(DOCUMENTS(orgId));

    await expect(page.getByTestId('documents-page')).toBeVisible();
    await expect(page.getByTestId('envelope-empty')).toBeVisible();

    await page.getByTestId('envelope-new-btn').click();

    // The DS `Select` is a button plus a popover, not a native <select>. Its options carry
    // `role="option"` inside a `role="listbox"` panel portalled to `document.body`.
    await page.getByTestId('envelope-template-select').click();
    await page.getByRole('option', { name: 'Contractor agreement BY (v1)' }).click();

    await expect(page.getByTestId('envelope-fill-form')).toBeVisible();
    await expect(page.getByTestId('envelope-field-full_name')).toBeVisible();
    await expect(page.getByTestId('envelope-field-contractor_tax_id')).toBeVisible();

    // The signer's field is previewed, never offered: it is not the sender's to fill.
    const preview = page.getByTestId('envelope-signer-fields-preview');
    await expect(preview).toContainText('Bank details');
    await expect(page.getByTestId('envelope-field-contractor_bank')).toHaveCount(0);

    await page.getByTestId('envelope-field-full_name').fill(SENDER_VALUES.full_name);
    await page.getByTestId('envelope-field-contractor_tax_id').fill(SENDER_VALUES.contractor_tax_id);
    await page.getByTestId('envelope-title-input').fill('Contractor agreement — A. Kaminski');
    await page.getByTestId('envelope-signer-name-1').fill('Ivan Demchenko');
    await page.getByTestId('envelope-signer-email-1').fill(signer1);
    await page.getByTestId('envelope-signer-name-2').fill('Alex Kaminski');
    await page.getByTestId('envelope-signer-email-2').fill(signer2);

    await page.getByTestId('envelope-send-btn').click();

    await expect(page.getByTestId('toast-envelope-sent')).toHaveText('Sent for signature');
    await page.waitForURL(/\/documents\/[0-9a-f-]{36}/);
    await expect(page.getByTestId('envelope-status')).toHaveText('Sent');

    await page.getByTestId('envelope-tab-signers').click();
    await expect(page.getByTestId('envelope-signer-status-1')).toHaveText('Notified');
    // Requirement 14 — signing is sequential, so signer 2 has been told nothing yet.
    await expect(page.getByTestId('envelope-signer-status-2')).toHaveText('Pending');
    expect(await latestMail(request, signer2, 'signing_invitation')).toBeNull();

    await page.getByTestId('envelope-tab-document').click();
    await expect(page.getByTestId('envelope-fill-form')).toBeVisible();
    await expect(page.getByTestId('envelope-title-input')).toBeDisabled();
    await expect(page.getByTestId('envelope-field-full_name')).toBeDisabled();
    await expect(page.getByTestId('envelope-send-btn')).toHaveCount(0);
  });

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

  test('TC-02-E2E-03: The second link does not exist before the first signature', async ({
    request,
  }) => {
    const fixture = await seed(request, 'env-turn');

    // Requirement 14 — a token for signer 2 is issued the moment signer 1 signs, and not
    // one moment earlier. Before that there is nothing in their inbox at all.
    expect(await latestMail(request, fixture.signer2, 'signing_invitation')).toBeNull();

    const link1 = await signingLinkFor(request, fixture.signer1);
    await signViaApi(request, link1, { typedName: 'Ivan Demchenko' });

    const invitation = await latestMail(request, fixture.signer2, 'signing_invitation');
    expect(invitation).not.toBeNull();
    expect(invitation!.to).toBe(fixture.signer2);
    expect(String(invitation!.signingUrl)).toContain('/sign/');
    expect(String(invitation!.signingUrl)).not.toContain(link1);

    expect((await readEnvelope(request, fixture.orgId, fixture.envelopeId)).status).toBe(
      'partially_signed',
    );
  });

  test('TC-02-E2E-04: Signer declines', async ({ browser, page, request }) => {
    const fixture = await seed(request, 'env-decline');
    const link1 = await signingLinkFor(request, fixture.signer1);

    const signerPage = await openSigningLink(browser, link1);
    await signerPage.getByTestId('signing-decline-btn').click();
    await expect(signerPage.getByTestId('signing-decline-modal')).toBeVisible();
    await signerPage.getByTestId('signing-decline-reason-input').fill('Terms are not acceptable');
    await signerPage.getByTestId('signing-decline-confirm-btn').click();

    await expect(signerPage.getByTestId('signing-state-declined')).toBeVisible();
    await expect(signerPage.getByTestId('signing-submit-btn')).toHaveCount(0);
    await signerPage.context().close();

    await signIn(page, fixture.adminEmail);
    await page.goto(`${DOCUMENTS(fixture.orgId)}/${fixture.envelopeId}`);
    await expect(page.getByTestId('envelope-status')).toHaveText('Declined');

    await page.getByTestId('envelope-tab-signers').click();
    await expect(page.getByTestId('envelope-signer-row-1')).toContainText('Terms are not acceptable');
    await expect(page.getByTestId('envelope-signer-status-1')).toHaveText('Declined');
  });

  test('TC-02-E2E-05: Void invalidates an outstanding link', async ({
    browser,
    page,
    request,
  }) => {
    const fixture = await seed(request, 'env-void');
    // Captured but deliberately not opened: the link has to be invalidated by the void,
    // not by having been used.
    const link1 = await signingLinkFor(request, fixture.signer1);

    await signIn(page, fixture.adminEmail);
    await page.goto(`${DOCUMENTS(fixture.orgId)}/${fixture.envelopeId}`);

    await page.getByTestId('envelope-void-btn').click();
    await expect(page.getByTestId('envelope-void-modal')).toBeVisible();
    await page.getByTestId('envelope-void-reason-input').fill('Terms renegotiated');
    await page.getByTestId('envelope-void-confirm-btn').click();

    await expect(page.getByTestId('toast-envelope-voided')).toHaveText('Document voided');
    await expect(page.getByTestId('envelope-status')).toHaveText('Voided');

    const signerPage = await openSigningLink(browser, link1);
    const voided = signerPage.getByTestId('signing-state-voided');
    await expect(voided).toBeVisible();
    await expect(voided).toContainText('withdrawn by the sender');
    await expect(voided).toContainText('Terms renegotiated');
    await expect(signerPage.getByTestId('signing-submit-btn')).toHaveCount(0);
    await signerPage.context().close();
  });

  test('TC-02-E2E-06: A used link becomes read-only', async ({ browser, request }) => {
    const fixture = await seed(request, 'env-used');
    const link1 = await signingLinkFor(request, fixture.signer1);
    await signViaApi(request, link1, { typedName: 'Ivan Demchenko' });

    const signerPage = await openSigningLink(browser, link1);

    // Requirement 25 — the link stays valid, but only as a view of what was signed.
    const signed = signerPage.getByTestId('signing-state-signed');
    await expect(signed).toBeVisible();
    await expect(signed).toContainText('You signed this document on');
    await expect(signerPage.getByTestId('signing-document-frame')).toBeVisible();

    await expect(signerPage.getByTestId('signing-submit-btn')).toHaveCount(0);
    await expect(signerPage.getByTestId('signing-signature-canvas')).toHaveCount(0);
    await expect(signerPage.getByTestId('signing-consent-checkbox')).toHaveCount(0);
    await expect(signerPage.getByTestId('signing-decline-btn')).toHaveCount(0);
    await signerPage.context().close();
  });

  test('TC-02-E2E-07: Expired link', async ({ browser, request }) => {
    const fixture = await seed(request, 'env-expired');
    const link1 = await signingLinkFor(request, fixture.signer1);

    // There is no UI for expiry and a test cannot advance the clock, so the column is
    // written directly. The sweep is *not* run afterwards, on purpose: the case exists to
    // show that lazy expiry is authoritative (requirement 34) while the stored status
    // still says `sent`.
    await expireEnvelope(request, fixture.orgId, fixture.envelopeId);

    const signerPage = await openSigningLink(browser, link1);
    const expired = signerPage.getByTestId('signing-state-expired');
    await expect(expired).toBeVisible();
    await expect(expired).toContainText('This link expired on');
    await expect(signerPage.getByTestId('signing-request-new-link-btn')).toBeVisible();
    await expect(signerPage.getByTestId('signing-submit-btn')).toHaveCount(0);
    await expect(signerPage.getByTestId('signing-signature-canvas')).toHaveCount(0);

    // Requirement 35 — the page notifies the sender and issues nothing by itself, so the
    // newest invitation in this signer's inbox is still the one that has already expired.
    await signerPage.getByTestId('signing-request-new-link-btn').click();
    await expect(signerPage.getByTestId('signing-request-new-link-btn')).toHaveCount(0);
    const stillTheSame = await latestMail(request, fixture.signer1, 'signing_invitation');
    expect(String(stillTheSame!.signingUrl)).toContain(link1);
    await signerPage.context().close();
  });

  test('TC-02-E2E-08: Invalid link', async ({ browser, request }) => {
    // A real envelope exists in the background, so "nothing leaks" is a claim about this
    // response rather than about an empty database.
    const fixture = await seed(request, 'env-invalid');

    const signerPage = await openSigningLink(browser, '/sign/not-a-real-token');
    await expect(signerPage.getByTestId('signing-state-invalid')).toBeVisible();
    await expect(signerPage.getByTestId('signing-state-invalid')).toContainText(
      'This signing link is not valid.',
    );

    const content = await signerPage.content();
    expect(content).not.toContain('Contractor agreement');
    expect(content).not.toContain('Devscribed LLC');
    expect(content).not.toContain('Alex Kaminski');
    expect(content).not.toContain(fixture.signer1);
    await expect(signerPage.getByTestId('signing-submit-btn')).toHaveCount(0);
    await signerPage.context().close();
  });

  test('TC-02-E2E-09: A Cyrillic contract renders correctly', async ({
    browser,
    page,
    request,
  }) => {
    const cyrillicFields = [
      { key: 'full_name', label: 'ФИО', required: true, filledBy: 'sender', order: 1 },
      { key: 'contractor_tax_id', label: 'УНП', required: true, filledBy: 'sender', order: 2 },
      {
        key: 'contractor_bank',
        label: 'Банковские реквизиты',
        type: 'multiline',
        required: true,
        filledBy: 'signer:contractor',
        order: 3,
      },
    ];
    const cyrillicBody =
      '<p>ДОГОВОР подряда с {{full_name}}, УНП {{contractor_tax_id}}.</p>' +
      '<p>Реквизиты: {{contractor_bank}}</p>';
    const values = { full_name: 'Алексей Каминский', contractor_tax_id: '191234567' };
    const cyrillicBank = 'Приорбанк, БИК ПЙАБ BY2X';

    const fixture = await seed(request, 'env-cyrillic', {
      body: cyrillicBody,
      fields: cyrillicFields,
      values,
    });

    const link1 = await signingLinkFor(request, fixture.signer1);
    const signer1Page = await openSigningLink(browser, link1);

    // The encoding regression this case exists to catch shows up here: the document is
    // frozen at send, so if anything on the path mangles UTF-8 the exact strings below
    // stop surviving into what the signer is asked to sign.
    const signerSrcdoc = await signer1Page
      .getByTestId('signing-document-frame')
      .getAttribute('srcdoc');
    expect(signerSrcdoc).toContain('ДОГОВОР подряда');
    expect(signerSrcdoc).toContain(values.full_name);
    expect(signerSrcdoc).not.toContain('�');
    await signer1Page.context().close();

    await signViaApi(request, link1, { typedName: 'Иван Демченко' });
    const link2 = await signingLinkFor(request, fixture.signer2);
    await signViaApi(request, link2, {
      typedName: 'Алексей Каминский',
      fieldValues: { contractor_bank: cyrillicBank },
    });

    await waitForSignedPdf(request, fixture.orgId, fixture.envelopeId);

    await signIn(page, fixture.adminEmail);
    await page.goto(`${DOCUMENTS(fixture.orgId)}/${fixture.envelopeId}`);
    await expect(page.getByTestId('envelope-status')).toHaveText('Completed');

    // Same sandboxed frame, same reason for asserting on `srcdoc`: the completed document
    // still carries every Cyrillic string byte for byte.
    const adminSrcdoc = await page.getByTestId('envelope-document-frame').getAttribute('srcdoc');
    expect(adminSrcdoc).toContain('ДОГОВОР подряда');
    expect(adminSrcdoc).toContain(values.full_name);
    expect(adminSrcdoc).toContain('УНП');
    expect(adminSrcdoc).not.toContain('�');

    // The signer's own Cyrillic value is entered after the freeze, so the stored document
    // carries its placeholder rather than the value (invariant 5 — written exactly once).
    // What a reader is served is that document with the value filled in, and this is the
    // assertion that says so: the completed document shows what the contractor typed,
    // byte for byte, not a blank and not `{{contractor_bank}}`.
    expect(adminSrcdoc).toContain(cyrillicBank);
    expect(adminSrcdoc).not.toContain('{{');

    // Also asserted where the value is stored — the round trip through the request, the
    // database, and the response is exactly the path an encoding bug would break.
    const detail = await (
      await request.get(
        `${API}/api/organizations/${fixture.orgId}/envelopes/${fixture.envelopeId}`,
      )
    ).json();
    const bank = detail.fields.find((field: { key: string }) => field.key === 'contractor_bank');
    expect(bank.value).toBe(cyrillicBank);
    expect(bank.label).toBe('Банковские реквизиты');

    const download = page.getByTestId('envelope-download-btn');
    await expect(download).toBeVisible();
    await expect(download).toBeEnabled();

    // The PDF itself is fetched rather than clicked through, because the click hands the
    // presigned URL to the browser and navigates away from the screen under test. Its
    // *text* is deliberately not asserted: Chromium embeds a subsetted font, so the bytes
    // carry glyph ids rather than Unicode, and any "assertion" over them would be
    // decoding the font rather than checking the encoding. The Cyrillic claim is made
    // above, on the document the renderer is handed.
    const url = (
      await (
        await request.get(
          `${API}/api/organizations/${fixture.orgId}/envelopes/${fixture.envelopeId}/document`,
        )
      ).json()
    ).url as string;
    const pdf = await request.get(url);
    expect(pdf.ok()).toBe(true);
    const bytes = await pdf.body();
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
    // A certificate page plus the contract is never a few hundred bytes.
    expect(bytes.byteLength).toBeGreaterThan(2000);
  });

  test('TC-02-E2E-10: Activity tab shows the verified chain', async ({ page, request }) => {
    const fixture = await seed(request, 'env-audit');

    const link1 = await signingLinkFor(request, fixture.signer1);
    await signViaApi(request, link1, { typedName: 'Ivan Demchenko' });
    const link2 = await signingLinkFor(request, fixture.signer2);
    await signViaApi(request, link2, {
      typedName: 'Alex Kaminski',
      fieldValues: { contractor_bank: BANK },
    });

    await signIn(page, fixture.adminEmail);
    await page.goto(`${DOCUMENTS(fixture.orgId)}/${fixture.envelopeId}`);
    await page.getByTestId('envelope-tab-activity').click();

    // Requirements 38–39: the badge is the arithmetic saying nobody edited the trail.
    await expect(page.getByTestId('envelope-chain-status')).toHaveText('Chain verified');

    const list = page.getByTestId('envelope-audit-list');
    await expect(list).toBeVisible();
    const rows = page.locator('[data-testid^="envelope-audit-row-"]');
    await expect(rows).not.toHaveCount(0);

    for (const label of ['Created', 'Sent', 'Viewed', 'Completed']) {
      await expect(rows.filter({ hasText: label })).not.toHaveCount(0);
    }
    // One `signed` event per signer, and no more — requirement 37 pairs events with
    // transitions exactly once.
    await expect(rows.filter({ hasText: 'Signed' })).toHaveCount(2);

    // Requirement 41 — a signer-originated event names who it came from and from where.
    for (const signer of ['Ivan Demchenko', 'Alex Kaminski']) {
      const signedRow = rows.filter({ hasText: 'Signed' }).filter({ hasText: signer });
      await expect(signedRow).toHaveCount(1);
      await expect(signedRow).toContainText(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})|(::1)|(::ffff)/);
    }

    // Reverse chronological, asserted on the timestamps the rows print rather than on a
    // fixed sequence of types: the rows are printed to the minute and several events of
    // one transaction share it, so only the ordering itself is a stable claim.
    const stamps = await page
      .locator('[data-testid^="envelope-audit-row-"] > span:nth-child(1)')
      .allInnerTexts();
    const times = stamps.map((text) => Date.parse(text.replace(',', '')));
    expect(times.every((time) => !Number.isNaN(time))).toBe(true);
    for (let index = 1; index < times.length; index += 1) {
      expect(times[index]).toBeLessThanOrEqual(times[index - 1]);
    }
  });

  test('TC-02-E2E-11: Sent documents cannot be edited', async ({ page, request }) => {
    const fixture = await seed(request, 'env-locked');

    await signIn(page, fixture.adminEmail);
    await page.goto(`${DOCUMENTS(fixture.orgId)}/${fixture.envelopeId}`);

    await expect(page.getByTestId('envelope-status')).toHaveText('Sent');
    await expect(page.getByTestId('envelope-fill-form')).toBeVisible();

    // Requirement 6 — only a draft may be edited, and the screen says so structurally:
    // every control is inert, not merely unstyled.
    await expect(page.getByTestId('envelope-title-input')).toBeDisabled();
    await expect(page.getByTestId('envelope-expires-input')).toBeDisabled();
    await expect(page.getByTestId('envelope-field-full_name')).toBeDisabled();
    await expect(page.getByTestId('envelope-field-contractor_tax_id')).toBeDisabled();
    await expect(page.getByTestId('envelope-signer-name-1')).toBeDisabled();
    await expect(page.getByTestId('envelope-signer-email-2')).toBeDisabled();
    await expect(page.getByTestId('envelope-swap-order-btn')).toHaveCount(0);
    await expect(page.getByTestId('envelope-save-draft-btn')).toHaveCount(0);
    await expect(page.getByTestId('envelope-send-btn')).toHaveCount(0);

    // Void is the only way out of a sent envelope, so it must be here.
    await expect(page.getByTestId('envelope-void-btn')).toBeVisible();

    // And the server keeps the same rule regardless of what the screen offers.
    const rejected = await request.put(
      `${API}/api/organizations/${fixture.orgId}/envelopes/${fixture.envelopeId}`,
      { data: { title: 'Rewritten after sending' } },
    );
    expect(rejected.status()).toBe(409);
  });

  test('TC-02-E2E-12: Regular user has no access to documents', async ({ page, request }) => {
    const fixture = await seed(request, 'env-user');
    // A second person rather than the admin demoting themselves — the zero-admin guard
    // refuses that, correctly. The envelope already exists, made by the admin, which is
    // the state this case is about looking at without `ViewEnvelopes`.
    const member = await addMemberToOrganization(request, fixture.orgId, {
      firstName: 'Ulad',
      lastName: 'User',
    });

    await signIn(page, member.email);

    // No dead controls: the group is not drawn for a role the route behind it would 404.
    await expect(page.getByTestId('app-sidebar')).toBeVisible();
    await expect(page.getByTestId('nav-documents')).toHaveCount(0);

    await page.goto(DOCUMENTS(fixture.orgId));
    await expect(page.getByText('This page could not be found')).toBeVisible();
    await expect(page.getByTestId('documents-page')).toHaveCount(0);
    await expect(page.getByTestId('envelopes-table')).toHaveCount(0);
    expect(await page.content()).not.toContain('Contractor agreement — A. Kaminski');

    // Typing the envelope's own address is the same wall.
    await page.goto(`${DOCUMENTS(fixture.orgId)}/${fixture.envelopeId}`);
    await expect(page.getByTestId('envelope-detail')).toHaveCount(0);
    await expect(page.getByTestId('envelope-document-frame')).toHaveCount(0);
  });
});
