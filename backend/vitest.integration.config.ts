import { defineConfig } from 'vitest/config';
import configuration from './vitest.config.ts';
export default defineConfig({ ...configuration, test: { ...configuration.test, include: ['tests/integration/**/*.test.ts'], maxWorkers: 4, isolate: false, hookTimeout: 20000, testTimeout: 20000 } });
