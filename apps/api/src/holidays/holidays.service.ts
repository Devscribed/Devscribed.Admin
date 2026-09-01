import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  HOLIDAY_MESSAGES,
  can,
  validateHolidayCountryCode,
  validateHolidayDate,
  validateHolidayName,
  validatePaidHours,
  type Role,
} from '@devscribed/validation';
import { Prisma } from '@prisma/client';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';

interface CallerMembership {
  id: string;
  role: Role;
  organizationId: string;
  accountId: string;
}

/** One row of the holidays list (spec org/03 GET .../holidays 200 contract). */
export interface HolidaySummary {
  id: string;
  /** Always `YYYY-MM-DD` — a `@db.Date` column, never an instant. */
  date: string;
  name: string;
  /** A JSON number, not the Prisma `Decimal`, which would serialize as a string. */
  paidHours: number;
  countryCode: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The submitted body of POST / PATCH. Every field is `unknown` until validated. */
export interface HolidayInput {
  date?: unknown;
  name?: unknown;
  paidHours?: unknown;
  countryCode?: unknown;
}

/** The parsed `GET .../holidays` query string. */
export interface HolidayListQuery {
  year?: unknown;
  country?: unknown;
  scope?: unknown;
}

/**
 * Spec organization/03 — Holidays. Capability checks live here rather than in
 * `CapabilityGuard` because this resource deliberately answers with two different
 * statuses: a caller without `view-holidays` gets **404** (unknown and unauthorized
 * look identical, the `OrgScopeGuard` discipline), while a caller who may see the
 * calendar but not delete from it gets **403** carrying the spec's tabulated wording.
 * The guard can express neither. Every query filters by `session.organizationId`;
 * the path `orgId` is compared by `OrgScopeGuard` and never used as a selector.
 */
@Injectable()
export class HolidaysService {
  private readonly logger = new Logger(HolidaysService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * `GET /organizations/:orgId/holidays`.
   *
   * `scope=mine` is the Time Tracking calendar's read and needs no capability — a
   * `user` and a `viewer` must see the markers on their own calendar. It ignores
   * `country` and resolves the caller's own (requirement 14: `Account.phoneCountryCode`
   * if present, else null), returning rows scoped to that country plus every global
   * row. `scope=all` (the default) requires `view-holidays` and applies `country`,
   * which still includes global rows (TC-03-INT-13).
   */
  async listHolidays(
    session: SessionPayload,
    query: HolidayListQuery,
  ): Promise<{ holidays: HolidaySummary[] }> {
    const scope = query.scope === 'mine' ? 'mine' : 'all';
    // `scope=mine` is open to every authenticated member; anything else is gated.
    const caller =
      scope === 'mine'
        ? await this.requireCaller(session)
        : await this.requireViewCapability(session);

    const year = await this.resolveYear(query.year, caller.accountId);
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));

    let countryFilter: Prisma.HolidayWhereInput = {};
    if (scope === 'mine') {
      const account = await this.prisma.account.findUnique({
        where: { id: caller.accountId },
        select: { phoneCountryCode: true },
      });
      const mine = this.normalizeResolvedCountry(account?.phoneCountryCode);
      countryFilter = mine
        ? { OR: [{ countryCode: mine }, { countryCode: null }] }
        : { countryCode: null };
    } else {
      const country = typeof query.country === 'string' ? query.country : 'all';
      if (country !== 'all' && country.length > 0) {
        // A country filter still shows the global rows — they apply to that country too.
        countryFilter = { OR: [{ countryCode: country }, { countryCode: null }] };
      }
    }

    const rows = await this.prisma.holiday.findMany({
      where: {
        organizationId: caller.organizationId,
        date: { gte: start, lt: end },
        ...countryFilter,
      },
      orderBy: { date: 'asc' },
    });

    return { holidays: rows.map((row) => this.toSummary(row)) };
  }

  /**
   * `POST /organizations/:orgId/holidays`. Requires `manage-holidays` (else 404).
   * `organizationId` comes from the session — a body that carries one is ignored
   * (§Security, IDOR). A P2002 from either uniqueness index becomes the spec's 409.
   */
  async createHoliday(
    session: SessionPayload,
    input: HolidayInput,
  ): Promise<{ holiday: HolidaySummary }> {
    const caller = await this.requireManageCapability(session);
    const parsed = this.parseInput(input, { partial: false });

    try {
      const holiday = await this.prisma.holiday.create({
        data: {
          organizationId: caller.organizationId,
          name: parsed.name!,
          date: parsed.date!,
          paidHours: parsed.paidHours!,
          countryCode: parsed.countryCode ?? null,
          createdByAccountId: caller.accountId,
        },
      });
      this.logMutation('holiday_created', caller, holiday);
      return { holiday: this.toSummary(holiday) };
    } catch (e) {
      throw this.mapDuplicate(e);
    }
  }

  /**
   * `PATCH /organizations/:orgId/holidays/:holidayId`. Requires `manage-holidays`.
   * Every field is optional; only the submitted ones are validated and written. The
   * row is resolved with the session's organization in the `where`, so a holiday in
   * another organization is a 404 rather than an edit (TC-03-INT-19).
   */
  async updateHoliday(
    session: SessionPayload,
    holidayId: string,
    input: HolidayInput,
  ): Promise<{ holiday: HolidaySummary }> {
    const caller = await this.requireManageCapability(session);
    const existing = await this.findInOrg(caller, holidayId);
    const parsed = this.parseInput(input, { partial: true });

    const data: Prisma.HolidayUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.date !== undefined) data.date = parsed.date;
    if (parsed.paidHours !== undefined) data.paidHours = parsed.paidHours;
    if ('countryCode' in parsed) data.countryCode = parsed.countryCode ?? null;

    try {
      const holiday = await this.prisma.holiday.update({
        where: { id: existing.id },
        data,
      });
      this.logMutation('holiday_updated', caller, holiday);
      return { holiday: this.toSummary(holiday) };
    } catch (e) {
      throw this.mapDuplicate(e);
    }
  }

  /**
   * `DELETE /organizations/:orgId/holidays/:holidayId`. Two gates in this order:
   * `view-holidays` first, so a `user` gets the same 404 they get everywhere else on
   * this resource, then `delete-holidays`, so a manager — who can see the calendar —
   * gets a 403 carrying `HOLIDAY_MESSAGES.deleteForbidden` (TC-03-INT-11 /
   * TC-03-E2E-02). Hard delete; there is no archived state.
   */
  async deleteHoliday(session: SessionPayload, holidayId: string): Promise<void> {
    const caller = await this.requireViewCapability(session);
    if (!can(caller.role, 'delete-holidays')) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: HOLIDAY_MESSAGES.deleteForbidden,
      });
    }

    const existing = await this.findInOrg(caller, holidayId);
    await this.prisma.holiday.delete({ where: { id: existing.id } });
    this.logMutation('holiday_deleted', caller, existing);
  }

  /* ---------------------------------------------------------------- *
   * Gates
   * ---------------------------------------------------------------- */

  /**
   * The caller's own active membership, resolved from the session — the
   * `ClientsService.requireCaller` shape. A missing / removed / wrong-org row is a
   * 403 only reachable with a broken cookie; `OrgScopeGuard` has already 404'd a
   * cross-org URL by this point.
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

  /** `view-holidays` gate — 404, never 403 (spec §Security). */
  private async requireViewCapability(session: SessionPayload): Promise<CallerMembership> {
    const caller = await this.requireCaller(session);
    if (!can(caller.role, 'view-holidays')) {
      throw new NotFoundException();
    }
    return caller;
  }

  /** `manage-holidays` gate — same 404 discipline (TC-03-INT-03). */
  private async requireManageCapability(session: SessionPayload): Promise<CallerMembership> {
    const caller = await this.requireCaller(session);
    if (!can(caller.role, 'manage-holidays')) {
      throw new NotFoundException();
    }
    return caller;
  }

  /* ---------------------------------------------------------------- *
   * Helpers
   * ---------------------------------------------------------------- */

  private async findInOrg(caller: CallerMembership, holidayId: string) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id: holidayId, organizationId: caller.organizationId },
    });
    if (!holiday) {
      throw new NotFoundException({
        error: 'not_found',
        message: HOLIDAY_MESSAGES.notFound,
      });
    }
    return holiday;
  }

  /**
   * Re-runs every shared rule server-side (the client's copy is never a gate) and
   * collects the failures into one 422 keyed by field name, so the web layer can put
   * each message under its own `field-error-{field}` node.
   */
  private parseInput(
    input: HolidayInput,
    options: { partial: boolean },
  ): { date?: Date; name?: string; paidHours?: number; countryCode?: string | null } {
    const body = input ?? {};
    const fields: Record<string, string> = {};
    const parsed: {
      date?: Date;
      name?: string;
      paidHours?: number;
      countryCode?: string | null;
    } = {};

    const wants = (key: keyof HolidayInput): boolean =>
      !options.partial || body[key] !== undefined;

    if (wants('date')) {
      const result = validateHolidayDate(body.date);
      if (result.valid) parsed.date = new Date(`${result.value}T00:00:00.000Z`);
      else fields.date = result.error;
    }

    if (wants('name')) {
      const result = validateHolidayName(body.name);
      if (result.valid) parsed.name = result.value;
      else fields.name = result.error;
    }

    if (wants('paidHours')) {
      const result = validatePaidHours(body.paidHours);
      if (result.valid) parsed.paidHours = result.value;
      else fields.paidHours = result.error;
    }

    // `countryCode: null` is a meaningful submission ("all countries"), so the key's
    // presence — not its value — decides whether a PATCH touches the column.
    if (!options.partial || 'countryCode' in body) {
      const result = validateHolidayCountryCode(body.countryCode);
      if (result.valid) parsed.countryCode = result.value;
      else fields.countryCode = result.error;
    }

    if (Object.keys(fields).length > 0) {
      throw new UnprocessableEntityException({ error: 'validation_error', fields });
    }
    return parsed;
  }

  /**
   * Both uniqueness indexes surface as P2002 — the composite one and the hand-written
   * partial one that closes the two-globals-on-one-date case. Either is the spec's
   * duplicate (Validation Rule 9); anything else is a real failure and rethrown.
   */
  private mapDuplicate(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException({
        error: 'holiday_duplicate',
        message: HOLIDAY_MESSAGES.duplicate,
      });
    }
    return e;
  }

  /**
   * The list year: the query parameter when it is a sane 4-digit year, else the
   * current year *in the caller's own timezone* — a member in Auckland on 1 January
   * must not be shown last year's calendar because the server is still on UTC.
   */
  private async resolveYear(input: unknown, accountId: string): Promise<number> {
    const raw = typeof input === 'string' || typeof input === 'number' ? Number(input) : NaN;
    if (Number.isInteger(raw) && raw >= 1970 && raw <= 9999) return raw;

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { timezone: true },
    });
    return this.currentYearIn(account?.timezone ?? null);
  }

  private currentYearIn(timezone: string | null): number {
    if (timezone) {
      try {
        const formatted = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          year: 'numeric',
        }).format(new Date());
        const year = Number(formatted);
        if (Number.isInteger(year)) return year;
      } catch {
        // An account carrying a zone Intl does not know falls back to UTC rather
        // than 500ing on a stale profile value.
      }
    }
    return new Date().getUTCFullYear();
  }

  /**
   * `Account.phoneCountryCode` is validated elsewhere and may hold a legacy or blank
   * value; only a clean alpha-2 resolves a member's country (requirement 14), and
   * anything else means "no country" — global holidays only.
   */
  private normalizeResolvedCountry(value: string | null | undefined): string | null {
    const result = validateHolidayCountryCode(value ?? null);
    return result.valid ? result.value : null;
  }

  private toSummary(row: {
    id: string;
    date: Date;
    name: string;
    paidHours: Prisma.Decimal;
    countryCode: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): HolidaySummary {
    return {
      id: row.id,
      // A `@db.Date` column comes back as UTC midnight; slicing keeps it a calendar
      // day and stops any timezone from shifting it (requirement 6).
      date: row.date.toISOString().slice(0, 10),
      name: row.name,
      paidHours: row.paidHours.toNumber(),
      countryCode: row.countryCode,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** §Logging — every mutation, at info. */
  private logMutation(
    event: string,
    caller: CallerMembership,
    holiday: {
      id: string;
      date: Date;
      name: string;
      paidHours: Prisma.Decimal;
      countryCode: string | null;
    },
  ): void {
    this.logger.log(
      JSON.stringify({
        event,
        actorAccountId: caller.accountId,
        organizationId: caller.organizationId,
        holidayId: holiday.id,
        date: holiday.date.toISOString().slice(0, 10),
        name: holiday.name,
        paidHours: holiday.paidHours.toNumber(),
        countryCode: holiday.countryCode,
      }),
    );
  }
}
