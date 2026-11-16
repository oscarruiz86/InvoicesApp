import { fileURLToPath } from 'node:url';
import { command, startKeycloakFixture } from './auth-fixture.mjs';

const fixture = await startKeycloakFixture([]);
try {
  await fixture.setApplicationRoles(['APP_ADMIN']);
  const target = await fixture.companyDirectoryFixture();
  console.log(await command(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts', 'tests/integration/company-directory-keycloak.test.ts'], {
    cwd: fileURLToPath(new URL('../backend/', import.meta.url)),
    env: { ...process.env, KEYCLOAK_DIRECTORY_TEST_ISSUER: fixture.issuer, KEYCLOAK_DIRECTORY_TEST_CLIENT_ID: target.clientId, KEYCLOAK_DIRECTORY_TEST_CLIENT_SECRET: target.clientSecret, KEYCLOAK_DIRECTORY_TEST_SUBJECT: target.subject },
  }));
} finally {
  await fixture.close();
}
