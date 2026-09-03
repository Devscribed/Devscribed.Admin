import { COUNTRY_OPTIONS } from '@/account-data';
import { countryName } from '@devscribed/validation';

/** The value of the "applies everywhere" option — an empty string, which the API
 * reads as `countryCode: null` (spec requirement 4). */
export const ALL_COUNTRIES = '';

/**
 * The holiday country picker (spec §Screens, row 3): **All countries** first, then
 * every alpha-2 the app knows, labelled with its full name.
 *
 * The code list is reused from `COUNTRY_OPTIONS` — the app's one country list — but
 * the labels are rebuilt: that list is the *phone* picker, so its labels carry a
 * dialling code and a flag emoji, neither of which belongs on a holiday, and the
 * design system forbids emoji outright.
 */
export const HOLIDAY_COUNTRY_OPTIONS: { value: string; label: string }[] = [
  { value: ALL_COUNTRIES, label: 'All countries' },
  ...COUNTRY_OPTIONS.map((option) => ({
    value: option.value,
    label: countryName(option.value) ?? option.value,
  })),
];

/** The full country name for a stored code — 'All' when the holiday is global. */
export function holidayCountryLabel(code: string | null): string {
  if (!code) return 'All';
  return countryName(code) ?? code;
}
