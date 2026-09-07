/**
 * Which holiday provider driver the application talks to, decided once at boot.
 *
 * The house rule for a port's own configuration, verbatim from `queue.provider.ts` and
 * `storage.provider.ts`: an explicit `HOLIDAY_PROVIDER` wins, and the local driver is the
 * default whenever `NODE_ENV` is not `production`. A fresh clone therefore needs no
 * configuration and no test touches the network. A value that names no driver throws at
 * boot rather than defaulting — a name with no driver behind it is a typo, and resolving
 * it to the real one would put a suite on the public internet.
 */

export type HolidayProviderName = 'nager' | 'fake';

/** The public endpoint, from §External Contracts. No credential of any kind. */
export const NAGER_DEFAULT_BASE_URL = 'https://date.nager.at';

/**
 * REQ-02-011's default call bound. One page load makes one call per country in the set,
 * and the list paints before any of them, so the bound is what an admin waits for the
 * summary rather than what they wait for the screen.
 */
export const HOLIDAY_PROVIDER_DEFAULT_TIMEOUT_MS = 8000;

export interface HolidayProviderConfig {
  driver: HolidayProviderName;
  baseUrl: string;
  timeoutMs: number;
}

export class HolidayProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HolidayProviderConfigError';
  }
}

/** An empty variable is an unset one: `.env` files declare keys they do not fill in. */
const value = (raw: string | undefined): string | undefined => {
  const trimmed = (raw ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export function resolveHolidayProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): HolidayProviderConfig {
  const configured = value(env.HOLIDAY_PROVIDER);
  if (configured !== undefined && configured !== 'nager' && configured !== 'fake') {
    throw new HolidayProviderConfigError(
      `HOLIDAY_PROVIDER must be "nager" or "fake", not "${configured}".`,
    );
  }
  const driver: HolidayProviderName =
    (configured as HolidayProviderName | undefined) ??
    (env.NODE_ENV === 'production' ? 'nager' : 'fake');

  const timeoutRaw = value(env.HOLIDAY_PROVIDER_TIMEOUT_MS);
  const timeoutMs = timeoutRaw === undefined ? HOLIDAY_PROVIDER_DEFAULT_TIMEOUT_MS : Number(timeoutRaw);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new HolidayProviderConfigError(
      `HOLIDAY_PROVIDER_TIMEOUT_MS must be a positive number of milliseconds, not "${timeoutRaw}".`,
    );
  }

  return {
    driver,
    baseUrl: (value(env.HOLIDAY_PROVIDER_BASE_URL) ?? NAGER_DEFAULT_BASE_URL).replace(/\/+$/, ''),
    timeoutMs,
  };
}
