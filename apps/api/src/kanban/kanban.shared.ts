import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KANBAN_MESSAGES, can, type MemberCapability, type Role } from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';

/** The caller's resolved membership — shared across board & task services. */
export interface CallerMembership {
  id: string;
  role: Role;
  organizationId: string;
  accountId: string;
}

export interface ProjectContext {
  id: string;
  organizationId: string;
  name: string;
  status: string;
  key: string | null;
  nextTaskNumber: number;
}

/**
 * Spec 13 — shared caller/permission helpers reused by BoardService and TasksService.
 * Resolves the caller's membership on every request, gates capabilities via `can(...)`,
 * scopes projects by `session.organizationId` (cross-org → 404), and layers the
 * user-role project-membership check on top.
 */
@Injectable()
export class KanbanAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Caller's active membership. Mirrors the pattern in ProjectsService — the session
   * must match an ACTIVE membership in the org whose id is in the JWT. Anything else
   * is 403 (never trust the client's role, always re-read).
   */
  async requireCaller(session: SessionPayload): Promise<CallerMembership> {
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

  /** Enforces a capability on the caller — 403 with the spec-13 message when denied. */
  requireCapability(
    caller: CallerMembership,
    capability: MemberCapability,
    message: string,
  ): void {
    if (!can(caller.role, capability)) {
      throw new ForbiddenException({ error: 'forbidden', message });
    }
  }

  /**
   * Load the project by id, scoped to caller's org. 404 on miss (IDOR protection).
   * Does NOT enforce project-membership; callers layer that on afterwards.
   */
  async requireProject(caller: CallerMembership, projectId: string): Promise<ProjectContext> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: caller.organizationId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        status: true,
        key: true,
        nextTaskNumber: true,
      },
    });
    if (!project) {
      throw new NotFoundException({ error: 'not_found', message: 'Project not found' });
    }
    return project;
  }

  /**
   * user role is further scoped to projects they are ProjectMember of. admin/manager
   * bypass this check. viewer never reaches this method — the capability guard rejects
   * it first.
   */
  async requireProjectAccess(
    caller: CallerMembership,
    project: ProjectContext,
    message: string,
  ): Promise<void> {
    if (caller.role === 'admin' || caller.role === 'manager') return;
    const assignment = await this.prisma.projectMember.findUnique({
      where: {
        projectId_membershipId: { projectId: project.id, membershipId: caller.id },
      },
    });
    if (!assignment) {
      throw new ForbiddenException({ error: 'forbidden', message });
    }
  }

  /** The project must have a key to expose the board (spec 13 FR-2). */
  requireProjectKey(project: ProjectContext): asserts project is ProjectContext & { key: string } {
    if (!project.key) {
      throw new BadRequestException({
        error: 'project_key_required',
        message: KANBAN_MESSAGES.projectKeyRequired,
      });
    }
  }

  /** Archived projects are read-only — every mutation is 400 project_archived. */
  requireProjectActive(project: ProjectContext): void {
    if (project.status !== 'active') {
      throw new BadRequestException({
        error: 'project_archived',
        message: KANBAN_MESSAGES.projectArchived,
      });
    }
  }
}
