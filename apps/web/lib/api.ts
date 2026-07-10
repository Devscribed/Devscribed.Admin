const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';

export interface ApiErrorBody {
  message?: string;
  /** Per-field validation errors keyed by field name. */
  errors?: Record<string, string>;
}

/** Thrown for any non-2xx API response; carries the status and parsed body. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    super(body?.message ?? `Request failed (${status})`);
    this.name = 'ApiError';
  }
}

export interface SignupPayload {
  orgName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** IANA timezone auto-detected from the browser (spec 01). */
  timezone?: string;
}

export interface Member {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  joinedAt: string;
}

export interface MembersResponse {
  members: Member[];
  canManage: boolean;
}

async function parseBody(res: Response): Promise<ApiErrorBody & Record<string, unknown>> {
  try {
    return (await res.json()) as ApiErrorBody & Record<string, unknown>;
  } catch {
    return {};
  }
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  organization: { id: string; name: string };
}

/** Create the account, organization, and admin membership (spec 01). */
export async function signup(payload: SignupPayload): Promise<void> {
  const res = await fetch(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const body = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
}

/** Authenticate with email + password (spec 02). */
export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  const body = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body as unknown as AuthResponse;
}

/** Request a password-reset link. Always resolves neutrally (spec 02, req 7). */
export async function forgotPassword(email: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email }),
  });
  const body = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return (body.message as string) ?? '';
}

/** Set a new password from a valid reset token (spec 02, reqs 8–9). */
export async function resetPassword(token: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token, password }),
  });
  const body = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return (body.message as string) ?? '';
}

/** Clear the current session. */
export async function logout(): Promise<void> {
  await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
}

/** List the active members of the current organization (spec 05, minimal). */
export async function fetchMembers(): Promise<MembersResponse> {
  const res = await fetch(`${BASE}/members`, { credentials: 'include' });
  const body = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body as unknown as MembersResponse;
}
