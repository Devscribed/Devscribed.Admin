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

/** Fires the forgot-password request straight through the API, as a precondition. */
export async function requestReset(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const response = await request.post(`${API}/api/forgot-password`, { data: { email } });
  if (!response.ok()) throw new Error(`Reset request failed for ${email}`);
}

/** Signs in through the UI and waits for the app shell to settle on Members. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(VALID.password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL('**/members');
}

export interface Registered {
  email: string;
  accountId: string;
  organizationId: string;
}

/**
 * Registers an organization and hands back its ids. The request context keeps the
 * session cookie, so a caller can go on to seed hiring data through the API — a
 * precondition, not the thing under test.
 */
export async function registerOrganization(
  request: APIRequestContext,
  email: string,
): Promise<Registered> {
  const response = await request.post(`${API}/api/signup`, {
    data: { ...VALID, email, orgName: 'Acme Inc', timezone: 'Europe/Berlin' },
  });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not register ${email} (${response.status()})`);
  }
  const body = await response.json();
  return { email, accountId: body.account.id, organizationId: body.organization.id };
}

export interface SeededCategory {
  id: string;
  name: string;
}

/** Creates a category through the API — a precondition, not the thing under test. */
export async function createCategory(
  request: APIRequestContext,
  org: Registered,
  name: string,
): Promise<SeededCategory> {
  const response = await request.post(
    `${API}/api/organizations/${org.organizationId}/hiring/categories`,
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
  org: Registered,
  input: { name: string; type?: string; values?: string[] },
): Promise<SeededCriterion> {
  const type = input.type ?? 'scale';
  const response = await request.post(
    `${API}/api/organizations/${org.organizationId}/hiring/criteria`,
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
 * Assesses a criterion on an application through the API — a precondition for the
 * settings screen's archive-versus-delete rules, which only differ once something has
 * been assessed.
 */
export async function assessCriterion(
  request: APIRequestContext,
  org: Registered,
  applicationId: string,
  criterionId: string,
  value: Record<string, unknown>,
): Promise<void> {
  const response = await request.put(
    `${API}/api/organizations/${org.organizationId}/hiring/applications/${applicationId}/criteria/${criterionId}`,
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
  org: Registered,
  overrides: {
    title?: string;
    durationMinutes?: number;
    description?: string;
    categoryIds?: string[];
  } = {},
): Promise<SeededVacancy> {
  const response = await request.post(
    `${API}/api/organizations/${org.organizationId}/hiring/vacancies`,
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
 */
export async function bookInterview(
  request: APIRequestContext,
  publicSlug: string,
  candidate: { firstName?: string; lastName?: string; email?: string; slotIndex?: number } = {},
): Promise<{ startUtc: string }> {
  const availability = await request.get(`${API}/api/book/${publicSlug}/availability`, {
    params: { timeZone: 'UTC' },
  });
  if (!availability.ok()) {
    throw new Error(`Precondition failed: availability answered ${availability.status()}`);
  }

  const dates: Record<string, string[]> = (await availability.json()).dates ?? {};
  const startUtc = Object.keys(dates)
    .sort()
    .flatMap((date) => dates[date])[candidate.slotIndex ?? 0];
  if (!startUtc) throw new Error('Precondition failed: the window offers no slots');

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
 * Until the candidate database lands, this is the only route to a candidate card that
 * the product itself hands anyone ([04 §01.7](../../specs/hiring/04-candidate-card.md)).
 * Reading it from the event is the calendar's equivalent of reading a reset link out of
 * the mail sink — a test that assembled the URL from ids it got elsewhere would be
 * testing a link nobody is ever sent.
 */
export async function latestInviteLink(request: APIRequestContext): Promise<InviteLink> {
  const response = await request.get(`${API}/api/test/calendar/latest`);
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

export interface BoardCard {
  applicationId: string;
  candidateId: string;
  name: string;
  position: number;
  hasConclusion: boolean;
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
  org: Registered,
  vacancyId: string,
): Promise<BoardColumn[]> {
  const response = await request.get(
    `${API}/api/organizations/${org.organizationId}/hiring/vacancies/${vacancyId}/board`,
  );
  if (!response.ok()) {
    throw new Error(`Precondition failed: the board answered ${response.status()}`);
  }
  return (await response.json()).columns as BoardColumn[];
}

/** The cards of one column, in board order. */
export async function columnCards(
  request: APIRequestContext,
  org: Registered,
  vacancyId: string,
  status: string,
): Promise<BoardCard[]> {
  const columns = await readBoard(request, org, vacancyId);
  return columns.find((column) => column.status === status)!.cards;
}
