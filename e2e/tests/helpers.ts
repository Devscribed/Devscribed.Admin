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

export interface SeededVacancy {
  id: string;
  publicSlug: string;
  title: string;
}

/** Creates a vacancy through the API, interviewed by the account that owns the session. */
export async function createVacancy(
  request: APIRequestContext,
  org: Registered,
  overrides: { title?: string; durationMinutes?: number; description?: string } = {},
): Promise<SeededVacancy> {
  const response = await request.post(
    `${API}/api/organizations/${org.organizationId}/hiring/vacancies`,
    {
      data: {
        title: overrides.title ?? 'Senior React Engineer',
        durationMinutes: overrides.durationMinutes ?? 60,
        description: overrides.description ?? '',
        interviewerAccountId: org.accountId,
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
 */
export async function bookInterview(
  request: APIRequestContext,
  publicSlug: string,
  candidate: { firstName?: string; lastName?: string; email?: string } = {},
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
    .flatMap((date) => dates[date])[0];
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

/** A tiny but non-empty PDF — enough to satisfy every rule the CV validator applies. */
export const CV_FILE = {
  name: 'jane-doe-cv.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4 a perfectly ordinary cv'),
};
