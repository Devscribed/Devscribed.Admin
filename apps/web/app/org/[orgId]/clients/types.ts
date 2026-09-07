/**
 * Response shapes for the Clients endpoints (spec organization/01 §API Contracts).
 * These mirror what the API returns; the validation layer owns wording/rules.
 */

/** A client's lifecycle status. */
export type ClientStatus = 'active' | 'archived';

/**
 * One row of `GET /api/organizations/{orgId}/clients` — carries the two project
 * counts (all vs active) surfaced in the list table.
 */
export interface ClientListItem {
  id: string;
  name: string;
  status: ClientStatus;
  projectCount: number;
  activeProjectCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClientsResponse {
  clients: ClientListItem[];
}

/**
 * Full client record — returned by POST/PATCH/archive/restore and by the detail
 * endpoint. Includes the archive audit fields absent from the list row.
 */
export interface ClientSummary {
  id: string;
  name: string;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  archivedByAccountId: string | null;
  createdByAccountId: string;
}

/** One nested project inside the detail endpoint's `projects` array. */
export interface ClientProjectRow {
  id: string;
  name: string;
  status: 'active' | 'archived';
}

export interface ClientDetailResponse {
  client: ClientSummary;
  projects: ClientProjectRow[];
}

/* ------------------------------------------------------------------ *
 * Requests spec 03 — the client's contacts.
 * ------------------------------------------------------------------ */

/** `invited` while a pending invitation exists with no row of its own; then `active`
 * once accepted, and `removed` after a removal. */
export type ClientContactStatus = 'invited' | 'active' | 'removed';

/** One row of `GET /api/organizations/{orgId}/clients/{clientId}/contacts`. */
export interface ClientContactRow {
  id: string;
  email: string;
  displayName: string | null;
  status: ClientContactStatus;
  invitedAt: string | null;
  joinedAt: string | null;
}

export interface ClientContactsResponse {
  contacts: ClientContactRow[];
}
