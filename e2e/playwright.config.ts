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
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
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
