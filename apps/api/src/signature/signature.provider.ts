import type { Provider } from '@nestjs/common';
import { SignWellHttpClient, HttpSignWellClient } from './signwell/signwell-http-client';
import { StubSignWellHttpClient } from './signwell/stub-signwell-http-client';

/**
 * Driver selection for the SignWell HTTP boundary, next to the drivers it chooses between
 * — the same shape `mail.provider.ts`, `pdf.provider.ts`, `storage.provider.ts` and
 * `queue.provider.ts` already have.
 *
 * What used to live here was `selectSignatureProvider()`, which resolved exactly one
 * *provider* class at boot from `SIGNATURE_PROVIDER`. That is gone: which provider signs
 * an envelope is an organization setting read at send, and which adapters exist is decided
 * by whether their configuration is present. Both questions are answered by
 * `SigningProviderRegistry`, at call time. The only thing left to choose at boot is how
 * the adapter talks to the network.
 *
 * The stub is refused in production outright. A stub that could be switched on there is a
 * way to make a contract that was never sent look sent.
 */
export function selectSignWellHttpClient(): typeof HttpSignWellClient | typeof StubSignWellHttpClient {
  const driver = (process.env.SIGNWELL_DRIVER ?? '').trim().toLowerCase();

  if (driver === 'stub') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SIGNWELL_DRIVER=stub is refused in production');
    }
    return StubSignWellHttpClient;
  }
  if (driver && driver !== 'http') {
    // Loudly, rather than falling back: silently talking to nobody when someone asked for
    // a real provider is the worst possible way to discover a typo.
    throw new Error(`Unknown SIGNWELL_DRIVER: ${driver}`);
  }

  return HttpSignWellClient;
}

/**
 * A factory rather than `useClass`, because `HttpSignWellClient` takes its transport and
 * its tuning as ordinary constructor arguments with defaults — which is what lets the
 * retry, rate-limit and breaker behaviour be driven from a test with no network and no
 * timers. Nest would otherwise try to resolve a function type as a dependency.
 */
export const signWellHttpClientProvider: Provider = {
  provide: SignWellHttpClient,
  useFactory: (): SignWellHttpClient => {
    const Driver = selectSignWellHttpClient();
    return new Driver();
  },
};
