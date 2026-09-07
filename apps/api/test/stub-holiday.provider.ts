import {
  FakeHolidayProvider,
  germanyShape,
  nationwideEntry,
  polandShape,
} from '../src/holidays/provider/fake-holiday.provider';
import type { ProviderHolidays } from '../src/holidays/provider/holiday-provider';

/**
 * The holiday provider the integration suite runs against.
 *
 * It exists so a case can state its precondition — "this country answers Germany's
 * shape", "this one refuses the connection", "this one never answers" — instead of
 * arranging one through environment variables, and so a case can count the calls that
 * were actually made (REQ-02-007 is a rule about a call that does **not** happen).
 *
 * It extends the shipped local driver rather than restating it: the shapes the double has
 * to reproduce are the ones §External Contracts measured, and a second copy of Germany's
 * twenty entries would be a second fixture the moment one of them changed. It therefore
 * reports that driver's name, `fake`, which is what every row written under it records.
 */
export class StubHolidayProvider extends FakeHolidayProvider {
  /** How many times each country was asked, keyed by uppercase code. */
  readonly callsByCountry = new Map<string, number>();

  constructor(callBoundMs = 2000) {
    super(callBoundMs);
  }

  async holidays(countryCode: string, year: number): Promise<ProviderHolidays> {
    const code = countryCode.trim().toUpperCase();
    this.callsByCountry.set(code, (this.callsByCountry.get(code) ?? 0) + 1);
    return super.holidays(code, year);
  }

  /** Poland's shape — 14 nationwide `Public` entries, no two on one date. */
  answersPoland(countryCode: string): void {
    this.setCountry(countryCode, {
      kind: 'entries',
      entries: (year) => polandShape(year, countryCode.toUpperCase()),
    });
  }

  /** Germany's shape — 20 entries of which 10 are regional and must be discarded. */
  answersGermany(countryCode: string): void {
    this.setCountry(countryCode, {
      kind: 'entries',
      entries: (year) => germanyShape(year, countryCode.toUpperCase()),
    });
  }

  /** An arbitrary set of nationwide entries, one per `MM-DD`. */
  answersOn(countryCode: string, monthDays: readonly string[]): void {
    this.setCountry(countryCode, {
      kind: 'entries',
      entries: (year) =>
        monthDays.map((md, index) =>
          nationwideEntry(year, countryCode.toUpperCase(), md, `Stub Holiday ${index + 1}`),
        ),
    });
  }

  /** A covered country that offers nothing (REQ-02-010). */
  answersEmpty(countryCode: string): void {
    this.setCountry(countryCode, { kind: 'empty' });
  }

  /** A refused connection (REQ-02-009). */
  refuses(countryCode: string): void {
    this.setCountry(countryCode, { kind: 'fail' });
  }

  /** A call that never answers (REQ-02-011). */
  neverAnswers(countryCode: string): void {
    this.setCountry(countryCode, { kind: 'never' });
  }

  /** Forget every override, the total call count and the per-country counts. */
  reset(): void {
    super.reset();
    this.callsByCountry.clear();
  }

  callsFor(countryCode: string): number {
    return this.callsByCountry.get(countryCode.trim().toUpperCase()) ?? 0;
  }
}

/** The `MM-DD` dates Germany's shape offers nationwide, in order — what a sync writes. */
export function germanNationwideDates(year: number): string[] {
  return germanyShape(year)
    .filter((e) => e.global === true)
    .map((e) => String(e.date));
}

/** The dates Poland's shape offers, in order. */
export function polishDates(year: number): string[] {
  return polandShape(year).map((e) => String(e.date));
}
