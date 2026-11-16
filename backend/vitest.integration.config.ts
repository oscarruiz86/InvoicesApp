import { defineConfig } from 'vitest/config';
import configuration from './vitest.config.ts';
export default defineConfig({ ...configuration, test: { ...configuration.test, include: ['tests/integration/**/*.test.ts'], testTimeout: 20000 } });
