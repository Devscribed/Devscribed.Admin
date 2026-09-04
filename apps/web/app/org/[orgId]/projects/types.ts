import type { Role } from '@devscribed/validation';

/** A project's lifecycle status (spec 11 §Data Model). */
export type ProjectStatus = 'active' | 'archived';

/**
 * A member as the list row draws them: the name the mark is tinted and labelled from, and
 * the letters inside it. Both come from the server — §93's `Avatar` takes its initials as a
 * prop and never derives them, so the rule for "first letter of each name" lives in one
 * place rather than on every screen that draws a person.
 */
export interface ProjectMemberPreview {
  name: string;
  initials: string;
}

/**
 * One entry of `GET /api/organizations/{orgId}/projects` (spec 11 §API Contracts).
 * The list endpoint carries the hours aggregate and a *sample* of the roster; the roster
 * itself is a separate call (`GET .../projects/{id}/members`).
 */
export interface ProjectListItem {
  id: string;
  name: string;
  status: ProjectStatus;
  memberCount: number;
  /**
   * Spec 11 — at most the first three members, in roster order. A sample, never a length:
   * `memberCount` is what says how many there are, and it is the number the column reads.
   */
  memberPreview: ProjectMemberPreview[];
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
