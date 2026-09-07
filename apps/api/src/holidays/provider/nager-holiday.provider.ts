import { Logger } from '@nestjs/common';
import { acceptProviderEntries } from '@devscribed/validation';
import { HolidayProvider, type ProviderHolidays } from './holiday-provider';

/**
 * Nager.Date over HTTPS — `GET {base}/api/v3/PublicHolidays/{year}/{code}` — with no
 * credential of any kind (§External Contracts, §Security).
 *
 * Everything the payload claims is re-validated by `acceptProviderEntries`: this driver
 * decides nothing about which entries count, it only fetches and parses. Any non-2xx, any
 * body that is not an array and any abort **throws**; REQ-02-009 turns that into an
 * unsourced country and a `200`, so a failure here is never a status a caller sees.
 */
export class NagerHolidayProvider extends HolidayProvider {
  readonly name = 'nager';

  private readonly log = new Logger(NagerHolidayProvider.name);

  constructor(
    private readonly baseUrl: string,
    readonly callBoundMs: number,
  ) {
    super();
  }

  async holidays(countryCode: string, year: number): Promise<ProviderHolidays> {
    const code = countryCode.trim().toUpperCase();
    const url = `${this.baseUrl}/api/v3/PublicHolidays/${year}/${encodeURIComponent(code)}`;

    // Node's global `fetch` has no timeout of its own, so the abort signal is the whole
    // of the guarantee — and it is what releases the socket rather than merely ignoring
    // an answer that arrives too late (the `fetchTransport` shape).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.callBoundMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`holiday provider answered ${response.status} for ${code} ${year}`);
      }
      const body: unknown = await response.json();
      if (!Array.isArray(body)) {
        throw new Error(`holiday provider answered a non-array body for ${code} ${year}`);
      }
      const { accepted, discarded } = acceptProviderEntries(body, { countryCode: code, year });
      this.log.log(
        JSON.stringify({
          event: 'holiday_provider_answered',
          provider: this.name,
          countryCode: code,
          year,
          offered: accepted.length,
          discarded,
        }),
      );
      return { entries: accepted, discarded };
    } finally {
      clearTimeout(timer);
    }
  }
}
