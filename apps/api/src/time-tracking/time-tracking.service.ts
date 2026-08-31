import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TIME_TRACKING_MESSAGES,
  can,
  computeTaskLabel,
  computeTimerStopMinutes,
  localDateInTz,
  validateTimeEntry,
  validateTimeEntryRange,
  validateTimerMeta,
  zonedWallClockToUtc,
  type Role,
} from '@devscribed/validation';
import { Prisma } from '@prisma/client';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';

/**
 * Timezone (spec 12 change): entry `startTime`/`endTime` stay absolute UTC instants in the
 * DB (schema unchanged), but the wall-clock a caller types is interpreted in — and composed
 * from — the caller's `Account.timezone`, falling back to `'UTC'` when it is null/empty.
 * A manual `09:00` typed by a Europe/Berlin (UTC+2) caller is stored as `07:00Z`; a timer
 * stop's calendar `date` is the day of `startedAt` in the caller's tz; the not-in-the-future
 * / 90-days-past check uses the caller's tz "today". When the tz is unset/UTC every
 * conversion is the identity, so the behavior is exactly the previous UTC-wall-clock v1.
 * The shared, tested helpers live in `@devscribed/validation` so the API and web agree
 * byte-for-byte. NOTE: an admin/manager composing an entry for ANOTHER member uses the
 * CREATING caller's tz (the simplest consistent rule).
 */

/** The timer response shape (spec 12 GET/POST/PUT timer contracts + spec 15 task fields). */
export interface TimerShape {
  id: string;
  projectId: string | null;
  projectName: string | null;
  task: string | null;
  /** Spec 15 — id of the linked Task, if any. */
  taskId: string | null;
  /** Spec 15 — display key `{PROJECT_KEY}-{taskNumber}` when a task is linked. */
  taskKey: string | null;
  description: string | null;
  startedAt: string;
}

/** A single time-entry row (spec 12 time-entries contracts). `memberName` only for manage-all callers. */
export interface TimeEntryShape {
  id: string;
  membershipId: string;
  memberName?: string;
  projectId: string | null;
  projectName: string | null;
  task: string | null;
  /** Spec 15 — id of the linked Task, if any. */
  taskId: string | null;
  /** Spec 15 — display key `{PROJECT_KEY}-{taskNumber}` when a task is linked. */
  taskKey: string | null;
  description: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number;
  createdAt: string;
}

export interface TimerMetaBody {
  projectId?: unknown;
  /** Spec 15 — optional link to a Task belonging to the same project. */
  taskId?: unknown;
  task?: unknown;
  description?: unknown;
  /** Present on start bodies — always ignored (spec 12 Security 9 / TC-12-INT-24). */
  startedAt?: unknown;
}

export interface TimeEntryBody {
  membershipId?: unknown;
  projectId?: unknown;
  /** Spec 15 — optional link to a Task belonging to the same project. */
  taskId?: unknown;
  task?: unknown;
  description?: unknown;
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  durationMinutes?: unknown;
}

interface CallerMembership {
  id: string;
  role: Role;
  organizationId: string;
  accountId: string;
  /** The caller's `Account.timezone` (may be null/empty → treated as UTC). */
  timezone: string | null;
}

type ProjectClient = Pick<Prisma.TransactionClient, 'project'> | PrismaService;

/** Prisma tx client with access to task + project + membership (spec 15 task resolution). */
type TaskClient = Prisma.TransactionClient | PrismaService;

/** Result of resolving a `taskId` in a mutation. `task` is the recomputed snapshot label
 * (spec 15 FR-2) that must OVERWRITE any client-supplied `task` text. When `undefined`,
 * the caller did not touch `taskId` on this request and the existing `task` column /
 * label must be preserved. When `null`, the caller explicitly cleared `taskId` (FR-6 —
 * clear the id, but leave the free-text `task` label unchanged). */
interface TaskLinkResolution {
  /** `undefined` → no change; `null` → clear; string → set. */
  taskId: string | null | undefined;
  /** `undefined` → do not overwrite existing task text; string → overwrite with this. */
  taskLabel: string | undefined;
}

/**
 * Spec 12 — Time Tracking (timer + manual entries). Same conventions as `ProjectsService`:
 * the caller's membership + role are resolved from the DB every request (never trusted from
 * the client), capabilities are gated with `can(...)`, and every entry/project/membership
 * lookup is filtered by the caller's `organizationId` so a foreign or nonexistent id is a
 * 404 byte-for-byte identical to "does not exist" (IDOR, spec 12 Security 5–8).
 */
@Injectable()
export class TimeTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  /* ---------------------------------------------------------------- *
   * Timer
   * ---------------------------------------------------------------- */

  /**
   * `GET .../timer`. Returns ONLY the caller's own running timer (spec 12 Privacy 33 — no
   * endpoint exposes another member's timer). Any active member may call; a viewer simply
   * has none. Resolves `projectName` when a project is attached.
   */
  async getTimer(session: SessionPayload): Promise<{ timer: TimerShape | null }> {
    const caller = await this.requireCaller(session);
    const timer = await this.prisma.runningTimer.findUnique({
      where: { membershipId: caller.id },
      include: { project: { select: { name: true, key: true } }, taskRef: { select: { taskNumber: true } } },
    });
    return { timer: timer ? this.toTimerShape(timer) : null };
  }

  /**
   * `POST .../timer/start`. Needs `use-timer` (viewer → 403). Metadata validated; an active
   * project is required when `projectId` is given. `startedAt` is ALWAYS NOW() server-side —
   * any body `startedAt` is ignored (Security 9 / TC-12-INT-24). One-per-member is enforced
   * by the DB unique constraint: a P2002 becomes a 409 (Security 11 / TC-12-INT-02/23).
   */
  async startTimer(session: SessionPayload, body: TimerMetaBody): Promise<TimerShape> {
    const caller = await this.requireTimer(session);
    const meta = this.validateMeta(body);

    try {
      const timer = await this.prisma.$transaction(async (tx) => {
        const projectId = await this.resolveProjectId(tx, caller.organizationId, body.projectId);
        // Spec 15 — resolve/validate taskId inside the same tx to avoid TOCTOU.
        const link = await this.resolveTaskLink(tx, {
          caller,
          projectId,
          rawTaskId: body.taskId,
        });
        return tx.runningTimer.create({
          data: {
            membershipId: caller.id,
            organizationId: caller.organizationId,
            projectId,
            // FR-2: when taskId is linked, the computed label OVERWRITES client `task`.
            task: link.taskLabel !== undefined ? link.taskLabel : meta.task,
            taskId: link.taskId === undefined ? null : link.taskId,
            description: meta.description,
            // Server clock only — the client cannot forge the start instant.
            startedAt: new Date(),
          },
          include: {
            project: { select: { name: true, key: true } },
            taskRef: { select: { taskNumber: true } },
          },
        });
      });
      return this.toTimerShape(timer);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw this.conflict('timer_already_running', TIME_TRACKING_MESSAGES.timerAlreadyRunning);
      }
      throw e;
    }
  }

  /**
   * `PUT .../timer`. Updates the caller's running timer metadata; `startedAt` is untouched.
   * 404 `no_timer` if none is running. Validates metadata + active project.
   */
  async updateTimer(session: SessionPayload, body: TimerMetaBody): Promise<TimerShape> {
    const caller = await this.requireCaller(session);
    const meta = this.validateMeta(body);

    const timer = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.runningTimer.findUnique({ where: { membershipId: caller.id } });
      if (!existing) {
        throw this.noTimer();
      }
      const projectId = await this.resolveProjectId(tx, caller.organizationId, body.projectId);
      const link = await this.resolveTaskLink(tx, {
        caller,
        projectId,
        rawTaskId: body.taskId,
      });
      // Spec 15 FR-2: setting taskId overwrites `task` with the computed label (client
      // `task` is discarded). Spec 15 FR-6: an explicit `taskId: null` clears the link
      // but MUST leave `task` free-text unchanged — so we do not write task in that case
      // unless the client also sent a `task` value on the same request.
      const data: Prisma.RunningTimerUpdateInput = {
        project: projectId
          ? { connect: { id: projectId } }
          : { disconnect: true },
        description: meta.description,
      };
      if (link.taskLabel !== undefined) {
        data.task = link.taskLabel;
      } else if (typeof body.task === 'string') {
        // Caller supplied a task value explicitly (no taskId link) — accept it.
        data.task = meta.task;
      }
      if (link.taskId !== undefined) {
        data.taskRef = link.taskId === null ? { disconnect: true } : { connect: { id: link.taskId } };
      }
      return tx.runningTimer.update({
        where: { membershipId: caller.id },
        data,
        include: {
          project: { select: { name: true, key: true } },
          taskRef: { select: { taskNumber: true } },
        },
      });
    });
    return this.toTimerShape(timer);
  }

  /**
   * `POST .../timer/stop`. 404 `no_timer` if none. In a transaction: compute the duration
   * server-side (`computeTimerStopMinutes`, min 1), create the TimeEntry (UTC rules), and
   * delete the RunningTimer. Any request body is ignored (Security 10 / TC-12-INT-27).
   */
  async stopTimer(session: SessionPayload): Promise<{ timeEntry: TimeEntryShape }> {
    const caller = await this.requireCaller(session);

    const timeEntry = await this.prisma.$transaction(async (tx) => {
      const timer = await tx.runningTimer.findUnique({ where: { membershipId: caller.id } });
      if (!timer) {
        throw this.noTimer();
      }

      const now = new Date();
      const durationMinutes = computeTimerStopMinutes(now.getTime() - timer.startedAt.getTime());
      // The entry's calendar date is the date of `startedAt` in the caller's tz (FR-15 — a
      // timer that spans midnight is assigned to the day it started, full duration, no split).
      // startTime/endTime stay the absolute instants (`startedAt`/`now`).
      const dateStr = localDateInTz(timer.startedAt.toISOString(), this.tzOf(caller));

      // Spec 15 FR-9: RE-COMPUTE the task label snapshot at stop time from the CURRENT
      // task row, in case the task's title changed while the timer was running
      // (TC-15-INT-10). If the task was deleted mid-run, taskRef is null (SetNull) and
      // we fall back to the timer's frozen `task` label.
      let entryTask = timer.task;
      let entryTaskId: string | null = timer.taskId;
      if (entryTaskId) {
        const task = await tx.task.findUnique({
          where: { id: entryTaskId },
          include: { project: { select: { key: true } } },
        });
        if (task && task.project.key) {
          entryTask = computeTaskLabel({
            projectKey: task.project.key,
            taskNumber: task.taskNumber,
            title: task.title,
          });
        } else {
          // Task was deleted between start and stop — treat as unlinked (FR-8).
          entryTaskId = null;
        }
      }

      const entry = await tx.timeEntry.create({
        data: {
          membershipId: caller.id,
          organizationId: caller.organizationId,
          projectId: timer.projectId,
          taskId: entryTaskId,
          task: entryTask,
          description: timer.description,
          date: this.dateOnly(dateStr),
          startTime: timer.startedAt,
          endTime: now,
          durationMinutes,
          createdByAccountId: caller.accountId,
        },
        include: {
          project: { select: { name: true, key: true } },
          taskRef: { select: { taskNumber: true } },
        },
      });

      await tx.runningTimer.delete({ where: { membershipId: caller.id } });
      return entry;
    });

    return { timeEntry: this.toEntryShape(timeEntry, null) };
  }

  /**
   * `DELETE .../timer`. Discards the running timer without creating an entry. Needs
   * `use-timer`. Idempotent — 200 even when no timer is running (TC-12-INT-05).
   */
  async discardTimer(session: SessionPayload): Promise<{ success: true }> {
    const caller = await this.requireTimer(session);
    await this.prisma.runningTimer.deleteMany({ where: { membershipId: caller.id } });
    return { success: true };
  }

  /* ---------------------------------------------------------------- *
   * Time entries
   * ---------------------------------------------------------------- */

  /**
   * `GET .../time-entries?from&to&membershipId`. Needs `view-time-tracking` (viewer → 403).
   * Range validated (missing/invalid/too-large → the spec's error bodies). `membershipId`:
   * a `user` caller's param is SILENTLY ignored (always own — no 403, no info leak,
   * Security 8 / TC-12-INT-25); an admin/manager honors it, but a removed/foreign target
   * yields the same empty shape as a zero-entry member (Privacy 34 / TC-12-INT-22 step 1).
   * `memberName` is included only for `manage-all` callers (Privacy 35).
   */
  async listEntries(
    session: SessionPayload,
    query: { from?: string; to?: string; membershipId?: string },
  ): Promise<{ entries: TimeEntryShape[]; totalMinutes: number }> {
    const caller = await this.requireCaller(session);
    if (!can(caller.role, 'view-time-tracking')) {
      throw this.forbidden(TIME_TRACKING_MESSAGES.viewForbidden);
    }

    const range = validateTimeEntryRange(query.from, query.to);
    if (!range.valid) {
      throw new BadRequestException(
        range.errors ? { errors: range.errors } : { error: range.error, message: range.message },
      );
    }

    const manageAll = can(caller.role, 'manage-all-time-entries');
    const empty = { entries: [] as TimeEntryShape[], totalMinutes: 0 };

    // Resolve which membership's entries to read.
    let targetMembershipId = caller.id;
    if (manageAll && typeof query.membershipId === 'string' && query.membershipId.length > 0) {
      const target = await this.prisma.membership.findFirst({
        where: { id: query.membershipId, organizationId: caller.organizationId, status: 'active' },
        select: { id: true },
      });
      // A removed/foreign target is indistinguishable from a valid member with zero entries.
      if (!target) return empty;
      targetMembershipId = target.id;
    }
    // For a `user` caller the param is never read — targetMembershipId stays `caller.id`.

    let memberName: string | undefined;
    if (manageAll) {
      const target = await this.prisma.membership.findUnique({
        where: { id: targetMembershipId },
        include: { account: { select: { firstName: true, lastName: true } } },
      });
      if (target) memberName = `${target.account.firstName} ${target.account.lastName}`;
    }

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        organizationId: caller.organizationId,
        membershipId: targetMembershipId,
        date: { gte: this.dateOnly(query.from as string), lte: this.dateOnly(query.to as string) },
      },
      include: {
        project: { select: { name: true, key: true } },
        taskRef: { select: { taskNumber: true } },
      },
      // date asc, then startTime asc with duration-only (null) entries last within a day.
      orderBy: [{ date: 'asc' }, { startTime: { sort: 'asc', nulls: 'last' } }],
    });

    const shaped = entries.map((e) => this.toEntryShape(e, memberName ?? null));
    const totalMinutes = shaped.reduce((sum, e) => sum + e.durationMinutes, 0);
    return { entries: shaped, totalMinutes };
  }

  /**
   * `POST .../time-entries`. Needs `manage-own-time-entries` (viewer → 403). A body
   * `membershipId` naming ANOTHER member requires `manage-all` (else 403 — TC-12-INT-20) and
   * the target must be an active org member (else 404, Security 6). `createdByAccountId` is
   * the session account, never the body (Security 24). Active-project rule enforced.
   */
  async createEntry(session: SessionPayload, body: TimeEntryBody): Promise<TimeEntryShape> {
    const caller = await this.requireCaller(session);
    if (!can(caller.role, 'manage-own-time-entries')) {
      throw this.forbidden(TIME_TRACKING_MESSAGES.viewForbidden);
    }

    const targetMembershipId = await this.resolveTargetMembership(caller, body.membershipId);

    const tz = this.tzOf(caller);
    const result = validateTimeEntry(this.toEntryInput(body), { today: this.today(tz) });
    if (!result.valid) {
      throw new BadRequestException({ errors: result.errors });
    }
    const value = result.value;

    const entry = await this.prisma.$transaction(async (tx) => {
      const project = await this.resolveActiveProject(tx, caller.organizationId, body.projectId);
      const link = await this.resolveTaskLink(tx, {
        caller,
        projectId: project?.id ?? null,
        rawTaskId: body.taskId,
      });
      // Spec 15 FR-2: computed label OVERWRITES client `task` text when taskId is set.
      const finalTask = link.taskLabel !== undefined ? link.taskLabel : value.task;
      return tx.timeEntry.create({
        data: {
          membershipId: targetMembershipId,
          organizationId: caller.organizationId,
          projectId: project?.id ?? null,
          taskId: link.taskId === undefined ? null : link.taskId,
          task: finalTask,
          description: value.description,
          date: this.dateOnly(value.date),
          startTime: value.startTime ? this.composeUtc(value.date, value.startTime, tz) : null,
          endTime: value.endTime ? this.composeUtc(value.date, value.endTime, tz) : null,
          durationMinutes: value.durationMinutes,
          createdByAccountId: caller.accountId,
        },
        include: {
          project: { select: { name: true, key: true } },
          taskRef: { select: { taskNumber: true } },
        },
      });
    });
    return this.toEntryShape(entry, null);
  }

  /**
   * `PUT .../time-entries/:id`. Org-scope first (foreign/nonexistent → 404, TC-12-INT-22),
   * THEN ownership: an entry not owned by the caller, without `manage-all`, → 403 (Security 7
   * / TC-12-INT-12). `membershipId` cannot be reassigned. FR-7 exception: an entry already
   * on an archived project may keep it if `projectId` is unchanged — only a SWITCH to an
   * archived/invalid project is rejected.
   */
  async updateEntry(
    session: SessionPayload,
    entryId: string,
    body: TimeEntryBody,
  ): Promise<TimeEntryShape> {
    const caller = await this.requireCaller(session);

    // Org-scope: a foreign or nonexistent id is a 404 before any ownership signal leaks.
    const existing = await this.prisma.timeEntry.findFirst({
      where: { id: entryId, organizationId: caller.organizationId },
    });
    if (!existing) throw new NotFoundException();

    if (existing.membershipId !== caller.id && !can(caller.role, 'manage-all-time-entries')) {
      throw this.forbidden(TIME_TRACKING_MESSAGES.forbiddenEdit, 'forbidden');
    }

    const tz = this.tzOf(caller);
    const result = validateTimeEntry(this.toEntryInput(body), { today: this.today(tz) });
    if (!result.valid) {
      throw new BadRequestException({ errors: result.errors });
    }
    const value = result.value;

    const entry = await this.prisma.$transaction(async (tx) => {
      const projectId = await this.resolveEntryProjectId(tx, caller.organizationId, existing.projectId, body.projectId);
      const link = await this.resolveTaskLink(tx, {
        caller,
        projectId,
        rawTaskId: body.taskId,
      });
      // Spec 15 FR-2: computed label OVERWRITES client `task` text when taskId is set.
      // FR-6: taskId: null (explicit) leaves `task` free-text alone — so when the caller
      // did not send a `task` field either, we do not overwrite it.
      const data: Prisma.TimeEntryUpdateInput = {
        project: projectId
          ? { connect: { id: projectId } }
          : { disconnect: true },
        description: value.description,
        date: this.dateOnly(value.date),
        startTime: value.startTime ? this.composeUtc(value.date, value.startTime, tz) : null,
        endTime: value.endTime ? this.composeUtc(value.date, value.endTime, tz) : null,
        durationMinutes: value.durationMinutes,
      };
      if (link.taskLabel !== undefined) {
        data.task = link.taskLabel;
      } else if (typeof body.task === 'string') {
        data.task = value.task;
      }
      if (link.taskId !== undefined) {
        data.taskRef = link.taskId === null ? { disconnect: true } : { connect: { id: link.taskId } };
      }
      return tx.timeEntry.update({
        where: { id: existing.id },
        data,
        include: {
          project: { select: { name: true, key: true } },
          taskRef: { select: { taskNumber: true } },
        },
      });
    });
    return this.toEntryShape(entry, null);
  }

  /**
   * `DELETE .../time-entries/:id`. Same org-scope-then-ownership as PUT (404 cross-org
   * TC-12-INT-22, 403 for a user deleting another's TC-12-INT-14). Hard delete (FR-28).
   */
  async deleteEntry(session: SessionPayload, entryId: string): Promise<{ success: true }> {
    const caller = await this.requireCaller(session);

    const existing = await this.prisma.timeEntry.findFirst({
      where: { id: entryId, organizationId: caller.organizationId },
    });
    if (!existing) throw new NotFoundException();

    if (existing.membershipId !== caller.id && !can(caller.role, 'manage-all-time-entries')) {
      throw this.forbidden(TIME_TRACKING_MESSAGES.forbiddenDelete, 'forbidden');
    }

    await this.prisma.timeEntry.delete({ where: { id: existing.id } });
    return { success: true };
  }

  /* ---------------------------------------------------------------- *
   * Helpers
   * ---------------------------------------------------------------- */

  /** Resolve who a create writes for: omitted/self → caller; another member needs manage-all. */
  private async resolveTargetMembership(
    caller: CallerMembership,
    rawMembershipId: unknown,
  ): Promise<string> {
    if (typeof rawMembershipId !== 'string' || rawMembershipId.length === 0 || rawMembershipId === caller.id) {
      return caller.id;
    }
    if (!can(caller.role, 'manage-all-time-entries')) {
      throw this.forbidden(TIME_TRACKING_MESSAGES.viewForbidden);
    }
    const target = await this.prisma.membership.findFirst({
      where: { id: rawMembershipId, organizationId: caller.organizationId, status: 'active' },
      select: { id: true },
    });
    if (!target) throw new NotFoundException();
    return target.id;
  }

  /**
   * Spec 15 — resolve and validate `taskId` on a create/update body. Runs inside the
   * caller's mutation transaction to close the TOCTOU window for the `user`-role
   * project-membership check (FR-7 / spec 15 Security §Cross-Project Protection).
   *
   * Contract:
   *   - `taskId === undefined` (omitted from body): returns `{ taskId: undefined,
   *     taskLabel: undefined }` — the caller leaves the existing DB link + `task`
   *     column untouched.
   *   - `taskId === null` (explicit clear): returns `{ taskId: null, taskLabel:
   *     undefined }` — clear the FK, but do NOT overwrite the free-text `task`
   *     snapshot (FR-6 / TC-15-INT-12, TC-15-INT-17).
   *   - `taskId` is a string: returns `{ taskId, taskLabel: "<computed>" }` where the
   *     label is `computeTaskLabel({...})` — this label OVERWRITES the client's `task`
   *     text (FR-2 / TC-15-INT-08).
   *
   * Errors:
   *   - 400 `task_requires_project` when taskId is set but projectId is null.
   *   - 400 `task_not_found` when the task is missing or belongs to another org
   *     (spec 15 §Security — never leak existence, so cross-org = 400 not 404).
   *   - 400 `task_wrong_project` when the task belongs to a different project than
   *     the request's projectId.
   *   - 403 `task_project_not_assigned` when a `user` caller tries to link a task in
   *     a project they are not a `ProjectMember` of (admin/manager bypass).
   */
  private async resolveTaskLink(
    tx: TaskClient,
    args: {
      caller: CallerMembership;
      projectId: string | null;
      rawTaskId: unknown;
    },
  ): Promise<TaskLinkResolution> {
    const raw = args.rawTaskId;
    if (raw === undefined) {
      return { taskId: undefined, taskLabel: undefined };
    }
    if (raw === null || raw === '') {
      // Explicit clear — leave `task` text alone (FR-6).
      return { taskId: null, taskLabel: undefined };
    }
    if (typeof raw !== 'string') {
      throw new BadRequestException({
        error: 'task_not_found',
        message: TIME_TRACKING_MESSAGES.taskLinkNotFound,
      });
    }
    if (!args.projectId) {
      throw new BadRequestException({
        error: 'task_requires_project',
        message: TIME_TRACKING_MESSAGES.taskRequiresProject,
      });
    }

    // Scope by caller's org via the task's project (spec 15 Security — a task from
    // another org is 400 `task_not_found`, byte-for-byte identical to "does not exist").
    const task = await (tx as PrismaService).task.findFirst({
      where: { id: raw, project: { organizationId: args.caller.organizationId } },
      include: { project: { select: { id: true, key: true } } },
    });
    if (!task) {
      throw new BadRequestException({
        error: 'task_not_found',
        message: TIME_TRACKING_MESSAGES.taskLinkNotFound,
      });
    }
    if (task.projectId !== args.projectId) {
      throw new BadRequestException({
        error: 'task_wrong_project',
        message: TIME_TRACKING_MESSAGES.taskWrongProject,
      });
    }
    // `user` role: must be a ProjectMember of the task's project — admin/manager bypass
    // (same pattern as spec 12 FR-8 / spec 13 board access, spec 15 FR-7).
    if (args.caller.role === 'user') {
      const assignment = await (tx as PrismaService).projectMember.findUnique({
        where: {
          projectId_membershipId: { projectId: task.projectId, membershipId: args.caller.id },
        },
      });
      if (!assignment) {
        throw new ForbiddenException({
          error: 'task_project_not_assigned',
          message: TIME_TRACKING_MESSAGES.taskProjectNotAssigned,
        });
      }
    }
    // project.key can be null for keyless projects — the task selector never shows them
    // (spec 15 FR-15), but a direct API call could still try. Fall back to computing a
    // label without the key prefix would break FR-2's `{KEY}-{N}: {title}` shape, so we
    // require the key.
    if (!task.project.key) {
      throw new BadRequestException({
        error: 'task_not_found',
        message: TIME_TRACKING_MESSAGES.taskLinkNotFound,
      });
    }
    const label = computeTaskLabel({
      projectKey: task.project.key,
      taskNumber: task.taskNumber,
      title: task.title,
    });
    return { taskId: task.id, taskLabel: label };
  }

  /** Validate timer metadata (task/description); 400 `{errors}` on failure. */
  private validateMeta(body: TimerMetaBody): { task: string | null; description: string | null } {
    const result = validateTimerMeta({
      task: typeof body.task === 'string' ? body.task : null,
      description: typeof body.description === 'string' ? body.description : null,
    });
    if (!result.valid) {
      throw new BadRequestException({ errors: result.errors });
    }
    return result.value;
  }

  /**
   * Timer/create projectId resolution: null/omitted → null; a given id must be an ACTIVE
   * project in the caller's org, else 400 `invalid_project` (TC-12-INT-21/31). Returns the id.
   */
  private async resolveProjectId(
    client: ProjectClient,
    organizationId: string,
    rawProjectId: unknown,
  ): Promise<string | null> {
    const project = await this.resolveActiveProject(client, organizationId, rawProjectId);
    return project?.id ?? null;
  }

  /** As `resolveProjectId` but returns the project row (id + name) or null. */
  private async resolveActiveProject(
    client: ProjectClient,
    organizationId: string,
    rawProjectId: unknown,
  ): Promise<{ id: string; name: string } | null> {
    if (rawProjectId === null || rawProjectId === undefined || rawProjectId === '') {
      return null;
    }
    if (typeof rawProjectId !== 'string') {
      throw this.invalidProject();
    }
    const project = await client.project.findFirst({
      where: { id: rawProjectId, organizationId, status: 'active' },
      select: { id: true, name: true },
    });
    if (!project) throw this.invalidProject();
    return project;
  }

  /**
   * PUT projectId resolution honoring FR-7: `undefined` (omitted) keeps the current project;
   * an unchanged id is preserved even if the project is now archived; any other id must be an
   * active org project (else 400). `null`/'' clears the project.
   */
  private async resolveEntryProjectId(
    client: ProjectClient,
    organizationId: string,
    currentProjectId: string | null,
    rawProjectId: unknown,
  ): Promise<string | null> {
    // Omitted → unchanged (keep the existing reference, archived or not).
    if (rawProjectId === undefined) return currentProjectId;
    // Explicit clear.
    if (rawProjectId === null || rawProjectId === '') return null;
    if (typeof rawProjectId !== 'string') throw this.invalidProject();
    // Unchanged reference is always allowed (FR-7: archived project preserved when not switched).
    if (rawProjectId === currentProjectId) return currentProjectId;
    // A genuine switch must target an active project.
    const project = await this.resolveActiveProject(client, organizationId, rawProjectId);
    return project?.id ?? null;
  }

  private toEntryInput(body: TimeEntryBody): {
    date: string | null;
    startTime: string | null;
    endTime: string | null;
    durationMinutes: number | string | null;
    task: string | null;
    description: string | null;
  } {
    return {
      date: typeof body.date === 'string' ? body.date : null,
      startTime: typeof body.startTime === 'string' ? body.startTime : null,
      endTime: typeof body.endTime === 'string' ? body.endTime : null,
      durationMinutes:
        typeof body.durationMinutes === 'number' || typeof body.durationMinutes === 'string'
          ? body.durationMinutes
          : null,
      task: typeof body.task === 'string' ? body.task : null,
      description: typeof body.description === 'string' ? body.description : null,
    };
  }

  /** The caller's effective timezone — their `Account.timezone`, or `'UTC'` when null/empty. */
  private tzOf(caller: CallerMembership): string {
    const tz = caller.timezone;
    return typeof tz === 'string' && tz.trim().length > 0 ? tz : 'UTC';
  }

  /** Current 'YYYY-MM-DD' in `tz` — the `today` reference for the backdating rules. */
  private today(tz: string): string {
    return localDateInTz(new Date().toISOString(), tz);
  }

  /** 'YYYY-MM-DD' → UTC-midnight Date for a `@db.Date` column. */
  private dateOnly(dateStr: string): Date {
    return new Date(`${dateStr}T00:00:00.000Z`);
  }

  /**
   * Compose a stored UTC instant from a `date` + `HH:MM` interpreted as wall-clock in `tz`
   * (Berlin `09:00` → `07:00Z`). An unset/`UTC` tz is the identity, matching the previous v1.
   */
  private composeUtc(dateStr: string, hhmm: string, tz: string): Date {
    return zonedWallClockToUtc(dateStr, hhmm, tz);
  }

  private toTimerShape(timer: {
    id: string;
    projectId: string | null;
    task: string | null;
    taskId: string | null;
    description: string | null;
    startedAt: Date;
    project?: { name: string; key: string | null } | null;
    taskRef?: { taskNumber: number } | null;
  }): TimerShape {
    return {
      id: timer.id,
      projectId: timer.projectId,
      projectName: timer.project?.name ?? null,
      task: timer.task,
      taskId: timer.taskId,
      taskKey:
        timer.taskId && timer.project?.key && timer.taskRef
          ? `${timer.project.key}-${timer.taskRef.taskNumber}`
          : null,
      description: timer.description,
      startedAt: timer.startedAt.toISOString(),
    };
  }

  private toEntryShape(
    entry: {
      id: string;
      membershipId: string;
      projectId: string | null;
      task: string | null;
      taskId: string | null;
      description: string | null;
      date: Date;
      startTime: Date | null;
      endTime: Date | null;
      durationMinutes: number;
      createdAt: Date;
      project?: { name: string; key: string | null } | null;
      taskRef?: { taskNumber: number } | null;
    },
    memberName: string | null,
  ): TimeEntryShape {
    const shape: TimeEntryShape = {
      id: entry.id,
      membershipId: entry.membershipId,
      projectId: entry.projectId,
      projectName: entry.project?.name ?? null,
      task: entry.task,
      taskId: entry.taskId,
      taskKey:
        entry.taskId && entry.project?.key && entry.taskRef
          ? `${entry.project.key}-${entry.taskRef.taskNumber}`
          : null,
      description: entry.description,
      date: entry.date.toISOString().slice(0, 10),
      startTime: entry.startTime ? entry.startTime.toISOString() : null,
      endTime: entry.endTime ? entry.endTime.toISOString() : null,
      durationMinutes: entry.durationMinutes,
      createdAt: entry.createdAt.toISOString(),
    };
    if (memberName !== null) shape.memberName = memberName;
    return shape;
  }

  private invalidProject(): BadRequestException {
    return new BadRequestException({
      error: 'invalid_project',
      message: TIME_TRACKING_MESSAGES.projectInvalid,
    });
  }

  private noTimer(): NotFoundException {
    return new NotFoundException({ error: 'no_timer', message: TIME_TRACKING_MESSAGES.timerNotRunning });
  }

  private conflict(error: string, message: string): ConflictException {
    return new ConflictException({ error, message });
  }

  private forbidden(message: string, error = 'forbidden'): ForbiddenException {
    return new ForbiddenException({ error, message });
  }

  /** Caller's own active membership, resolved from the session — mirrors `ProjectsService`. */
  private async requireCaller(session: SessionPayload): Promise<CallerMembership> {
    const caller = await this.prisma.membership.findUnique({
      where: { accountId: session.accountId },
      include: { account: { select: { timezone: true } } },
    });
    if (!caller || caller.status !== 'active' || caller.organizationId !== session.organizationId) {
      throw new ForbiddenException();
    }
    return {
      id: caller.id,
      role: caller.role as Role,
      organizationId: caller.organizationId,
      accountId: caller.accountId,
      timezone: caller.account.timezone,
    };
  }

  /** Caller who additionally holds `use-timer` (admin/manager/user) — viewer → 403. */
  private async requireTimer(session: SessionPayload): Promise<CallerMembership> {
    const caller = await this.requireCaller(session);
    if (!can(caller.role, 'use-timer')) {
      throw this.forbidden(TIME_TRACKING_MESSAGES.viewForbidden);
    }
    return caller;
  }
}
