import type { Role } from '@devscribed/validation';

/** A project's lifecycle status (spec 11 §Data Model). */
export type ProjectStatus = 'active' | 'archived';

/**
 * One entry of `GET /api/organizations/{orgId}/projects` (spec 11 §API Contracts).
 * The list endpoint carries member/hours aggregates but no per-member data — the
 * roster is a separate call (`GET .../projects/{id}/members`).
 */
export interface ProjectListItem {
  id: string;
  name: string;
  status: ProjectStatus;
  memberCount: number;
  totalHours: number;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** Spec 13 — 2–10 uppercase letters; null until the caller sets it. */
  key?: string | null;
  /**
   * Spec organization/01 — client link. `null` when no client is assigned.
   * The list endpoint carries both id and name so the row can render without a
   * second fetch (name is authoritative at the time of the query).
   */
  clientId: string | null;
  clientName: string | null;
}

export interface ProjectsResponse {
  projects: ProjectListItem[];
}

/** The 201/200 body of POST/PUT `.../projects` — no aggregates. */
export interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  createdAt: string;
  /** Spec 13 — 2–10 uppercase letters; null until the caller sets it. */
  key?: string | null;
  /** Spec organization/01 — client link. `null` when no client is assigned. */
  clientId?: string | null;
  clientName?: string | null;
}

/**
 * One row of `GET /api/organizations/{orgId}/projects/{projectId}/members` (spec 11).
 * The roster payload carries no email (unlike the org members list) — member rows show
 * avatar + full name + role only.
 */
export interface ProjectMember {
  membershipId: string;
  accountId: string;
  firstName: string;
  lastName: string;
  role: Role;
  /** ISO-8601 timestamp of when the member was assigned. */
  assignedAt: string;
}

export interface ProjectMembersResponse {
  members: ProjectMember[];
}
