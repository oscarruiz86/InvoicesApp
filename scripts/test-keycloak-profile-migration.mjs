import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { command, freePort, keycloakImage, waitFor } from './auth-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const suffix = randomBytes(5).toString('hex');
const project = `keycloak-profile-migration-test-${suffix}`;
const port = await freePort();
const base = `http://localhost:${port}`;
const secretsDirectory = fileURLToPath(new URL(`../.artifacts/${project}/secrets/`, import.meta.url));
const adminUsername = `migration-admin-${suffix}`;
const adminPassword = randomBytes(32).toString('base64url');
const profileSecret = randomBytes(32).toString('base64url');
const preservedUsername = `existing-user-${suffix}`;
const environment = {
  ...process.env,
  KEYCLOAK_PORT: String(port),
  KEYCLOAK_PUBLIC_URL: base,
  KEYCLOAK_SECRET_DIR: secretsDirectory,
  KC_BOOTSTRAP_ADMIN_USERNAME: adminUsername,
  INVOICES_WEB_ORIGIN: 'http://localhost:5173',
};
const compose = (...args) => command('docker', ['compose', '-p', project, ...args], { cwd: root, env: environment });
const redact = value => value.replaceAll(adminPassword, '[redacted]').replaceAll(profileSecret, '[redacted]');

let adminToken;
let adminTokenExpiresAt = 0;
async function getAdminToken() {
  if (!adminToken || Date.now() >= adminTokenExpiresAt) {
    const login = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: adminUsername, password: adminPassword }),
    });
    assert.equal(login.status, 200, 'Isolated bootstrap administrator must authenticate');
    const credentials = await login.json();
    adminToken = credentials.access_token;
    adminTokenExpiresAt = Date.now() + Math.max(5, credentials.expires_in - 10) * 1000;
  }
  return adminToken;
}

async function adminRequest(path, options = {}) {
  const token = await getAdminToken();
  const response = await fetch(`${base}/admin/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  });
  return response;
}

try {
  await mkdir(secretsDirectory, { recursive: true });
  await writeFile(`${secretsDirectory}/keycloak-bootstrap-admin-password`, adminPassword, { flag: 'wx' });
  await writeFile(`${secretsDirectory}/keycloak-profile-init-client-secret`, profileSecret, { flag: 'wx' });

  const rendered = await compose('config');
  assert(!rendered.includes(adminPassword) && !rendered.includes(profileSecret), 'Compose configuration must not contain secret contents');
  await compose('--profile', 'keycloak-bootstrap', 'run', '--rm', 'keycloak-bootstrap');
  await compose('up', '-d', '--wait', 'keycloak');
  await waitFor(`${base}/realms/invoices/.well-known/openid-configuration`);

  await getAdminToken();

  const created = await adminRequest('realms/invoices/users', {
    method: 'POST',
    body: JSON.stringify({ username: preservedUsername, enabled: true, email: `${preservedUsername}@example.invalid` }),
  });
  assert.equal(created.status, 201, 'Existing realm fixture user must be created before migration');
  const preservedUserId = new URL(created.headers.get('location')).pathname.split('/').at(-1);
  assert(preservedUserId, 'Keycloak must return the id of the existing test user');

  await compose('--profile', 'keycloak-migrate', 'run', '--rm', 'keycloak-profile-migrate');
  await compose('run', '--rm', 'keycloak-profile-init');

  const preservedUser = await adminRequest(`realms/invoices/users/${preservedUserId}`);
  assert.equal(preservedUser.status, 200, 'Migration must preserve existing realm users');
  assert.equal((await preservedUser.json()).username, `${preservedUsername}@example.invalid`);
  const realm = await (await adminRequest('realms/invoices')).json();
  assert.equal(realm.registrationAllowed, true);
  assert.equal(realm.registrationEmailAsUsername, true);
  assert.equal(realm.verifyEmail, true);

  const profileClients = await (await adminRequest('realms/invoices/clients?clientId=invoices-profile-init')).json();
  assert.equal(profileClients.length, 1, 'Migration must create exactly one profile service client');
  const managementClients = await (await adminRequest('realms/invoices/clients?clientId=realm-management')).json();
  assert.equal(managementClients.length, 1);
  const serviceAccount = await (await adminRequest(`realms/invoices/clients/${profileClients[0].id}/service-account-user`)).json();
  const mappings = await (await adminRequest(`realms/invoices/users/${serviceAccount.id}/role-mappings/clients/${managementClients[0].id}`)).json();
  assert.deepEqual(mappings.map(role => role.name).sort(), ['manage-clients', 'manage-realm', 'query-clients', 'view-clients']);

  const serviceTokenResponse = await fetch(`${base}/realms/invoices/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: 'invoices-profile-init', client_secret: profileSecret }),
  });
  assert.equal(serviceTokenResponse.status, 200, 'Profile service account must authenticate with its file-backed secret');
  const serviceToken = (await serviceTokenResponse.json()).access_token;
  const forbidden = await fetch(`${base}/admin/realms/master`, { headers: { Authorization: `Bearer ${serviceToken}` } });
  assert.equal(forbidden.status, 403, 'Profile service account must not administer the master realm');

  const keycloakId = (await compose('ps', '-q', 'keycloak')).trim();
  assert(keycloakId, 'Persistent Keycloak container must remain available after migration');
  const environmentConfig = await command('docker', ['inspect', '--format', '{{json .Config.Env}}', keycloakId], { cwd: root, env: environment });
  assert(!environmentConfig.includes(adminPassword) && !environmentConfig.includes(profileSecret), 'Persistent Keycloak container configuration must not contain secret contents');
  assert(!environmentConfig.includes('KC_BOOTSTRAP_ADMIN_PASSWORD='), 'Persistent Keycloak must not receive a plaintext bootstrap password variable');
  const logs = await compose('logs', 'keycloak');
  assert(!logs.includes(adminPassword) && !logs.includes(profileSecret), 'Keycloak logs must not contain secret contents');

  console.log(`Keycloak profile migration passed: existing data preserved, restricted client configured, kcadm sessions ephemeral, and secrets absent from persistent config/logs (Keycloak ${keycloakImage.split('@')[0]}).`);
} catch (error) {
  throw new Error(redact(error.message));
} finally {
  if (!project.startsWith('keycloak-profile-migration-test-')) throw new Error('Unsafe test project name');
  try { await compose('down', '--volumes', '--remove-orphans'); }
  finally { await rm(fileURLToPath(new URL(`../.artifacts/${project}/`, import.meta.url)), { recursive: true, force: true }); }
}
