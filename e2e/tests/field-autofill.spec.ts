import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  API,
  addMemberToOrganization,
  createAutofillTemplate,
  registerOrganization,
  setMemberProfile,
  setMembershipRole,
  signIn,
  signViaApi,
  signingLinkFor,
  todayInZone,
  uniqueEmail,
  waitForSignedPdf,
  type MemberProfileSeed,
  type SeededMember,
} from './helpers';

/**
 * Spec 03 — Field Autofill, the E2E row of its test matrix.
 *
 * The isolation strategy is spec 01's and 02's, unchanged: every test mints its own
 * admin account, and signup creates a fresh organization with it.
 *
 * What is new here is that three of these cases need **two people in one organization** —
 * a manager or a plain user looking at someone else's contract details, or at their own.
 * Signup always makes a new organization and `Membership.accountId` is unique, so the
 * extra membership is built by `addMemberToOrganization`, which registers the account
 * through the API and then moves the membership signup created into the organization
 * under test. The full reasoning, and why there is no product path to do this yet, is at
 * that helper's definition. Roles are always spent through `POST /api/test/role`
 * (`setMembershipRole`), so each test says in its own body which role it is looking
 * through.
 *
 * Two assertion rules this suite keeps:
 *
 *  - **The document, not just the form.** Snapshotting (TC-04) and requirement 23's
 *    "masking governs the profile, never the document" (TC-05) are both claims about what
 *    ends up in the contract, so both are asserted on the rendered document and not only
 *    on an input that happens to show the same string.
 *  - **`srcdoc`, not `frameLocator`.** The document frame is `<iframe sandbox="">` — no
 *    `allow-scripts`, no `allow-same-origin` — so its content is as opaque to the test as
 *    it is to the page. The rendered document is therefore asserted on the `srcdoc`
 *    attribute that produced it, exactly as the spec 01 and 02 suites do.
 */

const DOCUMENTS = (orgId: string) => `/org/${orgId}/documents`;
const MEMBER = (orgId: string, memberId: string) => `/org/${orgId}/members/${memberId}`;
const CONTRACT_DETAILS = (orgId: string, memberId: string) =>
  `${MEMBER(orgId, memberId)}?tab=contract-details`;

/** Signup pins this zone, and `today` resolves in the organization's zone (requirement 2). */
const ORG_TIMEZONE = 'Europe/Berlin';

/** The spec's own mockup values, so the masks below are the ones it prints. */
const ALEX_PROFILE: MemberProfileSeed = {
  addressLine: 'Nezavisimosti Ave 1, apt 5',
  city: 'Minsk',
  postalCode: '220030',
  country: 'BY',
  taxId: '191234567',
  dateOfBirth: '1991-03-14',
  idDocumentNumber: 'MP1234567',
  bankDetails: 'IBAN BY13 ALFA 3014 0000 0100 0000 0000',
};

/** `member.fullAddress` — the four parts joined in order, the country expanded. */
const ALEX_FULL_ADDRESS = 'Nezavisimosti Ave 1, apt 5, Minsk, 220030, Belarus';

/**
 * Five fields, four of them bound: exactly what TC-03-E2E-02's "Fills 4 of 5 fields"
 * describes. All five are the sender's, so the summary's denominator is unambiguous.
 */
const BOUND_FIELDS = [
  {
    key: 'contractor_full_name',
    label: 'Full name',
    required: true,
    autofillSource: 'member.fullName',
    order: 1,
  },
  {
    key: 'contractor_tax_id',
    label: 'Tax ID',
    required: true,
    autofillSource: 'member.taxId',
    order: 2,
  },
  {
    key: 'contractor_address',
    label: 'Address',
    type: 'multiline',
    required: true,
    autofillSource: 'member.fullAddress',
    order: 3,
  },
  {
    key: 'contract_date',
    label: 'Contract date',
    type: 'date',
    required: true,
    autofillSource: 'today',
    order: 4,
  },
  // Unbound on purpose: the case that proves autofill fills what it was told to and
  // nothing else.
  { key: 'contract_no', label: 'Contract no.', required: false, autofillSource: null, order: 5 },
];

const BOUND_BODY =
  '<p>AGREEMENT with {{contractor_full_name}}, tax id {{contractor_tax_id}}.</p>' +
  '<p>Address: {{contractor_address}}</p>' +
  '<p>Dated {{contract_date}}, contract no. {{contract_no}}.</p>';

const TEMPLATE_NAME = 'Contractor agreement BY';

interface Fixture {
  orgId: string;
  adminEmail: string;
  templateId: string;
  subject: SeededMember;
}

/**
 * An organization with an admin, one subject member, and one published bound template.
 *
 * Built through the API for the same reason spec 02's fixture is: only the case actually
 * under test should be driven through the screens, or every test starts failing whenever
 * an unrelated screen does.
 */
async function seed(
  request: APIRequestContext,
  prefix: string,
  options: {
    subjectName?: { firstName: string; lastName: string };
    profile?: MemberProfileSeed | null;
    body?: string;
    fields?: typeof BOUND_FIELDS;
    templateName?: string;
  } = {},
): Promise<Fixture> {
  const adminEmail = uniqueEmail(prefix);
  const { orgId } = await registerOrganization(request, adminEmail, 'Devscribed LLC');

  const subject = await addMemberToOrganization(orgId, {
    firstName: options.subjectName?.firstName ?? 'Alex',
    lastName: options.subjectName?.lastName ?? 'Kaminski',
    email: uniqueEmail(`${prefix}-subject`),
  });
  // The subject is a plain member of this organization; nothing in these cases depends on
  // what the *subject* may do, only on what the viewer may.
  await setMembershipRole(request, subject.email, 'user');

  if (options.profile) await setMemberProfile(request, orgId, subject.membershipId, options.profile);

  const templateId = await createAutofillTemplate(request, orgId, {
    name: options.templateName ?? TEMPLATE_NAME,
    bodyHtml: options.body ?? BOUND_BODY,
    fields: options.fields ?? BOUND_FIELDS,
    publish: true,
  });

  return { orgId, adminEmail, templateId, subject };
}

/**
 * The DS `Select` is a button plus a popover, not a native `<select>`.
 *
 * The options are anchors, but they now carry `role="option"` inside a `role="listbox"`
 * panel, which overrides the implicit `link` role they used to expose — so this looks them
 * up as the options they are. The panel is also portalled to `document.body`, which is why
 * it is reached from `page` rather than from the field's own subtree.
 */
async function choose(page: Page, testId: string, optionLabel: string): Promise<void> {
  await page.getByTestId(testId).click();
  await page.getByRole('option', { name: optionLabel, exact: true }).click();
}

/**
 * Drives `/documents/new` as far as an existing draft.
 *
 * The subject is picked **before** the template on purpose: picking the template is what
 * creates the envelope, and autofill resolves once, at creation (requirement 6). Doing it
 * the other way round would produce an envelope with no subject and a test that proves
 * nothing.
 */
async function startDocument(
  page: Page,
  orgId: string,
  subjectName: string | null,
  templateLabel = `${TEMPLATE_NAME} (v1)`,
): Promise<void> {
  await page.goto(`${DOCUMENTS(orgId)}/new`);
  await expect(page.getByTestId('envelope-fill-form')).toBeVisible();
  if (subjectName !== null) await choose(page, 'envelope-subject-select', subjectName);
  await choose(page, 'envelope-template-select', templateLabel);
  await expect(page.getByTestId('envelope-field-contractor_full_name')).toBeVisible();
}

/** Fills the two signers and the title, then sends. Preconditions for `POST .../send`. */
async function sendDocument(
  page: Page,
  signer1: string,
  signer2: string,
  title = 'Contractor agreement — A. Kaminski',
): Promise<void> {
  await page.getByTestId('envelope-title-input').fill(title);
  await page.getByTestId('envelope-signer-name-1').fill('Ivan Demchenko');
  await page.getByTestId('envelope-signer-email-1').fill(signer1);
  await page.getByTestId('envelope-signer-name-2').fill('Alex Kaminski');
  await page.getByTestId('envelope-signer-email-2').fill(signer2);
  await page.getByTestId('envelope-send-btn').click();
  await expect(page.getByTestId('toast-envelope-sent')).toHaveText('Sent for signature');
}

/**
 * The id of the envelope the screen just created. Each test owns its organization, so the
 * list holds exactly one — read from the API because `/documents/new` keeps the draft's id
 * out of the URL until it is sent.
 */
async function onlyEnvelopeId(request: APIRequestContext, orgId: string): Promise<string> {
  const response = await request.get(`${API}/api/organizations/${orgId}/envelopes`);
  expect(response.ok()).toBe(true);
  const { envelopes } = (await response.json()) as { envelopes: Array<{ id: string }> };
  expect(envelopes).toHaveLength(1);
  return envelopes[0].id;
}

test.describe('Field autofill', () => {
  test('TC-03-E2E-01: Admin fills contract details', async ({ page, request }) => {
    const fixture = await seed(request, 'af-fill', { profile: null });

    await signIn(page, fixture.adminEmail);
    // Reached the way an admin reaches it — through the members list — rather than by
    // typing the detail address, because the row is the only route the product offers.
    await page.getByTestId(`member-row-${fixture.subject.membershipId}`).click();
    await page.getByTestId('member-detail-tab-contract-details').click();

    await expect(page.getByTestId('member-contract-details')).toBeVisible();
    await expect(page.getByTestId('profile-empty')).toHaveText(
      'No contract details yet. Add them to fill contracts automatically.',
    );

    const edit = page.getByTestId('profile-edit-btn');
    // Requirement 14 — nothing has ever been saved, so the affordance says "add".
    await expect(edit).toHaveText('Add contract details');
    await edit.click();

    await expect(page.getByTestId('profile-form')).toBeVisible();
    await page.getByTestId('profile-input-addressLine').fill(ALEX_PROFILE.addressLine!);
    await page.getByTestId('profile-input-city').fill(ALEX_PROFILE.city!);
    // Requirement 17 — the code is stored, the name is chosen.
    await choose(page, 'profile-input-country', 'Belarus');
    await page.getByTestId('profile-input-taxId').fill(ALEX_PROFILE.taxId!);
    await page.getByTestId('profile-input-dateOfBirth').fill(ALEX_PROFILE.dateOfBirth!);

    await page.getByTestId('profile-save-btn').click();

    await expect(page.getByTestId('toast-profile-saved')).toHaveText('Contract details saved');
    await expect(page.getByTestId('profile-form')).toHaveCount(0);
    await expect(page.getByTestId('profile-row-addressLine')).toContainText(
      ALEX_PROFILE.addressLine!,
    );
    await expect(page.getByTestId('profile-row-taxId')).toContainText(ALEX_PROFILE.taxId!);
    await expect(page.getByTestId('profile-row-country')).toContainText('Belarus');
    await expect(page.getByTestId('profile-row-dateOfBirth')).toContainText('14 March 1991');
    // The admin sees the real values, so nothing is masked and no hint is drawn.
    await expect(page.getByTestId('profile-masked-hint')).toHaveCount(0);
    await expect(page.getByTestId('profile-updated-meta')).toContainText('Last updated');

    // Step 4 — a reload proves the values were stored, not merely echoed by the form.
    await page.goto(CONTRACT_DETAILS(fixture.orgId, fixture.subject.membershipId));
    await expect(page.getByTestId('profile-row-taxId')).toContainText(ALEX_PROFILE.taxId!);
    await expect(page.getByTestId('profile-row-city')).toContainText('Minsk');
    await expect(page.getByTestId('profile-empty')).toHaveCount(0);
  });

  test('TC-03-E2E-02: Autofill visibly prefills the fill form', async ({ page, request }) => {
    const fixture = await seed(request, 'af-prefill', { profile: ALEX_PROFILE });

    await signIn(page, fixture.adminEmail);
    await startDocument(page, fixture.orgId, fixture.subject.name);

    await expect(page.getByTestId('envelope-field-contractor_full_name')).toHaveValue(
      'Alex Kaminski',
    );
    await expect(page.getByTestId('envelope-field-contractor_tax_id')).toHaveValue(
      ALEX_PROFILE.taxId!,
    );
    await expect(page.getByTestId('envelope-field-contractor_address')).toHaveValue(
      ALEX_FULL_ADDRESS,
    );
    await expect(page.getByTestId('envelope-field-contract_date')).toHaveValue(
      todayInZone(ORG_TIMEZONE),
    );

    // Each filled input carries the ⟲ marker naming where the value came from.
    for (const key of [
      'contractor_full_name',
      'contractor_tax_id',
      'contractor_address',
      'contract_date',
    ]) {
      await expect(page.getByTestId(`envelope-field-autofill-${key}`)).toBeVisible();
    }

    // The unbound field is empty and unmarked — autofill filled what it was told to.
    await expect(page.getByTestId('envelope-field-contract_no')).toHaveValue('');
    await expect(page.getByTestId('envelope-field-autofill-contract_no')).toHaveCount(0);

    await expect(page.getByTestId('envelope-autofill-summary')).toHaveText(
      "Fills 4 of 5 fields from this member's profile",
    );
    // A full profile leaves nothing unfilled, so the gap banner is absent rather than empty.
    await expect(page.getByTestId('envelope-autofill-gaps')).toHaveCount(0);

    // Requirement 6 / spec 03's "starting point, not a lock" — the input takes an edit.
    const taxId = page.getByTestId('envelope-field-contractor_tax_id');
    await expect(taxId).toBeEnabled();
    await taxId.fill('999999999');
    await expect(taxId).toHaveValue('999999999');
    // And the marker survives the overwrite: it records where the value came from, not
    // what it currently is (the same rule TC-03-INT-05 states).
    await expect(page.getByTestId('envelope-field-autofill-contractor_tax_id')).toBeVisible();
  });

  test('TC-03-E2E-03: Incomplete profile shows gaps, not an error', async ({ page, request }) => {
    // A member with only a name: no profile row at all, which requirement 14 says must
    // behave exactly like an all-null one.
    const fixture = await seed(request, 'af-gaps', {
      subjectName: { firstName: 'Nina', lastName: 'Novak' },
      profile: null,
    });

    await signIn(page, fixture.adminEmail);
    await startDocument(page, fixture.orgId, fixture.subject.name);

    // Nothing was blocked: the envelope exists and the form is on screen.
    await expect(page.getByTestId('envelope-fill-form')).toBeVisible();
    await expect(page.getByTestId('toast-envelope-error')).toHaveCount(0);

    // What the profile *could* answer is filled; what it could not is a gap.
    await expect(page.getByTestId('envelope-field-contractor_full_name')).toHaveValue('Nina Novak');
    await expect(page.getByTestId('envelope-field-contract_date')).toHaveValue(
      todayInZone(ORG_TIMEZONE),
    );
    await expect(page.getByTestId('envelope-field-contractor_tax_id')).toHaveValue('');
    await expect(page.getByTestId('envelope-field-contractor_address')).toHaveValue('');

    const gaps = page.getByTestId('envelope-autofill-gaps');
    await expect(gaps).toBeVisible();
    await expect(gaps).toContainText('2 field(s) could not be filled');
    await expect(gaps).toContainText('Tax ID');
    await expect(gaps).toContainText('Address');

    // The link opens the subject's Contract details in a new tab, so the half-filled
    // draft on this screen survives the detour.
    const link = page.getByTestId('envelope-open-profile-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute(
      'href',
      `/org/${fixture.orgId}/members/${fixture.subject.membershipId}?tab=contract-details`,
    );
    await expect(link).toHaveAttribute('target', '_blank');

    await expect(page.getByTestId('envelope-autofill-summary')).toHaveText(
      "Fills 2 of 5 fields from this member's profile",
    );
  });

  test('TC-03-E2E-04: Snapshot survives a profile edit', async ({ page, request }) => {
    const fixture = await seed(request, 'af-snapshot', { profile: ALEX_PROFILE });
    const signer1 = uniqueEmail('af-snapshot-company');
    const signer2 = uniqueEmail('af-snapshot-contractor');

    await signIn(page, fixture.adminEmail);
    await startDocument(page, fixture.orgId, fixture.subject.name);
    await expect(page.getByTestId('envelope-field-contractor_tax_id')).toHaveValue(
      ALEX_PROFILE.taxId!,
    );
    const envelopeId = await onlyEnvelopeId(request, fixture.orgId);

    // Step 1 — the profile is edited in another tab, exactly as the case describes, while
    // the draft stays open in the first.
    const other = await page.context().newPage();
    await other.goto(CONTRACT_DETAILS(fixture.orgId, fixture.subject.membershipId));
    await other.getByTestId('profile-edit-btn').click();
    await other.getByTestId('profile-input-taxId').fill('999999999');
    await other.getByTestId('profile-save-btn').click();
    await expect(other.getByTestId('toast-profile-saved')).toBeVisible();
    await expect(other.getByTestId('profile-row-taxId')).toContainText('999999999');
    await other.close();

    // Step 2 — back to the draft, reloaded from the server rather than from React state,
    // which is the only way this can be a claim about the stored snapshot.
    await page.goto(`${DOCUMENTS(fixture.orgId)}/${envelopeId}`);
    await expect(page.getByTestId('envelope-status')).toHaveText('Draft');
    await expect(page.getByTestId('envelope-field-contractor_tax_id')).toHaveValue(
      ALEX_PROFILE.taxId!,
    );

    // And the assertion that matters: requirement 8 is about the *contract*, not about a
    // form field, so the same claim is made on the document the signers are shown.
    await sendDocument(page, signer1, signer2);
    await expect(page.getByTestId('envelope-status')).toHaveText('Sent');
    // The frozen document only exists once the screen has reloaded the sent envelope.
    await expect(page.getByTestId('envelope-document-frame')).toBeVisible();
    const srcdoc = await page.getByTestId('envelope-document-frame').getAttribute('srcdoc');
    expect(srcdoc).toContain(ALEX_PROFILE.taxId!);
    expect(srcdoc).not.toContain('999999999');
    expect(srcdoc).toContain(ALEX_FULL_ADDRESS);
  });

  test('TC-03-E2E-05: Manager sees masked values', async ({ page, request }) => {
    const fixture = await seed(request, 'af-mask', { profile: ALEX_PROFILE });
    const manager = await addMemberToOrganization(fixture.orgId, {
      firstName: 'Greta',
      lastName: 'Manager',
      email: uniqueEmail('af-mask-manager'),
    });
    await setMembershipRole(request, manager.email, 'manager');
    const signer1 = uniqueEmail('af-mask-company');
    const signer2 = uniqueEmail('af-mask-contractor');

    await signIn(page, manager.email);
    await page.goto(CONTRACT_DETAILS(fixture.orgId, fixture.subject.membershipId));

    // Half one — requirement 20: the non-sensitive half is legible, the sensitive half is
    // a mask, and the card says so rather than pretending the profile is empty.
    await expect(page.getByTestId('member-contract-details')).toBeVisible();
    await expect(page.getByTestId('profile-row-addressLine')).toContainText(
      ALEX_PROFILE.addressLine!,
    );
    await expect(page.getByTestId('profile-row-city')).toContainText('Minsk');
    await expect(page.getByTestId('profile-row-taxId')).toContainText('***4567');
    await expect(page.getByTestId('profile-row-taxId')).not.toContainText(ALEX_PROFILE.taxId!);
    await expect(page.getByTestId('profile-row-idDocumentNumber')).toContainText('***4567');
    await expect(page.getByTestId('profile-row-idDocumentNumber')).not.toContainText('MP1234567');
    await expect(page.getByTestId('profile-row-dateOfBirth')).toContainText('1991');
    await expect(page.getByTestId('profile-row-dateOfBirth')).not.toContainText('March');
    await expect(page.getByTestId('profile-row-bankDetails')).toContainText('••••');
    await expect(page.getByTestId('profile-row-bankDetails')).not.toContainText('IBAN');
    await expect(page.getByTestId('profile-masked-hint')).toHaveText(
      'Some values are hidden. Ask an admin if you need them.',
    );
    // States table — "Masked → Edit is absent". Absent, not disabled: there is nothing
    // complete enough for this caller to save.
    await expect(page.getByTestId('profile-edit-btn')).toHaveCount(0);
    // Nothing else on the page leaks what the rows refuse to print.
    expect(await page.content()).not.toContain(ALEX_PROFILE.bankDetails!);

    /* ---- half two: the same manager, the same values, inside a document ---- */

    await startDocument(page, fixture.orgId, fixture.subject.name);
    // The manager's alt flow: the input is read-only and labelled, because this caller
    // cannot judge a value they may not read.
    await expect(page.getByTestId('envelope-field-masked-contractor_tax_id')).toHaveText(
      'Hidden — will be filled automatically',
    );
    await expect(page.getByTestId('envelope-field-contractor_tax_id')).toBeDisabled();

    await sendDocument(page, signer1, signer2);
    await expect(page.getByTestId('envelope-status')).toHaveText('Sent');

    // Requirement 23, and the regression this half of the case exists to catch: masking
    // governs the **profile**, never the document. Once snapshotted, the value is part of
    // the contract and is shown in full to anyone who may view the envelope — a manager
    // who could not read the terms of the contract they just sent would be useless.
    await expect(page.getByTestId('envelope-document-frame')).toBeVisible();
    const srcdoc = await page.getByTestId('envelope-document-frame').getAttribute('srcdoc');
    expect(srcdoc).toContain(ALEX_PROFILE.taxId!);
    expect(srcdoc).not.toContain('***4567');
    expect(srcdoc).toContain(ALEX_FULL_ADDRESS);
  });

  test('TC-03-E2E-06: A member edits their own contract details', async ({ page, request }) => {
    const fixture = await seed(request, 'af-self', { profile: ALEX_PROFILE });
    // The viewer here is the subject themselves — a plain `user` (the role `seed` gives
    // them) looking at their own row, which is the matrix's "user (own)" column.
    await signIn(page, fixture.subject.email);
    await page.getByTestId(`member-row-${fixture.subject.membershipId}`).click();
    await page.getByTestId('member-detail-tab-contract-details').click();

    // The permission matrix's "user (own)" column: full values, and the right to edit.
    await expect(page.getByTestId('profile-row-taxId')).toContainText(ALEX_PROFILE.taxId!);
    await expect(page.getByTestId('profile-row-bankDetails')).toContainText('IBAN BY13');
    await expect(page.getByTestId('profile-masked-hint')).toHaveCount(0);

    await page.getByTestId('profile-edit-btn').click();
    await expect(page.getByTestId('profile-input-addressLine')).toHaveValue(
      ALEX_PROFILE.addressLine!,
    );
    await page.getByTestId('profile-input-addressLine').fill('Kalvariyskaya 17, apt 9');
    await page.getByTestId('profile-input-bankDetails').fill('IBAN BY99 PRIO 3014 1111 2222 3333');
    await page.getByTestId('profile-save-btn').click();

    await expect(page.getByTestId('toast-profile-saved')).toHaveText('Contract details saved');
    await expect(page.getByTestId('profile-row-addressLine')).toContainText(
      'Kalvariyskaya 17, apt 9',
    );
    await expect(page.getByTestId('profile-row-bankDetails')).toContainText('BY99 PRIO');

    // Stored, not just rendered. Reloaded through the `?tab=` address rather than
    // `page.reload()`, because the tab is component state: a plain reload lands on About.
    await page.goto(CONTRACT_DETAILS(fixture.orgId, fixture.subject.membershipId));
    await expect(page.getByTestId('profile-row-addressLine')).toContainText(
      'Kalvariyskaya 17, apt 9',
    );
  });

  test("TC-03-E2E-07: A member cannot see another member's contract details", async ({
    page,
    request,
  }) => {
    const fixture = await seed(request, 'af-other', { profile: ALEX_PROFILE });
    const outsider = await addMemberToOrganization(fixture.orgId, {
      firstName: 'Pavel',
      lastName: 'Regular',
      email: uniqueEmail('af-other-user'),
    });
    await setMembershipRole(request, outsider.email, 'user');

    await signIn(page, outsider.email);

    // The tab is absent for a role the matrix gives no read access to — not disabled, and
    // not a tab that leads to an error.
    await page.goto(MEMBER(fixture.orgId, fixture.subject.membershipId));
    await expect(page.getByTestId('member-detail-tab-about')).toBeVisible();
    await expect(page.getByTestId('member-detail-tab-contract-details')).toHaveCount(0);
    await expect(page.getByTestId('member-contract-details')).toHaveCount(0);

    // Typing the tab's own address is the same wall, and the API behind it refuses too —
    // otherwise the screen would be the only thing standing between a member and someone
    // else's passport number.
    await page.goto(CONTRACT_DETAILS(fixture.orgId, fixture.subject.membershipId));
    await expect(page.getByTestId('member-detail-tab-about')).toBeVisible();
    await expect(page.getByTestId('member-contract-details')).toHaveCount(0);

    const content = await page.content();
    expect(content).not.toContain(ALEX_PROFILE.taxId!);
    expect(content).not.toContain(ALEX_PROFILE.idDocumentNumber!);
    expect(content).not.toContain(ALEX_PROFILE.bankDetails!);
    expect(content).not.toContain('***4567');

    // `page.request` shares the browser context's cookies, so this asks the question **as
    // the person on screen**. The `request` fixture holds the admin session every
    // precondition ran under, and a 403 proved with the wrong identity proves nothing.
    const refused = await page.request.get(
      `${API}/api/organizations/${fixture.orgId}/members/${fixture.subject.membershipId}/profile`,
    );
    expect(refused.status()).toBe(403);
  });

  test('TC-03-E2E-08: Autofilled Cyrillic values reach the signed document', async ({
    page,
    request,
  }) => {
    const cyrillicProfile: MemberProfileSeed = {
      ...ALEX_PROFILE,
      addressLine: 'пр. Независимости 1, кв. 5',
      city: 'Минск',
    };
    const cyrillicFields = [
      {
        key: 'contractor_full_name',
        label: 'ФИО',
        required: true,
        autofillSource: 'member.fullName',
        order: 1,
      },
      {
        key: 'contractor_tax_id',
        label: 'УНП',
        required: true,
        autofillSource: 'member.taxId',
        order: 2,
      },
      {
        key: 'contractor_address',
        label: 'Адрес',
        type: 'multiline',
        required: true,
        autofillSource: 'member.fullAddress',
        order: 3,
      },
      {
        key: 'contract_date',
        label: 'Дата договора',
        type: 'date',
        required: true,
        autofillSource: 'today',
        order: 4,
      },
      { key: 'contract_no', label: 'Номер', required: false, autofillSource: null, order: 5 },
    ];
    const fixture = await seed(request, 'af-cyrillic', {
      subjectName: { firstName: 'Алексей', lastName: 'Каминский' },
      profile: cyrillicProfile,
      templateName: 'Договор подряда',
      body:
        '<p>ДОГОВОР подряда с {{contractor_full_name}}, УНП {{contractor_tax_id}}.</p>' +
        '<p>Адрес: {{contractor_address}}</p>' +
        '<p>Дата {{contract_date}}, номер {{contract_no}}.</p>',
      fields: cyrillicFields,
    });
    const fullAddress = 'пр. Независимости 1, кв. 5, Минск, 220030, Belarus';
    const signer1 = uniqueEmail('af-cyrillic-company');
    const signer2 = uniqueEmail('af-cyrillic-contractor');

    await signIn(page, fixture.adminEmail);
    await startDocument(page, fixture.orgId, fixture.subject.name, 'Договор подряда (v1)');

    await expect(page.getByTestId('envelope-field-contractor_full_name')).toHaveValue(
      'Алексей Каминский',
    );
    await expect(page.getByTestId('envelope-field-contractor_address')).toHaveValue(fullAddress);

    const envelopeId = await onlyEnvelopeId(request, fixture.orgId);
    await sendDocument(page, signer1, signer2, 'Договор подряда — А. Каминский');

    // Both signatures are preconditions here, not the thing under test — spec 02's suite
    // is what proves the signing screens work.
    await signViaApi(request, await signingLinkFor(request, signer1), {
      typedName: 'Иван Демченко',
    });
    await signViaApi(request, await signingLinkFor(request, signer2), {
      typedName: 'Алексей Каминский',
    });
    await waitForSignedPdf(request, fixture.orgId, envelopeId);

    await page.goto(`${DOCUMENTS(fixture.orgId)}/${envelopeId}`);
    await expect(page.getByTestId('envelope-status')).toHaveText('Completed');
    await expect(page.getByTestId('envelope-document-frame')).toBeVisible();

    // The claim of this case: the *completed document* carries the autofilled Cyrillic
    // values byte for byte. Asserted on `srcdoc` because the frame is `sandbox=""` and
    // its content is unreachable from the test — see the note at the top of this file.
    const srcdoc = await page.getByTestId('envelope-document-frame').getAttribute('srcdoc');
    expect(srcdoc).toContain('Алексей Каминский');
    expect(srcdoc).toContain(fullAddress);
    expect(srcdoc).toContain('ДОГОВОР подряда');
    expect(srcdoc).not.toContain('�');
    expect(srcdoc).not.toContain('{{');

    // Also where the value is stored: the round trip through resolution, the database and
    // the response is exactly the path an encoding bug would break.
    const detail = await (
      await request.get(`${API}/api/organizations/${fixture.orgId}/envelopes/${envelopeId}`)
    ).json();
    const address = detail.fields.find((field: { key: string }) => field.key === 'contractor_address');
    expect(address.value).toBe(fullAddress);
    expect(address.label).toBe('Адрес');

    // The PDF is fetched rather than clicked through, because the click hands the
    // presigned URL to the browser and navigates away from the screen under test. Its
    // *text* is deliberately not asserted, for the reason spec 02's TC-02-E2E-09 records:
    // Chromium embeds a subsetted font, so the bytes carry glyph ids rather than Unicode.
    // The Cyrillic claim is made above, on the document the renderer is handed.
    await expect(page.getByTestId('envelope-download-btn')).toBeEnabled();
    const url = (
      await (
        await request.get(
          `${API}/api/organizations/${fixture.orgId}/envelopes/${envelopeId}/document`,
        )
      ).json()
    ).url as string;
    const pdf = await request.get(url);
    expect(pdf.ok()).toBe(true);
    const bytes = await pdf.body();
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(bytes.byteLength).toBeGreaterThan(2000);
  });
});
