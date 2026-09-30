import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@leaddesk/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts') },
  },
  server: { port: Number(process.env.SHOWROOM_PORT ?? 3001) },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 15000,
  },
});
