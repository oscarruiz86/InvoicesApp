import { defineConfig } from '@playwright/test';
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false,
  use: { baseURL, browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: process.env.E2E_BASE_URL ? undefined : { command: 'npm run dev', url: baseURL, reuseExistingServer: !process.env.CI, timeout: 60000 },
});
