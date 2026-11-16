import { startKeycloakFixture } from './auth-fixture.mjs';

const fixture = await startKeycloakFixture(['http://localhost:5173']);
try {
  await fixture.verifyConfiguration();
  await fixture.restart();
  await fixture.verifyConfiguration();
  console.log('Keycloak: realm, roles, public client, forbidden flows, PKCE and restart persistence verified.');
} finally { await fixture.close(); }
