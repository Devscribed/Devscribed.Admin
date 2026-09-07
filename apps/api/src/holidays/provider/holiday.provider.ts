import { Logger, type Provider } from '@nestjs/common';
import { FakeHolidayProvider } from './fake-holiday.provider';
import { HolidayProvider } from './holiday-provider';
import { resolveHolidayProviderConfig } from './holiday-provider.config';
import { NagerHolidayProvider } from './nager-holiday.provider';

/**
 * Which driver serves the `HolidayProvider` port, resolved at module construction so a
 * misconfiguration throws before `main.ts` ever reaches `listen()`.
 *
 * Registered once in `CoreModule`, which is `@Global`: one instance for the whole
 * application, so `overrideProvider(HolidayProvider)` in a test replaces the instance the
 * routes actually call.
 */
export const holidayProviderProvider: Provider = {
  provide: HolidayProvider,
  useFactory: (): HolidayProvider => {
    const config = resolveHolidayProviderConfig();
    // Whether a sync reaches the public internet decides whether an organization's
    // holidays are real, so it is stated at boot rather than inferred from behaviour.
    new Logger('HolidayProvider').log(
      config.driver === 'nager'
        ? `Nager.Date at ${config.baseUrl}, call bound ${config.timeoutMs}ms`
        : `Fake holiday provider — answers from memory, call bound ${config.timeoutMs}ms`,
    );
    return config.driver === 'nager'
      ? new NagerHolidayProvider(config.baseUrl, config.timeoutMs)
      : new FakeHolidayProvider(config.timeoutMs);
  },
};
