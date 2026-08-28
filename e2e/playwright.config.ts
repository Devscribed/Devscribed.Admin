import { cpus } from 'node:os';
import { defineConfig, devices } from '@playwright/test';

/**
 * Where the suite points.
 *
 * Unset, it is the local pair of dev servers this config starts below — the hermetic run
 * that CI and a fresh clone get. Set to a deployed environment's address, it runs the same
 * tests against that deployment and starts nothing:
 *
 *   E2E_BASE_URL=https://<host> npm run test:e2e
 *
 * Note what that second mode really tests. Locally the browser talks to :3000 and the
 * suite talks to :4000 directly; against a deployment there is only one address, because
 * the API has no public one and every /api/* call goes through the web app's rewrite. So a
 * remote run exercises the proxy path too, which the local run cannot.
 */
const REMOTE = process.env.E2E_BASE_URL;
const WEB = REMOTE ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',

  /**
   * Parallel, and safe to be: every test mints its own account, and signup creates a
   * fresh organization with it, so no test can see another's data. That isolation was
   * always the design — it just was not being spent.
   *
   * It is worth spending now because the suite tripled when the user-management area
   * landed: ~124 cases at one worker is twelve minutes, which is long enough that people
   * stop running it before pushing, which is the only way a suite really fails.
   *
   * The worker count is sized from the machine, not from CI. Those were one setting until
   * the pipeline started running the suite with `CI=1` — which it must, so that
   * `reuseExistingServer` stays off and a trace is produced — and thereby inherited the
   * two-worker cap written for a two-core GitHub runner. On a fourteen-core workstation
   * that turned a 135s suite into 282s.
   *
   * Measured on this suite, wall time against workers: 2 → 282s, 6 → 205s with no flakes,
   * 10 → 135s with three, 20 → 213s with about thirty retries. Fastest is not the target,
   * though. At the high end the machine is saturated and unusable for whoever owns it, the
   * flake count climbs, and under enough contention the API itself starts answering 500 —
   * which the page-error guard, correctly, turns into failures.
   *
   * So the cap is a quarter of the logical cores, bounded at six: five here, comfortably
   * under a minute for the suite, and eleven cores still free. Raise it for a one-off with
   * PW_WORKERS. CI keeps its two, because a two-core runner has nothing to give.
   */
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.PW_WORKERS
    ? Number(process.env.PW_WORKERS)
    : Math.max(2, Math.min(6, Math.floor(cpus().length / 4))),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: WEB,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Nothing to start when the target is a deployment.
  webServer: REMOTE ? [] : [
    {
      command: 'npm run dev --workspace @devscribed/api',
      cwd: '..',
      // Only what the suite genuinely needs to stay hermetic. Each of these is already
      // the non-production default, and each is named anyway because Playwright reuses an
      // already-running dev server: without them, whether the suite touched AWS would
      // depend on how that server happened to be started. Everything else the documents
      // area reads (bucket names, queue URLs, SES settings) is deliberately absent — a
      // hermetic run must not have a value to reach for.
      env: {
        // The sink transport keeps reset links and signing invitations readable from the
        // tests; it is also what unlocks /api/test/mail, which stays 404 under any real
        // transport.
        MAIL_TRANSPORT: 'memory',
        // Signed documents go to apps/api/.local-storage, never to S3.
        STORAGE_DRIVER: 'local',
        // Chromium via playwright-core, with the built-in fallback writer if the browser
        // is missing. Never the render Lambda.
        PDF_RENDERER: 'local-chromium',
        // The completion render runs in-process, after the transaction commits, so a test
        // can assert on the finished envelope without polling a queue.
        JOB_QUEUE: 'inline',
        // Signing links must point at the web server this config starts.
        APP_PUBLIC_URL: WEB,
        // Spec 04. The stub driver answers every SignWell call from memory and is
        // refused outright when NODE_ENV is production, so the suite stays hermetic and
        // spends none of the ten-documents-a-minute create budget. The three
        // configuration values are named because *registration* is decided by their
        // presence: without them the provider is unconfigured and TC-04-E2E-01 could
        // never select it.
        SIGNWELL_DRIVER: 'stub',
        SIGNWELL_API_KEY: 'e2e-signwell-api-key',
        SIGNWELL_API_APPLICATION_ID: 'e2e-signwell-application',
        SIGNWELL_WEBHOOK_SECRET: 'e2e-signwell-webhook-id',
        SIGNWELL_TEST_MODE: 'true',
      },
      port: 4000,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // Playwright discards a web server's output by default, and that default cost a long
      // afternoon: `LocalChromiumPdfRenderer` degrades to a Latin-1 text writer when it
      // cannot launch a browser and says so with a warning — a warning that went nowhere.
      // The visible symptom was a signed PDF that was merely *small*, with no clue why.
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev --workspace @devscribed/web',
      cwd: '..',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
