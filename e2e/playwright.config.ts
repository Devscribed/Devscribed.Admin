import { defineConfig, devices } from '@playwright/test';
import * as path from 'node:path';

const API_PORT = 4000;
const WEB_PORT = 3000;
const ROOT = path.resolve(__dirname, '..');

/**
 * E2E config: Playwright starts the NestJS API and the Next.js web app itself,
 * both pointed at the dedicated test database (`USE_TEST_DB=true`). `global-setup`
 * migrates and truncates that database before the run.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 30_000,
  globalSetup: require.resolve('./global-setup'),
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npx nest start',
      cwd: path.join(ROOT, 'apps/api'),
      url: `http://localhost:${API_PORT}/api/health`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        USE_TEST_DB: 'true',
        API_PORT: String(API_PORT),
      },
    },
    {
      command: `npx next dev -p ${WEB_PORT}`,
      cwd: path.join(ROOT, 'apps/web'),
      url: `http://localhost:${WEB_PORT}/signup`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        API_ORIGIN: `http://localhost:${API_PORT}`,
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
});
