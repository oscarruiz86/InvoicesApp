import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

export const keycloakImage = 'quay.io/keycloak/keycloak:26.8.2@sha256:3879c623248408de29a5303178b5816c77e8dfef3890c361f8c0bbeaa979ba3b';
export async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
export function command(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { ...options, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.once('error', reject);
    // Do not print command arguments or environment: they can contain local configuration.
    child.once('exit', code => code === 0 ? resolve(output) : reject(new Error(`${program} failed (${code}): ${output.slice(-2000)}`)));
  });
}
export async function waitFor(url, timeoutMs = 600_000, check = () => {}) {
  const deadline = Date.now() + timeoutMs;
  let failure = '';
  while (Date.now() < deadline) {
    check();
    try { const response = await fetch(url, { signal: AbortSignal.timeout(10_000) }); if (response.ok) return; failure = `HTTP ${response.status}`; } catch (error) { failure = error.cause?.code ?? error.name; }
    await delay(500);
  }
  throw new Error(`Service did not become ready within its startup deadline (${failure})`);
}
export async function createRealmFixture(base, adminUsername, adminPassword, origins, accessTokenLifespan = 40) {
  assert(origins.every(origin => ['localhost', '127.0.0.1'].includes(new URL(origin).hostname)), 'Fixtures require local web origins');
  const realm = `invoices-auth-test-${randomBytes(5).toString('hex')}`;
  const username = `test-${randomBytes(5).toString('hex')}`;
  const password = randomBytes(32).toString('base64url');
  let adminToken; let adminTokenUntil = 0;
  const admin = async (path, options = {}) => {
    if (Date.now() >= adminTokenUntil) {
      const login = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
        method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: adminUsername, password: adminPassword }),
      });
      assert.equal(login.status, 200, 'Local test administrator must authenticate');
      const credentials = await login.json(); adminToken = credentials.access_token;
      adminTokenUntil = Date.now() + Math.min(30, credentials.expires_in - 5) * 1000;
    }
    return fetch(`${base}/admin/realms/${path}`, { signal: AbortSignal.timeout(30_000), ...options, headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json', ...options.headers } });
  };
  const template = JSON.parse(await readFile(new URL('../keycloak/invoices-realm.json', import.meta.url), 'utf8'));
  const userProfile = JSON.parse(await readFile(new URL('../keycloak/invoices-user-profile.json', import.meta.url), 'utf8'));
  template.realm = realm;
  // Admin API imports do not expand container environment placeholders.
  template.clients[0].baseUrl = `${origins[0] ?? base}/login`;
  template.clients[0].redirectUris = origins.map(origin => `${origin}/auth/callback`);
  template.clients[0].webOrigins = origins;
  template.clients[0].attributes['post.logout.redirect.uris'] = origins.map(origin => `${origin}/`).join('##');
  // Short lifetime only in this isolated realm makes renewal observable without editing the development realm.
  template.accessTokenLifespan = accessTokenLifespan;
  template.users = [{ username, enabled: true, email: 'driver@example.invalid', emailVerified: true, firstName: 'Test', lastName: 'Driver', requiredActions: [], realmRoles: ['DRIVER'], credentials: [{ type: 'password', value: password, temporary: false }] }];
  const created = await admin('', { method: 'POST', body: JSON.stringify(template) });
  const createdDetails = created.status === 201 ? '' : await created.text();
  assert.equal(created.status, 201, `Test realm must be created: ${createdDetails}`);
  const defaultProfileResponse = await admin(`${realm}/users/profile`);
  assert.equal(defaultProfileResponse.status, 200, 'Default user profile must be available');
  await defaultProfileResponse.json();
  const configuredProfile = await admin(`${realm}/users/profile`, { method: 'PUT', body: JSON.stringify(userProfile) });
  const profileDetails = await configuredProfile.text();
  assert.equal(configuredProfile.status, 200, `Test user profile must be configured: ${profileDetails}`);
  return {
    base, realm, username, password, issuer: `${base}/realms/${realm}`,
    async userId() {
      const users = await (await admin(`${realm}/users?username=${encodeURIComponent(username)}&exact=true`)).json();
      assert.equal(users.length, 1); return users[0].id;
    },
    async setApplicationRoles(names) {
      assert(names.every(name => ['APP_ADMIN', 'COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER'].includes(name)));
      const users = await (await admin(`${realm}/users?username=${encodeURIComponent(username)}&exact=true`)).json();
      assert.equal(users.length, 1);
      const path = `${realm}/users/${users[0].id}/role-mappings/realm`;
      const assigned = await (await admin(path)).json();
      const application = assigned.filter(role => ['APP_ADMIN', 'COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER'].includes(role.name));
      if (application.length) assert.equal((await admin(path, { method: 'DELETE', body: JSON.stringify(application) })).status, 204);
      const roles = await (await admin(`${realm}/roles`)).json();
      assert.equal((await admin(path, { method: 'POST', body: JSON.stringify(roles.filter(role => names.includes(role.name))) })).status, 204);
    },
    async logoutSessions() { assert.equal((await admin(`${realm}/logout-all`, { method: 'POST' })).status, 200); },
    async companyDirectoryFixture() {
      const clientId = `company-directory-${randomBytes(4).toString('hex')}`;
      const clientSecret = randomBytes(32).toString('base64url');
      assert.equal((await admin(`${realm}/clients`, { method: 'POST', body: JSON.stringify({ clientId, secret: clientSecret, publicClient: false, serviceAccountsEnabled: true, standardFlowEnabled: false, directAccessGrantsEnabled: false }) })).status, 201);
      const [client] = await (await admin(`${realm}/clients?clientId=${clientId}`)).json();
      const clientScopes = await (await admin(`${realm}/client-scopes`)).json();
      const roleScope = clientScopes.find(scope => scope.name === 'company-directory-admin');
      assert(roleScope, 'Company directory service accounts need the dedicated realm-management role scope');
      assert.equal((await admin(`${realm}/clients/${client.id}/default-client-scopes/${roleScope.id}`, { method: 'PUT' })).status, 204);
      const adminApiScope = clientScopes.find(scope => scope.name === 'kc-admin-api');
      assert(adminApiScope, 'Keycloak Admin REST API scope must be available');
      assert.equal((await admin(`${realm}/clients/${client.id}/default-client-scopes/${adminApiScope.id}`, { method: 'PUT' })).status, 204);
      const account = await (await admin(`${realm}/clients/${client.id}/service-account-user`)).json();
      const [management] = await (await admin(`${realm}/clients?clientId=realm-management`)).json();
      const roles = await (await admin(`${realm}/clients/${management.id}/roles`)).json();
      const readOnlyDirectoryRoles = roles.filter(role => ['query-users', 'view-users'].includes(role.name));
      assert.deepEqual(readOnlyDirectoryRoles.map(role => role.name).sort(), ['query-users', 'view-users']);
      assert.equal((await admin(`${realm}/client-scopes/${roleScope.id}/scope-mappings/clients/${management.id}`, { method: 'POST', body: JSON.stringify(readOnlyDirectoryRoles) })).status, 204);
      assert.equal((await admin(`${realm}/users/${account.id}/role-mappings/clients/${management.id}`, { method: 'POST', body: JSON.stringify(readOnlyDirectoryRoles) })).status, 204);
      const mapped = await (await admin(`${realm}/users/${account.id}/role-mappings/clients/${management.id}`)).json();
      assert.deepEqual(mapped.map(role => role.name).sort(), ['query-users', 'view-users']);
      const targetName = `company-admin-${randomBytes(4).toString('hex')}`;
      const targetPassword = randomBytes(32).toString('base64url');
      const createdTarget = await admin(`${realm}/users`, { method: 'POST', body: JSON.stringify({ username: targetName, enabled: true, email: 'company@example.invalid', emailVerified: true, firstName: 'Company', lastName: 'Administrator', credentials: [{ type: 'password', value: targetPassword, temporary: false }] }) });
      assert.equal(createdTarget.status, 201);
      // The realm may canonicalize usernames to email. Use the identity returned by creation.
      const targetId = createdTarget.headers.get('location')?.split('/').at(-1);
      assert(targetId, 'Created directory fixture must provide a Location');
      const target = await (await admin(`${realm}/users/${encodeURIComponent(targetId)}`)).json();
      assert.equal(target.id, targetId);
      const role = await (await admin(`${realm}/roles/COMPANY_ADMIN`)).json();
      assert.equal((await admin(`${realm}/users/${target.id}/role-mappings/realm`, { method: 'POST', body: JSON.stringify([role]) })).status, 204);
      return { clientId, clientSecret, subject: target.id, username: targetName, password: targetPassword };
    },
    async verifyConfiguration() {
      const representation = await (await admin(realm)).json();
      assert.equal(representation.defaultSignatureAlgorithm, 'RS256');
      assert.equal(representation.registrationAllowed, true, 'Self-registration must be enabled');
      assert.equal(representation.registrationEmailAsUsername, true, 'Self-registration must identify accounts by email');
      assert.equal(representation.verifyEmail, true, 'New accounts must require email verification');
      const profileResponse = await admin(`${realm}/users/profile`);
      assert.equal(profileResponse.status, 200, 'Managed user profile must be available');
      const profile = await profileResponse.json();
      const attributes = new Map(profile.attributes.map(attribute => [attribute.name, attribute]));
      for (const name of ['document_type', 'document_number']) {
        assert(attributes.has(name), `Managed profile must include ${name}`);
        assert.deepEqual(attributes.get(name).permissions.edit, ['admin', 'user']);
      }
      assert.deepEqual(attributes.get('email').permissions.edit, ['admin'], 'Users must not be able to edit email in their profile');
      assert.deepEqual(attributes.get('document_type').validations.options.options, ['CC', 'CE', 'TI', 'RC', 'PA', 'PPT']);
      assert.equal(attributes.get('document_number').validations.pattern.pattern, '^[A-Za-z0-9-]+$');
      const existingUsers = await (await admin(`${realm}/users?username=${encodeURIComponent(username)}&exact=true`)).json();
      assert.equal(existingUsers.length, 1, 'Existing users must remain available after enabling the managed profile');
      assert.equal(existingUsers[0].credentials, undefined, 'User reads must not expose credentials');
      const registration = await fetch(`${base}/realms/${realm}/protocol/openid-connect/registrations?${new URLSearchParams({
        client_id: 'invoices-web', response_type: 'code', scope: 'openid', redirect_uri: `${origins[0]}/auth/callback`,
        code_challenge: 'a'.repeat(43), code_challenge_method: 'S256',
      })}`);
      assert.equal(registration.status, 200, 'The Keycloak registration form must be reachable');
      const registrationHtml = await registration.text();
      for (const field of ['email', 'password', 'document_type', 'document_number']) assert(registrationHtml.includes(field), `Registration must render ${field}`);
      const userPayload = (suffix, documentType, documentNumber) => ({
        username: `profile-${suffix}@example.invalid`, email: `profile-${suffix}@example.invalid`, enabled: true,
        firstName: 'Perfil', lastName: 'Colombiano',
        attributes: { document_type: [documentType], document_number: [documentNumber] },
      });
      assert.equal((await admin(`${realm}/users`, { method: 'POST', body: JSON.stringify(userPayload(`valid-${Date.now()}`, 'CC', '10203040')) })).status, 201);
      assert.equal((await admin(`${realm}/users`, { method: 'POST', body: JSON.stringify(userPayload(`type-${Date.now()}`, 'DNI', '10203040')) })).status, 400, 'Unknown Colombian document types must be rejected');
      assert.equal((await admin(`${realm}/users`, { method: 'POST', body: JSON.stringify(userPayload(`number-${Date.now()}`, 'CC', '12 30')) })).status, 400, 'Invalid document number characters must be rejected');
      const clients = await (await admin(`${realm}/clients?clientId=invoices-web`)).json();
      assert.equal(clients[0].publicClient, true);
      assert.equal(clients[0].directAccessGrantsEnabled, false);
      assert.equal(clients[0].implicitFlowEnabled, false);
      assert.equal(clients[0].serviceAccountsEnabled, false);
      assert.equal(clients[0].attributes['pkce.code.challenge.method'], 'S256');
      const scopes = await (await admin(`${realm}/clients/${clients[0].id}/default-client-scopes`)).json();
      const basic = scopes.find(scope => scope.name === 'basic');
      assert(basic, 'The subject mapper scope must be assigned by default');
      const mappers = await (await admin(`${realm}/client-scopes/${basic.id}/protocol-mappers/models`)).json();
      assert(mappers.some(mapper => mapper.protocolMapper === 'oidc-sub-mapper' && mapper.config['access.token.claim'] === 'true'), 'Access Tokens must include a verified subject');
      const roles = await (await admin(`${realm}/roles`)).json();
      for (const name of ['APP_ADMIN', 'COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER']) assert(roles.some(role => role.name === name));
      const denied = await fetch(`${base}/realms/${realm}/protocol/openid-connect/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: 'invoices-web', username, password }) });
      assert.equal(denied.status, 400);
      for (const query of [
        { response_type: 'token', redirect_uri: `${origins[0]}/auth/callback` },
        { response_type: 'code', redirect_uri: 'https://untrusted.invalid/callback', code_challenge: 'a'.repeat(43), code_challenge_method: 'S256' },
        { response_type: 'code', redirect_uri: `${origins[0]}/auth/callback` },
        { response_type: 'code', redirect_uri: `${origins[0]}/auth/callback`, code_challenge: 'a'.repeat(43), code_challenge_method: 'plain' },
      ]) {
        const response = await fetch(`${base}/realms/${realm}/protocol/openid-connect/auth?${new URLSearchParams({ client_id: 'invoices-web', scope: 'openid', ...query })}`, { redirect: 'manual' });
        // Keycloak either renders a local error or redirects an OAuth error to an already validated URI.
        const location = response.headers.get('location');
        const target = location ? new URL(location) : undefined;
        const redirectedError = target && (target.searchParams.has('error') || new URLSearchParams(target.hash.slice(1)).has('error'));
        assert(response.status === 400 || ([302, 303].includes(response.status) && redirectedError), `Forbidden flow must fail: response_type=${query.response_type}, challenge=${query.code_challenge_method ?? 'missing'}, HTTP=${response.status}`);
        if (query.redirect_uri.includes('untrusted')) assert(!response.headers.get('location')?.includes('untrusted.invalid'));
      }
    },
    async close() {
      assert(realm.startsWith('invoices-auth-test-'));
      const response = await admin(realm, { method: 'DELETE' });
      assert([204, 404].includes(response.status), 'Only the fixture realm is removed');
    },
  };
}

export async function startKeycloakFixture(origins, options = {}) {
  const port = await freePort();
  const base = `http://localhost:${port}`;
  const name = `invoices-auth-test-${process.pid}-${randomBytes(3).toString('hex')}`;
  const env = { ...process.env, KC_BOOTSTRAP_ADMIN_USERNAME: `bootstrap-${randomBytes(6).toString('hex')}`, KC_BOOTSTRAP_ADMIN_PASSWORD: randomBytes(32).toString('base64url') };
  await command('docker', ['run', '--detach', '--name', name, '-p', `127.0.0.1:${port}:8080`, '-e', 'KC_BOOTSTRAP_ADMIN_USERNAME', '-e', 'KC_BOOTSTRAP_ADMIN_PASSWORD', keycloakImage, 'start-dev', '--hostname', base], { env });
  let fixture;
  try {
    await waitFor(`${base}/realms/master/.well-known/openid-configuration`);
    fixture = await createRealmFixture(base, env.KC_BOOTSTRAP_ADMIN_USERNAME, env.KC_BOOTSTRAP_ADMIN_PASSWORD, origins, options.accessTokenLifespan ?? 40);
    return { ...fixture, async restart() { await command('docker', ['restart', name]); await waitFor(`${base}/realms/${fixture.realm}/.well-known/openid-configuration`); }, async stop() { await command('docker', ['stop', name]); }, async start() { await command('docker', ['start', name]); await waitFor(`${base}/realms/${fixture.realm}/.well-known/openid-configuration`); }, async close() { try { await fixture.close(); } finally { await command('docker', ['rm', '-f', name]); } } };
  } catch (error) {
    const logs = await command('docker', ['logs', '--tail', '35', name]);
    await command('docker', ['rm', '-f', name]);
    const safeLogs = logs.replaceAll(env.KC_BOOTSTRAP_ADMIN_PASSWORD, '[redacted]').replaceAll(env.KC_BOOTSTRAP_ADMIN_USERNAME, '[test-admin]');
    throw new Error(`${error.message}\nKeycloak startup diagnostics:\n${safeLogs}`);
  }
}
