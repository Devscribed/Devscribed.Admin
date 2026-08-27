import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import {
  API,
  addMemberToOrganization,
  createEnvelope,
  createTemplate,
  publishTemplateVersion,
  registerOrganization,
  signIn,
  signingLinkFor,
  uniqueEmail,
} from './helpers';

/**
 * Regressions found by hand and pinned here.
 *
 * Every case in this file exists because a real person hit the bug in a browser, so each
 * one is named after the symptom they reported rather than after a spec requirement — if
 * one of these fails, the sentence in the test name is the sentence to put in the bug.
 *
 * Two of the six are structural rather than behavioural: the `⋮` row menu and the design
 * system's `Select` both used to draw their popover as an absolutely-positioned sibling,
 * which the `Card` around every list cropped to a few pixels (`overflow: hidden`, for its
 * rounded corners). Both now render into `document.body`. A screenshot cannot be asserted
 * on, so those cases assert the property that actually broke: **every item is inside the
 * viewport and is the element the browser would hand a click at its own centre.** A panel
 * clipped to 4px, or covered by the modal overlay, fails that; a merely ugly one does not,
 * which is the right line for a regression test to hold.
 */

const DOCUMENTS = (orgId: string) => `/org/${orgId}/documents`;
const TEMPLATES = (orgId: string) => `/org/${orgId}/documents/templates`;

const FIELDS = [
  { key: 'company_bank', label: 'Company bank', required: true, filledBy: 'sender', order: 1 },
  {
    key: 'contractor_bank',
    label: 'Contractor bank',
    required: true,
    filledBy: 'signer:contractor',
    order: 2,
  },
];

const BODY =
  '<p>Company bank: {{company_bank}}</p><p>Contractor bank: {{contractor_bank}}</p>';

const COMPANY_BANK = 'IBAN BY13 ALFA 3014 0000 0100 0000 0000';

/**
 * The value signer 2 types on the signing page itself. Deliberately unlike anything the
 * sender entered, so "the document contains it" cannot pass by accident.
 */
const SIGNER_TYPED_BANK = 'IBAN BY99 PRIO 7777 TYPED AT SIGNING';

/**
 * Asserts that an open popover is usable, not merely present.
 *
 * `toBeVisible()` is not enough: a panel cropped by an ancestor's `overflow: hidden` still
 * has a box, still has text, and still passes it — which is exactly how the reported bug
 * survived the existing suite. So each item is checked for a box with real height, for
 * sitting inside the viewport, and for being what `elementFromPoint` returns at its own
 * centre. The last of those is the one that catches a panel painted underneath a modal
 * overlay or a sticky header.
 */
async function expectPopoverItemsUsable(page: Page, items: string[]): Promise<void> {
  for (const testIdOrText of items) {
    const item = testIdOrText.startsWith('#')
      ? page.getByTestId(testIdOrText.slice(1))
      : page.getByRole('menuitem', { name: testIdOrText });

    await expect(item).toBeVisible();

    const usable = await item.evaluate((node: Element) => {
      const box = node.getBoundingClientRect();
      const centre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return {
        height: box.height,
        width: box.width,
        insideViewport:
          box.top >= 0 &&
          box.left >= 0 &&
          box.bottom <= window.innerHeight &&
          box.right <= window.innerWidth,
        hitsItself: node === centre || node.contains(centre),
      };
    });

    expect(usable.height, `"${testIdOrText}" has no height — the panel is clipped`).toBeGreaterThan(
      8,
    );
    expect(usable.width, `"${testIdOrText}" has no width`).toBeGreaterThan(8);
    expect(usable.insideViewport, `"${testIdOrText}" is outside the viewport`).toBe(true);
    expect(usable.hitsItself, `"${testIdOrText}" is covered by something else`).toBe(true);
  }
}

/** The same check for a `Select`'s option list, which uses `option` rather than `menuitem`. */
async function expectOptionsUsable(page: Page, labels: string[]): Promise<void> {
  for (const label of labels) {
    const option = page.getByRole('option', { name: label, exact: true });
    await expect(option).toBeVisible();

    const usable = await option.evaluate((node: Element) => {
      const box = node.getBoundingClientRect();
      const centre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return {
        height: box.height,
        width: box.width,
        insideViewport:
          box.top >= 0 &&
          box.left >= 0 &&
          box.bottom <= window.innerHeight &&
          box.right <= window.innerWidth,
        hitsItself: node === centre || node.contains(centre),
      };
    });

    expect(usable.height, `option "${label}" has no height — the list is clipped`).toBeGreaterThan(
      8,
    );
    expect(usable.width, `option "${label}" has no width`).toBeGreaterThan(8);
    expect(usable.insideViewport, `option "${label}" is outside the viewport`).toBe(true);
    expect(usable.hitsItself, `option "${label}" is covered by something else`).toBe(true);
  }
}

/**
 * A signing link is opened in its own context, never in the admin's page: the surface is
 * session-less by design, and reusing the admin's cookie jar would prove nothing about
 * what a counterparty actually sees. Same rule as `envelopes-signing.spec.ts`.
 */
async function openSigningLink(browser: Browser, link: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(link);
  return page;
}

/** The `<img>` drawn into one signer's block, read off the sandboxed frame's `srcdoc`. */
function signatureBlockOf(srcdoc: string, roleKey: string): string {
  const open = `<span class="signature-mark" data-signature-for="${roleKey}">`;
  const start = srcdoc.indexOf(open);
  if (start < 0) throw new Error(`No signature slot for "${roleKey}" in the document`);
  const end = srcdoc.indexOf('</span>', start);
  return srcdoc.slice(start + open.length, end);
}

test.describe('Regressions', () => {
  /* ---------------------------------------------------------------- *
   * Bug 1 — "the ⋮ menu opened but was cut off after a few pixels"
   * ---------------------------------------------------------------- */
  test('BUG-01: the row menu on the templates list is fully visible and clickable', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('rgx-rowmenu');
    const { orgId } = await registerOrganization(request, adminEmail);
    const templateId = await createTemplate(request, orgId, {
      name: 'Row menu contract',
      bodyHtml: BODY,
      fields: FIELDS,
      publish: true,
    });

    await signIn(page, adminEmail);
    await page.goto(TEMPLATES(orgId));
    await expect(page.getByTestId(`template-row-${templateId}`)).toBeVisible();

    await page.getByTestId(`template-actions-${templateId}`).click();

    // All four, including the last one — the clip cut everything below the first row off.
    await expectPopoverItemsUsable(page, [
      'Open',
      'Preview',
      '#template-archive-btn',
      '#template-delete-btn',
    ]);

    // And an item still *does* its thing once clicked; a panel that is visible but inert
    // would be the same bug wearing a different hat.
    await page.getByRole('menuitem', { name: 'Preview' }).click();
    await expect(page.getByTestId('template-preview-modal')).toBeVisible();
    await expect(page.getByTestId('template-preview-frame')).toBeVisible();
  });

  test('BUG-01: Escape closes the row menu and hands focus back to its button', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('rgx-rowmenu-esc');
    const { orgId } = await registerOrganization(request, adminEmail);
    const templateId = await createTemplate(request, orgId, {
      name: 'Row menu keyboard',
      bodyHtml: BODY,
      fields: FIELDS,
      publish: true,
    });

    await signIn(page, adminEmail);
    await page.goto(TEMPLATES(orgId));

    const trigger = page.getByTestId(`template-actions-${templateId}`);
    await trigger.click();
    await expect(page.getByRole('menu')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    // The panel lives on <body> now, so the caret would land on the document unless the
    // component puts it back deliberately.
    await expect(trigger).toBeFocused();
  });

  /* ---------------------------------------------------------------- *
   * Bug 2 — "previous template versions were invisible anywhere in the UI"
   * ---------------------------------------------------------------- */
  test('BUG-02: the template editor lists every published version, not only the current one', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('rgx-versions');
    const { orgId } = await registerOrganization(request, adminEmail);
    const templateId = await createTemplate(request, orgId, {
      name: 'Versioned contract',
      bodyHtml: '<p>Version one says: {{company_bank}}</p><p>{{contractor_bank}}</p>',
      fields: FIELDS,
      publish: true,
    });
    await publishTemplateVersion(
      request,
      orgId,
      templateId,
      '<p>Version two says: {{company_bank}}</p><p>{{contractor_bank}}</p>',
    );

    await signIn(page, adminEmail);
    await page.goto(`${TEMPLATES(orgId)}/${templateId}`);

    await page.getByTestId('template-version-picker').click();

    // More than one: the whole bug was that only the current version had any presence in
    // the UI at all, so a picker with a single entry would still be the bug.
    const options = page.getByRole('option');
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toContainText('v2');
    await expect(options.nth(1)).toContainText('v1');
    await expectOptionsUsable(page, [
      String(await options.nth(0).textContent()),
      String(await options.nth(1).textContent()),
    ]);

    // And v1 is genuinely readable, not merely listed.
    await options.nth(1).click();
    await expect(page.getByTestId('template-preview-modal')).toBeVisible();
    const preview = await page.getByTestId('template-preview-frame').getAttribute('srcdoc');
    expect(preview).toContain('Version one says');
    expect(preview).not.toContain('Version two says');
  });

  /* ---------------------------------------------------------------- *
   * Bug 3 — "on New document the SUBJECT field was stuck on None"
   * ---------------------------------------------------------------- */
  test('BUG-03: the New document subject picker opens and selects a member', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('rgx-subject');
    const { orgId } = await registerOrganization(request, adminEmail);
    const member = await addMemberToOrganization(request, orgId, {
      firstName: 'Alina',
      lastName: 'Subject',
    });
    await createTemplate(request, orgId, {
      name: 'Subject picker contract',
      bodyHtml: BODY,
      fields: FIELDS,
      publish: true,
    });

    await signIn(page, adminEmail);
    await page.goto(`${DOCUMENTS(orgId)}/new`);

    const subject = page.getByTestId('envelope-subject-select');
    await expect(subject).toHaveText('None');
    await subject.click();

    // "None" plus both members of the organization — the picker could not be used at all
    // before, so the list being reachable is half the assertion.
    await expectOptionsUsable(page, ['None', member.name]);

    await page.getByRole('option', { name: member.name, exact: true }).click();

    // The list closes, the field keeps the choice, and the caret comes back to the field
    // rather than to the top of the document.
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(subject).toHaveText(member.name);
    await expect(subject).toBeFocused();
  });

  /**
   * The same symptom one screen over: the envelope *detail* passed the fill form an empty
   * member list, so its subject Select had nothing but "None" to resolve the stored id
   * against and reported no subject on an envelope that plainly had one.
   */
  test('BUG-03: the envelope detail names the subject it was created for', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('rgx-detail-subject');
    const { orgId } = await registerOrganization(request, adminEmail);
    const member = await addMemberToOrganization(request, orgId, {
      firstName: 'Bogdan',
      lastName: 'Subject',
    });
    const templateId = await createTemplate(request, orgId, {
      name: 'Detail subject contract',
      bodyHtml: BODY,
      fields: FIELDS,
      publish: true,
    });
    const envelope = await createEnvelope(request, orgId, {
      templateId,
      subjectMembershipId: member.membershipId,
      fieldValues: { company_bank: COMPANY_BANK },
      signers: [
        { name: 'Acme Inc', email: uniqueEmail('company') },
        { name: 'Bogdan Subject', email: member.email },
      ],
    });

    await signIn(page, adminEmail);
    await page.goto(`${DOCUMENTS(orgId)}/${envelope.id}`);

    const subject = page.getByTestId('envelope-subject-select');
    await expect(subject).toBeVisible();
    // The whole bug in one assertion: this said "None".
    await expect(subject).toHaveText(member.name);
    // And the screen stays read-only about it — the subject is fixed at creation, so the
    // fix must not have handed this screen a way to change it.
    await expect(subject).toBeDisabled();
  });

  test('BUG-03: a Select inside a modal opens above the overlay and Escape closes only the list', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('rgx-modal-select');
    const { orgId } = await registerOrganization(request, adminEmail);
    const templateId = await createTemplate(request, orgId, {
      name: 'Modal select contract',
      bodyHtml: BODY,
      fields: FIELDS,
    });

    await signIn(page, adminEmail);
    await page.goto(`${TEMPLATES(orgId)}/${templateId}`);
    await page.getByTestId("template-tab-fields").click();
    await page.getByTestId("template-field-add-btn").click();

    const type = page.getByTestId("template-field-type-select");
    await expect(type).toBeVisible();
    await type.click();

    // The panel is a child of <body>; the modal overlay is too. If the stacking order is
    // wrong the options are painted *under* the overlay and `elementFromPoint` returns it.
    await expectOptionsUsable(page, ['Text', 'Multiline', 'Checkbox']);

    await page.getByRole('option', { name: 'Multiline', exact: true }).click();
    await expect(type).toHaveText('Multiline');

    // Escape belongs to the list while the list is open — it must not take the dialog with
    // it, which is the failure mode a document-level key handler invites.
    await type.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(page.getByTestId("template-field-modal")).toBeVisible();
    await expect(type).toBeFocused();
  });

  /* ---------------------------------------------------------------- *
   * Bugs 4 and 5 — the sequential-signing promise, and the confirmation
   * ---------------------------------------------------------------- */
  test('BUG-04/05: signer 2 receives a document already signed by signer 1, and their confirmation carries what they just typed', async ({
    browser,
    request,
  }) => {
    const adminEmail = uniqueEmail('rgx-sequential');
    const { orgId } = await registerOrganization(request, adminEmail);
    const templateId = await createTemplate(request, orgId, {
      name: 'Sequential contract',
      bodyHtml: BODY,
      fields: FIELDS,
      publish: true,
    });

    const signer1 = uniqueEmail('rgx-first');
    const signer2 = uniqueEmail('rgx-second');
    await createEnvelope(request, orgId, {
      templateId,
      title: 'Sequential contract',
      fieldValues: { company_bank: COMPANY_BANK },
      signers: [
        { name: 'First Signer', email: signer1 },
        { name: 'Second Signer', email: signer2 },
      ],
      send: true,
    });

    /* ---- signer 1 signs ---- */

    const page1 = await openSigningLink(browser, await signingLinkFor(request, signer1));

    // Before anyone has signed, both blocks are empty — otherwise "signer 2 sees a
    // signature" could pass on a document that always showed one.
    const before = String(await page1.getByTestId('signing-document-frame').getAttribute('srcdoc'));
    expect(signatureBlockOf(before, 'company')).toBe('');
    expect(signatureBlockOf(before, 'contractor')).toBe('');

    await page1.getByTestId('signing-signature-mode-typed').click();
    await page1.getByTestId('signing-signature-typed-input').fill('First Signer');
    await page1.getByTestId('signing-consent-checkbox').click();
    await page1.getByTestId('signing-submit-btn').click();
    await expect(page1.getByTestId('signing-state-signed')).toBeVisible();
    await page1.context().close();

    /* ---- BUG-04: what signer 2 opens ---- */

    const page2 = await openSigningLink(browser, await signingLinkFor(request, signer2));
    await expect(page2.getByTestId('signing-page')).toBeVisible();

    const received = String(await page2.getByTestId('signing-document-frame').getAttribute('srcdoc'));
    expect(
      signatureBlockOf(received, 'company'),
      'signer 2 must receive a document already signed by signer 1',
    ).toContain('<img src="data:image/');
    expect(
      signatureBlockOf(received, 'contractor'),
      'signer 2 has not signed yet, so their own line must still be blank',
    ).toBe('');

    /* ---- BUG-05: what signer 2 is shown immediately after signing ---- */

    await page2.getByTestId('signing-field-contractor_bank').fill(SIGNER_TYPED_BANK);
    await page2.getByTestId('signing-signature-mode-typed').click();
    await page2.getByTestId('signing-signature-typed-input').fill('Second Signer');
    await page2.getByTestId('signing-consent-checkbox').click();
    await page2.getByTestId('signing-submit-btn').click();

    await expect(page2.getByTestId('signing-state-signed')).toBeVisible();

    // Without reloading. The read-only confirmation is rendered from whatever the page
    // holds at that moment, and it used to hold the copy fetched *before* the submit.
    const confirmed = String(
      await page2.getByTestId('signing-document-frame').getAttribute('srcdoc'),
    );
    expect(confirmed, 'the confirmation must show the value the signer just typed').toContain(
      SIGNER_TYPED_BANK,
    );
    expect(signatureBlockOf(confirmed, 'company')).toContain('<img src="data:image/');
    expect(signatureBlockOf(confirmed, 'contractor')).toContain('<img src="data:image/');

    await page2.context().close();
  });

  /* ---------------------------------------------------------------- *
   * The freeze invariant, which every fix above had to leave alone.
   * ---------------------------------------------------------------- */
  test('BUG-04/05/06: filling the document for display never rewrites the bytes that were signed', async ({
    browser,
    request,
  }) => {
    const adminEmail = uniqueEmail('rgx-freeze');
    const { orgId } = await registerOrganization(request, adminEmail);
    const templateId = await createTemplate(request, orgId, {
      name: 'Freeze contract',
      bodyHtml: BODY,
      fields: FIELDS,
      publish: true,
    });

    const signer1 = uniqueEmail('rgx-freeze-1');
    const signer2 = uniqueEmail('rgx-freeze-2');
    const envelope = await createEnvelope(request, orgId, {
      templateId,
      title: 'Freeze contract',
      fieldValues: { company_bank: COMPANY_BANK },
      signers: [
        { name: 'First Signer', email: signer1 },
        { name: 'Second Signer', email: signer2 },
      ],
      send: true,
    });

    const hashAtSend = await documentHashOf(request, orgId, envelope.id);
    expect(hashAtSend).toMatch(/^[0-9a-f]{64}$/);

    // Only the contractor owns a field, so only their turn fills one. Stated per signer
    // rather than probed with a `count()`, which would race the form's first render and
    // silently submit an empty required field.
    for (const [address, name, ownsField] of [
      [signer1, 'First Signer', false],
      [signer2, 'Second Signer', true],
    ] as Array<[string, string, boolean]>) {
      const page = await openSigningLink(browser, await signingLinkFor(request, address));
      await expect(page.getByTestId('signing-page')).toBeVisible();
      if (ownsField) {
        await page.getByTestId('signing-field-contractor_bank').fill(SIGNER_TYPED_BANK);
      }
      await page.getByTestId('signing-signature-mode-typed').click();
      await page.getByTestId('signing-signature-typed-input').fill(name);
      await page.getByTestId('signing-consent-checkbox').click();
      await page.getByTestId('signing-submit-btn').click();
      await expect(page.getByTestId('signing-state-signed')).toBeVisible();
      await page.context().close();
    }

    // Two signatures and a signer-entered value later, the hash is the one from send: the
    // fill passes work on a copy, and `documentHash` still describes the stored bytes.
    expect(await documentHashOf(request, orgId, envelope.id)).toBe(hashAtSend);
  });

  /* ---------------------------------------------------------------- *
   * BUG-07 — "the template editor said someone else changed it, and nobody had"
   * ---------------------------------------------------------------- */

  /**
   * Found by the E2E suite running against the deployed stand, and by nothing else.
   *
   * The editor saved on a two-second idle timer *and* explicitly on every tab change, with
   * no guard against a second save starting while the first was still in flight. Both
   * carried the `rowVersion` they had read before either returned, so the server took the
   * first and refused the second as a conflict — and the screen then told the author their
   * template had been "changed by someone else". There was no someone else. It was their
   * own previous keystroke.
   *
   * It cannot reproduce on a developer's machine: a save round-trips in single-digit
   * milliseconds there, so two never overlap. Latency is the whole bug, so this test
   * supplies its own rather than depending on a slow environment — every draft save is
   * held for a second, which is long enough for the tab change to land on top of the
   * autosave and short enough to keep the test quick.
   *
   * What it asserts is the symptom the author saw: the conflict dialog, which is modal and
   * covers the header, never appears, and Publish goes through.
   */
  test('BUG-07: quick edits do not make the editor accuse a second author', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('rgx-conflict');
    const { orgId } = await registerOrganization(request, email);
    const templateId = await createTemplate(request, orgId, {
      name: 'Concurrent save contract',
      bodyHtml: '<p>Placeholder</p>',
    });

    // Applied before the page loads so the very first save is slow too.
    await page.route('**/document-templates/*/draft', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });

    await signIn(page, email);
    await page.goto(`${TEMPLATES(orgId)}/${templateId}`);
    await expect(page.getByTestId('template-editor')).toBeVisible();

    // Edit, then move between tabs faster than a save can finish. Each tab change asks for
    // an explicit save; with a save already in flight, this is exactly the overlap.
    await page
      .getByTestId('template-body-editor')
      .fill('<p>AGREEMENT with {{contractor_full_name}}</p>');
    await page.getByTestId('template-tab-fields').click();
    await page.getByTestId('template-field-add-btn').click();
    await page.getByTestId('template-field-key-input').fill('contractor_full_name');
    await page.getByTestId('template-field-label-input').fill('Full name');
    await page.getByTestId('template-field-save-btn').click();
    await page.getByTestId('template-tab-signers').click();
    await page.getByTestId('template-signer-key-1').fill('company');
    await page.getByTestId('template-signer-label-1').fill('Company');
    await page.getByTestId('template-signer-key-2').fill('contractor');
    await page.getByTestId('template-signer-label-2').fill('Contractor');
    await page.getByTestId('template-tab-body').click();

    await expect(page.getByTestId('template-save-state')).toHaveText('Saved', { timeout: 20_000 });

    // The dialog is the bug. It is modal, so had it opened, the click below would time out
    // against it rather than reach the button — which is how this was found.
    await expect(page.getByText('Changed by someone else')).toHaveCount(0);

    await page.getByTestId('template-publish-btn').click();
    await expect(page.getByTestId('toast-template-published')).toHaveText('Template published');
  });

});

/** The envelope's `documentHash`, read the way the detail screen reads it. */
async function documentHashOf(
  request: APIRequestContext,
  orgId: string,
  envelopeId: string,
): Promise<string> {
  const response = await request.get(
    `${API}/api/organizations/${orgId}/envelopes/${envelopeId}`,
  );
  if (!response.ok()) throw new Error(`Could not read envelope ${envelopeId}`);
  return (await response.json()).documentHash as string;
}
