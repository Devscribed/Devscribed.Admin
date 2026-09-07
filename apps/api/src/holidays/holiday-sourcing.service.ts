import { ForbiddenException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  HOLIDAY_IMPORT_PAID_HOURS,
  HOLIDAY_SOURCE_IMPORTED,
  buildSourcedCountrySet,
  can,
  holidayExternalKey,
  normalizeRole,
  validateRefreshFlag,
  validateSyncYear,
  type AcceptedProviderEntry,
  type HolidaySourcingState,
} from '@devscribed/validation';
import { Prisma } from '@prisma/client';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import { HolidayProvider } from './provider/holiday-provider';

/** The caller, resolved from the session and never from the path. */
interface CallerMembership {
  role: string;
  organizationId: string;
  accountId: string;
}

/** One country of the `sourcing` block on `GET .../holidays` (§`GET .../holidays`). */
export interface SourcingCountry {
  countryCode: string;
  state: HolidaySourcingState;
  holidayCount: number;
  lastImportedAt: string | null;
}

export interface SourcingBlock {
  year: number;
  countries: SourcingCountry[];
}

/** One country of the sync response — the three outcomes of the entry decision table. */
export interface SyncCountryResult {
  countryCode: string;
  state: HolidaySourcingState;
  written: number;
  skipped: number;
  discarded: number;
}

export interface SyncResult {
  year: number;
  countries: SyncCountryResult[];
}

/** The submitted body of `POST .../holidays/sync`. Every field is `unknown` until validated. */
export interface SyncInput {
  year?: unknown;
  refresh?: unknown;
}

/**
 * Time off spec 02 — the sourced country set, the sync, and the import writer.
 *
 * Capability checks live here rather than in `CapabilityGuard` because every refusal on
 * this resource is a **404** (REQ-02-019, REQ-02-020) and the guard answers 403. Every
 * query and every write scopes by `session.organizationId`; the path `orgId` is compared
 * by `OrgScopeGuard` and is never a selector.
 *
 * **No lock is taken, deliberately.** The two uniqueness indexes on `Holiday` and the one
 * on `HolidayImport` are the arbiter: two admins syncing one unsourced year at the same
 * instant (Edge case 12) is resolved by letting the second writer's inserts collide and
 * counting them as skipped, exactly as if the pre-read had found the row. The shipped
 * holiday writers take no lock either, so there is nothing to serialise against.
 */
@Injectable()
export class HolidaySourcingService {
  private readonly logger = new Logger(HolidaySourcingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: HolidayProvider,
  ) {}

  /**
   * REQ-02-001 — every active member's stated holiday country.
   *
   * PATCH-012 — and nothing else. The organization's own country, and the stored
   * checkbox that used to add it, are both gone: holidays are sourced for the countries
   * the people in the organization are in.
   */
  async sourcedCountrySet(organizationId: string): Promise<string[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId, status: 'active' },
      select: { countryCode: true },
      // Order-stable: the set is rendered as a list of countries, and a set whose
      // order changed between two reads would repaint the summary for no reason.
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    });

    return buildSourcedCountrySet({
      memberCountries: memberships.map((m) => m.countryCode),
    });
  }

  /**
   * The `sourcing` block of `GET .../holidays` — the sourced country set for one year,
   * each country carrying the state of its import record. A country with no record
   * appears as `unsourced`, which is what REQ-02-012 reads to decide whether to sync.
   */
  async sourcingBlock(organizationId: string, year: number): Promise<SourcingBlock> {
    const countries = await this.sourcedCountrySet(organizationId);
    const imports = await this.prisma.holidayImport.findMany({
      where: { organizationId, year, countryCode: { in: countries } },
    });
    const byCountry = new Map(imports.map((row) => [row.countryCode, row]));

    return {
      year,
      countries: countries.map((countryCode) => {
        const record = byCountry.get(countryCode);
        return {
          countryCode,
          state: stateOf(record?.holidayCount),
          holidayCount: record?.holidayCount ?? 0,
          lastImportedAt: record?.importedAt.toISOString() ?? null,
        };
      }),
    };
  }

  /**
   * `POST /organizations/:orgId/holidays/sync`. Requires `manage-holidays` (else 404).
   *
   * Always `200` (REQ-02-009): a provider that errors, answers unparseably or does not
   * answer within the call bound leaves its country `unsourced` and every other country
   * written. A failure is never a status, because the screen it is drawn on is working.
   */
  async sync(session: SessionPayload, input: SyncInput): Promise<SyncResult> {
    const caller = await this.requireCapability(session, 'manage-holidays');
    const body = input ?? {};

    const year = validateSyncYear(body.year);
    if (!year.valid) {
      throw new UnprocessableEntityException({
        error: 'validation_error',
        fields: { year: year.error },
      });
    }

    // Validation Rule 3 carries no message, so a value that is neither absent nor a
    // boolean cannot be refused with one. It is logged and read as "no refresh": a
    // refresh re-asks a third party, replaces every row a previous import wrote and
    // brings back rows an admin deleted on purpose.
    const flag = validateRefreshFlag(body.refresh);
    if (!flag.valid) {
      this.logger.warn(
        JSON.stringify({
          event: 'holiday_sync_refresh_unreadable',
          organizationId: caller.organizationId,
          actorAccountId: caller.accountId,
        }),
      );
    }
    const refresh = flag.valid ? flag.value : false;

    const countries = await this.sourcedCountrySet(caller.organizationId);
    const existing = await this.prisma.holidayImport.findMany({
      where: { organizationId: caller.organizationId, year: year.value, countryCode: { in: countries } },
    });
    const recorded = new Map(existing.map((row) => [row.countryCode, row]));

    const results: SyncCountryResult[] = [];
    for (const countryCode of countries) {
      const record = recorded.get(countryCode);

      // REQ-02-007 — a recorded country and year is never fetched again on its own. No
      // call is made at all, which is what makes an admin's edits and deletions
      // permanent, and what makes invariant 5's "zero once all are recorded" true.
      if (record && !refresh) {
        results.push({
          countryCode,
          state: stateOf(record.holidayCount),
          written: 0,
          skipped: 0,
          discarded: 0,
        });
        continue;
      }

      const answer = await this.callProvider(countryCode, year.value);
      if (answer === null) {
        // REQ-02-009 — no import record, no holiday, the country reported unsourced.
        // Under a refresh the existing record stands: it is not deleted and not aged.
        // Neither are the rows: the clearance below happens only once an answer is in
        // hand, so a provider that failed never empties a year it cannot refill.
        results.push({ countryCode, state: 'unsourced', written: 0, skipped: 0, discarded: 0 });
        continue;
      }

      // PATCH-013 — a refresh REPLACES what a previous import left. Without this a row
      // whose date or name moved upstream stayed on the screen for good, because the
      // stale row itself occupied the date the corrected one wanted.
      if (refresh) await this.clearImported(caller.organizationId, countryCode, year.value);

      const { written, skipped } = await this.writeEntries(
        caller,
        countryCode,
        year.value,
        answer.entries,
      );
      // REQ-02-021 — what the provider OFFERED once REQ-02-005 discarded the regional
      // entries, not what this import wrote. A refresh of a fully-stored country
      // therefore records the offered count and stays `sourced` rather than being
      // mistaken for an empty country (REQ-02-023, Edge case 10).
      const offered = written + skipped;
      await this.recordImport(caller.organizationId, countryCode, year.value, offered);

      results.push({
        countryCode,
        state: stateOf(offered),
        written,
        skipped,
        discarded: answer.discarded,
      });
    }

    this.logger.log(
      JSON.stringify({
        event: 'holiday_sync_completed',
        actorAccountId: caller.accountId,
        organizationId: caller.organizationId,
        year: year.value,
        refresh,
        countries: results.map((r) => ({ countryCode: r.countryCode, state: r.state, written: r.written })),
      }),
    );

    return { year: year.value, countries: results };
  }

  /* ---------------------------------------------------------------- *
   * The provider call
   * ---------------------------------------------------------------- */

  /**
   * REQ-02-011 — every provider call is raced against the configured call bound **here**,
   * in the service, rather than inside a driver. A driver-side deadline bounds only a
   * driver that makes an HTTP request, and the guarantee this rule makes is that the
   * request comes back.
   *
   * `null` is REQ-02-009's answer for all three failures — an error, an unparseable body,
   * and a call that never answered — because no rule distinguishes them and a caller that
   * could tell them apart would grow a behaviour no requirement states.
   */
  private async callProvider(
    countryCode: string,
    year: number,
  ): Promise<{ entries: AcceptedProviderEntry[]; discarded: number } | null> {
    const bound = this.provider.callBoundMs;
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), bound);
      if (typeof timer.unref === 'function') timer.unref();
    });

    try {
      // The rejection is caught on the call's own promise, so a driver that fails AFTER
      // the deadline resolves does not surface as an unhandled rejection.
      const call = this.provider
        .holidays(countryCode, year)
        .then((value) => ({ ok: true as const, value }))
        .catch((error: unknown) => ({ ok: false as const, error }));

      const outcome = await Promise.race([call, deadline]);
      if (outcome === TIMED_OUT) {
        this.logger.warn(
          JSON.stringify({
            event: 'holiday_provider_timed_out',
            provider: this.provider.name,
            countryCode,
            year,
            callBoundMs: bound,
          }),
        );
        return null;
      }
      if (!outcome.ok) {
        this.logger.warn(
          JSON.stringify({
            event: 'holiday_provider_failed',
            provider: this.provider.name,
            countryCode,
            year,
            reason: (outcome.error as Error)?.message ?? 'unknown',
          }),
        );
        return null;
      }
      return outcome.value;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* ---------------------------------------------------------------- *
   * The import writer
   * ---------------------------------------------------------------- */

  /**
   * §Decision table — what one provider entry becomes.
   *
   * The rule REQ-02-006 states is "the date already carries a holiday that reaches this
   * country", and the question this code asks is exactly that: a row on that date whose
   * `countryCode` is the imported country's own **or is null**. A row for another country
   * does not reach anybody here, so the date is free and the pair is distinct under the
   * unique index (Edge case 7b).
   *
   * PATCH-013 — a sync never modifies a row, and deletes one only through
   * {@link clearImported}, which a refresh runs first and which can reach nothing a person
   * wrote. Everything this method itself states is an insert (invariants 1 and 2).
   */
  private async writeEntries(
    caller: CallerMembership,
    countryCode: string,
    year: number,
    entries: readonly AcceptedProviderEntry[],
  ): Promise<{ written: number; skipped: number }> {
    if (entries.length === 0) return { written: 0, skipped: 0 };

    const dates = entries.map((entry) => asUtcDate(entry.date));
    // Re-read immediately before the write. Anything loaded earlier is stale, and the
    // rows this looks for are exactly the ones a manual create or another sync may have
    // just added.
    const occupied = await this.prisma.holiday.findMany({
      where: {
        organizationId: caller.organizationId,
        date: { in: dates },
        OR: [{ countryCode }, { countryCode: null }],
      },
      select: { date: true },
    });
    const blocked = new Set(occupied.map((row) => ymd(row.date)));

    let written = 0;
    let skipped = 0;
    for (const entry of entries) {
      if (blocked.has(entry.date)) {
        skipped += 1;
        continue;
      }
      try {
        await this.prisma.holiday.create({
          data: {
            organizationId: caller.organizationId,
            name: entry.name,
            date: asUtcDate(entry.date),
            paidHours: HOLIDAY_IMPORT_PAID_HOURS,
            countryCode: entry.countryCode,
            // NOT NULL behind a foreign key, and the syncing account is the only
            // account in this transaction — and one that necessarily holds
            // `manage-holidays`.
            createdByAccountId: caller.accountId,
            source: HOLIDAY_SOURCE_IMPORTED,
            externalKey: holidayExternalKey(this.provider.name, entry.countryCode, entry.date),
            importedAt: new Date(),
          },
        });
        written += 1;
        // The date is now taken for the rest of this import too — a provider that
        // offered two entries on one date writes one of them (§Known Gaps).
        blocked.add(entry.date);
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          // Edge case 12 — another syncer won the race. The row exists, which is what
          // "skipped" means: the date already carries a holiday that reaches this
          // country.
          skipped += 1;
          blocked.add(entry.date);
          continue;
        }
        throw e;
      }
    }
    return { written, skipped };
  }

  /**
   * PATCH-013 — everything a previous import wrote for one country and year, removed so
   * the answer in hand can be written whole.
   *
   * The `source` column is the whole gate. A row a person added by hand is `manual` and is
   * never touched, whatever its date and whatever country it names; it also still occupies
   * its date afterwards, so the import that follows skips that day exactly as it did
   * before. What this can reach is only what a sync itself wrote.
   *
   * The consequence worth stating: an admin who EDITED an imported row still holds an
   * `imported` row, and a refresh replaces it with the provider's own text. Editing a row
   * is not the same as adding one, and the flag that would separate them does not exist.
   */
  private async clearImported(
    organizationId: string,
    countryCode: string,
    year: number,
  ): Promise<void> {
    await this.prisma.holiday.deleteMany({
      where: {
        organizationId,
        countryCode,
        source: HOLIDAY_SOURCE_IMPORTED,
        // A half-open year: `@db.Date` stores UTC midnight, so the first day of the next
        // year is the first value outside this one.
        date: { gte: asUtcDate(`${year}-01-01`), lt: asUtcDate(`${year + 1}-01-01`) },
      },
    });
  }

  /**
   * REQ-02-021 — one import record per `(organization, country, year)` (invariant 3),
   * carrying the provider, the moment and the offered count. The uniqueness index is the
   * arbiter: a concurrent writer that got there first turns the insert into an update, so
   * one record exists whoever wins.
   */
  private async recordImport(
    organizationId: string,
    countryCode: string,
    year: number,
    holidayCount: number,
  ): Promise<void> {
    const data = { provider: this.provider.name, holidayCount, importedAt: new Date() };
    try {
      await this.prisma.holidayImport.upsert({
        where: { organizationId_countryCode_year: { organizationId, countryCode, year } },
        create: { organizationId, countryCode, year, ...data },
        update: data,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        await this.prisma.holidayImport.update({
          where: { organizationId_countryCode_year: { organizationId, countryCode, year } },
          data,
        });
        return;
      }
      throw e;
    }
  }

  /* ---------------------------------------------------------------- *
   * Gates
   * ---------------------------------------------------------------- */

  /**
   * The caller's own active membership and the capability that opens this route. A role
   * without it gets a bare 404 (REQ-02-019, REQ-02-020) — never a 403, and never a body
   * naming the capability or confirming the organization exists.
   *
   * `can` does not normalize: `CAPABILITY_MATRIX` is keyed by the four-value union, so a
   * stored `member` has to pass through `normalizeRole` or it falls through to false.
   */
  async requireCapability(
    session: SessionPayload,
    capability: 'view-holidays' | 'manage-holidays',
  ): Promise<CallerMembership> {
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
    if (!can(normalizeRole(caller.role), capability)) {
      throw new NotFoundException();
    }
    return {
      role: caller.role,
      organizationId: caller.organizationId,
      accountId: caller.accountId,
    };
  }
}

/** The sentinel the call race resolves to, distinguishable from any driver answer. */
const TIMED_OUT = Symbol('holiday-provider-timed-out');

/**
 * §State Machine — `sourced` and `empty` are the two shapes an import record takes and
 * `unsourced` is the absence of one. An offered count of zero is REQ-02-010's
 * covered-but-empty: recorded, and never re-asked without a refresh.
 */
function stateOf(holidayCount: number | undefined): HolidaySourcingState {
  if (holidayCount === undefined) return 'unsourced';
  return holidayCount > 0 ? 'sourced' : 'empty';
}

/** `YYYY-MM-DD` → the UTC midnight a `@db.Date` column stores. */
function asUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** A `@db.Date` column back to `YYYY-MM-DD`, with no zone able to shift the day. */
function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}
