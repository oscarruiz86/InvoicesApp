import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), '@shared': fileURLToPath(new URL('../shared', import.meta.url)) } },
  // One isolated thread avoids concurrent jsdom workers exhausting the Windows runner.
  test: { pool: 'threads', maxWorkers: 1, environment: 'jsdom', include: ['tests/unit/**/*.test.{ts,tsx}'], setupFiles: ['tests/setup/setup.ts'], restoreMocks: true, testTimeout: 10_000 },
});
