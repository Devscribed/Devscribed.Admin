import { test as base, expect } from '@playwright/test';

/**
 * Every test watches for errors it was not looking for.
 *
 * Nothing in this suite listened for `console.error`, `pageerror` or a failed request, so a
 * regression in one module that surfaces on another module's screen passed unnoticed: each
 * test asserted its own thing and left. Integration tests cannot cover that class either —
 * they exercise modules apart, and this is the defect that only appears once two of them are
 * on the same page.
 *
 * The guard is `auto`, so a spec gets it by importing `test` from here instead of from
 * `@playwright/test`; nothing else in the file changes.
 *
 * `E2E_STRICT_ERRORS=1` makes a stray error fail the test. Without it the guard only
 * annotates and prints, which is how it should be introduced: turn it on once the existing
 * noise is at zero, so the first real failure means something.
 */

/** Errors that are noise rather than defects. Each entry says why, or it does not belong. */
const IGNORED = [
  // Navigating away mid-flight aborts in-flight requests; the browser reports it, the user
  // never sees it.
  /net::ERR_ABORTED/,
  // Playwright closes the context at teardown while React may still be flushing.
  /Target (page|closed)|Execution context was destroyed/,
  // The dev server's own HMR chatter, absent in a production build.
  /\[Fast Refresh\]|webpack-hmr|hot-update/,
  // A 4xx is the API answering as specified — a rejected submission, a guard returning 404 —
  // and the browser logs every non-2xx fetch as a console error regardless. The screens are
  // built to show these. A 5xx is not covered here and still fails.
  /Failed to load resource.*status of 4\d\d/,
];

/**
 * On by default. A guard nobody has seen fail is not a guard, and a warning nobody reads is
 * not either — measured across the suite exactly one test tripped this, and that one was a
 * deliberate 400 now covered above. `E2E_STRICT_ERRORS=0` downgrades it to a warning while
 * chasing a specific failure.
 */
const strict = process.env.E2E_STRICT_ERRORS !== '0';

export const test = base.extend<{ pageErrorGuard: void }>({
  pageErrorGuard: [
    async ({ page }, use, testInfo) => {
      const seen: string[] = [];
      const record = (line: string) => {
        if (!IGNORED.some((re) => re.test(line))) seen.push(line);
      };

      page.on('console', (m) => {
        if (m.type() === 'error') record(`console.error — ${m.text()}`);
      });
      page.on('pageerror', (e) => record(`uncaught — ${e.message}`));
      page.on('requestfailed', (r) => {
        const failure = r.failure()?.errorText ?? 'failed';
        record(`request failed — ${r.method()} ${r.url()} (${failure})`);
      });

      await use();

      if (!seen.length) return;

      const unique = [...new Set(seen)];
      const report = unique.map((l) => `  ${l}`).join('\n');
      testInfo.annotations.push({ type: 'page-errors', description: unique.join(' | ') });

      if (strict) {
        expect(unique, `the page reported ${unique.length} error(s) this test did not expect:\n${report}`).toEqual([]);
      } else {
        console.warn(`\n[page-errors] ${testInfo.titlePath.join(' › ')}\n${report}`);
      }
    },
    { auto: true },
  ],
});

export { expect };

/* Re-exported so a spec swaps one module specifier and nothing else. */
export { request } from '@playwright/test';
export type { APIRequestContext, Browser, Locator, Page } from '@playwright/test';
