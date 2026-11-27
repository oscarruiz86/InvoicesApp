import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const environment = process.env;
const baseUrl = environment.KEYCLOAK_ADMIN_AUDIT_TEST_BASE_URL?.trim();
const realm = environment.KEYCLOAK_ADMIN_AUDIT_TEST_REALM?.trim();
const clientId = environment.KEYCLOAK_ADMIN_AUDIT_TEST_CLIENT_ID?.trim();
const readerSecretFile = environment.KEYCLOAK_ADMIN_AUDIT_TEST_CLIENT_SECRET_FILE?.trim();
const adminUsername = environment.KEYCLOAK_ADMIN_AUDIT_TEST_ADMIN_USERNAME?.trim();
const adminSecretFile = environment.KEYCLOAK_ADMIN_AUDIT_TEST_ADMIN_SECRET_FILE?.trim();

function assertDisposableTarget() {
  let url;
  try { url = new URL(baseUrl); } catch { throw new Error('KEYCLOAK_ADMIN_AUDIT_TEST_CONFIG_INVALID'); }
  if (environment.KEYCLOAK_ADMIN_AUDIT_TEST_DISPOSABLE !== '1' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || !realm || !clientId || !readerSecretFile || !adminUsername || !adminSecretFile) throw new Error('KEYCLOAK_ADMIN_AUDIT_TEST_REQUIRES_DISPOSABLE_LOCAL_REALM');
  return url.origin;
}

async function token(origin, tokenRealm, form) {
  const response = await fetch(`${origin}/realms/${encodeURIComponent(tokenRealm)}/protocol/openid-connect/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('KEYCLOAK_ADMIN_AUDIT_TEST_TOKEN_FAILED');
  const payload = await response.json();
  if (typeof payload?.access_token !== 'string') throw new Error('KEYCLOAK_ADMIN_AUDIT_TEST_TOKEN_INVALID');
  return payload.access_token;
}

async function request(origin, accessToken, path, init = {}) {
  return fetch(`${origin}${path}`, { ...init, headers: { authorization: `Bearer ${accessToken}`, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers }, signal: AbortSignal.timeout(15000) });
}

const origin = assertDisposableTarget();
const [readerSecret, adminSecret] = await Promise.all([readFile(readerSecretFile, 'utf8'), readFile(adminSecretFile, 'utf8')]);
if (!readerSecret.trim() || !adminSecret.trim()) throw new Error('KEYCLOAK_ADMIN_AUDIT_TEST_SECRET_INVALID');
const readerToken = await token(origin, realm, { grant_type: 'client_credentials', client_id: clientId, client_secret: readerSecret.trim() });
const adminToken = await token(origin, 'master', { grant_type: 'password', client_id: 'admin-cli', username: adminUsername, password: adminSecret.trim() });
const realmPath = `/admin/realms/${encodeURIComponent(realm)}`;

const eventsConfigResponse = await request(origin, readerToken, `${realmPath}/events/config`);
assert.equal(eventsConfigResponse.status, 200, 'reader must inspect events configuration');
const eventsConfig = await eventsConfigResponse.json();
assert.equal(eventsConfig.adminEventsEnabled, true);
assert.equal(eventsConfig.adminEventsDetailsEnabled, false);
assert.notEqual(eventsConfig.eventsEnabled, true, 'user event capture must not be enabled by this setup');

const feedResponse = await request(origin, readerToken, `${realmPath}/admin-events?dateFrom=0&dateTo=${Date.now()}&direction=asc&first=0&max=10`);
assert.equal(feedResponse.status, 200, 'reader must access the administrative event feed');
assert.ok(Array.isArray(await feedResponse.json()));

const realmResponse = await request(origin, adminToken, realmPath);
assert.equal(realmResponse.status, 200);
const realmRepresentation = await realmResponse.json();
const realmWriteResponse = await request(origin, readerToken, realmPath, { method: 'PUT', body: JSON.stringify(realmRepresentation) });
assert.equal(realmWriteResponse.status, 403, 'reader must not modify realm configuration');

const clientQuery = new URLSearchParams({ clientId });
const clientsResponse = await request(origin, adminToken, `${realmPath}/clients?${clientQuery}`);
assert.equal(clientsResponse.status, 200);
const readerClient = (await clientsResponse.json()).find(client => client.clientId === clientId);
assert.ok(typeof readerClient?.id === 'string');
const clientPath = `${realmPath}/clients/${encodeURIComponent(readerClient.id)}`;
const clientWriteResponse = await request(origin, readerToken, clientPath, { method: 'PUT', body: JSON.stringify(readerClient) });
assert.equal(clientWriteResponse.status, 403, 'reader must not modify a client');

const managementClients = await request(origin, adminToken, `${realmPath}/clients?${new URLSearchParams({ clientId: 'realm-management' })}`);
assert.equal(managementClients.status, 200);
const managementClient = (await managementClients.json()).find(client => client.clientId === 'realm-management');
assert.ok(typeof managementClient?.id === 'string');
const serviceAccountResponse = await request(origin, adminToken, `${realmPath}/clients/${encodeURIComponent(readerClient.id)}/service-account-user`);
assert.equal(serviceAccountResponse.status, 200);
const serviceAccount = await serviceAccountResponse.json();
assert.ok(typeof serviceAccount?.id === 'string');
const mappingsPath = `${realmPath}/users/${encodeURIComponent(serviceAccount.id)}/role-mappings/clients/${encodeURIComponent(managementClient.id)}`;
const currentMappings = await request(origin, adminToken, mappingsPath);
assert.equal(currentMappings.status, 200);
const mappings = await currentMappings.json();
assert.deepEqual(mappings.map(role => role.name).sort(), ['view-events']);
const viewEventsRole = mappings.find(role => role.name === 'view-events');
const roleWriteResponse = await request(origin, readerToken, mappingsPath, { method: 'POST', body: JSON.stringify([viewEventsRole]) });
assert.equal(roleWriteResponse.status, 403, 'reader must not change role mappings');

console.log('Keycloak admin audit disposable-reader checks passed');
