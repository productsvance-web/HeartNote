import { defineConfig } from '@playwright/test';

const BASE_URL = 'https://localhost:3001';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    storageState: 'tests/.auth/baseline-caregiver.json',
    viewport: { width: 430, height: 932 },
  },
  globalSetup: './tests/global-setup.ts',
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
    ignoreHTTPSErrors: true,
  },
});
