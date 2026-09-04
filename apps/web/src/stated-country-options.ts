import { COUNTRY_OPTIONS } from '@devscribed/validation';

/**
 * The option list both country pickers this feature adds draw — the organization's on
 * Settings › Holidays and the member's on their About tab (time off spec 01 §Screens).
 *
 * It is `COUNTRY_OPTIONS` from `@devscribed/validation`, which is `COUNTRY_NAMES`: the same
 * 249 assigned alpha-2 codes Validation Rule 9's `validateCountryCode` tests. **The list
 * offered and the list accepted are one list, so they cannot drift.**
 *
 * Deliberately NOT the holiday form's picker. That one is built from the web app's own
 * phone-derived list (`apps/web/src/account-data.ts`, libphonenumber's `getCountries()`),
 * which offers `AC`, `TA` and `XK` — three codes rule 9 refuses — so an admin could pick
 * Kosovo and be told "Enter a valid country" about a value the product itself offered. The
 * holiday form and the holiday list's country filter keep their list: a `Holiday.countryCode`
 * may be any two uppercase letters, and a filter that cannot name a row that exists is worse
 * than one offering a rare country.
 *
 * Mapped once, here, because the design system's `Select` takes `{ value, label }` and the
 * package exports `{ code, name }`: two mappings of one list is how two pickers drift apart.
 */
export const STATED_COUNTRY_OPTIONS: { value: string; label: string }[] = COUNTRY_OPTIONS.map(
  ({ code, name }) => ({ value: code, label: name }),
);
