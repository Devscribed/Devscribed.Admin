import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { request as apiContexts, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Signup is irreversible by design (no delete endpoint yet), so tests never reuse an
 * address — each one mints its own. Members are scoped to the organization the test
 * just created, so a shared database still gives every test a clean list.
 */
let counter = 0;
export function uniqueEmail(prefix = 'owner'): string {
  counter += 1;
  return `${prefix}+${Date.now()}-${counter}@acme.com`;
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
export const API = process.env.E2E_API_URL ?? process.env.E2E_BASE_URL ?? 'http://localhost:4000';

/**
 * Headers for the mail sink.
 *
 * Empty locally, where the sink is open to anyone who can reach the dev server. Against a
 * deployment the sink is closed unless a token is presented — it hands out live signing
 * links, and that endpoint is on a public host — so `make e2e-<env>` fetches the token from
 * SSM and puts it here. No token, no read, and the suite says so rather than pretending.
 */
const MAIL_SINK_HEADERS: Record<string, string> = process.env.E2E_MAIL_SINK_TOKEN
  ? { authorization: `Bearer ${process.env.E2E_MAIL_SINK_TOKEN}` }
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
    headers: MAIL_SINK_HEADERS,
  });
  if (!response.ok()) {
    throw new Error(`No reset mail for ${email} (${response.status()})`);
  }
  return (await response.json()).token as string;
}

/**
 * Registers an account and hands back the organization it created. `registerAccount`
 * throws its response away, and the documents routes are all organization-scoped, so a
 * test that never touches the members screen still needs the id from signup rather than
 * scraping it out of a URL.
 *
 * The signup response also issues the session cookie into this `request` context, which
 * is what lets the API-level preconditions below run as this admin.
 */
export async function registerOrganization(
  request: APIRequestContext,
  email: string,
  orgName = 'Existing Org',
): Promise<{ orgId: string }> {
  const response = await request.post(`${API}/api/signup`, {
    data: { ...VALID, email, orgName, timezone: 'Europe/Berlin' },
  });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not register ${email} (${response.status()})`);
  }
  return { orgId: (await response.json()).organization.id as string };
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
 * Demotes (or promotes) the membership behind an address. Signup only ever mints an
 * `admin`, and there is no invite flow yet, so this test-only endpoint is the only way an
 * E2E run can look at a screen through a manager's, a user's, or a viewer's eyes.
 */
export async function setMembershipRole(
  request: APIRequestContext,
  email: string,
  role: 'admin' | 'manager' | 'user' | 'viewer',
): Promise<void> {
  const response = await request.post(`${API}/api/test/role`, { data: { email, role } });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not set ${email} to ${role} (${response.status()})`);
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
    headers: MAIL_SINK_HEADERS,
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
 * Moves an envelope's expiry into the past, writing the column directly.
 *
 * There is no UI or API for this and a test cannot advance the clock, so this is the one
 * precondition in the suite that goes around the product — the same exception the spec's
 * own TC-02-INT-17 takes. The sweep is deliberately *not* run afterwards: the point of
 * TC-02-E2E-07 is that lazy expiry is authoritative even when the stored status still
 * says `sent` (requirement 34).
 */
export async function expireEnvelope(envelopeId: string): Promise<void> {
  const { PrismaClient } = (await import('@prisma/client')) as {
    PrismaClient: new (options: {
      datasources: { db: { url: string } };
    }) => {
      envelope: { update(args: unknown): Promise<unknown> };
      $disconnect(): Promise<void>;
    };
  };

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
  try {
    await prisma.envelope.update({
      where: { id: envelopeId },
      data: { expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * The API's own database, read from its `.env` rather than from `process.env`: Playwright
 * starts the API as a child process that loads that file itself, and a suite that guessed
 * a connection string could silently edit a different database than the one under test.
 */
function databaseUrl(): string {
  const file = join(__dirname, '..', '..', 'apps', 'api', '.env');
  const match = /^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m.exec(readFileSync(file, 'utf8'));
  if (!match) throw new Error(`No DATABASE_URL in ${file}`);
  return match[1];
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
  accountId: string;
  email: string;
  /** `firstName lastName` — what `member.fullName` resolves to and what the UI prints. */
  name: string;
}

/**
 * Puts a **second person into an existing organization** — the precondition TC-03-E2E-05,
 * -06 and -07 are impossible without, since each of them needs two members of one org
 * looking at each other's contract details.
 *
 * Why this cannot be done through the product: there is no invite flow yet (see the note
 * on `setMembershipRole`), so signup is the only way to mint an account — and signup
 * always creates an organization of its own. `Membership.accountId` is `@unique` in
 * `schema.prisma`, so an account cannot hold a second membership either. The one honest
 * fixture left is therefore to register the account normally and then **move** the
 * membership signup just created into the organization under test, which is what the
 * invite flow will do in one step when user-management spec 04 lands. The organization
 * signup made along the way is left behind unused; nothing reads it.
 *
 * Two details that are load-bearing rather than incidental:
 *
 *  - The signup runs in its **own** `APIRequestContext`. `POST /api/signup` issues a
 *    session cookie, and running it in the caller's context would silently replace the
 *    admin session that every precondition after this one depends on.
 *  - The role is deliberately *not* set here. `POST /api/test/role` is this suite's one
 *    way to say what a membership may do, and leaving it to the caller keeps every test's
 *    role visible in the test itself rather than buried in a fixture.
 */
export async function addMemberToOrganization(
  orgId: string,
  seed: OrganizationMemberSeed,
): Promise<SeededMember> {
  const email = seed.email ?? uniqueEmail('member');

  const context = await apiContexts.newContext();
  let accountId: string;
  try {
    const response = await context.post(`${API}/api/signup`, {
      data: {
        ...VALID,
        firstName: seed.firstName,
        lastName: seed.lastName,
        email,
        orgName: `Holding org for ${email}`,
        timezone: 'Europe/Berlin',
      },
    });
    if (!response.ok()) {
      throw new Error(
        `Precondition failed: could not register ${email} (${response.status()} ${await response.text()})`,
      );
    }
    accountId = (await response.json()).account.id as string;
  } finally {
    await context.dispose();
  }

  const { PrismaClient } = (await import('@prisma/client')) as {
    PrismaClient: new (options: {
      datasources: { db: { url: string } };
    }) => {
      membership: { update(args: unknown): Promise<{ id: string }> };
      $disconnect(): Promise<void>;
    };
  };

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
  try {
    const membership = await prisma.membership.update({
      // `accountId` is unique, which is also why the membership has to be moved rather
      // than duplicated.
      where: { accountId },
      data: { organizationId: orgId, status: 'active' },
    });
    return {
      membershipId: membership.id,
      accountId,
      email,
      name: `${seed.firstName} ${seed.lastName}`,
    };
  } finally {
    await prisma.$disconnect();
  }
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
