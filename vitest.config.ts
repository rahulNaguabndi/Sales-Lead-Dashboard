import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@leaddesk/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
      '@': path.resolve(__dirname, 'apps/web'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['packages/shared/src/**/*.test.ts', 'apps/web/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'apps/web/e2e/**'],
    testTimeout: 30000,
  },
});
