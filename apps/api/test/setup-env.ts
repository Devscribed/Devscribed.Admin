import { TEST_DATABASE_URL } from './database-url';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DIRECT_URL = TEST_DATABASE_URL;

/**
 * Spec 04. The suite never touches SignWell — every case stubs the HTTP boundary through
 * `overrideProvider(SignWellHttpClient)` — but the *adapter* must be registered for a
 * case to reach it at all, and registration is decided by whether the configuration is
 * present. Naming the three values here is therefore a precondition of the SignWell
 * suites, not a convenience.
 *
 * `SIGNWELL_WEBHOOK_SECRET` is the id the three captured deliveries in
 * `signwell-webhook-fixtures.ts` were sent to, so their hashes — which SignWell produced —
 * verify against our implementation rather than against one of our own making.
 */
process.env.SIGNWELL_API_KEY = 'test-signwell-api-key';
process.env.SIGNWELL_API_APPLICATION_ID = 'test-signwell-application';
process.env.SIGNWELL_WEBHOOK_SECRET = '2ecc3f5c-3a2d-4e60-967b-4bf67e059ca0';
process.env.SIGNWELL_TEST_MODE = 'true';
process.env.SIGNWELL_API_BASE_URL = 'http://signwell.invalid/api/v1';

/**
 * The create poll (requirement 38) waits three seconds between reads in production, where
 * SignWell's parse takes a second or two. In the suite the stub answers instantly, so the
 * wait is pure latency — and TC-04-INT-03c, which deliberately drives the poll to its
 * bound, would otherwise cost thirty seconds on its own. Zero here changes how long the
 * poll waits and nothing about how many times it reads, which is what the cases assert.
 */
process.env.SIGNWELL_POLL_INTERVAL_MS = '0';
