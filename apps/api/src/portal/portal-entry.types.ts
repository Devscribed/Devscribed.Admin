/**
 * Portal spec 01 (Home) — types and small shared helpers used by both
 * `PortalFeedService` and `PortalEntryService`. Kept in one file rather than
 * duplicated in each, since both answer the same questions: who the caller is
 * (`resolvePortalCaller`), what window a projected entry must fall inside
 * (`computePortalWindow`), and which settings group a kind belongs to
 * (`portalGroupForKind`).
 */

import { NotFoundException } from '@nestjs/common';
import {
  hasCapability,
  normalizeRole,
  parseIsoDate,
  zonedTimeToUtc,
  type NormalizedRole,
  type PortalEntryKind,
} from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import type { PrismaService } from '../prisma.service';

/** A person's display name — first and last, trimmed. */
export function displayName(account: { firstName: string; lastName: string }): string {
  return `${account.firstName} ${account.lastName}`.trim();
}

/** REQ-01-048 — the three groups an organization's settings switch on or off. */
export type PortalGroupKey = 'people' | 'hiring' | 'work';

/** REQ-01-036 — which group a kind is derived under. */
export function portalGroupForKind(kind: PortalEntryKind): PortalGroupKey {
  switch (kind) {
    case 'member-joined':
    case 'member-anniversary':
      return 'people';
    case 'vacancy-opened':
      return 'hiring';
    case 'project-started':
      return 'work';
    default: {
      const exhaustive: never = kind;
      throw new Error(`portalGroupForKind: unhandled kind ${String(exhaustive)}`);
    }
  }
}

export interface PortalSubjectDto {
  kind: 'member' | 'vacancy' | 'project';
  id: string;
  name: string;
  initials: string | null;
}

/** `GET .../portal/news` — one row of `entries`. */
export interface PortalFeedEntryDto {
  id: string;
  kind: PortalEntryKind;
  group: PortalGroupKey;
  occurredAt: string;
  subject: PortalSubjectDto;
  detail: Record<string, unknown>;
}

export interface PortalFeedPageDto {
  entries: PortalFeedEntryDto[];
  nextCursor?: string;
}

/** `GET .../portal/news/{entryId}` — one server-ordered fact. */
export interface PortalEntryFactDto {
  key: string;
  label: string;
  value: string;
}

export interface PortalEntryMemberRefDto {
  id: string;
  name: string;
  initials: string | null;
}

export interface PortalEntryProjectRefDto {
  id: string;
  name: string;
}

/** `GET .../portal/news/{entryId}` — the whole entry page body. */
export interface PortalEntryDetailDto {
  id: string;
  kind: PortalEntryKind;
  group: PortalGroupKey;
  occurredAt: string;
  subject: PortalSubjectDto;
  facts: PortalEntryFactDto[];
  categories: string[] | null;
  body: string | null;
  shareUrl: string | null;
  link: string | null;
  /** `member-joined` / `member-anniversary` only — the active projects the reader may
   * already see the subject on (REQ-01-045). */
  projects?: PortalEntryProjectRefDto[];
  /**
   * `project-started` only — present (possibly `[]`) only where REQ-01-047 grants it;
   * the key itself is absent from the body otherwise (REQ-01-056) — unlike
   * REQ-01-055's `clientName`, which is `null` rather than absent so the two cases
   * cannot be told apart.
   */
  members?: PortalEntryMemberRefDto[];
}

/** The projection row, before the caller-dependent fields (`detail`) are attached. */
export interface PortalFeedRawEntry {
  kind: PortalEntryKind;
  sourceId: string;
  /** Present only for `member-anniversary`. */
  year?: number;
  group: PortalGroupKey;
  moment: Date;
  subject: PortalSubjectDto;
  detail: Record<string, unknown>;
}

/**
 * REQ-01-026 — "the 365 days ending at the caller's own today". `today` is a
 * `YYYY-MM-DD` string (`todayInTimeZone`'s own shape), read as a whole calendar day
 * **in the caller's own time zone**, not UTC: `end` is the last instant of that day
 * as `timezone`'s wall clock reads it, `start` is midnight 365 days before it, also
 * read in `timezone` — so a membership that joined exactly 365 days before today
 * sits on the window's own start boundary and is inside it (Edge case 3), while 366
 * days before is not (TC-01-INT-12). Computing the end in UTC instead answers the
 * wrong instant for any caller not on UTC: a caller behind UTC has their evening
 * fall on the *next* UTC date, and a UTC-anchored `end` cuts it off hours early.
 * `zonedTimeToUtc` is asked twice rather than once with an offset, because the
 * offset at `start` and at `end` may differ across a DST boundary inside the
 * 365-day span — the ordinary case, not the exception.
 */
export function computePortalWindow(today: string, timezone: string | null | undefined): { start: Date; end: Date } {
  const zone = timezone && timezone.trim().length > 0 ? timezone : 'UTC';
  const { year, month, day } = parseIsoDate(today);
  // Midnight at the *start* of the following day in `zone`, minus one millisecond,
  // is the last instant of `today` in `zone` — `zonedTimeToUtc` normalizes the
  // day-of-month overflow the same way `Date.UTC` does.
  const end = new Date(zonedTimeToUtc(year, month, day + 1, 0, 0, zone).getTime() - 1);
  const startCalendar = new Date(Date.UTC(year, month - 1, day));
  startCalendar.setUTCDate(startCalendar.getUTCDate() - 365);
  const start = zonedTimeToUtc(
    startCalendar.getUTCFullYear(),
    startCalendar.getUTCMonth() + 1,
    startCalendar.getUTCDate(),
    0,
    0,
    zone,
  );
  return { start, end };
}

/** The caller, resolved from the session — never from anything in the URL or the body. */
export interface PortalCaller {
  membershipId: string;
  accountId: string;
  organizationId: string;
  /** Normalized: the legacy `member` column value reads as `user`, as everywhere. */
  role: NormalizedRole;
  /** The raw column, for `hasCapability`, which normalizes internally. */
  rawRole: string;
  timezone: string | null;
}

/**
 * The one place both services resolve the caller. `organizationId` is the
 * session's, matched against the URL by `OrgScopeGuard` upstream and never read
 * from the path here. A caller with no active membership in this organization, or
 * one whose role does not hold `ViewPortalHome`, is answered a bare 404 — REQ-01-004
 * refuses every route in this spec that way, and every staff role holds the
 * capability, so this is a defensive branch rather than one any real caller hits.
 */
export async function resolvePortalCaller(
  prisma: PrismaService,
  session: SessionPayload,
  organizationId: string,
): Promise<PortalCaller> {
  const membership = await prisma.membership.findUnique({
    where: { accountId: session.accountId },
    select: {
      id: true,
      role: true,
      status: true,
      organizationId: true,
      accountId: true,
      account: { select: { timezone: true } },
    },
  });
  if (!membership || membership.status !== 'active' || membership.organizationId !== organizationId) {
    throw new NotFoundException();
  }
  if (!hasCapability(membership.role, 'ViewPortalHome')) {
    throw new NotFoundException();
  }
  return {
    membershipId: membership.id,
    accountId: membership.accountId,
    organizationId: membership.organizationId,
    role: normalizeRole(membership.role),
    rawRole: membership.role,
    timezone: membership.account.timezone,
  };
}
