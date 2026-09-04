import { request as apiContexts, type APIRequestContext, type Page } from '@playwright/test';
import { API_ORIGIN } from '../environment';

/**
 * Signup is irreversible by design (no delete endpoint yet), so tests never reuse an
 * address — each one mints its own. Members are scoped to the organization the test
 * just created, so a shared database still gives every test a clean list.
 *
 * The worker index is in there because the counter is **per process**, and Playwright runs
 * one process per worker: with a shared clock and two counters both starting at zero, two
 * workers mint the same address in the same millisecond and the second signup comes back
 * 409. That is not a flake to retry past — it is two tests being handed one account.
 */
let counter = 0;
const WORKER = process.env.TEST_PARALLEL_INDEX ?? process.env.TEST_WORKER_INDEX ?? '0';
export function uniqueEmail(prefix = 'owner'): string {
  counter += 1;
  return `${prefix}+${Date.now()}-w${WORKER}-${counter}@acme.com`;
}

export interface SignupValues {
  orgName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
}

export const VALID: Required<SignupValues> = {
  orgName: 'Acme Inc',
  firstName: 'Pat',
  lastName: 'Owner',
  email: 'owner@acme.com',
  password: 'Passw0rd',
};

const FIELDS: Array<[keyof SignupValues, string]> = [
  ['orgName', 'signup-org-name-input'],
  ['firstName', 'signup-first-name-input'],
  ['lastName', 'signup-last-name-input'],
  ['email', 'signup-email-input'],
  ['password', 'signup-password-input'],
];

/** Fills only the fields present in `values`; an empty string clears the field. */
export async function fillSignup(page: Page, values: SignupValues): Promise<void> {
  for (const [key, testId] of FIELDS) {
    const value = values[key];
    if (value === undefined) continue;
    await page.getByTestId(testId).fill(value);
  }
}

/**
 * Where the suite's own HTTP calls go.
 *
 * Locally that is the API's dev server, reached directly. Against a deployment it is the
 * *web* address: the API has no public one, and `/api/*` is proxied there by the rewrite in
 * next.config.mjs — so pointing at the web host is not a shortcut, it is the only route in,
 * and using it means these calls travel the same path a browser's do.
 */
export const API = API_ORIGIN;

/**
 * Headers for every `/api/test/*` fixture — the mail sink, the role switch, the membership
 * move, and the envelope-expiry write.
 *
 * Empty locally, where the fixtures are open to anyone who can reach the dev server.
 * Against a deployment they are shut unless a token is presented, so `make e2e-<env>`
 * fetches it from SSM and puts it here. No token, no fixtures, and the suite fails saying
 * so rather than pretending.
 *
 * One header set rather than one per route, because they are one fence: see
 * `apps/api/src/test-support/fixture-gate.ts`.
 */
const FIXTURE_HEADERS: Record<string, string> = process.env.E2E_FIXTURE_TOKEN
  ? { authorization: `Bearer ${process.env.E2E_FIXTURE_TOKEN}` }
  : {};

/** Registers an account straight through the API — a precondition, not the thing under test. */
export async function registerAccount(
  request: APIRequestContext,
  email: string,
  password: string = VALID.password,
): Promise<void> {
  const response = await request.post(`${API}/api/signup`, {
    data: { ...VALID, email, password, orgName: 'Existing Org', timezone: 'Europe/Berlin' },
  });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not register ${email} (${response.status()})`);
  }
}

/**
 * Reads the reset link out of the test mail sink — the closest a test can get to
 * opening the email. Only answers while the API runs the sink transport.
 */
export async function latestResetToken(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const response = await request.get(`${API}/api/test/mail/latest`, {
    params: { email },
    headers: FIXTURE_HEADERS,
  });
  if (!response.ok()) {
    throw new Error(`No reset mail for ${email} (${response.status()})`);
  }
  return (await response.json()).token as string;
}

export interface RegisteredOrganization {
  email: string;
  accountId: string;
  orgId: string;
}

/**
 * Registers an account and hands back the organization it created. `registerAccount`
 * throws its response away, and the documents routes are all organization-scoped, so a
 * test that never touches the members screen still needs the id from signup rather than
 * scraping it out of a URL.
 *
 * The signup response also issues the session cookie into this `request` context, which
 * is what lets the API-level preconditions below run as this admin.
 *
 * `accountId` comes back because hiring's preconditions assign the owner as an
 * interviewer, which is a fact about an account rather than a membership. The default
 * organization name is `Acme Inc` — the booking and manage pages render it as the only
 * branding a candidate sees, and those cases assert on it by name.
 */
export async function registerOrganization(
  request: APIRequestContext,
  email: string,
  orgName = 'Acme Inc',
): Promise<RegisteredOrganization> {
  const response = await request.post(`${API}/api/signup`, {
    data: { ...VALID, email, orgName, timezone: 'Europe/Berlin' },
  });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not register ${email} (${response.status()})`);
  }
  const body = await response.json();
  return { email, accountId: body.account.id as string, orgId: body.organization.id as string };
}

/** Signs in through the UI and waits for the app shell to settle. */
export async function signIn(
  page: Page,
  email: string,
  password: string = VALID.password,
): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL('**/members');
}

/**
 * Sets an existing member's role, so an E2E run can sign in as a manager, a user, or a
 * viewer.
 *
 * This used to be `POST /api/test/role`, a fixture that existed because signup always
 * created an `admin` and nothing could change that. Spec 04 brought the real thing, so
 * this is `PUT .../members/:memberId` now — the same call the Members screen makes.
 *
 * One consequence is worth knowing before reaching for it: **the sole admin cannot be
 * demoted.** The zero-admin guard refuses it, correctly, so a test that wants a manager
 * or a user invites one rather than demoting the admin it already has.
 */
export async function setMembershipRole(
  request: APIRequestContext,
  orgId: string,
  email: string,
  role: 'admin' | 'manager' | 'user' | 'viewer',
): Promise<void> {
  const member = await findMember(request, orgId, email);
  // `jobTitle` is sent because `PUT` replaces the record rather than patching it, and
  // omitting it would blank a member's title as a side effect of changing their role.
  const detail = await request.get(
    `${API}/api/organizations/${orgId}/members/${member.id}`,
  );
  const jobTitle = detail.ok() ? ((await detail.json()).jobTitle ?? '') : '';

  const response = await request.put(
    `${API}/api/organizations/${orgId}/members/${member.id}`,
    { data: { role, jobTitle } },
  );
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not set ${email} to ${role} ` +
        `(${response.status()} ${await response.text()})`,
    );
  }
}

export interface SeedField {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  filledBy?: string;
  order?: number;
}

export interface TemplateSeed {
  name: string;
  description?: string | null;
  bodyHtml?: string;
  fields?: SeedField[];
  /** Defaults to the spec's `company` / `contractor` pair — the only valid count is two. */
  signerRoles?: Array<{ key: string; label: string; order: number }>;
  publish?: boolean;
}

const DEFAULT_SIGNERS = [
  { key: 'company', label: 'Company', order: 1 },
  { key: 'contractor', label: 'Contractor', order: 2 },
];

/**
 * Builds a template straight through the API. Every E2E case except TC-01 arrives at a
 * screen that already has one, and driving the editor to get there would make each test
 * depend on the flow the previous test is the one actually verifying.
 *
 * The caller must already hold an admin session in this `request` context — see
 * `registerOrganization`.
 */
export async function createTemplate(
  request: APIRequestContext,
  orgId: string,
  seed: TemplateSeed,
): Promise<string> {
  const base = `${API}/api/organizations/${orgId}/document-templates`;

  const created = await request.post(base, {
    data: { name: seed.name, description: seed.description ?? null },
  });
  if (created.status() !== 201) {
    throw new Error(`Precondition failed: could not create "${seed.name}" (${created.status()})`);
  }
  const { id } = await created.json();

  if (seed.bodyHtml === undefined && seed.fields === undefined && !seed.publish) return id;

  // The lock is read back rather than assumed: the schema's starting value is an
  // implementation detail, and a precondition that guesses it would fail as a 409 that
  // looks like a bug in the test under way.
  const detail = await (await request.get(`${base}/${id}`)).json();

  const draft = await request.put(`${base}/${id}/draft`, {
    data: {
      rowVersion: detail.draftVersion.rowVersion,
      bodyHtml: seed.bodyHtml ?? '',
      signerRoles: seed.signerRoles ?? DEFAULT_SIGNERS,
      fields: (seed.fields ?? []).map((field, index) => ({
        key: field.key,
        label: field.label,
        type: field.type ?? 'text',
        required: field.required ?? false,
        options: null,
        maxLength: null,
        filledBy: field.filledBy ?? 'sender',
        autofillSource: null,
        order: field.order ?? index + 1,
      })),
    },
  });
  if (!draft.ok()) {
    throw new Error(
      `Precondition failed: could not save the draft of "${seed.name}" ` +
        `(${draft.status()} ${await draft.text()})`,
    );
  }

  if (seed.publish) {
    const published = await request.post(`${base}/${id}/publish`, { data: {} });
    if (!published.ok()) {
      throw new Error(
        `Precondition failed: could not publish "${seed.name}" ` +
          `(${published.status()} ${await published.text()})`,
      );
    }
  }

  return id;
}

/* ------------------------------------------------------------------ *
 * Spec 02 — envelopes and signing.
 *
 * The same rule as the template helpers above: preconditions are built through the
 * public API, because an envelope produced by `POST` + `PUT` + `send` is the envelope the
 * product actually produces, and seeding rows would let a bug in creation hide behind a
 * correct-looking test.
 * ------------------------------------------------------------------ */

export interface EnvelopeSignerSeed {
  name: string;
  email: string;
}

export interface EnvelopeSeed {
  templateId: string;
  title?: string;
  /** Sender-owned values only; the signer's own fields are filled on the signing page. */
  fieldValues?: Record<string, string>;
  signers: [EnvelopeSignerSeed, EnvelopeSignerSeed];
  expiresInDays?: number;
  /** The member the contract is about (spec 03). Omitted means an envelope with none. */
  subjectMembershipId?: string;
  /** Leave false to keep the envelope in `draft`. */
  send?: boolean;
}

export interface SeededEnvelope {
  id: string;
  signers: Array<{ id: string; roleKey: string; order: number }>;
}

/**
 * Creates an envelope from a published template, fills the sender's half, and optionally
 * sends it. The caller must already hold an admin session in this `request` context.
 */
export async function createEnvelope(
  request: APIRequestContext,
  orgId: string,
  seed: EnvelopeSeed,
): Promise<SeededEnvelope> {
  const base = `${API}/api/organizations/${orgId}/envelopes`;

  const created = await request.post(base, {
    data: {
      templateId: seed.templateId,
      subjectMembershipId: seed.subjectMembershipId ?? null,
      title: null,
      expiresInDays: seed.expiresInDays ?? 30,
    },
  });
  if (created.status() !== 201) {
    throw new Error(
      `Precondition failed: could not create an envelope (${created.status()} ${await created.text()})`,
    );
  }
  const envelope = (await created.json()) as SeededEnvelope;

  // Signers are materialized empty at creation (requirement 3), so the names and
  // addresses arrive with the fill, in the pinned role order.
  const ordered = [...envelope.signers].sort((a, b) => a.order - b.order);
  const updated = await request.put(`${base}/${envelope.id}`, {
    data: {
      title: seed.title ?? 'Contractor agreement — A. Kaminski',
      expiresInDays: seed.expiresInDays ?? 30,
      fieldValues: seed.fieldValues ?? {},
      signers: ordered.map((signer, index) => ({
        id: signer.id,
        name: seed.signers[index].name,
        email: seed.signers[index].email,
        order: signer.order,
      })),
    },
  });
  if (!updated.ok()) {
    throw new Error(
      `Precondition failed: could not fill the envelope (${updated.status()} ${await updated.text()})`,
    );
  }

  if (seed.send) await sendEnvelope(request, orgId, envelope.id);

  return { id: envelope.id, signers: ordered };
}

/** `POST .../send` — freezes the document and mails the first signer their link. */
export async function sendEnvelope(
  request: APIRequestContext,
  orgId: string,
  envelopeId: string,
): Promise<void> {
  const sent = await request.post(
    `${API}/api/organizations/${orgId}/envelopes/${envelopeId}/send`,
    { data: {} },
  );
  if (!sent.ok()) {
    throw new Error(
      `Precondition failed: could not send the envelope (${sent.status()} ${await sent.text()})`,
    );
  }
}

/** One message out of the test mail sink, or `null` when the address received none. */
export async function latestMail(
  request: APIRequestContext,
  email: string,
  type?: string,
): Promise<Record<string, unknown> | null> {
  const params: Record<string, string> = { email };
  if (type) params.type = type;
  const response = await request.get(`${API}/api/test/mail/latest`, {
    params,
    headers: FIXTURE_HEADERS,
  });
  if (response.status() === 404) return null;
  if (!response.ok()) {
    throw new Error(`Mail sink refused the read for ${email} (${response.status()})`);
  }
  return (await response.json()) as Record<string, unknown>;
}

/**
 * The signing link a recipient would click, read out of the sink exactly as they would
 * read it out of their inbox. Returns the path so it can be opened against Playwright's
 * `baseURL` — the sink hands back an absolute URL built from `APP_PUBLIC_URL`, and a test
 * should not depend on how the API server under test happened to be started.
 */
export async function signingLinkFor(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const message = await latestMail(request, email, 'signing_invitation');
  if (!message) throw new Error(`No signing invitation for ${email}`);
  return new URL(String(message.signingUrl)).pathname;
}

/** The raw token out of a `/sign/{token}` link — what the public API is keyed on. */
export const tokenOf = (link: string): string => link.split('/sign/')[1];

/**
 * Signs through the public API, the way the signing page does: read the document first
 * (which is what records the `viewed` event), then submit.
 *
 * Used where a test needs a signature as a *precondition* rather than as the thing under
 * test — TC-02-E2E-06 and -10 are about what the link and the audit trail look like
 * afterwards, and driving the canvas twice more to get there would make them fail
 * whenever TC-02-E2E-02 does.
 */
export async function signViaApi(
  request: APIRequestContext,
  link: string,
  options: { typedName: string; fieldValues?: Record<string, string> } = {
    typedName: 'Ivan Demchenko',
  },
): Promise<void> {
  const token = tokenOf(link);
  const opened = await request.get(`${API}/api/sign/${token}`);
  if (!opened.ok()) {
    throw new Error(`Precondition failed: could not open ${link} (${opened.status()})`);
  }

  const signed = await request.post(`${API}/api/sign/${token}/sign`, {
    data: {
      fieldValues: options.fieldValues ?? {},
      signature: { type: 'typed', value: options.typedName },
      consentAccepted: true,
    },
  });
  if (!signed.ok()) {
    throw new Error(
      `Precondition failed: could not sign ${link} (${signed.status()} ${await signed.text()})`,
    );
  }
}

/** Polls the envelope until its PDF is rendered. The render runs inline, off-request. */
export async function waitForSignedPdf(
  request: APIRequestContext,
  orgId: string,
  envelopeId: string,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = 'unknown';
  while (Date.now() < deadline) {
    const response = await request.get(
      `${API}/api/organizations/${orgId}/envelopes/${envelopeId}`,
    );
    if (response.ok()) {
      last = (await response.json()).pdfStatus as string;
      if (last === 'ready') return;
      if (last === 'failed') break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The signed PDF never became ready (pdfStatus=${last})`);
}

/**
 * Moves an envelope's expiry into the past.
 *
 * There is no UI or API for this and a test cannot advance the clock, so this goes around
 * the product — the same exception the spec's own TC-02-INT-17 takes. It goes around it
 * through a fenced fixture route rather than a Prisma client of the suite's own, which is
 * what lets the test run against a deployment: the database there has no route from
 * outside its VPC, and a precondition that needs one is a precondition that quietly
 * un-tests the environment it matters most in.
 *
 * The sweep is deliberately *not* run afterwards: the point of TC-02-E2E-07 is that lazy
 * expiry is authoritative even when the stored status still says `sent` (requirement 34).
 */
export async function expireEnvelope(
  request: APIRequestContext,
  orgId: string,
  envelopeId: string,
): Promise<void> {
  const response = await request.post(`${API}/api/test/envelopes/expire`, {
    data: { orgId, envelopeId },
    headers: FIXTURE_HEADERS,
  });
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not expire ${envelopeId} ` +
        `(${response.status()} ${await response.text()})`,
    );
  }
}


/* ------------------------------------------------------------------ *
 * Spec 03 — field autofill.
 *
 * Everything below is additive: the spec 01/02 helpers above are untouched, because the
 * suites that use them are green and their fixtures are not this spec's to reshape.
 * ------------------------------------------------------------------ */

export interface OrganizationMemberSeed {
  firstName: string;
  lastName: string;
  /** Defaults to a fresh address. */
  email?: string;
}

export interface SeededMember {
  membershipId: string;
  email: string;
  /** `firstName lastName` — what `member.fullName` resolves to and what the UI prints. */
  name: string;
}

/**
 * Puts a **second person into an existing organization** — the precondition every case
 * about two members looking at each other's records is impossible without.
 *
 * It invites them and accepts on their behalf, which is the product's own flow: spec 04
 * retired the fixture that used to do this by moving a membership sideways, exactly as
 * that fixture's own comments promised it would. A test now builds its people the way a
 * person does.
 *
 * The accept runs in its **own** `APIRequestContext`, and that is load-bearing rather
 * than tidy. Accepting signs the invitee in, so doing it in the caller's context would
 * silently replace the admin session every precondition after this one depends on.
 */
export async function addMemberToOrganization(
  request: APIRequestContext,
  orgId: string,
  seed: OrganizationMemberSeed,
): Promise<SeededMember> {
  const email = seed.email ?? uniqueEmail('member');

  // Invited as a `user`: the least it can be, so that a test which cares about the role
  // says so itself with `setMembershipRole` rather than inheriting one from a fixture.
  await sendInvitation(request, email, 'user');
  const token = await latestInvitationToken(request, email);

  const invitee = await apiContexts.newContext();
  try {
    await acceptInvitationViaApi(invitee, {
      token,
      firstName: seed.firstName,
      lastName: seed.lastName,
      password: VALID.password,
      timezone: 'Europe/Berlin',
    });
  } finally {
    await invitee.dispose();
  }

  const member = await findMember(request, orgId, email);
  return {
    membershipId: member.id,
    email,
    name: `${seed.firstName} ${seed.lastName}`,
  };
}

/** The eight contract-detail columns, as `PUT .../profile` takes them. */
export interface MemberProfileSeed {
  addressLine?: string | null;
  city?: string | null;
  postalCode?: string | null;
  /** ISO 3166-1 alpha-2 (requirement 17). */
  country?: string | null;
  taxId?: string | null;
  /** ISO `YYYY-MM-DD`. */
  dateOfBirth?: string | null;
  idDocumentNumber?: string | null;
  bankDetails?: string | null;
}

/**
 * Writes a member's contract details through the documented `PUT`, as a precondition.
 * The caller must hold a session that `EditMemberProfile` covers — an admin of the
 * organization, or the member themselves.
 */
export async function setMemberProfile(
  request: APIRequestContext,
  orgId: string,
  memberId: string,
  profile: MemberProfileSeed,
): Promise<void> {
  const response = await request.put(
    `${API}/api/organizations/${orgId}/members/${memberId}/profile`,
    { data: profile },
  );
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not save the profile of ${memberId} ` +
        `(${response.status()} ${await response.text()})`,
    );
  }
}

export interface AutofillSeedField {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  filledBy?: string;
  maxLength?: number | null;
  /** A catalogue key (`member.taxId`, `today`, …) or `null` for an unbound field. */
  autofillSource?: string | null;
  order?: number;
}

export interface AutofillTemplateSeed {
  name: string;
  bodyHtml: string;
  fields: AutofillSeedField[];
  signerRoles?: Array<{ key: string; label: string; order: number }>;
  publish?: boolean;
}

/**
 * `createTemplate` with bound fields.
 *
 * A separate helper rather than an extra key on `TemplateSeed`, because `createTemplate`
 * and its `SeedField` are spec 01/02's fixture: three green suites call them, and widening
 * an export they share to carry a spec 03 concern is how a passing suite starts failing
 * for reasons that have nothing to do with what it tests. The draft/publish shape below
 * is deliberately identical to that helper's — the same lock read-back, for the same
 * reason it gives.
 */
export async function createAutofillTemplate(
  request: APIRequestContext,
  orgId: string,
  seed: AutofillTemplateSeed,
): Promise<string> {
  const base = `${API}/api/organizations/${orgId}/document-templates`;

  const created = await request.post(base, { data: { name: seed.name, description: null } });
  if (created.status() !== 201) {
    throw new Error(`Precondition failed: could not create "${seed.name}" (${created.status()})`);
  }
  const { id } = await created.json();

  const detail = await (await request.get(`${base}/${id}`)).json();

  const draft = await request.put(`${base}/${id}/draft`, {
    data: {
      rowVersion: detail.draftVersion.rowVersion,
      bodyHtml: seed.bodyHtml,
      signerRoles: seed.signerRoles ?? [
        { key: 'company', label: 'Company', order: 1 },
        { key: 'contractor', label: 'Contractor', order: 2 },
      ],
      fields: seed.fields.map((field, index) => ({
        key: field.key,
        label: field.label,
        type: field.type ?? 'text',
        required: field.required ?? false,
        options: null,
        maxLength: field.maxLength ?? null,
        filledBy: field.filledBy ?? 'sender',
        autofillSource: field.autofillSource ?? null,
        order: field.order ?? index + 1,
      })),
    },
  });
  if (!draft.ok()) {
    throw new Error(
      `Precondition failed: could not save the draft of "${seed.name}" ` +
        `(${draft.status()} ${await draft.text()})`,
    );
  }

  if (seed.publish) {
    const published = await request.post(`${base}/${id}/publish`, { data: {} });
    if (!published.ok()) {
      throw new Error(
        `Precondition failed: could not publish "${seed.name}" ` +
          `(${published.status()} ${await published.text()})`,
      );
    }
  }

  return id;
}

/**
 * The server's own idea of "today", in the organization's timezone — which is what
 * `today` resolves to (requirement 2). Computed rather than hardcoded, and computed in
 * the org zone rather than the runner's, so a suite run at 23:30 UTC in Berlin does not
 * fail on a date that is genuinely correct.
 */
export function todayInZone(timezone = 'Europe/Berlin'): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Fires the forgot-password request straight through the API, as a precondition. */
export async function requestReset(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const response = await request.post(`${API}/api/forgot-password`, { data: { email } });
  if (!response.ok()) throw new Error(`Reset request failed for ${email}`);
}

export interface SignedUpOrg {
  accountId: string;
  organizationId: string;
}

/**
 * Signs up a fresh organization straight through the API — a precondition, not the
 * thing under test — and leaves `request`'s cookie jar authenticated as its sole admin.
 * Unlike `registerAccount`, this lets a caller pick the org name, which spec 03's
 * invitation tests need (the accept screen renders it back).
 */
export async function signupOrg(
  request: APIRequestContext,
  values: {
    orgName: string;
    email: string;
    firstName?: string;
    lastName?: string;
    password?: string;
    timezone?: string;
  },
): Promise<SignedUpOrg> {
  const response = await request.post(`${API}/api/signup`, {
    data: {
      orgName: values.orgName,
      firstName: values.firstName ?? VALID.firstName,
      lastName: values.lastName ?? VALID.lastName,
      email: values.email,
      password: values.password ?? VALID.password,
      // Signup leaves timezone null when unset, which parks the settings Save button
      // behind an empty required field; callers that go on to save pass a real zone.
      ...(values.timezone ? { timezone: values.timezone } : {}),
    },
  });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not sign up ${values.email} (${response.status()})`);
  }
  const body = await response.json();
  return { accountId: body.account.id, organizationId: body.organization.id };
}

/** Logs in straight through the API, switching `request`'s cookie jar to this account. */
export async function login(
  request: APIRequestContext,
  email: string,
  password: string = VALID.password,
): Promise<void> {
  const response = await request.post(`${API}/api/login`, { data: { email, password } });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not log in ${email} (${response.status()})`);
  }
}

/** Sends an invitation as whichever account `request`'s cookie jar is currently signed in as. */
export async function sendInvitation(
  request: APIRequestContext,
  email: string,
  role: string,
): Promise<void> {
  const response = await request.post(`${API}/api/invitations`, { data: { email, role } });
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not invite ${email} as ${role} (${response.status()})`,
    );
  }
}

/**
 * Reads the invitation link out of the test mail sink, mirroring `latestResetToken`.
 * Only answers while the API runs the sink transport.
 */
export async function latestInvitationToken(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const response = await request.get(`${API}/api/test/mail/latest`, {
    params: { email, type: 'invitation' },
  });
  if (!response.ok()) {
    throw new Error(`No invitation mail for ${email} (${response.status()})`);
  }
  return (await response.json()).token as string;
}

/**
 * Accepts an invitation straight through the API — used to set up preconditions (an
 * already-used invitation, a member created via a prior invite) rather than to exercise
 * the accept screen itself.
 */
export async function acceptInvitationViaApi(
  request: APIRequestContext,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await request.post(`${API}/api/invitations/accept`, { data: payload });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not accept invitation (${response.status()})`);
  }
}

/**
 * Fires an email-change request straight through the API, as a precondition — requires
 * `request`'s cookie jar to already be authenticated as the account changing its email.
 */
export async function requestEmailChangeViaApi(
  request: APIRequestContext,
  newEmail: string,
): Promise<void> {
  const response = await request.post(`${API}/api/account/change-email`, {
    data: { newEmail },
  });
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not request email change to ${newEmail} (${response.status()})`,
    );
  }
}

/**
 * Reads the email-change confirmation link out of the test mail sink, mirroring
 * `latestResetToken` — the confirmation mail is keyed by the NEW address and carries the
 * raw token. Only answers while the API runs the sink transport.
 */
export async function latestEmailChangeToken(
  request: APIRequestContext,
  newEmail: string,
): Promise<string> {
  const response = await request.get(`${API}/api/test/mail/latest`, {
    // Underscores: the wire name is the sink's own discriminator, which is the key in
    // `MailMessages`. It used to be hyphenated here and special-cased in the controller,
    // and one alias is one more place for the two to disagree.
    params: { email: newEmail, type: 'email_change_confirmation' },
  });
  if (!response.ok()) {
    throw new Error(`No email-change mail for ${newEmail} (${response.status()})`);
  }
  return (await response.json()).token as string;
}

/**
 * Test-only backdoor (`TestFixturesController`) that force-expires a pending email
 * change, identified by its NEW address. Mirrors `expireInvitation`: there is no
 * product-facing, HTTP-only way to fast-forward 24 hours.
 */
export async function expireEmailChange(
  request: APIRequestContext,
  newEmail: string,
): Promise<void> {
  const response = await request.post(`${API}/api/test/email-change/expire`, {
    data: { email: newEmail },
  });
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not expire email change for ${newEmail} (${response.status()})`,
    );
  }
}

/**
 * Test-only backdoor (`TestFixturesController`) that force-expires a pending
 * invitation. There is no product-facing, HTTP-only way to fast-forward seven days.
 */
export async function expireInvitation(request: APIRequestContext, email: string): Promise<void> {
  const response = await request.post(`${API}/api/test/invitations/expire`, { data: { email } });
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not expire invitation for ${email} (${response.status()})`,
    );
  }
}

/**
 * Test-only backdoor (`TestFixturesController`) that creates an account with a
 * password but no organization membership — unreachable via the public API, where
 * every account gets a membership in the same transaction that creates it.
 */
export async function createBareAccount(
  request: APIRequestContext,
  email: string,
  password: string = VALID.password,
  firstName = 'Pat',
  lastName = 'Other',
): Promise<void> {
  const response = await request.post(`${API}/api/test/accounts`, {
    data: { email, password, firstName, lastName },
  });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not create bare account ${email} (${response.status()})`);
  }
}

/**
 * Invites `email` at `role` and accepts on their behalf via the API in one step —
 * the spec-04/05 fixture workhorse for "an org with members at several roles".
 * Requires `request`'s cookie jar to already be authenticated as an admin/manager
 * of the inviting org (as `sendInvitation` does). Accepting switches the cookie jar
 * to the new member (mirrors what accepting for real does) — callers that need to
 * keep issuing admin/manager API calls afterward must `login` back as themselves.
 */
export async function inviteAndAcceptViaApi(
  request: APIRequestContext,
  email: string,
  role: string,
  values: { firstName?: string; lastName?: string; password?: string } = {},
): Promise<void> {
  await sendInvitation(request, email, role);
  const token = await latestInvitationToken(request, email);
  await acceptInvitationViaApi(request, {
    token,
    firstName: values.firstName ?? 'Pat',
    lastName: values.lastName ?? 'Member',
    password: values.password ?? VALID.password,
  });
}

export interface MemberSummary {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: 'active' | 'removed';
  isLastAdmin: boolean;
  isSelf: boolean;
}

/**
 * Looks up a member's list-row fields (id included) by email straight through the
 * API — the accept-invitation response never surfaces the membership id, so this is
 * how a test targets a delete/restore call at a member it just created. Requires
 * `request`'s cookie jar to be authenticated as a member of the organization.
 */
export async function findMember(
  request: APIRequestContext,
  organizationId: string,
  email: string,
): Promise<MemberSummary> {
  const response = await request.get(`${API}/api/organizations/${organizationId}/members`, {
    params: { showRemoved: 'true' },
  });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not list members for ${organizationId} (${response.status()})`);
  }
  const body = await response.json();
  const member = (body.members as MemberSummary[]).find((m) => m.email === email);
  if (!member) {
    throw new Error(`Precondition failed: member ${email} not found in org ${organizationId}`);
  }
  return member;
}

/**
 * Configures a member's vacation financials straight through the API — a precondition
 * for the accrual E2E (spec 08), not the thing under test. Requires `request`'s cookie
 * jar to be authenticated as an admin/manager of the organization.
 */
export async function configureFinancials(
  request: APIRequestContext,
  organizationId: string,
  memberId: string,
  body: {
    monthlySalary: number;
    clientHourlyRate: number;
    vacationDaysPerYear: number;
    currency: string;
    isReservePercentManual: boolean;
    vacationReservePercent?: number;
  },
): Promise<void> {
  const response = await request.put(
    `${API}/api/organizations/${organizationId}/members/${memberId}/vacation/financials`,
    { data: body },
  );
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not configure financials for member ${memberId} (${response.status()})`,
    );
  }
}

/**
 * Test-only backdoor (`TestFixturesController`) that backdates a member's financials
 * snapshot(s) `effectiveFrom` to a past date, keyed by the member's account email. This
 * makes accrual for a past billing month find an effective snapshot and produce a FULL
 * (non-prorated) credit — mirrors `expireEmailChange`: there is no product-facing,
 * HTTP-only way to move a snapshot's effective date into the past.
 */
export async function backdateFinancials(
  request: APIRequestContext,
  email: string,
  effectiveFrom: string,
): Promise<void> {
  const response = await request.post(`${API}/api/test/financials/backdate`, {
    data: { email, effectiveFrom },
  });
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not backdate financials for ${email} (${response.status()})`,
    );
  }
}

export interface AccrualRunResult {
  processed: number;
  creditsCreated: number;
  skipped: number;
  billingPeriod: string;
}

/**
 * Runs the manual accrual trigger straight through the API — a precondition for the
 * accrual E2E (spec 08) that generates the credit transactions the UI then renders.
 * Requires `request`'s cookie jar to be authenticated as an admin. Unlike the other
 * helpers it returns the parsed run summary so a caller can assert on the counts.
 */
export async function runAccrual(
  request: APIRequestContext,
  month: number,
  year: number,
): Promise<AccrualRunResult> {
  const response = await request.post(`${API}/api/admin/accrual/run`, {
    data: { month, year },
  });
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not run accrual for ${month}/${year} (${response.status()})`,
    );
  }
  return (await response.json()) as AccrualRunResult;
}

/**
 * Test-only backdoor (`TestFixturesController`) that seeds a `credit` vacation reserve
 * transaction of an exact `amount` for the member behind `email`. The accrual engine only
 * produces formula-derived amounts, so this is how spec 09's E2E sets a precise balance
 * precondition ("exactly N available days"). `createdAt` defaults to now (current calendar
 * year) so the credit counts toward the live reserve. With the default salary 3000
 * (`dailySalary` ≈ 138.46), seed 1400 → 10 available days, seed 300 → 2 available days.
 */
export async function seedReserveCredit(
  request: APIRequestContext,
  email: string,
  amount: number,
): Promise<void> {
  const response = await request.post(`${API}/api/test/vacation/seed-credit`, {
    data: { email, amount },
  });
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not seed reserve credit for ${email} (${response.status()})`,
    );
  }
}

/**
 * Submits a vacation request straight through the API — a precondition for the spec 09
 * approve/cancel E2E, not the thing under test. Requires `request`'s cookie jar to be
 * authenticated as the MEMBER submitting for themselves (`memberId` must be the caller's
 * own membership; `login(request, memberEmail)` first). Returns the parsed `201` body.
 */
export async function submitVacationRequestViaApi(
  request: APIRequestContext,
  organizationId: string,
  memberId: string,
  dates: { startDate: string; endDate: string },
): Promise<{ id: string; workingDays: number; deductionAmount: number }> {
  const response = await request.post(
    `${API}/api/organizations/${organizationId}/members/${memberId}/vacation/requests`,
    { data: dates },
  );
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not submit vacation request for member ${memberId} (${response.status()})`,
    );
  }
  return (await response.json()) as { id: string; workingDays: number; deductionAmount: number };
}

/**
 * Reviews (approves/rejects) a vacation request straight through the API — a precondition
 * (e.g. "an already-approved request") for the spec 09 cancel-refund E2E. Requires
 * `request`'s cookie jar to be authenticated as an admin/manager who is NOT the request
 * owner (`login` back as that actor first — submitting as the member swapped the jar).
 */
export async function reviewVacationRequestViaApi(
  request: APIRequestContext,
  organizationId: string,
  memberId: string,
  requestId: string,
  body: { decision: 'approved' | 'rejected'; comment?: string },
): Promise<void> {
  const response = await request.put(
    `${API}/api/organizations/${organizationId}/members/${memberId}/vacation/requests/${requestId}/review`,
    { data: body },
  );
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not review vacation request ${requestId} (${response.status()})`,
    );
  }
}

/**
 * Creates a project straight through the API — a spec 12 precondition (the timer/entry
 * project selectors, weekly-view project rows). Requires `request`'s cookie jar to be
 * authenticated as an admin/manager of the org. Returns the new project's id and name.
 */
export async function createProjectViaApi(
  request: APIRequestContext,
  organizationId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const response = await request.post(`${API}/api/organizations/${organizationId}/projects`, {
    data: { name },
  });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not create project "${name}" (${response.status()})`);
  }
  const body = await response.json();
  return { id: body.id as string, name: body.name as string };
}

/**
 * Assigns members to a project straight through the API — a spec 12 precondition so a
 * `user` sees the project in the assignment-filtered selectors (spec 11 ProjectMember).
 * Requires an admin/manager cookie jar.
 */
export async function assignProjectMembersViaApi(
  request: APIRequestContext,
  organizationId: string,
  projectId: string,
  membershipIds: string[],
): Promise<void> {
  const response = await request.post(
    `${API}/api/organizations/${organizationId}/projects/${projectId}/members`,
    { data: { membershipIds } },
  );
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not assign members to project ${projectId} (${response.status()})`,
    );
  }
}

/**
 * One request topic, as `GET .../request-topics` returns it. Requests spec 02 made the
 * topic the only classifier a caller supplies, so every request a fixture raises needs
 * one; signup writes the catalogue in the same transaction as the organization, so a
 * seeded topic is always there to read.
 */
export interface SeededTopic {
  id: string;
  name: string;
  audience: string;
  type: string;
  status: string;
}

/** Reads one organization's catalogue. Requires any active member's cookie jar. */
export async function listRequestTopicsViaApi(
  request: APIRequestContext,
  organizationId: string,
  query = '?status=all',
): Promise<SeededTopic[]> {
  const response = await request.get(
    `${API}/api/organizations/${organizationId}/request-topics${query}`,
  );
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not read request topics (${response.status()} ${await response.text()})`,
    );
  }
  return ((await response.json()) as { topics: SeededTopic[] }).topics;
}

/** The id of one seeded topic by name — the fixture every request create body needs. */
export async function requestTopicIdViaApi(
  request: APIRequestContext,
  organizationId: string,
  name = 'VPN',
  audience = 'staff',
): Promise<string> {
  const topics = await listRequestTopicsViaApi(request, organizationId);
  const topic = topics.find((t) => t.name === name && t.audience === audience);
  if (!topic) {
    throw new Error(`Precondition failed: no ${audience} topic named "${name}"`);
  }
  return topic.id;
}

/** Archives one topic through the product's own route. Requires a curator's jar. */
export async function archiveRequestTopicViaApi(
  request: APIRequestContext,
  organizationId: string,
  topicId: string,
): Promise<void> {
  const response = await request.patch(
    `${API}/api/organizations/${organizationId}/request-topics/${topicId}/archive`,
  );
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not archive topic ${topicId} (${response.status()} ${await response.text()})`,
    );
  }
}

export interface TimeEntryInput {
  /** Target member (admin/manager creating for another). Omitted = caller's own membership. */
  membershipId?: string;
  projectId?: string | null;
  task?: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  /** Spec 16 — optional; server defaults to `true` when absent. */
  billable?: boolean;
}

export interface CreatedTimeEntry {
  id: string;
  membershipId: string;
  projectId: string | null;
  date: string;
  durationMinutes: number;
}

/**
 * Creates a time entry straight through the API — the spec 12 fixture workhorse for
 * "a user with entries this period". Creates for the caller's own membership unless
 * `membershipId` is supplied (admin/manager creating on another's behalf, TC-12-INT-19).
 * Returns the created entry so a test can target its row/edit/delete testids by id.
 */
export async function createTimeEntryViaApi(
  request: APIRequestContext,
  organizationId: string,
  input: TimeEntryInput,
): Promise<CreatedTimeEntry> {
  const response = await request.post(
    `${API}/api/organizations/${organizationId}/time-entries`,
    { data: input },
  );
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not create time entry on ${input.date} (${response.status()})`,
    );
  }
  return (await response.json()) as CreatedTimeEntry;
}

/**
 * Starts the caller's running timer straight through the API — a spec 12 precondition
 * (e.g. a timer already running before the page loads). Requires `request`'s cookie jar
 * to be authenticated as the member; the server owns `startedAt`.
 */
export async function startTimerViaApi(
  request: APIRequestContext,
  organizationId: string,
  body: { projectId?: string | null; task?: string; description?: string; billable?: boolean } = {},
): Promise<void> {
  const response = await request.post(
    `${API}/api/organizations/${organizationId}/timer/start`,
    { data: body },
  );
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not start timer (${response.status()})`);
  }
}

/**
 * Updates the caller's own account settings straight through the API — a spec 06/12
 * precondition (e.g. flipping `firstDayOfWeek` to "Sunday" so the calendar re-orders).
 * `PUT /api/account/settings` validates the WHOLE settings object, so this first reads the
 * current settings and merges the patch over them (mapping the nullable phone fields to
 * empty strings). Requires `request`'s cookie jar to be authenticated as that account.
 */
export async function updateAccountSettingsViaApi(
  request: APIRequestContext,
  patch: Partial<{
    firstName: string;
    lastName: string;
    phoneCountryCode: string;
    phoneNumber: string;
    timezone: string;
    firstDayOfWeek: string;
  }>,
): Promise<void> {
  const current = await request.get(`${API}/api/account/settings`);
  if (!current.ok()) {
    throw new Error(`Precondition failed: could not read account settings (${current.status()})`);
  }
  const s = await current.json();
  const body = {
    firstName: s.firstName,
    lastName: s.lastName,
    phoneCountryCode: s.phoneCountryCode ?? '',
    phoneNumber: s.phoneNumber ?? '',
    timezone: s.timezone ?? '',
    firstDayOfWeek: s.firstDayOfWeek,
    ...patch,
  };
  const response = await request.put(`${API}/api/account/settings`, { data: body });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not update account settings (${response.status()})`);
  }
}

/**
 * Soft-deletes a member straight through the API — a precondition (e.g. for
 * TC-02-E2E-04's "removed member tries to log in"), not the thing under test.
 * Requires `request`'s cookie jar to be authenticated as an admin/manager.
 */
export async function removeMember(
  request: APIRequestContext,
  organizationId: string,
  memberId: string,
): Promise<void> {
  const response = await request.delete(
    `${API}/api/organizations/${organizationId}/members/${memberId}`,
  );
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not remove member ${memberId} (${response.status()})`);
  }
}

/* ------------------------------------------------------------------ *
 * Regression preconditions
 *
 * Appended for `regressions.spec.ts`. Nothing above this line changed.
 * ------------------------------------------------------------------ */

/**
 * Publishes one more version of an already-published template, so a test can look at a
 * template that genuinely has a history.
 *
 * `PUT .../draft` clones the current version into a fresh draft whenever none is open,
 * which is why only the body has to be supplied: the signer roles and the fields come
 * across from the version being superseded. `rowVersion` is read back rather than
 * guessed — a template that *does* have an open draft would otherwise 409, and a
 * precondition that fails as a conflict looks like a bug in the case under way.
 */
export async function publishTemplateVersion(
  request: APIRequestContext,
  orgId: string,
  templateId: string,
  bodyHtml: string,
): Promise<void> {
  const base = `${API}/api/organizations/${orgId}/document-templates/${templateId}`;

  const detail = await (await request.get(base)).json();
  const rowVersion = detail.draftVersion?.rowVersion ?? 0;

  const draft = await request.put(`${base}/draft`, { data: { rowVersion, bodyHtml } });
  if (!draft.ok()) {
    throw new Error(
      `Precondition failed: could not open a new draft of ${templateId} ` +
        `(${draft.status()} ${await draft.text()})`,
    );
  }

  const published = await request.post(`${base}/publish`, { data: {} });
  if (!published.ok()) {
    throw new Error(
      `Precondition failed: could not publish the new version of ${templateId} ` +
        `(${published.status()} ${await published.text()})`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * The rail
 * ------------------------------------------------------------------ */

/**
 * Expands one titled group in the rail.
 *
 * Every destination but `Timesheets` lives inside a group now, and only the group holding
 * the current route arrives open (§13) — so from Members, which is where signing in lands,
 * most rows are one toggle away and are not in the document until it is thrown. A group
 * title is reached by its accessible name rather than a test id, for the same reason the
 * hamburger is: the name is what a reader has to navigate by, and a test id would not
 * prove it exists.
 *
 * Idempotent, so a test already inside the section does not close it.
 */
export async function openNavSection(page: Page, title: string): Promise<void> {
  const toggle = page.getByRole('button', { name: title, exact: true });
  await toggle.waitFor({ state: 'visible' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

/** Opens a group and clicks one of its rows. */
export async function clickNav(page: Page, section: string, testId: string): Promise<void> {
  await openNavSection(page, section);
  await page.getByTestId(testId).click();
}

/**
 * Opens the floating tracker from the bar's pill (spec 12).
 *
 * The pill says *a timer is running*; the widget it discloses is what carries the project and
 * the stop control, so a case that reads `topbar-timer-project` or presses
 * `topbar-timer-stop-btn` opens it first. Same seam as `openNavSection`, for the same reason:
 * a closed disclosure holds none of its contents in the document.
 */
export async function openTracker(page: Page): Promise<void> {
  const pill = page.getByTestId('topbar-timer-indicator');
  await pill.waitFor({ state: 'visible' });
  if ((await pill.getAttribute('aria-expanded')) !== 'true') await pill.click();
  await page.getByTestId('topbar-timer-widget').waitFor({ state: 'visible' });
}

/** `openNavSection(page, 'Hiring')`, kept because hiring's cases read better for it. */
export async function openHiringSection(page: Page): Promise<void> {
  await openNavSection(page, 'Hiring');
}

/** Opens the `Hiring` group and clicks one of its rows. */
export async function clickHiringNav(page: Page, testId: string): Promise<void> {
  await clickNav(page, 'Hiring', testId);
}

/* ------------------------------------------------------------------ *
 * Hiring — specs 01-07
 * ------------------------------------------------------------------ */

export interface SeededRoleMember {
  email: string;
  accountId: string;
  role: string;
}

/**
 * Adds a second member with a given role, through the API's test-only seam.
 *
 * There is no invitation endpoint yet (user-management spec 03), so a browser has no way
 * to produce a `manager`, a `user` or a `viewer` at all — and hiring's permission matrix
 * is four roles wide, with the interviewer's row gated on assignment rather than role.
 * `POST /api/test/members` is that missing seam and only that: it answers behind an
 * `admin`'s own session and never in production, the same way the mail sink and the
 * calendar stub do.
 *
 * The request context must be carrying the admin's session — `registerOrganization`
 * leaves it there.
 */
export async function addMember(
  request: APIRequestContext,
  input: { email: string; role: string; firstName?: string; lastName?: string },
): Promise<SeededRoleMember> {
  const response = await request.post(`${API}/api/test/members`, {
    data: { password: VALID.password, ...input },
  });
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not seed a ${input.role} (${response.status()})`,
    );
  }
  const body = await response.json();
  return { email: body.email, accountId: body.accountId, role: body.role };
}

/**
 * Creates a vacancy interviewed by somebody other than the session's owner — which is
 * what makes a `user` an interviewer, and is the precondition for every rule in
 * hiring 03 §06 and 04 §01.
 */
export async function createVacancyFor(
  request: APIRequestContext,
  org: RegisteredOrganization,
  interviewerAccountId: string,
  overrides: { title?: string; durationMinutes?: number } = {},
): Promise<SeededVacancy> {
  const response = await request.post(
    `${API}/api/organizations/${org.orgId}/hiring/vacancies`,
    {
      data: {
        title: overrides.title ?? 'Senior React Engineer',
        durationMinutes: overrides.durationMinutes ?? 60,
        description: '',
        interviewerAccountId,
      },
    },
  );
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not create a vacancy (${response.status()})`);
  }
  const body = await response.json();
  return { id: body.id, publicSlug: body.publicSlug, title: body.title };
}

export interface SeededCategory {
  id: string;
  name: string;
}

/** Creates a category through the API — a precondition, not the thing under test. */
export async function createCategory(
  request: APIRequestContext,
  org: RegisteredOrganization,
  name: string,
): Promise<SeededCategory> {
  const response = await request.post(
    `${API}/api/organizations/${org.orgId}/hiring/categories`,
    { data: { name } },
  );
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not create category ${name} (${response.status()})`);
  }
  const body = await response.json();
  return { id: body.id, name: body.name };
}

export interface SeededCriterion {
  id: string;
  name: string;
  type: string;
  values: Array<{ id: string; label: string; position: number; assessmentCount: number }>;
}

/** Creates a criterion through the API — a precondition, not the thing under test. */
export async function createCriterion(
  request: APIRequestContext,
  org: RegisteredOrganization,
  input: { name: string; type?: string; values?: string[] },
): Promise<SeededCriterion> {
  const type = input.type ?? 'scale';
  const response = await request.post(
    `${API}/api/organizations/${org.orgId}/hiring/criteria`,
    {
      data: {
        name: input.name,
        type,
        ...(type === 'scale' ? { values: input.values ?? ['A1', 'A2', 'B1'] } : {}),
      },
    },
  );
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not create criterion ${input.name} (${response.status()})`,
    );
  }
  return response.json();
}

/**
 * Archives a criterion through the API — a precondition for hiring 03 §04.19, where an
 * archived criterion is still filterable and has to say so in the picker.
 */
export async function archiveCriterion(
  request: APIRequestContext,
  org: RegisteredOrganization,
  criterionId: string,
): Promise<void> {
  const response = await request.patch(
    `${API}/api/organizations/${org.orgId}/hiring/criteria/${criterionId}`,
    { data: { isArchived: true } },
  );
  if (!response.ok()) {
    throw new Error(`Precondition failed: archiving answered ${response.status()}`);
  }
}

/**
 * Assesses a criterion on an application through the API — a precondition for the
 * settings screen's archive-versus-delete rules, which only differ once something has
 * been assessed.
 */
export async function assessCriterion(
  request: APIRequestContext,
  org: RegisteredOrganization,
  applicationId: string,
  criterionId: string,
  value: Record<string, unknown>,
): Promise<void> {
  const response = await request.put(
    `${API}/api/organizations/${org.orgId}/hiring/applications/${applicationId}/criteria/${criterionId}`,
    { data: value },
  );
  if (!response.ok()) {
    throw new Error(`Precondition failed: assessment answered ${response.status()}`);
  }
}

export interface SeededVacancy {
  id: string;
  publicSlug: string;
  title: string;
}

/** Creates a vacancy through the API, interviewed by the account that owns the session. */
export async function createVacancy(
  request: APIRequestContext,
  org: RegisteredOrganization,
  overrides: {
    title?: string;
    durationMinutes?: number;
    description?: string;
    categoryIds?: string[];
  } = {},
): Promise<SeededVacancy> {
  const response = await request.post(
    `${API}/api/organizations/${org.orgId}/hiring/vacancies`,
    {
      data: {
        title: overrides.title ?? 'Senior React Engineer',
        durationMinutes: overrides.durationMinutes ?? 60,
        description: overrides.description ?? '',
        interviewerAccountId: org.accountId,
        ...(overrides.categoryIds ? { categoryIds: overrides.categoryIds } : {}),
      },
    },
  );
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not create a vacancy (${response.status()})`);
  }
  const body = await response.json();
  return { id: body.id, publicSlug: body.publicSlug, title: body.title };
}

/**
 * Books an interview straight through the public endpoint, at the earliest time the
 * interviewer is free. A precondition for the screens that need a vacancy with
 * candidates on it, not the thing under test — the booking page has its own suite.
 *
 * `slotIndex` picks a later slot when a test needs two interviews that do not collide.
 *
 * The availability endpoint answers one month at a time and defaults to the window's first,
 * so asking once means asking about *this* month only. On the last afternoon of one there is
 * almost nothing left in it — `bookingWindow` runs from today to the same day next month, and
 * clipped to today's month that is a few hours of one weekday. Every suite that seeds an
 * interview then fails a precondition for a reason that has nothing to do with what it tests.
 * So the next month is read too, and only when the first does not have enough.
 */
/** `2026-09` — the month after the one the booking window starts in. */
function nextMonth(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function bookInterview(
  request: APIRequestContext,
  publicSlug: string,
  candidate: { firstName?: string; lastName?: string; email?: string; slotIndex?: number } = {},
): Promise<{ startUtc: string }> {
  const wanted = candidate.slotIndex ?? 0;
  const slots: string[] = [];
  // `undefined` is the window's own first month; the second is next month, named explicitly.
  for (const month of [undefined, nextMonth()]) {
    const availability = await request.get(`${API}/api/book/${publicSlug}/availability`, {
      params: month ? { timeZone: 'UTC', month } : { timeZone: 'UTC' },
    });
    if (!availability.ok()) {
      throw new Error(`Precondition failed: availability answered ${availability.status()}`);
    }
    const dates: Record<string, string[]> = (await availability.json()).dates ?? {};
    slots.push(...Object.keys(dates).sort().flatMap((date) => dates[date]));
    if (slots.length > wanted) break;
  }

  const startUtc = slots[wanted];
  if (!startUtc) {
    throw new Error(
      `Precondition failed: the window offers ${slots.length} slot(s), and slot ${wanted} was asked for`,
    );
  }

  const booked = await request.post(`${API}/api/book/${publicSlug}`, {
    multipart: {
      firstName: candidate.firstName ?? 'Jane',
      lastName: candidate.lastName ?? 'Doe',
      email: candidate.email ?? uniqueEmail('candidate'),
      startUtc,
      timeZone: 'UTC',
      cv: CV_FILE,
    },
  });
  if (!booked.ok()) {
    throw new Error(`Precondition failed: booking answered ${booked.status()}`);
  }
  return { startUtc };
}

/**
 * A real, minimal PDF: 303 bytes, one blank A4 page, no fonts and no content stream.
 *
 * It has to be a PDF a reader can actually open, not merely a file the CV validator
 * accepts — the card's **View** action hands it to the browser's PDF viewer, and a
 * fixture that only satisfies the extension check makes that button look broken when it
 * is working perfectly.
 *
 * Base64 rather than a string literal because a PDF's cross-reference table is
 * byte-addressed and each of its entries ends in a significant trailing space. An editor
 * set to trim trailing whitespace would silently shift every offset and break the file.
 */
const BLANK_PDF_BASE64 =
  'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNTk1IDg0Ml0+PmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1MiAwMDAwMCBuIAowMDAwMDAwMTAxIDAwMDAwIG4gCnRyYWlsZXI8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxNjQKJSVFT0YK';

export const CV_FILE = {
  name: 'jane-doe-cv.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from(BLANK_PDF_BASE64, 'base64'),
};

export interface InviteLink {
  organizationId: string;
  candidateId: string;
  applicationId: string;
  /** The path the interviewer actually clicks, query string included. */
  path: string;
}

/**
 * The deep link out of the invite the last booking created.
 *
 * The candidate database is now a second route for an `admin` or `manager`, but for a
 * `user` interviewer this is still the only one the product hands them until My
 * interviews lands ([04 §01.7](../../specs/hiring/04-candidate-card.md)).
 * Reading it from the event is the calendar's equivalent of reading a reset link out of
 * the mail sink — a test that assembled the URL from ids it got elsewhere would be
 * testing a link nobody is ever sent.
 *
 * `mailbox` is the interviewer's address, and it is not optional: the fake calendar is
 * one process shared by every worker, so the latest event without it is whichever test
 * booked last (ADR 0012).
 */
export async function latestInviteLink(
  request: APIRequestContext,
  mailbox: string,
): Promise<InviteLink> {
  const response = await request.get(`${API}/api/test/calendar/latest`, { params: { mailbox } });
  if (!response.ok()) {
    throw new Error(`Precondition failed: no calendar event (${response.status()})`);
  }

  const body = (await response.json()).body as string;
  const match = body.match(
    /\/org\/([0-9a-f-]+)\/hiring\/candidates\/([0-9a-f-]+)\?application=([0-9a-f-]+)/,
  );
  if (!match) throw new Error(`Precondition failed: no card link in the invite:\n${body}`);

  return {
    organizationId: match[1],
    candidateId: match[2],
    applicationId: match[3],
    path: match[0],
  };
}

export interface ManageLink {
  slug: string;
  token: string;
  /** The path the candidate actually opens. */
  path: string;
}

/**
 * The manage link out of the invite the last booking created.
 *
 * Read from the calendar event rather than assembled from a token obtained some other
 * way, for the same reason `latestInviteLink` is: the invite is the only channel this
 * release has, so a test that built the URL itself would be testing a link nobody is
 * ever sent (07 §03.14). Narrowed to the interviewer's `mailbox` for the same reason
 * `latestInviteLink` is.
 */
export async function latestManageLink(
  request: APIRequestContext,
  mailbox: string,
): Promise<ManageLink> {
  const response = await request.get(`${API}/api/test/calendar/latest`, { params: { mailbox } });
  if (!response.ok()) {
    throw new Error(`Precondition failed: no calendar event (${response.status()})`);
  }

  const body = (await response.json()).body as string;
  const match = body.match(/\/manage\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`Precondition failed: no manage link in the invite:\n${body}`);

  return { slug: match[1], token: match[2], path: match[0] };
}

/**
 * A second document, plainly not the one the booking carried — the CV a replacement
 * puts in place of it (07 §07).
 */
export const REPLACEMENT_CV = {
  name: 'corrected-cv.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  buffer: Buffer.from('a corrected CV, in a different format'),
};

/**
 * Moves a booking through the candidate's own public routes — a precondition, not the
 * thing under test.
 *
 * It reads the picker's own list rather than computing a slot, so a seeded move is one
 * the page would actually have offered: the application's duration, the booked
 * interviewer's mailbox, and its own event excluded (07 §05).
 */
export async function rescheduleBooking(
  request: APIRequestContext,
  slug: string,
  token: string,
): Promise<{ startUtc: string }> {
  const record = await request.get(`${API}/api/manage/${slug}/${token}`);
  if (!record.ok()) {
    throw new Error(`Precondition failed: manage answered ${record.status()}`);
  }
  const current = (await record.json()).booking?.startUtc as string | undefined;

  const availability = await request.get(`${API}/api/manage/${slug}/${token}/availability`, {
    params: { timeZone: 'UTC' },
  });
  if (!availability.ok()) {
    throw new Error(`Precondition failed: availability answered ${availability.status()}`);
  }

  const dates: Record<string, string[]> = (await availability.json()).dates ?? {};
  const startUtc = Object.keys(dates)
    .sort()
    .flatMap((date) => dates[date])
    .find((slot) => slot !== current);
  if (!startUtc) throw new Error('Precondition failed: nowhere to move this interview to');

  const moved = await request.post(`${API}/api/manage/${slug}/${token}/reschedule`, {
    data: { startUtc, timeZone: 'UTC' },
  });
  if (!moved.ok()) {
    throw new Error(`Precondition failed: reschedule answered ${moved.status()}`);
  }
  return { startUtc };
}

/** Replaces a booking's CV through the candidate's own route — a precondition. */
export async function replaceCv(
  request: APIRequestContext,
  slug: string,
  token: string,
  file: { name: string; mimeType: string; buffer: Buffer } = REPLACEMENT_CV,
): Promise<void> {
  const response = await request.post(`${API}/api/manage/${slug}/${token}/cv`, {
    multipart: { cv: file },
  });
  if (!response.ok()) {
    throw new Error(`Precondition failed: CV replacement answered ${response.status()}`);
  }
}

/** Moves an application to another board column — a precondition, not the thing tested. */
export async function setApplicationStatus(
  request: APIRequestContext,
  org: RegisteredOrganization,
  applicationId: string,
  status: string,
): Promise<void> {
  const response = await request.patch(
    `${API}/api/organizations/${org.orgId}/hiring/applications/${applicationId}`,
    { data: { status } },
  );
  if (!response.ok()) {
    throw new Error(`Precondition failed: status change answered ${response.status()}`);
  }
}

export interface BoardCard {
  applicationId: string;
  candidateId: string;
  name: string;
  position: number;
  hasConclusion: boolean;
  isCancelled: boolean;
}

export interface BoardColumn {
  status: string;
  count: number;
  cards: BoardCard[];
}

/**
 * The board straight through the API, so a test can name the card it is about to drag.
 *
 * A precondition, not the thing under test: the ids are generated server-side and there
 * is no other way for a test to learn them. The request context carries the session from
 * `registerOrganization`, which is the same cookie the browser will use.
 */
export async function readBoard(
  request: APIRequestContext,
  org: RegisteredOrganization,
  vacancyId: string,
): Promise<BoardColumn[]> {
  const response = await request.get(
    `${API}/api/organizations/${org.orgId}/hiring/vacancies/${vacancyId}/board`,
  );
  if (!response.ok()) {
    throw new Error(`Precondition failed: the board answered ${response.status()}`);
  }
  return (await response.json()).columns as BoardColumn[];
}

/** The cards of one column, in board order. */
export async function columnCards(
  request: APIRequestContext,
  org: RegisteredOrganization,
  vacancyId: string,
  status: string,
): Promise<BoardCard[]> {
  const columns = await readBoard(request, org, vacancyId);
  return columns.find((column) => column.status === status)!.cards;
}
