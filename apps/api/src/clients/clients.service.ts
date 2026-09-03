import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CLIENT_MESSAGES,
  can,
  normalizeClientName,
  parseClientStatusFilter,
  validateClientName,
  type Role,
} from '@devscribed/validation';
import { Prisma } from '@prisma/client';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';

export interface CallerMembership {
  id: string;
  role: Role;
  organizationId: string;
  accountId: string;
}

/** A single row of the clients list (spec org/01 GET .../clients contract). */
export interface ClientListItem {
  id: string;
  name: string;
  status: string;
  /** Count of projects with `clientId = this.id`, regardless of status. */
  projectCount: number;
  /** Count of projects with `status = 'active'`. */
  activeProjectCount: number;
  createdAt: string;
  updatedAt: string;
}

/** The mutation response shape (spec org/01 POST/PATCH .../clients contracts). */
export interface ClientSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  archivedByAccountId: string | null;
  createdByAccountId: string;
}

/** Client detail — client plus nav-aid project list (spec org/01 GET .../clients/:id). */
export interface ClientDetailResponse {
  client: ClientSummary;
  projects: Array<{ id: string; name: string; status: string }>;
}

/**
 * Spec organization/01 — Clients. Role checks happen inside the service via
 * `can(role, 'manage-clients' | 'view-clients')`; a caller without the capability
 * gets 404 (not 403), so cross-org and lack-of-capability collapse to the same
 * response — same discipline as `OrgScopeGuard`. Every lookup filters by
 * `session.organizationId`, never the path `orgId` (IDOR protection per spec §Security).
 */
@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `GET /organizations/:orgId/clients`. admin/manager only (else 404). Filters by
   * `?status=` (active/archived/all — invalid values silently coerced to 'active' by
   * `parseClientStatusFilter`) and `?q=` (case-insensitive substring, 0–120 chars —
   * a longer or non-string value is treated as no filter, mirroring the projects-style
   * permissiveness rather than 400ing). `projectCount` / `activeProjectCount` come
   * from two grouped queries so the whole list is one round-trip per group (no N+1).
   */
  async listClients(
    session: SessionPayload,
    query: { status?: unknown; q?: unknown },
  ): Promise<{ clients: ClientListItem[] }> {
    const caller = await this.requireViewCapability(session);

    const statusFilter = parseClientStatusFilter(
      typeof query.status === 'string' ? query.status : undefined,
    );

    // The search is optional; a longer-than-120 string or a non-string is silently
    // treated as no filter, so a stray query param never turns into a 400 (spec §16).
    const q = typeof query.q === 'string' ? query.q : '';
    const searchFilter =
      q.length > 0 && q.length <= 120
        ? { name: { contains: q, mode: Prisma.QueryMode.insensitive } }
        : {};

    const clients = await this.prisma.client.findMany({
      where: {
        organizationId: caller.organizationId,
        ...(statusFilter === 'all' ? {} : { status: statusFilter }),
        ...searchFilter,
      },
      // Postgres UTF-8 collation is adequate for the spec's assertions; the finer
      // point of case-insensitive collation is out of scope for v1 (spec §16).
      orderBy: { name: 'asc' },
    });

    // Two grouped queries — total and active — batched with the list so the whole
    // response is three round-trips regardless of client count.
    const clientIds = clients.map((c) => c.id);
    const totals = new Map<string, number>();
    const actives = new Map<string, number>();
    if (clientIds.length > 0) {
      const totalRows = await this.prisma.project.groupBy({
        by: ['clientId'],
        where: { clientId: { in: clientIds } },
        _count: { _all: true },
      });
      for (const row of totalRows) {
        if (row.clientId) totals.set(row.clientId, row._count._all);
      }
      const activeRows = await this.prisma.project.groupBy({
        by: ['clientId'],
        where: { clientId: { in: clientIds }, status: 'active' },
        _count: { _all: true },
      });
      for (const row of activeRows) {
        if (row.clientId) actives.set(row.clientId, row._count._all);
      }
    }

    return {
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        projectCount: totals.get(c.id) ?? 0,
        activeProjectCount: actives.get(c.id) ?? 0,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
    };
  }

  /**
   * `POST /organizations/:orgId/clients`. admin/manager only (else 404). Validates the
   * name via the shared rules (`validateClientName` — normalises + collapses whitespace
   * before the length/pattern checks) and persists the normalised value. The DB's
   * functional unique index on `(organizationId, LOWER(name))` is the race backstop —
   * a P2002 maps to the same 409 as the pre-check (TC-01-INT-05..07 / TC-01-INT-08 for
   * the cross-org case, where each org's index is independent).
   */
  async createClient(
    session: SessionPayload,
    input: { name?: unknown },
  ): Promise<{ client: ClientSummary }> {
    const caller = await this.requireManageCapability(session);

    const name = this.normalizeInputName(input);

    try {
      const client = await this.prisma.client.create({
        data: {
          organizationId: caller.organizationId,
          name,
          createdByAccountId: caller.accountId,
        },
      });
      return { client: this.toSummary(client) };
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        throw new ConflictException({
          error: 'client_name_taken',
          message: CLIENT_MESSAGES.nameDuplicate,
        });
      }
      throw e;
    }
  }

  /**
   * `GET /organizations/:orgId/clients/:clientId`. admin/manager only. 404 if the
   * client is not in the caller's org (identical body for missing vs foreign — IDOR).
   * `user`/`viewer` also get 404 via the capability gate. Members of each project are
   * intentionally not included — the projects list here is a nav aid (spec req 19).
   */
  async getClient(
    session: SessionPayload,
    clientId: string,
  ): Promise<ClientDetailResponse> {
    const caller = await this.requireViewCapability(session);

    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId: caller.organizationId },
    });
    if (!client) {
      throw new NotFoundException({
        error: 'not_found',
        message: CLIENT_MESSAGES.notFound,
      });
    }

    const projects = await this.prisma.project.findMany({
      where: { clientId: client.id, organizationId: caller.organizationId },
      select: { id: true, name: true, status: true },
      orderBy: { name: 'asc' },
    });

    return { client: this.toSummary(client), projects };
  }

  /**
   * `PATCH /organizations/:orgId/clients/:clientId`. admin/manager only. Same name
   * validation and 409 shape as create. 404 if the client is not in the caller's org.
   * A no-op rename (same name after normalisation) is allowed and still bumps
   * `updatedAt` (spec TC-01-INT-16 — documented behaviour).
   */
  async renameClient(
    session: SessionPayload,
    clientId: string,
    input: { name?: unknown },
  ): Promise<{ client: ClientSummary }> {
    const caller = await this.requireManageCapability(session);

    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId: caller.organizationId },
    });
    if (!client) {
      throw new NotFoundException({
        error: 'not_found',
        message: CLIENT_MESSAGES.notFound,
      });
    }

    const name = this.normalizeInputName(input);

    try {
      const updated = await this.prisma.client.update({
        where: { id: client.id },
        data: { name },
      });
      return { client: this.toSummary(updated) };
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        throw new ConflictException({
          error: 'client_name_taken',
          message: CLIENT_MESSAGES.nameDuplicate,
        });
      }
      throw e;
    }
  }

  /**
   * `PATCH /organizations/:orgId/clients/:clientId/archive`. admin/manager only. 404
   * if not in caller's org. **Idempotent** — archiving an already-archived client
   * returns 200 with the current state and does NOT bump `archivedAt` (spec
   * TC-01-INT-18). Existing project.clientId values are preserved — the soft archive
   * never clears the FK (spec requirement 13 / TC-01-INT-19).
   */
  async archiveClient(
    session: SessionPayload,
    clientId: string,
  ): Promise<{ client: ClientSummary }> {
    const caller = await this.requireManageCapability(session);

    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId: caller.organizationId },
    });
    if (!client) {
      throw new NotFoundException({
        error: 'not_found',
        message: CLIENT_MESSAGES.notFound,
      });
    }

    if (client.status === 'archived') {
      // Idempotent — return the current state without touching archivedAt/updatedAt.
      return { client: this.toSummary(client) };
    }

    const updated = await this.prisma.client.update({
      where: { id: client.id },
      data: {
        status: 'archived',
        archivedAt: new Date(),
        archivedByAccountId: caller.accountId,
      },
    });
    return { client: this.toSummary(updated) };
  }

  /**
   * `PATCH /organizations/:orgId/clients/:clientId/restore`. admin/manager only. 404
   * if not in caller's org. Idempotent — restoring an already-active client returns
   * 200 with the current state without touching updatedAt.
   */
  async restoreClient(
    session: SessionPayload,
    clientId: string,
  ): Promise<{ client: ClientSummary }> {
    const caller = await this.requireManageCapability(session);

    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId: caller.organizationId },
    });
    if (!client) {
      throw new NotFoundException({
        error: 'not_found',
        message: CLIENT_MESSAGES.notFound,
      });
    }

    if (client.status === 'active') {
      // Idempotent — no-op.
      return { client: this.toSummary(client) };
    }

    const updated = await this.prisma.client.update({
      where: { id: client.id },
      data: {
        status: 'active',
        archivedAt: null,
        archivedByAccountId: null,
      },
    });
    return { client: this.toSummary(updated) };
  }

  /**
   * Caller's own active membership, resolved from the session — mirrors the
   * `requireCaller` in `ProjectsService`. A row missing/removed/wrong-org is a 403
   * (that path is only reachable by a broken cookie, not by an ordinary caller —
   * `OrgScopeGuard` already 404s a cross-org URL before we get here).
   */
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

  /**
   * `manage-clients` gate. A missing capability collapses to 404 rather than 403 —
   * mirroring `OrgScopeGuard`, so a `user`/`viewer` who should see nothing does see
   * nothing (spec TC-01-INT-03 / TC-01-INT-04). The path is the same URL an
   * admin/manager would call, so a distinctive 403 body would leak the fact that
   * the resource exists.
   *
   * Public, not private, since requests spec 03: the contacts routes on a client decide
   * with the same two gates and must give the same answer, so they call these rather
   * than re-deriving the rule (REQ-03-008).
   */
  async requireManageCapability(session: SessionPayload): Promise<CallerMembership> {
    const caller = await this.requireCaller(session);
    if (!can(caller.role, 'manage-clients')) {
      throw new NotFoundException();
    }
    return caller;
  }

  /** `view-clients` gate — same 404 discipline as `requireManageCapability`. */
  async requireViewCapability(session: SessionPayload): Promise<CallerMembership> {
    const caller = await this.requireCaller(session);
    if (!can(caller.role, 'view-clients')) {
      throw new NotFoundException();
    }
    return caller;
  }

  /** Validates + normalises a submitted name; 422 with the field-error shape on fail. */
  private normalizeInputName(input: { name?: unknown }): string {
    const raw = typeof input?.name === 'string' ? input.name : '';
    const result = validateClientName(raw);
    if (!result.valid) {
      throw new UnprocessableEntityException({
        error: 'validation_error',
        fields: { name: result.error },
      });
    }
    // validateClientName already normalised; be belt-and-braces so a future
    // widening of the validator can't drift the persisted shape.
    return normalizeClientName(result.value);
  }

  private isUniqueViolation(e: unknown): boolean {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
  }

  private toSummary(client: {
    id: string;
    name: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    archivedAt: Date | null;
    archivedByAccountId: string | null;
    createdByAccountId: string;
  }): ClientSummary {
    return {
      id: client.id,
      name: client.name,
      status: client.status,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
      archivedAt: client.archivedAt ? client.archivedAt.toISOString() : null,
      archivedByAccountId: client.archivedByAccountId,
      createdByAccountId: client.createdByAccountId,
    };
  }
}
