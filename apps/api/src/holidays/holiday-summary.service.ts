import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  can,
  isHolidayApplicableToMember,
  normalizeRole,
  resolveCurrencyAtDate,
  resolveMemberHolidayCountry,
  resolveRateAtDate,
  toHours,
  toMoney,
  validateSyncYear,
} from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import { HolidaySourcingService } from './holiday-sourcing.service';

/** One row of `countries` — holiday ROWS carrying that code, and who resolves to it. */
export interface SummaryCountryRow {
  /** `null` is the global row: holidays that reach every active member. */
  countryCode: string | null;
  holidayCount: number;
  memberCount: number;
}

/** One amount, in one currency. Absent entirely rather than zeroed when withheld. */
export interface SummaryAmount {
  currency: string;
  amount: string;
}

/** One row of `members` — the holidays that REACH one person, and what they cost. */
export interface SummaryMemberRow {
  membershipId: string;
  displayName: string;
  countryCode: string | null;
  holidayCount: number;
  paidHours: string;
  byCurrency?: SummaryAmount[];
}

export interface SummaryTotals {
  holidayCount: number;
  paidHours: string;
  byCurrency?: SummaryAmount[];
}

export interface HolidaySummaryView {
  year: number;
  countries: SummaryCountryRow[];
  members: SummaryMemberRow[];
  totals: SummaryTotals;
}

/**
 * Time off spec 02 §The numbers — days by country, days by person, and what they cost.
 *
 * `view-holidays` opens the day counts (REQ-02-019, a 404 without it); `view-amounts-owed`
 * opens the money, **separately** (REQ-02-017), so money is never reachable here by a
 * capability granted for something else. Withheld fields are omitted, never zeroed: a
 * body cannot then be read for the shape of what it did not say.
 *
 * Every amount is the Amounts Owed arithmetic — each holiday valued at the billable rate
 * in force on its OWN date and rounded with `toMoney` first, the rounded values then
 * summed — because `reports.service.ts` sums already-rounded per-row amounts and the two
 * screens have to agree to the cent (TC-02-INT-09).
 */
@Injectable()
export class HolidaySummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sourcing: HolidaySourcingService,
  ) {}

  /**
   * `GET /organizations/:orgId/holidays/summary`. Resolves the caller's capabilities and
   * hands them to {@link buildSummary} explicitly.
   *
   * The seam is part of the design rather than an accident of it: no shipped role holds
   * `view-holidays` without `view-amounts-owed`, so REQ-02-017 cannot be observed through
   * a session at all, and the rule has to exist before a role splits the two.
   */
  async summary(session: SessionPayload, input: { year?: unknown }): Promise<HolidaySummaryView> {
    const caller = await this.sourcing.requireCapability(session, 'view-holidays');
    const year = validateSyncYear(input?.year);
    if (!year.valid) {
      throw new UnprocessableEntityException({
        error: 'validation_error',
        fields: { year: year.error },
      });
    }
    return this.buildSummary(caller.organizationId, year.value, {
      includeAmounts: can(normalizeRole(caller.role), 'view-amounts-owed'),
    });
  }

  /**
   * The summary itself, with the capability set supplied rather than resolved.
   *
   * @param includeAmounts REQ-02-017 — `false` omits every amount and every currency
   *   from every member row and from `totals`. Not a zero and not an empty list.
   */
  async buildSummary(
    organizationId: string,
    year: number,
    options: { includeAmounts: boolean },
  ): Promise<HolidaySummaryView> {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));

    const [memberships, holidays, sourcedCountries] = await Promise.all([
      this.prisma.membership.findMany({
        where: { organizationId, status: 'active' },
        select: {
          id: true,
          countryCode: true,
          account: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.holiday.findMany({
        where: { organizationId, date: { gte: start, lt: end } },
        select: { id: true, name: true, date: true, paidHours: true, countryCode: true },
        orderBy: { date: 'asc' },
      }),
      this.sourcing.sourcedCountrySet(organizationId),
    ]);

    const members = memberships.map((m) => ({
      id: m.id,
      displayName: `${m.account.firstName} ${m.account.lastName}`.trim(),
      // PATCH-012 — the member's own stated country and nothing else. Somebody who has
      // stated none is counted for the global holidays alone; the organization's country
      // is no longer read on their behalf.
      countryCode: resolveMemberHolidayCountry(m.countryCode),
    }));

    /* ---- countries (REQ-02-013) -------------------------------------------------- */

    // Holiday ROWS carrying each code. A country in the sourced set that nobody resolves
    // to still appears, with a `memberCount` of 0 — the set is the question the screen
    // asked, and a country missing from the answer would read as one nobody sources.
    const rowsByCountry = new Map<string, number>();
    let globalRows = 0;
    for (const holiday of holidays) {
      if (holiday.countryCode === null) globalRows += 1;
      else {
        const code = holiday.countryCode.toUpperCase();
        rowsByCountry.set(code, (rowsByCountry.get(code) ?? 0) + 1);
      }
    }
    const membersByCountry = new Map<string, number>();
    for (const member of members) {
      if (member.countryCode === null) continue;
      membersByCountry.set(member.countryCode, (membersByCountry.get(member.countryCode) ?? 0) + 1);
    }

    const countries: SummaryCountryRow[] = sourcedCountries.map((countryCode) => ({
      countryCode,
      holidayCount: rowsByCountry.get(countryCode) ?? 0,
      memberCount: membersByCountry.get(countryCode) ?? 0,
    }));
    // A global holiday is its own row rather than added into each country — adding it in
    // would make the country rows overlap, and the screen labels them as row counts.
    // Its `memberCount` is every active member, because it reaches all of them.
    if (globalRows > 0) {
      countries.push({ countryCode: null, holidayCount: globalRows, memberCount: members.length });
    }

    /* ---- members (REQ-02-014, REQ-02-015, REQ-02-018, REQ-02-024) ---------------- */

    const membershipIds = members.map((m) => m.id);

    interface MemberRate {
      clientHourlyRate: number;
      monthlySalary: number;
      currency: string;
    }
    const liveByMember = new Map<string, MemberRate>();
    const snapshotsByMember = new Map<string, (MemberRate & { effectiveFrom: Date })[]>();

    // Read nothing financial at all where the caller may not see money: a body that
    // omits amounts should also not have asked for them.
    if (options.includeAmounts) {
      const [financials, snapshots] = await Promise.all([
        this.prisma.memberFinancials.findMany({
          where: { membershipId: { in: membershipIds } },
          select: {
            membershipId: true,
            clientHourlyRate: true,
            monthlySalary: true,
            currency: true,
          },
        }),
        this.prisma.memberFinancialsSnapshot.findMany({
          where: { membershipId: { in: membershipIds } },
          select: {
            membershipId: true,
            clientHourlyRate: true,
            monthlySalary: true,
            currency: true,
            effectiveFrom: true,
          },
        }),
      ]);
      for (const row of financials) {
        liveByMember.set(row.membershipId, {
          clientHourlyRate: row.clientHourlyRate.toNumber(),
          monthlySalary: row.monthlySalary.toNumber(),
          currency: row.currency,
        });
      }
      for (const row of snapshots) {
        const list = snapshotsByMember.get(row.membershipId) ?? [];
        list.push({
          clientHourlyRate: row.clientHourlyRate.toNumber(),
          monthlySalary: row.monthlySalary.toNumber(),
          currency: row.currency,
          effectiveFrom: row.effectiveFrom,
        });
        snapshotsByMember.set(row.membershipId, list);
      }
    }

    const totalsByCurrency = new Map<string, number>();
    let totalHolidayCount = 0;
    let totalPaidHours = 0;

    const memberRows: SummaryMemberRow[] = members.map((member) => {
      let holidayCount = 0;
      let paidHours = 0;
      const byCurrency = new Map<string, number>();

      const live = liveByMember.get(member.id) ?? null;
      const history = snapshotsByMember.get(member.id) ?? [];

      for (const holiday of holidays) {
        if (!isHolidayApplicableToMember(holiday, member)) continue;
        holidayCount += 1;
        const hours = holiday.paidHours.toNumber();
        paidHours += hours;

        if (!options.includeAmounts) continue;
        // REQ-02-018 — a member with no settings and no snapshot has no `byCurrency` key
        // at all, and contributes nothing to `totals.byCurrency`, while keeping their
        // day count and paid hours (REQ-02-024).
        const currency = resolveCurrencyAtDate(history, live, holiday.date);
        if (currency === null) continue;
        const { billRate } = resolveRateAtDate(history, live, holiday.date);
        // Rounded per holiday and THEN summed: Amounts Owed sums already-rounded rows,
        // and the two have to be equal to the cent.
        const amount = Number(toMoney(hours * billRate));
        byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + amount);
        totalsByCurrency.set(currency, (totalsByCurrency.get(currency) ?? 0) + amount);
      }

      totalHolidayCount += holidayCount;
      totalPaidHours += paidHours;

      const row: SummaryMemberRow = {
        membershipId: member.id,
        displayName: member.displayName,
        countryCode: member.countryCode,
        holidayCount,
        paidHours: toHours(paidHours),
      };
      // REQ-02-018 decides this on **financial settings**, not on arithmetic: a member
      // who has a live row or a snapshot carries the key, even where no holiday reached
      // them and the list is therefore empty. Keying it on `byCurrency.size` would make a
      // member with settings and no holidays indistinguishable from one with no settings
      // at all, which is the single thing that rule exists to separate.
      if (options.includeAmounts && (live !== null || history.length > 0)) {
        row.byCurrency = amountList(byCurrency);
      }
      return row;
    });

    /* ---- totals (REQ-02-016) ----------------------------------------------------- */

    // Sums over MEMBERS, never over countries: the two arrays count different things and
    // are not expected to sum to each other (Edge cases 22 and 23).
    const totals: SummaryTotals = {
      holidayCount: totalHolidayCount,
      paidHours: toHours(totalPaidHours),
    };
    // One entry per currency and no field anywhere carrying a total across currencies —
    // an exchange rate is a number this product does not have.
    if (options.includeAmounts) {
      totals.byCurrency = amountList(totalsByCurrency);
    }

    return { year, countries, members: memberRows, totals };
  }
}

/** A currency map as the response's list, ordered so two reads never disagree. */
function amountList(amounts: Map<string, number>): SummaryAmount[] {
  return [...amounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount: toMoney(amount) }));
}
