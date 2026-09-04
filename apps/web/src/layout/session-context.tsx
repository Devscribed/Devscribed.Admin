'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface SessionAccount {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  timezone: string | null;
  /** Spec 06 preference: "Monday" (default) or "Sunday" — the week start for the
   * spec-12 calendar/weekly views. */
  firstDayOfWeek: string;
}

export interface SessionOrganization {
  id: string;
  name: string;
}

/**
 * What this environment can do that the product does not otherwise promise. Not
 * permissions — the role covers those — but whether a thing exists here at all.
 */
export interface SessionFeatures {
  /** Mail is simulated here and readable, so the Outbox screen exists. */
  mailOutbox: boolean;
}

/** The client a contact works for. `null` for a member of staff (REQ-03-005). */
export interface SessionClient {
  id: string;
  name: string;
}

/**
 * Requests spec 03 — one shape answers both principals, so every screen branches on a
 * value that is always present rather than inferring a kind from what is missing.
 *
 * `role` is `null` for a client contact, who holds none: their rights come from the
 * principal kind, and no value of `Membership.role` produces them (REQ-03-016). Asking
 * the kind first is the ordering rule REQ-03-017 states — a role-keyed helper answers a
 * principal with no role the viewer set, which grants rather than refuses.
 */
export interface Session {
  account: SessionAccount;
  organization: SessionOrganization;
  role: string | null;
  principal: 'member' | 'client';
  client: SessionClient | null;
  /**
   * Whether anybody has assigned this member an interview — the one navigation
   * predicate that is not a role (hiring 03 §06.31).
   *
   * It arrives with the session rather than being fetched by the sidebar because the
   * shell blocks on this response before it renders anything, which is what stops a
   * gated row flashing into view and back out.
   */
  isInterviewer: boolean;
  features: SessionFeatures;
}

/** True while the signed-in principal is a client contact. */
export function isClientPrincipal(session: Session): boolean {
  return session.principal === 'client';
}

const SessionContext = createContext<Session | null>(null);

/**
 * The shell resolves `/api/me` once and hands the answer down, so pages inside it
 * never repeat that request on every navigation.
 */
export function SessionProvider({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** Only callable inside the shell, which never renders children before resolving. */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside the app shell');
  return session;
}
