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

export interface Session {
  account: SessionAccount;
  organization: SessionOrganization;
  role: string;
  features: SessionFeatures;
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
