import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PROJECT_MESSAGES,
  can,
  parseProjectStatusFilter,
  validateMembershipIds,
  validateProjectName,
  type Role,
} from '@devscribed/validation';
import { Prisma } from '@prisma/client';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';

/** A single row of the projects list (spec 11 GET .../projects contract). */
export interface ProjectListItem {
  id: string;
  name: string;
  status: string;
  memberCount: number;
  totalHours: number;
  createdAt: string;
}

/** The `POST`/`PUT` project response shape (spec 11 API contracts). */
export interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

/** A single assigned-member row (spec 11 GET .../members contract). */
export interface ProjectMemberItem {
  membershipId: string;
  accountId: string;
  firstName: string;
  lastName: string;
  role: string;
  assignedAt: string;
}

export interface CreateProjectInput {
  name?: unknown;
}

export interface AddMembersInput {
  membershipIds?: unknown;
}

interface CallerMembership {
  id: string;
  role: Role;
  organizationId: string;
  accountId: string;
}

/**
 * Spec 11 — Projects. Same guard order/shape conventions as `RequestsService` and
 * `MembersService`: the caller's membership + role are resolved from the DB on every
 * request (never trusted from the client), capabilities are gated with `can(...)`, and
 * every `projectId`/`membershipId` lookup is filtered by the caller's `organizationId`
 * in the same query so a foreign or nonexistent id is a 404, byte-for-byte identical to
 * "does not exist" (IDOR protection, spec 11 Security 5–7 / TC-11-INT-14).
 */
@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `GET /organizations/:orgId/projects`. viewer → 403. admin/manager → all projects,
   * honoring `?status=` (active/archived/all). user → only ACTIVE projects they are
   * assigned to (status filter ignored). Sorted by name ascending.
   */
  async listProjects(
    session: SessionPayload,
    query: { status?: unknown },
  ): Promise<{ projects: ProjectListItem[] }> {
    const caller = await this.requireCaller(session);

    // viewer has no access to any project features (spec 11 Roles matrix / TC-11-INT-12).
    if (!can(caller.role, 'list-assigned-projects')) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: PROJECT_MESSAGES.forbidden,
      });
    }

    const isManager = can(caller.role, 'manage-projects');

    let where: Prisma.ProjectWhereInput;
    if (isManager) {
      // admin/manager see all projects, filtered by the status query param.
      const statusFilter = parseProjectStatusFilter(
        typeof query.status === 'string' ? query.status : undefined,
      );
      where = {
        organizationId: caller.organizationId,
        ...(statusFilter === 'all' ? {} : { status: statusFilter }),
      };
    } else {
      // user: only ACTIVE projects they are assigned to. There is no code path by which a
      // user can request another member's projects (spec 11 Security 7 / TC-11-INT-11).
      where = {
        organizationId: caller.organizationId,
        status: 'active',
        members: { some: { membershipId: caller.id } },
      };
    }

    const projects = await this.prisma.project.findMany({
      where,
      // memberCount mirrors the roster (`listMembers`): a soft-removed member does not
      // count, so the count filters on the membership's active status too.
      include: {
        _count: { select: { members: { where: { membership: { status: 'active' } } } } },
      },
      orderBy: { name: 'asc' },
    });

    // Spec 12 §4 — real `totalHours` per project: sum of `TimeEntry.durationMinutes` / 60,
    // rounded to one decimal. One grouped query covers every project in the list (efficient,
    // no N+1). A project with no entries has no group row, so it correctly stays 0.0 —
    // spec-11's TC-11-INT-01 still holds.
    const projectIds = projects.map((p) => p.id);
    const minutesByProject = new Map<string, number>();
    if (projectIds.length > 0) {
      const grouped = await this.prisma.timeEntry.groupBy({
        by: ['projectId'],
        where: { projectId: { in: projectIds } },
        _sum: { durationMinutes: true },
      });
      for (const g of grouped) {
        if (g.projectId) minutesByProject.set(g.projectId, g._sum.durationMinutes ?? 0);
      }
    }

    return {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        memberCount: p._count.members,
        totalHours: Math.round(((minutesByProject.get(p.id) ?? 0) / 60) * 10) / 10,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }

  /**
   * `POST /organizations/:orgId/projects`. admin/manager only. Validates the name, then a
   * case-insensitive duplicate pre-check for the clean 409 on the common path; the DB's
   * functional unique index on `(organizationId, LOWER(name))` is the race backstop —
   * a P2002 is mapped to the same 409 (TC-11-INT-15). `createdByAccountId` is set from the
   * session, never the body.
   */
  async createProject(
    session: SessionPayload,
    input: CreateProjectInput,
  ): Promise<ProjectSummary> {
    const caller = await this.requireManager(session);

    const nameResult = validateProjectName(typeof input.name === 'string' ? input.name : '');
    if (!nameResult.valid) {
      throw new BadRequestException({ errors: { name: nameResult.error } });
    }
    const name = nameResult.value;

    await this.assertNameAvailable(caller.organizationId, name, null);

    try {
      const project = await this.prisma.project.create({
        data: {
          organizationId: caller.organizationId,
          name,
          createdByAccountId: caller.accountId,
        },
      });
      return this.toSummary(project);
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        throw new ConflictException({
          error: 'duplicate_name',
          message: PROJECT_MESSAGES.nameDuplicate,
        });
      }
      throw e;
    }
  }

  /**
   * `PUT /organizations/:orgId/projects/:projectId`. admin/manager only. 404 if the
   * project is not in the caller's org. Validates the name and rejects a case-insensitive
   * duplicate (excluding the project itself).
   */
  async renameProject(
    session: SessionPayload,
    projectId: string,
    input: CreateProjectInput,
  ): Promise<ProjectSummary> {
    const caller = await this.requireManager(session);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: caller.organizationId },
    });
    if (!project) {
      throw new NotFoundException({ error: 'not_found', message: PROJECT_MESSAGES.notFound });
    }

    const nameResult = validateProjectName(typeof input.name === 'string' ? input.name : '');
    if (!nameResult.valid) {
      throw new BadRequestException({ errors: { name: nameResult.error } });
    }
    const name = nameResult.value;

    await this.assertNameAvailable(caller.organizationId, name, project.id);

    try {
      const updated = await this.prisma.project.update({
        where: { id: project.id },
        data: { name },
      });
      return this.toSummary(updated);
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        throw new ConflictException({
          error: 'duplicate_name',
          message: PROJECT_MESSAGES.nameDuplicate,
        });
      }
      throw e;
    }
  }

  /**
   * `PATCH /organizations/:orgId/projects/:projectId/archive`. admin/manager only. 404 if
   * not in org; 400 `already_archived` if already archived. The state check + transition
   * run in a transaction with a row lock so two concurrent archives yield exactly one
   * archive event (spec 11 Security 15).
   */
  async archiveProject(
    session: SessionPayload,
    projectId: string,
  ): Promise<{ success: true }> {
    const caller = await this.requireManager(session);
    return this.transition(caller, projectId, 'active', 'archived', {
      error: 'already_archived',
      message: PROJECT_MESSAGES.alreadyArchived,
    });
  }

  /**
   * `PATCH /organizations/:orgId/projects/:projectId/restore`. admin/manager only. 404 if
   * not in org; 400 `already_active` if already active.
   */
  async restoreProject(
    session: SessionPayload,
    projectId: string,
  ): Promise<{ success: true }> {
    const caller = await this.requireManager(session);
    return this.transition(caller, projectId, 'archived', 'active', {
      error: 'already_active',
      message: PROJECT_MESSAGES.alreadyActive,
    });
  }

  /**
   * `GET /organizations/:orgId/projects/:projectId/members`. admin/manager only. 404 if
   * the project is not in the caller's org. Members sorted by lastName, firstName asc.
   */
  async listMembers(
    session: SessionPayload,
    projectId: string,
  ): Promise<{ members: ProjectMemberItem[] }> {
    const caller = await this.requireManager(session);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: caller.organizationId },
    });
    if (!project) {
      throw new NotFoundException({ error: 'not_found', message: PROJECT_MESSAGES.notFound });
    }

    // Only ACTIVE memberships surface in a project roster. Spec-04 removal is a
    // soft-delete (`status='removed'`), so the `onDelete: Cascade` FK never fires and the
    // ProjectMember row persists; filtering on the membership's status here is what makes a
    // removed member drop out of every roster (spec 11 requirement 15 / TC-11-INT-13).
    const assignments = await this.prisma.projectMember.findMany({
      where: { projectId: project.id, membership: { status: 'active' } },
      include: {
        membership: { include: { account: true } },
      },
    });

    const members: ProjectMemberItem[] = assignments.map((a) => ({
      membershipId: a.membershipId,
      accountId: a.membership.accountId,
      firstName: a.membership.account.firstName,
      lastName: a.membership.account.lastName,
      role: a.membership.role,
      assignedAt: a.assignedAt.toISOString(),
    }));

    members.sort(
      (x, y) =>
        x.lastName.localeCompare(y.lastName) || x.firstName.localeCompare(y.firstName),
    );

    return { members };
  }

  /**
   * `POST /organizations/:orgId/projects/:projectId/members`. admin/manager only. Every id
   * must be an ACTIVE membership in the caller's org — any invalid id rejects the whole
   * batch (400 `invalid_member`, no partial writes). Already-assigned ids are silently
   * skipped and counted. `assignedByAccountId` is set from the session.
   */
  async addMembers(
    session: SessionPayload,
    projectId: string,
    input: AddMembersInput,
  ): Promise<{ added: number; alreadyAssigned: number }> {
    const caller = await this.requireManager(session);

    const idsResult = validateMembershipIds(input.membershipIds);
    if (!idsResult.valid) {
      throw new BadRequestException({ errors: { membershipIds: idsResult.error } });
    }
    // De-duplicate the incoming ids so the same id twice in one payload counts once.
    const requestedIds = [...new Set(idsResult.value)];

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: projectId, organizationId: caller.organizationId },
      });
      if (!project) {
        throw new NotFoundException({ error: 'not_found', message: PROJECT_MESSAGES.notFound });
      }

      // Every requested id must be an ACTIVE membership in the caller's org. A single
      // invalid id rejects the whole batch — no partial writes (spec 11 Security 6).
      const validMemberships = await tx.membership.findMany({
        where: {
          id: { in: requestedIds },
          organizationId: caller.organizationId,
          status: 'active',
        },
        select: { id: true },
      });
      if (validMemberships.length !== requestedIds.length) {
        throw new BadRequestException({
          error: 'invalid_member',
          message: PROJECT_MESSAGES.membersInvalid,
        });
      }

      const existing = await tx.projectMember.findMany({
        where: { projectId: project.id, membershipId: { in: requestedIds } },
        select: { membershipId: true },
      });
      const alreadyAssignedIds = new Set(existing.map((e) => e.membershipId));
      const toAdd = requestedIds.filter((id) => !alreadyAssignedIds.has(id));

      if (toAdd.length > 0) {
        await tx.projectMember.createMany({
          data: toAdd.map((membershipId) => ({
            projectId: project.id,
            membershipId,
            assignedByAccountId: caller.accountId,
          })),
        });
      }

      return { added: toAdd.length, alreadyAssigned: alreadyAssignedIds.size };
    });
  }

  /**
   * `DELETE /organizations/:orgId/projects/:projectId/members/:membershipId`.
   * admin/manager only. 404 if the project is not in the caller's org, or the membership
   * is not assigned to the project.
   */
  async removeMember(
    session: SessionPayload,
    projectId: string,
    membershipId: string,
  ): Promise<{ success: true }> {
    const caller = await this.requireManager(session);

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: projectId, organizationId: caller.organizationId },
      });
      if (!project) {
        throw new NotFoundException({ error: 'not_found', message: PROJECT_MESSAGES.notFound });
      }

      const assignment = await tx.projectMember.findUnique({
        where: { projectId_membershipId: { projectId: project.id, membershipId } },
      });
      if (!assignment) {
        throw new NotFoundException({ error: 'not_found', message: PROJECT_MESSAGES.notFound });
      }

      await tx.projectMember.delete({ where: { id: assignment.id } });
      return { success: true };
    });
  }

  /**
   * Shared archive/restore state transition. Wrapped in a transaction with a row lock on
   * the project so a doubled concurrent request produces exactly one transition — the
   * second sees the already-changed status and gets the 400 (spec 11 Security 15).
   */
  private async transition(
    caller: CallerMembership,
    projectId: string,
    fromStatus: string,
    toStatus: string,
    conflict: { error: string; message: string },
  ): Promise<{ success: true }> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT "id", "status" FROM "Project"
        WHERE "id" = ${projectId} AND "organizationId" = ${caller.organizationId}
        FOR UPDATE`;
      const project = rows[0];
      if (!project) {
        throw new NotFoundException({ error: 'not_found', message: PROJECT_MESSAGES.notFound });
      }
      if (project.status !== fromStatus) {
        throw new BadRequestException(conflict);
      }
      await tx.project.update({ where: { id: project.id }, data: { status: toStatus } });
      return { success: true };
    });
  }

  /**
   * Case-insensitive duplicate pre-check for the clean 409 on the common path. The DB
   * functional unique index remains the authority under a race.
   */
  private async assertNameAvailable(
    organizationId: string,
    name: string,
    excludeProjectId: string | null,
  ): Promise<void> {
    const existing = await this.prisma.project.findFirst({
      where: {
        organizationId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeProjectId ? { id: { not: excludeProjectId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        error: 'duplicate_name',
        message: PROJECT_MESSAGES.nameDuplicate,
      });
    }
  }

  private isUniqueViolation(e: unknown): boolean {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
  }

  private toSummary(project: {
    id: string;
    name: string;
    status: string;
    createdAt: Date;
  }): ProjectSummary {
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      createdAt: project.createdAt.toISOString(),
    };
  }

  /** Caller's own active membership, resolved from the session — mirrors `RequestsService`. */
  private async requireCaller(session: SessionPayload): Promise<CallerMembership> {
    const caller = await this.prisma.membership.findUnique({
      where: { accountId: session.accountId },
    });
    if (
      !caller ||
      caller.status !== 'active' ||
      caller.organizationId !== session.organizationId
    ) {
      throw new ForbiddenException();
    }
    return {
      id: caller.id,
      role: caller.role as Role,
      organizationId: caller.organizationId,
      accountId: caller.accountId,
    };
  }

  /** Caller who additionally holds `manage-projects` (admin/manager) — else 403. */
  private async requireManager(session: SessionPayload): Promise<CallerMembership> {
    const caller = await this.requireCaller(session);
    if (!can(caller.role, 'manage-projects')) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: PROJECT_MESSAGES.forbidden,
      });
    }
    return caller;
  }
}
