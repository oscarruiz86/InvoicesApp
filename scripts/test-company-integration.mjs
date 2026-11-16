import { fileURLToPath } from 'node:url';
import { startCompanyMongo } from './company-mongo-fixture.mjs';
import { command } from './auth-fixture.mjs';
const fixture = await startCompanyMongo();
try {
  console.log(await command(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts', 'tests/integration/company-management.test.ts'], {
    cwd: fileURLToPath(new URL('../backend/', import.meta.url)), env: { ...process.env, MONGODB_TEST_URI: fixture.uri },
  }));
} finally { await fixture.stop(); }
