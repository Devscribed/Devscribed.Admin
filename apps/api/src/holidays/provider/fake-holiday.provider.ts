import { Logger } from '@nestjs/common';
import { acceptProviderEntries, type RawProviderEntry } from '@devscribed/validation';
import { HolidayProvider, type ProviderHolidays } from './holiday-provider';

/**
 * The local driver — a double of Nager.Date that answers from memory, reaches no network,
 * and is what a fresh clone and the E2E suite run against.
 *
 * It reports its **own** name, `fake`, not the service it doubles: `externalKey` and
 * `HolidayImport.provider` then say which driver wrote a row (§Boundary values, Identity),
 * which is the difference between a row somebody can trace and one that claims to have
 * come from a service nothing called.
 *
 * Its table reproduces every behaviour §External Contracts requires of a double, because
 * an E2E run reaches this driver only through the running API and can seed nothing:
 *
 * | Country | Behaviour |
 * |---|---|
 * | `PL` | Poland's shape — 14 entries, all `global`, all `Public`, no two on one date |
 * | `DE` | Germany's shape — 20 entries of which 10 are regional and carry `counties` |
 * | `US` | A nationwide set of 11 |
 * | `MT` | Four entries of which one has a 200-character name, one is dated outside the requested year and one names a day February does not have (Rules 4 and 6) |
 * | `VA` | An empty array — covered, and offering nothing (REQ-02-010) |
 * | `IN`, `AE` | A refused connection (REQ-02-009) — the two codes §External Contracts recorded as uncovered |
 * | `AQ` | A call that never answers (REQ-02-011) |
 * | anything else | An empty array — recorded as covered-but-empty rather than re-asked forever |
 *
 * The dates are fixed month-days rather than the real movable feasts: a double has to
 * answer the same thing for every year a case asks about, and no rule under test depends
 * on which day of the week a holiday falls on.
 */
export class FakeHolidayProvider extends HolidayProvider {
  readonly name = 'fake';

  private readonly log = new Logger(FakeHolidayProvider.name);

  /** How many times the provider was actually called, for a case that counts calls. */
  calls = 0;

  /** Per-country overrides a seeding hook has installed, keyed by uppercase code. */
  private readonly overrides = new Map<string, FakeCountryBehaviour>();

  /**
   * Not `readonly`: a case that drives REQ-02-011 has to shorten the bound, and a bound
   * only settable through the environment would make the whole port's configuration a
   * property of how the process was started.
   */
  callBoundMs: number;

  constructor(callBoundMs: number) {
    super();
    this.callBoundMs = callBoundMs;
  }

  /** A seeding hook: point one country at any of the behaviours above. */
  setCountry(countryCode: string, behaviour: FakeCountryBehaviour): void {
    this.overrides.set(countryCode.trim().toUpperCase(), behaviour);
  }

  /** A seeding hook: forget every override and the call count. */
  reset(): void {
    this.overrides.clear();
    this.calls = 0;
  }

  async holidays(countryCode: string, year: number): Promise<ProviderHolidays> {
    const code = countryCode.trim().toUpperCase();
    this.calls += 1;
    const behaviour = this.overrides.get(code) ?? defaultBehaviour(code);

    if (behaviour.kind === 'fail') {
      throw new Error(`holiday provider refused the connection for ${code} ${year}`);
    }
    if (behaviour.kind === 'never') {
      // Never answers, and does not hold the process open while not answering: the
      // sourcing service's own race against `callBoundMs` is what ends the wait.
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 10 * 60 * 1000);
        if (typeof timer.unref === 'function') timer.unref();
      });
      throw new Error(`holiday provider never answered for ${code} ${year}`);
    }

    const raw = behaviour.kind === 'empty' ? [] : behaviour.entries(year, code);
    const { accepted, discarded } = acceptProviderEntries(raw, { countryCode: code, year });
    this.log.log(
      JSON.stringify({
        event: 'holiday_provider_answered',
        provider: this.name,
        driver: 'fake',
        countryCode: code,
        year,
        offered: accepted.length,
        discarded,
      }),
    );
    return { entries: accepted, discarded };
  }
}

export type FakeCountryBehaviour =
  | { kind: 'entries'; entries: (year: number, countryCode: string) => RawProviderEntry[] }
  | { kind: 'empty' }
  | { kind: 'fail' }
  | { kind: 'never' };

/** One nationwide `Public` entry in the shape the provider hands over. */
export function nationwideEntry(
  year: number,
  countryCode: string,
  monthDay: string,
  name: string,
): RawProviderEntry {
  return {
    date: `${year}-${monthDay}`,
    localName: name,
    name,
    countryCode,
    fixed: true,
    global: true,
    counties: null,
    launchYear: null,
    types: ['Public'],
  };
}

/** One regional entry — `global: false` and a `counties` array, which REQ-02-005 refuses. */
export function regionalEntry(
  year: number,
  countryCode: string,
  monthDay: string,
  name: string,
): RawProviderEntry {
  return {
    ...nationwideEntry(year, countryCode, monthDay, name),
    global: false,
    counties: [`${countryCode}-BY`, `${countryCode}-BW`],
  };
}

const POLAND: Array<[string, string]> = [
  ['01-01', "New Year's Day"],
  ['01-06', 'Epiphany'],
  ['04-05', 'Easter Sunday'],
  ['04-06', 'Easter Monday'],
  ['05-01', 'Labour Day'],
  ['05-03', 'Constitution Day'],
  ['05-24', 'Pentecost Sunday'],
  ['06-04', 'Corpus Christi'],
  ['08-15', 'Assumption Day'],
  ['11-01', "All Saints' Day"],
  ['11-11', 'Independence Day'],
  ['12-24', 'Christmas Eve'],
  ['12-25', 'Christmas Day'],
  ['12-26', 'St. Stephens Day'],
];

const GERMANY_NATIONWIDE: Array<[string, string]> = [
  ['01-01', "New Year's Day"],
  ['04-03', 'Good Friday'],
  ['04-06', 'Easter Monday'],
  ['05-01', 'Labour Day'],
  ['05-14', 'Ascension Day'],
  ['05-25', 'Whit Monday'],
  ['10-03', 'German Unity Day'],
  ['11-25', 'Repentance and Prayer Day'],
  ['12-25', 'Christmas Day'],
  ['12-26', 'St. Stephens Day'],
];

const GERMANY_REGIONAL: Array<[string, string]> = [
  ['01-06', 'Epiphany'],
  ['02-17', 'Carnival'],
  ['03-08', "International Women's Day"],
  ['05-04', 'Peace Festival'],
  ['06-04', 'Corpus Christi'],
  ['08-08', 'Augsburg Peace Festival'],
  ['08-15', 'Assumption Day'],
  ['10-31', 'Reformation Day'],
  ['11-01', "All Saints' Day"],
  ['11-18', 'Repentance Day'],
];

const UNITED_STATES: Array<[string, string]> = [
  ['01-01', "New Year's Day"],
  ['01-19', 'Martin Luther King, Jr. Day'],
  ['02-16', "Washington's Birthday"],
  ['05-25', 'Memorial Day'],
  ['06-19', 'Juneteenth'],
  ['07-04', 'Independence Day'],
  ['09-07', 'Labor Day'],
  ['10-12', 'Columbus Day'],
  ['11-11', 'Veterans Day'],
  ['11-26', 'Thanksgiving Day'],
  ['12-25', 'Christmas Day'],
];

/**
 * Poland's shape — 14 entries, every one nationwide and `Public`, no two on one date.
 * Exported because the integration double reproduces the same shapes, and two copies of
 * a fixture is how the two stop being the same fixture.
 */
export function polandShape(year: number, countryCode = 'PL'): RawProviderEntry[] {
  return POLAND.map(([md, name]) => nationwideEntry(year, countryCode, md, name));
}

/** Germany's shape — 20 entries of which 10 are regional (§External Contracts). */
export function germanyShape(year: number, countryCode = 'DE'): RawProviderEntry[] {
  return [
    ...GERMANY_NATIONWIDE.map(([md, name]) => nationwideEntry(year, countryCode, md, name)),
    ...GERMANY_REGIONAL.map(([md, name]) => regionalEntry(year, countryCode, md, name)),
  ];
}

/** A nationwide set of 11 for the United States. */
export function unitedStatesShape(year: number, countryCode = 'US'): RawProviderEntry[] {
  return UNITED_STATES.map(([md, name]) => nationwideEntry(year, countryCode, md, name));
}

/**
 * Rules 4 and 6 — a 200-character name, an entry dated outside the requested year, and a
 * date that matches `YYYY-MM-DD` and names no day. One entry of the four is clean, so a
 * filter that discarded everything would fail this shape too.
 */
export function malformedShape(year: number, countryCode = 'MT'): RawProviderEntry[] {
  return [
    nationwideEntry(year, countryCode, '02-10', 'Feast of St. Paul'),
    nationwideEntry(year, countryCode, '03-19', 'A'.repeat(200)),
    nationwideEntry(year - 1, countryCode, '12-13', 'Republic Day'),
    nationwideEntry(year, countryCode, '02-31', 'The Thirty-First of February'),
  ];
}

function defaultBehaviour(countryCode: string): FakeCountryBehaviour {
  switch (countryCode) {
    case 'PL':
      return { kind: 'entries', entries: polandShape };
    case 'DE':
      return { kind: 'entries', entries: germanyShape };
    case 'US':
      return { kind: 'entries', entries: unitedStatesShape };
    case 'MT':
      // Rules 4 and 6 — a name of 200 characters and an entry dated outside the year.
      return { kind: 'entries', entries: malformedShape };
    case 'VA':
      return { kind: 'empty' };
    case 'IN':
    case 'AE':
      return { kind: 'fail' };
    case 'AQ':
      return { kind: 'never' };
    default:
      return { kind: 'empty' };
  }
}
