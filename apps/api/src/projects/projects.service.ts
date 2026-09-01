import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CLIENT_MESSAGES,
  KANBAN_MESSAGES,
  PROJECT_MESSAGES,
  can,
  parseProjectStatusFilter,
  validateMembershipIds,
  validateProjectKey,
  validateProjectName,
  type Role,
} from '@devscribed/validation';
import { Prisma } from '@prisma/client';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';

/** A single row of the projects list (spec 11 GET .../projects contract, extended by spec 13). */
export interface ProjectListItem {
  id: string;
  name: string;
  status: string;
  memberCount: number;
  totalHours: number;
  createdAt: string;
  /** Spec 13 — the project's task-key prefix, or null when not set. */
  key: string | null;
  /** Spec organization/01 — the linked client's id, or null when unlinked. */
  clientId: string | null;
  /** Spec organization/01 — the linked client's current display name. */
  clientName: string | null;
}

/** The `POST`/`PUT` project response shape (spec 11 API contracts, extended by spec 13). */
export interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  /** Spec 13 — the project's task-key prefix, or null when not set. */
  key: string | null;
  /** Spec 13 — atomically-allocated task counter. */
  nextTaskNumber: number;
  /** Spec organization/01 — the linked client's id, or null when unlinked. */
  clientId: string | null;
  /** Spec organization/01 — the linked client's current display name. */
  clientName: string | null;
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
  /** Spec 13 — optional at creation, optional-and-immutable-once-set on PUT. */
  key?: unknown;
  /**
   * Spec organization/01 — optional client link. `undefined` means "not present in the
   * payload, don't touch"; `null` clears; a string is a client id to look up + verify.
   */
  clientId?: unknown;
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
      // count, so the count filters on the membership's active status too. The client
      // include is spec organization/01 — the list surfaces a client column server-side
      // so no per-row lookup is needed on the web page.
      include: {
        _count: { select: { members: { where: { membership: { status: 'active' } } } } },
        client: { select: { id: true, name: true } },
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
        key: p.key,
        clientId: p.clientId,
        clientName: p.client ? p.client.name : null,
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

    const key = await this.parseAndAssertKeyAvailable(input.key, caller.organizationId, null);

    // Spec organization/01 — optional client link. `undefined` means "not present",
    // so the default (unlinked) is preserved. `null` explicitly creates unlinked.
    // A valid active client id in the same org is set; anything else 422s.
    const clientId = await this.resolveClientId(caller.organizationId, input.clientId);

    try {
      const project = await this.prisma.project.create({
        data: {
          organizationId: caller.organizationId,
          name,
          key,
          createdByAccountId: caller.accountId,
          ...(clientId !== undefined ? { clientId } : {}),
        },
        include: { client: { select: { id: true, name: true } } },
      });
      return this.toSummary(project);
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        // Two unique indexes on Project: (org, LOWER(name)) and partial (org, key).
        // The pre-checks above catch the common paths; a race here maps back to the
        // spec-correct 409 for whichever conflict fired.
        const meta = (e as Prisma.PrismaClientKnownRequestError).meta;
        const target =
          meta && typeof meta === 'object' && 'target' in meta ? String((meta as { target?: unknown }).target ?? '') : '';
        if (target.includes('key')) {
          throw new ConflictException({
            error: 'key_duplicate',
            message: KANBAN_MESSAGES.projectKeyDuplicate,
          });
        }
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

    // Spec 13 — key is optional on PUT; when supplied, must be either the same value
    // (idempotent no-op) or a new value on a project that currently has no key.
    const keyProvided = input.key !== undefined && input.key !== null;
    let keyToSet: string | undefined;
    if (keyProvided) {
      const parsed = this.parseKeyInput(input.key);
      if (project.key !== null) {
        if (project.key === parsed) {
          keyToSet = undefined; // no-op, skip the write
        } else {
          throw new BadRequestException({
            error: 'key_immutable',
            message: KANBAN_MESSAGES.projectKeyImmutable,
          });
        }
      } else {
        await this.assertKeyAvailable(caller.organizationId, parsed, project.id);
        keyToSet = parsed;
      }
    }

    // Spec organization/01 — same client-resolve on rename. `undefined` means "not
    // present in payload, don't touch"; `null` clears; a string is validated.
    const clientId = await this.resolveClientId(caller.organizationId, input.clientId);

    try {
      const updated = await this.prisma.project.update({
        where: { id: project.id },
        data: {
          name,
          ...(keyToSet !== undefined ? { key: keyToSet } : {}),
          ...(clientId !== undefined ? { clientId } : {}),
        },
        include: { client: { select: { id: true, name: true } } },
      });
      return this.toSummary(updated);
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        const meta = (e as Prisma.PrismaClientKnownRequestError).meta;
        const target =
          meta && typeof meta === 'object' && 'target' in meta ? String((meta as { target?: unknown }).target ?? '') : '';
        if (target.includes('key')) {
          throw new ConflictException({
            error: 'key_duplicate',
            message: KANBAN_MESSAGES.projectKeyDuplicate,
          });
        }
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
    key: string | null;
    nextTaskNumber: number;
    clientId: string | null;
    client?: { id: string; name: string } | null;
  }): ProjectSummary {
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      createdAt: project.createdAt.toISOString(),
      key: project.key,
      nextTaskNumber: project.nextTaskNumber,
      clientId: project.clientId,
      clientName: project.client ? project.client.name : null,
    };
  }

  /**
   * Spec organization/01 §Security — resolve a caller-supplied `clientId` for project
   * create/edit. Returns `undefined` when the payload key is absent (skip the write),
   * `null` when explicitly cleared, and the string id when the lookup succeeds. A
   * non-string / non-null value with the key present is a defensive 422 with the
   * spec's `client_not_found` shape; a missing id or an id belonging to another
   * organization is also `client_not_found` (never leaks cross-org existence); an
   * archived client in the same org is `client_archived`. All shared strings come
   * from `CLIENT_MESSAGES` — never inlined here.
   */
  private async resolveClientId(
    organizationId: string,
    raw: unknown,
  ): Promise<string | null | undefined> {
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new UnprocessableEntityException({
        error: 'client_not_found',
        message: CLIENT_MESSAGES.clientNotFound,
      });
    }
    const client = await this.prisma.client.findFirst({
      where: { id: raw, organizationId },
      select: { id: true, status: true },
    });
    if (!client) {
      throw new UnprocessableEntityException({
        error: 'client_not_found',
        message: CLIENT_MESSAGES.clientNotFound,
      });
    }
    if (client.status === 'archived') {
      throw new UnprocessableEntityException({
        error: 'client_archived',
        message: CLIENT_MESSAGES.clientArchived,
      });
    }
    return client.id;
  }

  /**
   * Spec 13 — parse+validate a caller-supplied key. Empty/whitespace/null → null (the
   * caller may omit it), otherwise runs the shared validator and 400s on failure.
   */
  private parseKeyInput(input: unknown): string {
    const raw = typeof input === 'string' ? input : '';
    const result = validateProjectKey(raw);
    if (!result.valid) {
      throw new BadRequestException({ errors: { key: result.error } });
    }
    return result.value;
  }

  /** Wraps `parseKeyInput` + duplicate check for create. Returns null when omitted. */
  private async parseAndAssertKeyAvailable(
    input: unknown,
    organizationId: string,
    excludeProjectId: string | null,
  ): Promise<string | null> {
    if (input === undefined || input === null) return null;
    if (typeof input === 'string' && input.trim().length === 0) return null;
    const key = this.parseKeyInput(input);
    await this.assertKeyAvailable(organizationId, key, excludeProjectId);
    return key;
  }

  /** Spec 13 — pre-check for the 409 key_duplicate on the common path. */
  private async assertKeyAvailable(
    organizationId: string,
    key: string,
    excludeProjectId: string | null,
  ): Promise<void> {
    const existing = await this.prisma.project.findFirst({
      where: {
        organizationId,
        key,
        ...(excludeProjectId ? { id: { not: excludeProjectId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        error: 'key_duplicate',
        message: KANBAN_MESSAGES.projectKeyDuplicate,
      });
    }
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
