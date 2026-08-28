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
    params: { email: newEmail, type: 'email-change-confirmation' },
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
  body: { projectId?: string | null; task?: string; description?: string } = {},
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
