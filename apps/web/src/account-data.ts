/**
 * App-owned option tables for the Account Settings phone/timezone/first-day selectors
 * (spec 06 design — "DS gaps": this is application data feeding a standard `Select`, not
 * a design-system component). The country and timezone lists are derived at runtime from
 * `libphonenumber-js` and `Intl`, so nothing here hardcodes a name, flag, or offset.
 */

import { getCountries, getCountryCallingCode } from 'libphonenumber-js';
import { FIRST_DAY_OF_WEEK_VALUES } from '@devscribed/validation';

/**
 * The shape the system's `Select` takes, which every builder below already produced: the
 * label was typed `ReactNode` and has always been a string — a flag is an emoji inside one,
 * not an element. `SelectOption.label` is a `string`, so narrowing the declaration is what
 * makes these tables usable as options rather than casting at each of the three call sites.
 */
export interface AppSelectOption {
  value: string;
  label: string;
}

/**
 * The flag emoji for an ISO 3166-1 alpha-2 code, built from the two regional-indicator
 * code points (e.g. `US` → 🇺🇸). A pure transform — no lookup table to fall out of date.
 */
export function flagFromAlpha2(code: string): string {
  const cc = (code ?? '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  const base = 0x1f1e6; // regional indicator 'A'
  return String.fromCodePoint(
    base + (cc.charCodeAt(0) - 65),
    base + (cc.charCodeAt(1) - 65),
  );
}

/** English region display names, guarded — `Intl.DisplayNames` is widely available but
 * we never want a missing implementation to throw the whole module out. */
const regionNames: Intl.DisplayNames | null = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

function countryName(code: string): string {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Every country `libphonenumber-js` knows a calling code for, as `{ value: alpha-2,
 * label: "🇺🇸 United States +1" }`, sorted by country name. Built once at module load.
 */
export const COUNTRY_OPTIONS: AppSelectOption[] = getCountries()
  .map((code) => {
    let dialCode = '';
    try {
      dialCode = getCountryCallingCode(code);
    } catch {
      dialCode = '';
    }
    return { code, name: countryName(code), dialCode };
  })
  .filter((entry) => entry.dialCode.length > 0)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((entry) => ({
    value: entry.code,
    label: `${flagFromAlpha2(entry.code)} ${entry.name} +${entry.dialCode}`,
  }));

/**
 * A curated set of common IANA zones. Not exhaustive — the business spec asks for "a
 * reasonable ~30–60 common zones"; a user whose saved zone falls outside the list has it
 * injected by `buildTimezoneOptions` so the `Select` can still show it.
 */
const CURATED_ZONES: readonly string[] = [
  'UTC',
  // Americas
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Vancouver',
  'America/Phoenix',
  'America/Denver',
  'America/Chicago',
  'America/Mexico_City',
  'America/New_York',
  'America/Toronto',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'Pacific/Honolulu',
  // Europe / Africa
  'Atlantic/Reykjavik',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Dublin',
  'Africa/Lagos',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Zurich',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Europe/Athens',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Europe/Kyiv',
  'Europe/Moscow',
  'Africa/Nairobi',
  // Asia / Pacific
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Perth',
  'Australia/Brisbane',
  'Australia/Sydney',
  'Pacific/Auckland',
];

/** Parses the browser's `GMT±hh:mm` offset for a zone into a `(GMT-7:00)` label and a
 * signed-minutes sort key. Offsets are the current (DST-aware) values, per the spec's
 * "Compute offsets with Intl.DateTimeFormat". */
function offsetFor(zone: string): { label: string; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date());
    const raw = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
    const match = raw.match(/GMT([+-])(\d{1,2}):(\d{2})/);
    if (!match) return { label: '(GMT+0:00)', minutes: 0 };
    const sign = match[1];
    const hours = parseInt(match[2], 10);
    const mins = parseInt(match[3], 10);
    const total = (sign === '-' ? -1 : 1) * (hours * 60 + mins);
    return { label: `(GMT${sign}${hours}:${match[3]})`, minutes: total };
  } catch {
    return { label: '(GMT+0:00)', minutes: 0 };
  }
}

/**
 * The timezone `Select` options as `{ value: IANA, label: "(GMT-7:00) America/Los_Angeles" }`,
 * sorted west-to-east by current offset. When `saved` is a zone outside the curated list it
 * is injected so the pre-selected value renders (business spec — "if the saved value isn't in
 * the list, inject it").
 */
export function buildTimezoneOptions(saved?: string | null): AppSelectOption[] {
  const zones = new Set<string>(CURATED_ZONES);
  if (saved && saved.trim().length > 0) zones.add(saved.trim());

  return [...zones]
    .map((zone) => ({ zone, ...offsetFor(zone) }))
    .sort((a, b) => a.minutes - b.minutes || a.zone.localeCompare(b.zone))
    .map((entry) => ({ value: entry.zone, label: `${entry.label} ${entry.zone}` }));
}

/** First day of week — the two values the shared validator accepts (Monday default). */
export const FIRST_DAY_OPTIONS: AppSelectOption[] = FIRST_DAY_OF_WEEK_VALUES.map((value) => ({
  value,
  label: value,
}));
