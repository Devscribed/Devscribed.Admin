'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface SessionAccount {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  timezone: string | null;
}

export interface SessionOrganization {
  id: string;
  name: string;
}

export interface Session {
  account: SessionAccount;
  organization: SessionOrganization;
  role: string;
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
