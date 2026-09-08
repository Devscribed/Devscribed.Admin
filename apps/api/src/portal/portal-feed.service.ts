import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  PORTAL_MESSAGES,
  anniversaryDate,
  can,
  composeCursor,
  composeEntryId,
  getAvatarInitials,
  parseCursor,
  todayInTimeZone,
  validateFeedLimit,
  type PortalCursor,
} from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import { PortalSettingsService } from './portal-settings.service';
import {
  computePortalWindow,
  displayName,
  resolvePortalCaller,
  type PortalCaller,
  type PortalFeedEntryDto,
  type PortalFeedPageDto,
  type PortalFeedRawEntry,
  type PortalSubjectDto,
} from './portal-entry.types';

function toEntryId(raw: PortalFeedRawEntry): string {
  return composeEntryId(raw.kind, raw.sourceId, raw.year);
}

/**
 * Ordinal comparison, not `localeCompare` — entry ids are opaque `kind:sourceId`
 * strings, and a locale-aware collation can order two of them differently from
 * plain codepoint order (it treats punctuation like the `-` inside a uuid as a
 * low-weight, sometimes-ignored difference). `compareFeedEntries` and the cursor
 * boundary below both need the *same* order, so both call this one function
 * rather than each spelling out their own comparison.
 */
function compareEntryIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** REQ-01-024 — moment descending, ties broken by entry id ascending. */
function compareFeedEntries(a: PortalFeedRawEntry, b: PortalFeedRawEntry): number {
  const diff = b.moment.getTime() - a.moment.getTime();
  if (diff !== 0) return diff;
  return compareEntryIds(toEntryId(a), toEntryId(b));
}

/**
 * REQ-01-025 — "strictly after" the cursor in `compareFeedEntries`'s own order.
 * Built from the same moment-then-id comparison `compareFeedEntries` uses (with
 * the cursor standing in for the "entry" on the other side), so the boundary the
 * cursor draws can never disagree with the order the page was sorted in.
 */
function isAfterCursor(entry: PortalFeedRawEntry, cursor: PortalCursor): boolean {
  const cursorInstant = new Date(cursor.instant);
  const diff = cursorInstant.getTime() - entry.moment.getTime();
  if (diff !== 0) return diff > 0;
  return compareEntryIds(toEntryId(entry), cursor.entryId) > 0;
}

function toFeedEntryDto(raw: PortalFeedRawEntry): PortalFeedEntryDto {
  return {
    id: toEntryId(raw),
    kind: raw.kind,
    group: raw.group,
    occurredAt: raw.moment.toISOString(),
    subject: raw.subject,
    detail: raw.detail,
  };
}

/**
 * Portal spec 01 — the feed projection (REQ-01-022 through REQ-01-036, REQ-01-054).
 *
 * **The feed is a projection, not a table.** Every read below is a `SELECT` against
 * `Membership`, `Vacancy` and `Project`; nothing is ever written here, which is what
 * REQ-01-054 requires and TC-01-INT-02 counts.
 *
 * **Four kinds and no more.** No entry is derived from a `Client` (REQ-01-032), and
 * none from `Candidate`, `Application`, `ApplicationScheduleEvent`,
 * `ApplicationCriterion` or `ApplicationCv` (REQ-01-033) — this service imports
 * none of those models' tables.
 *
 * **Visibility is uniform.** REQ-01-034 marks every kind Drawn for every role; the
 * only field a role changes is a `project-started`'s `clientName`
 * (REQ-01-035/REQ-01-055), decided in `deriveProjectEntries` below.
 */
@Injectable()
export class PortalFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PortalSettingsService,
  ) {}

  /** `GET /api/organizations/{orgId}/portal/news`. */
  async listNews(
    session: SessionPayload,
    organizationId: string,
    query: { limit?: unknown; cursor?: unknown },
  ): Promise<PortalFeedPageDto> {
    const caller = await resolvePortalCaller(this.prisma, session, organizationId);

    const limitResult = validateFeedLimit(query.limit);
    if (!limitResult.valid) {
      throw new UnprocessableEntityException({
        error: 'validation_error',
        fields: { limit: limitResult.error },
      });
    }
    const limit = limitResult.value;

    let cursor: PortalCursor | null = null;
    if (query.cursor !== undefined) {
      if (typeof query.cursor !== 'string') {
        throw new UnprocessableEntityException({
          error: 'validation_error',
          fields: { cursor: PORTAL_MESSAGES.cursorInvalid },
        });
      }
      cursor = parseCursor(query.cursor);
      if (!cursor) {
        throw new UnprocessableEntityException({
          error: 'validation_error',
          fields: { cursor: PORTAL_MESSAGES.cursorInvalid },
        });
      }
    }

    const today = todayInTimeZone(caller.timezone);
    const { start, end } = computePortalWindow(today);
    // Edge case 15 — a cursor from before a group changed still parses and pages from
    // that moment; the window's own end is never widened by a cursor, only narrowed,
    // so this is a bound, not a second source of truth for "today".
    const cursorInstant = cursor ? new Date(cursor.instant) : null;
    const effectiveEnd = cursorInstant && cursorInstant < end ? cursorInstant : end;

    const groups = await this.settings.readGroups(organizationId);

    const [memberEntries, vacancyEntries, projectEntries] = await Promise.all([
      groups.people ? this.deriveMemberEntries(organizationId, start, effectiveEnd) : [],
      groups.hiring ? this.deriveVacancyEntries(organizationId, start, effectiveEnd) : [],
      groups.work ? this.deriveProjectEntries(organizationId, start, effectiveEnd, caller) : [],
    ]);

    const merged = [...memberEntries, ...vacancyEntries, ...projectEntries];
    merged.sort(compareFeedEntries);

    const filtered = cursor ? merged.filter((entry) => isAfterCursor(entry, cursor!)) : merged;
    const page = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;

    const result: PortalFeedPageDto = { entries: page.map(toFeedEntryDto) };
    if (hasMore) {
      const last = page[page.length - 1];
      result.nextCursor = composeCursor(last.moment, toEntryId(last));
    }
    return result;
  }

  /**
   * REQ-01-027, REQ-01-028, REQ-01-029 — every active `Membership`'s own joining and
   * every whole-year anniversary of it that falls inside the window. A `removed`
   * membership is excluded by the `status: 'active'` filter, so it derives neither
   * kind (Edge case 1).
   */
  private async deriveMemberEntries(
    organizationId: string,
    start: Date,
    end: Date,
  ): Promise<PortalFeedRawEntry[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId, status: 'active', joinedAt: { lte: end } },
      select: {
        id: true,
        joinedAt: true,
        jobTitle: true,
        account: { select: { firstName: true, lastName: true } },
      },
    });

    const entries: PortalFeedRawEntry[] = [];
    for (const membership of memberships) {
      const subject: PortalSubjectDto = {
        kind: 'member',
        id: membership.id,
        name: displayName(membership.account),
        initials: getAvatarInitials(membership.account.firstName, membership.account.lastName),
      };

      if (membership.joinedAt >= start && membership.joinedAt <= end) {
        entries.push({
          kind: 'member-joined',
          sourceId: membership.id,
          group: 'people',
          moment: membership.joinedAt,
          subject,
          detail: { jobTitle: membership.jobTitle },
        });
      }

      // Anniversaries only move forward in time as `year` grows, so the loop can stop
      // the moment it passes the window's end rather than computing every year since
      // joining (Edge case 3, Edge case 4, TC-01-INT-12).
      for (let year = 1; ; year += 1) {
        const anniversary = anniversaryDate(membership.joinedAt, year);
        if (anniversary > end) break;
        if (anniversary >= start) {
          entries.push({
            kind: 'member-anniversary',
            sourceId: membership.id,
            year,
            group: 'people',
            moment: anniversary,
            subject,
            detail: { years: year },
          });
        }
      }
    }
    return entries;
  }

  /** REQ-01-030 — every `Vacancy`, at `createdAt`, whatever its current `status`. */
  private async deriveVacancyEntries(
    organizationId: string,
    start: Date,
    end: Date,
  ): Promise<PortalFeedRawEntry[]> {
    const vacancies = await this.prisma.vacancy.findMany({
      where: { organizationId, createdAt: { gte: start, lte: end } },
      select: {
        id: true,
        title: true,
        createdAt: true,
        interviewer: { select: { firstName: true, lastName: true } },
        categories: { select: { category: { select: { name: true } } } },
      },
    });

    return vacancies.map((vacancy) => ({
      kind: 'vacancy-opened' as const,
      sourceId: vacancy.id,
      group: 'hiring' as const,
      moment: vacancy.createdAt,
      subject: { kind: 'vacancy' as const, id: vacancy.id, name: vacancy.title, initials: null },
      detail: {
        categories: vacancy.categories.map((entry) => entry.category.name),
        interviewerName: displayName(vacancy.interviewer),
      },
    }));
  }

  /**
   * REQ-01-031 — every `Project`, at `createdAt`, whatever its current `status`. The
   * one role-dependent field in the whole feed: REQ-01-035 names the project's client
   * where the reader holds `view-clients` or is a `ProjectMember` of it, and
   * REQ-01-055 answers `null` — never omits the key — otherwise, so a reader can
   * never tell a project with no client from one whose client is not theirs to see.
   */
  private async deriveProjectEntries(
    organizationId: string,
    start: Date,
    end: Date,
    caller: PortalCaller,
  ): Promise<PortalFeedRawEntry[]> {
    const projects = await this.prisma.project.findMany({
      where: { organizationId, createdAt: { gte: start, lte: end } },
      select: {
        id: true,
        name: true,
        createdAt: true,
        client: { select: { name: true } },
      },
    });
    if (projects.length === 0) return [];

    const canSeeAllClients = can(caller.role, 'view-clients');
    let ownProjectIds = new Set<string>();
    if (!canSeeAllClients) {
      const memberships = await this.prisma.projectMember.findMany({
        where: {
          membershipId: caller.membershipId,
          projectId: { in: projects.map((project) => project.id) },
        },
        select: { projectId: true },
      });
      ownProjectIds = new Set(memberships.map((membership) => membership.projectId));
    }

    return projects.map((project) => {
      const visible = canSeeAllClients || ownProjectIds.has(project.id);
      return {
        kind: 'project-started' as const,
        sourceId: project.id,
        group: 'work' as const,
        moment: project.createdAt,
        subject: { kind: 'project' as const, id: project.id, name: project.name, initials: null },
        detail: {
          clientName: visible && project.client ? project.client.name : null,
        },
      };
    });
  }
}
