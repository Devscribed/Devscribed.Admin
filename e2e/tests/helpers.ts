import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRequestContext, Page } from '@playwright/test';

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

export const API = 'http://localhost:4000';

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
  const response = await request.get(`${API}/api/test/mail/latest`, { params: { email } });
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
      subjectMembershipId: null,
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
  const response = await request.get(`${API}/api/test/mail/latest`, { params });
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

/** Fires the forgot-password request straight through the API, as a precondition. */
export async function requestReset(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const response = await request.post(`${API}/api/forgot-password`, { data: { email } });
  if (!response.ok()) throw new Error(`Reset request failed for ${email}`);
}
