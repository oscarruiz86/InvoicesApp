import { fileURLToPath } from 'node:url';
import { command, startKeycloakFixture } from './auth-fixture.mjs';
import { startCompanyMongo } from './company-mongo-fixture.mjs';
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run npm --prefix backend run test:integration:prepared');
let mongo, identity;
try {
  const started = await Promise.allSettled([startCompanyMongo(), startKeycloakFixture([])]);
  if (started[0].status === 'fulfilled') mongo = started[0].value;
  if (started[1].status === 'fulfilled') identity = started[1].value;
  for (const result of started) if (result.status === 'rejected') throw result.reason;
  await identity.setApplicationRoles(['APP_ADMIN']);
  const directory = await identity.companyDirectoryFixture();
  console.log('Running full integration with disposable MongoDB and Keycloak fixtures.');
  console.log(await command(process.execPath, [npm, 'run', 'test:integration'], {
    cwd: fileURLToPath(new URL('../backend/', import.meta.url)), env: { ...process.env,
      MONGODB_TEST_URI: mongo.uri, NOTIFICATIONS_RETENTION_TEST_URI: mongo.uri,
      KEYCLOAK_DIRECTORY_TEST_ISSUER: identity.issuer, KEYCLOAK_DIRECTORY_TEST_CLIENT_ID: directory.clientId,
      KEYCLOAK_DIRECTORY_TEST_CLIENT_SECRET: directory.clientSecret, KEYCLOAK_DIRECTORY_TEST_SUBJECT: directory.subject,
    },
  }));
} finally {
  const cleanup = await Promise.allSettled([identity?.close(), mongo?.stop()]);
  for (const result of cleanup) if (result.status === 'rejected') console.error('Disposable integration fixture cleanup failed.');
}
