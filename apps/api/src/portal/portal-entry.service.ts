import { Injectable, NotFoundException } from '@nestjs/common';
import {
  anniversaryDate,
  can,
  composeEntryId,
  getAvatarInitials,
  parseEntryId,
  todayInTimeZone,
} from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import { PortalSettingsService } from './portal-settings.service';
import {
  computePortalWindow,
  displayName,
  resolvePortalCaller,
  type PortalCaller,
  type PortalEntryDetailDto,
  type PortalEntryFactDto,
  type PortalEntryMemberRefDto,
  type PortalEntryProjectRefDto,
  type PortalSubjectDto,
} from './portal-entry.types';

/** The web app's own origin — the same pattern every other cross-app link in the API uses. */
function webOrigin(): string {
  return process.env.WEB_ORIGIN || 'http://localhost:3000';
}

/**
 * Portal spec 01 — the entry page (REQ-01-038 through REQ-01-047, REQ-01-054 through
 * REQ-01-056).
 *
 * **Security discipline (§Security): the source row is always loaded first, and every
 * reason the caller's feed would not contain it — an id this spec derives nothing
 * for, a switched-off group, a row outside the 365-day window, a vanished row, a row
 * in another organization — is answered by the same bare `NotFoundException()`, with
 * no distinguishing body and no distinguishing order of checks between them
 * (TC-01-INT-16). There is no role-based exclusion to check: REQ-01-034 draws every
 * kind to every role, so nothing here is ever refused *because of who is asking* —
 * only fields are ever withheld, never the entry itself.
 */
@Injectable()
export class PortalEntryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PortalSettingsService,
  ) {}

  /** `GET /api/organizations/{orgId}/portal/news/{entryId}`. */
  async getEntry(
    session: SessionPayload,
    organizationId: string,
    entryId: string,
  ): Promise<PortalEntryDetailDto> {
    const caller = await resolvePortalCaller(this.prisma, session, organizationId);

    const parsed = parseEntryId(entryId);
    if (!parsed) throw new NotFoundException();

    const groups = await this.settings.readGroups(organizationId);
    const today = todayInTimeZone(caller.timezone);
    const { start, end } = computePortalWindow(today, caller.timezone);

    switch (parsed.kind) {
      case 'vacancy-opened': {
        const vacancy = await this.prisma.vacancy.findFirst({
          where: { id: parsed.sourceId, organizationId },
          select: {
            id: true,
            title: true,
            description: true,
            createdAt: true,
            status: true,
            durationMinutes: true,
            publicSlug: true,
            interviewer: { select: { firstName: true, lastName: true } },
            categories: { select: { category: { select: { name: true } } } },
          },
        });
        if (!vacancy) throw new NotFoundException();
        if (!groups.hiring || vacancy.createdAt < start || vacancy.createdAt > end) {
          throw new NotFoundException();
        }
        return this.buildVacancyEntry(vacancy);
      }

      case 'project-started': {
        const project = await this.prisma.project.findFirst({
          where: { id: parsed.sourceId, organizationId },
          select: {
            id: true,
            name: true,
            createdAt: true,
            status: true,
            client: { select: { name: true } },
          },
        });
        if (!project) throw new NotFoundException();
        if (!groups.work || project.createdAt < start || project.createdAt > end) {
          throw new NotFoundException();
        }
        return this.buildProjectEntry(organizationId, caller, project);
      }

      case 'member-joined': {
        const membership = await this.prisma.membership.findFirst({
          where: { id: parsed.sourceId, organizationId, status: 'active' },
          select: {
            id: true,
            joinedAt: true,
            jobTitle: true,
            account: { select: { firstName: true, lastName: true } },
          },
        });
        if (!membership) throw new NotFoundException();
        if (!groups.people || membership.joinedAt < start || membership.joinedAt > end) {
          throw new NotFoundException();
        }
        return this.buildMemberEntry(
          'member-joined',
          undefined,
          organizationId,
          caller,
          membership,
          membership.joinedAt,
        );
      }

      case 'member-anniversary': {
        const membership = await this.prisma.membership.findFirst({
          where: { id: parsed.sourceId, organizationId, status: 'active' },
          select: {
            id: true,
            joinedAt: true,
            jobTitle: true,
            account: { select: { firstName: true, lastName: true } },
          },
        });
        if (!membership) throw new NotFoundException();
        const year = parsed.year as number;
        const anniversary = anniversaryDate(membership.joinedAt, year);
        if (!groups.people || anniversary < start || anniversary > end) {
          throw new NotFoundException();
        }
        return this.buildMemberEntry(
          'member-anniversary',
          year,
          organizationId,
          caller,
          membership,
          anniversary,
        );
      }

      default: {
        // parseEntryId's own closed set already excludes anything else; kept for
        // safety, answered exactly as every other unreachable case here is.
        throw new NotFoundException();
      }
    }
  }

  /**
   * REQ-01-042, REQ-01-043, REQ-01-044 — title, description (as `body`), interview
   * length, categories and the interviewer's name always; the booking URL only while
   * `status` is `open` (Edge case 5).
   */
  private buildVacancyEntry(vacancy: {
    id: string;
    title: string;
    description: string | null;
    createdAt: Date;
    status: string;
    durationMinutes: number;
    publicSlug: string;
    interviewer: { firstName: string; lastName: string };
    categories: { category: { name: string } }[];
  }): PortalEntryDetailDto {
    const facts: PortalEntryFactDto[] = [
      { key: 'interviewer', label: 'Interviews with', value: displayName(vacancy.interviewer) },
      { key: 'duration', label: 'Interview length', value: `${vacancy.durationMinutes} minutes` },
    ];

    return {
      id: composeEntryId('vacancy-opened', vacancy.id),
      kind: 'vacancy-opened',
      group: 'hiring',
      occurredAt: vacancy.createdAt.toISOString(),
      subject: { kind: 'vacancy', id: vacancy.id, name: vacancy.title, initials: null },
      facts,
      categories: vacancy.categories.map((entry) => entry.category.name),
      body: vacancy.description ?? null,
      shareUrl: vacancy.status === 'open' ? `${webOrigin()}/book/${vacancy.publicSlug}` : null,
      link: null,
    };
  }

  /**
   * REQ-01-045 — display name, job title, `joinedAt` and the active projects the
   * reader may already see the subject on. The roster-visibility test
   * (`manage-projects` or being a `ProjectMember` of the project) is reused here so
   * one reader is never shown a project through this page that REQ-01-047 would hide
   * on that project's own page.
   */
  private async buildMemberEntry(
    kind: 'member-joined' | 'member-anniversary',
    year: number | undefined,
    organizationId: string,
    caller: PortalCaller,
    membership: {
      id: string;
      joinedAt: Date;
      jobTitle: string | null;
      account: { firstName: string; lastName: string };
    },
    moment: Date,
  ): Promise<PortalEntryDetailDto> {
    const subject: PortalSubjectDto = {
      kind: 'member',
      id: membership.id,
      name: displayName(membership.account),
      initials: getAvatarInitials(membership.account.firstName, membership.account.lastName),
    };

    const facts: PortalEntryFactDto[] = [];
    if (membership.jobTitle) {
      facts.push({ key: 'jobTitle', label: 'Job title', value: membership.jobTitle });
    }
    facts.push({ key: 'joinedAt', label: 'Joined', value: membership.joinedAt.toISOString() });
    if (kind === 'member-anniversary' && year !== undefined) {
      facts.push({ key: 'years', label: 'Years with the team', value: String(year) });
    }

    const rows = await this.prisma.projectMember.findMany({
      where: { membershipId: membership.id, project: { organizationId, status: 'active' } },
      select: { project: { select: { id: true, name: true } } },
    });

    let projects: PortalEntryProjectRefDto[] = [];
    if (rows.length > 0) {
      const canSeeAll = can(caller.role, 'manage-projects');
      let ownProjectIds = new Set<string>();
      if (!canSeeAll) {
        const own = await this.prisma.projectMember.findMany({
          where: {
            membershipId: caller.membershipId,
            projectId: { in: rows.map((row) => row.project.id) },
          },
          select: { projectId: true },
        });
        ownProjectIds = new Set(own.map((entry) => entry.projectId));
      }
      projects = rows
        .map((row) => row.project)
        .filter((project) => canSeeAll || ownProjectIds.has(project.id))
        .map((project) => ({ id: project.id, name: project.name }));
    }

    return {
      id: composeEntryId(kind, membership.id, year),
      kind,
      group: 'people',
      occurredAt: moment.toISOString(),
      subject,
      facts,
      categories: null,
      body: null,
      shareUrl: null,
      link: `/org/${organizationId}/members/${membership.id}`,
      projects,
    };
  }

  /**
   * REQ-01-046, REQ-01-047, REQ-01-056, Edge case 7 — name, `createdAt`, and the
   * client under REQ-01-035's own condition; the roster only where the reader holds
   * `manage-projects` or is a `ProjectMember` of it, omitted (never nulled) otherwise;
   * `Archived` recorded as a fact when the project is archived.
   */
  private async buildProjectEntry(
    organizationId: string,
    caller: PortalCaller,
    project: {
      id: string;
      name: string;
      createdAt: Date;
      status: string;
      client: { name: string } | null;
    },
  ): Promise<PortalEntryDetailDto> {
    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_membershipId: { projectId: project.id, membershipId: caller.membershipId },
      },
      select: { id: true },
    });
    const isProjectMember = Boolean(membership);

    const canSeeClient = can(caller.role, 'view-clients') || isProjectMember;
    const clientName = canSeeClient && project.client ? project.client.name : null;

    const canSeeRoster = can(caller.role, 'manage-projects') || isProjectMember;
    let members: PortalEntryMemberRefDto[] | undefined;
    if (canSeeRoster) {
      const rows = await this.prisma.projectMember.findMany({
        where: { projectId: project.id },
        select: {
          membership: {
            select: { id: true, account: { select: { firstName: true, lastName: true } } },
          },
        },
      });
      members = rows.map((row) => ({
        id: row.membership.id,
        name: displayName(row.membership.account),
        initials: getAvatarInitials(row.membership.account.firstName, row.membership.account.lastName),
      }));
    }

    const facts: PortalEntryFactDto[] = [];
    if (project.status === 'archived') {
      facts.push({ key: 'status', label: 'Status', value: 'Archived' });
    }
    // REQ-01-047/REQ-01-056's own discipline — omitted, never a stated "unknown" —
    // is reused here: a reader who may not see the client gets no `client` fact at
    // all, rather than one carrying an empty or null value.
    if (clientName) {
      facts.push({ key: 'client', label: 'Client', value: clientName });
    }

    return {
      id: composeEntryId('project-started', project.id),
      kind: 'project-started',
      group: 'work',
      occurredAt: project.createdAt.toISOString(),
      subject: { kind: 'project', id: project.id, name: project.name, initials: null },
      facts,
      categories: null,
      body: null,
      shareUrl: null,
      link: null,
      members,
    };
  }
}
