import { defineConfig } from '@playwright/test';

const port = process.env.PORT ?? '3000';

export default defineConfig({
  testDir: 'apps/web/e2e',
  use: { baseURL: `http://localhost:${port}`, trace: 'on-first-retry' },
  webServer: {
    command: 'npm run dev:web',
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
