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

/** Fires the forgot-password request straight through the API, as a precondition. */
export async function requestReset(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const response = await request.post(`${API}/api/forgot-password`, { data: { email } });
  if (!response.ok()) throw new Error(`Reset request failed for ${email}`);
}
