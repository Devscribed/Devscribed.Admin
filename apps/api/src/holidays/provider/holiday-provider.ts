/**
 * The public-holiday capability, as specified in `specs/time-off/02-holiday-sourcing.md`.
 *
 * Callers name this class and never a vendor: no URL, no HTTP status and no vendor field
 * name crosses this boundary. What comes back is already filtered by the spec's own rules
 * — nationwide `Public` entries whose date, country and name passed Validation Rules 4 to
 * 6 — because the payload is a third party's and the filter is the product's.
 *
 * An abstract class rather than an interface so it can be the Nest DI token directly,
 * matching `CalendarProvider`, `FileStorage`, `JobQueue` and `MailService`.
 */

import type { AcceptedProviderEntry } from '@devscribed/validation';

export type { AcceptedProviderEntry };

export interface ProviderHolidays {
  /** The entries that passed the filter, in the order the provider gave them. */
  entries: AcceptedProviderEntry[];
  /** How many entries were refused — regional ones included. The `discarded` count. */
  discarded: number;
}

export abstract class HolidayProvider {
  /**
   * The **name of the driver that answered** — `nager` in a deployed environment, `fake`
   * under the local double (§Boundary values, Identity). It is what
   * `HolidayImport.provider` records and what `externalKey` is composed from, so a row
   * says which driver produced it rather than which service it was meant to come from.
   */
  abstract readonly name: string;

  /**
   * REQ-02-011 — the configured call bound, in milliseconds. Carried on the port because
   * the sourcing service races every call against it: a driver-side deadline would not
   * bound a driver with no HTTP in it, and "the request came back" is the guarantee.
   */
  abstract readonly callBoundMs: number;

  /**
   * The nationwide `Public` holidays of one country and year.
   *
   * Throws when the provider errors, answers unparseably, or cannot be reached. REQ-02-009
   * turns that into an unsourced country and a `200`, never into a status — which is why
   * nothing here returns a failure value the caller could mistake for an empty year.
   */
  abstract holidays(countryCode: string, year: number): Promise<ProviderHolidays>;
}
