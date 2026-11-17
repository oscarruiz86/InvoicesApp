import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { command, freePort, keycloakImage, waitFor } from './auth-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const suffix = randomBytes(5).toString('hex');
const project = `keycloak-image-rollback-test-${suffix}`;
const imageA = `local/keycloak-secrets-test:${suffix}-primary`;
const imageB = `local/keycloak-secrets-test:${suffix}-rollback`;
const port = await freePort();
const base = `http://localhost:${port}`;
const artifacts = fileURLToPath(new URL(`../.artifacts/${project}/`, import.meta.url));
const secretsDirectory = fileURLToPath(new URL(`../.artifacts/${project}/secrets/`, import.meta.url));
const adminUsername = `rollback-admin-${suffix}`;
const adminPassword = randomBytes(32).toString('base64url');
const preservedUsername = `rollback-user-${suffix}`;
const environment = {
  ...process.env,
  KEYCLOAK_IMAGE: imageA,
  KEYCLOAK_PORT: String(port),
  KEYCLOAK_PUBLIC_URL: base,
  KEYCLOAK_SECRET_DIR: secretsDirectory,
  KC_BOOTSTRAP_ADMIN_USERNAME: adminUsername,
  INVOICES_WEB_ORIGIN: 'http://localhost:5173',
};
const compose = (...args) => command('docker', ['compose', '-p', project, ...args], { cwd: root, env: environment });
const redact = value => value.replaceAll(adminPassword, '[redacted]');
let adminToken;
let tokenExpiresAt = 0;

async function getAdminToken() {
  if (!adminToken || Date.now() >= tokenExpiresAt) {
    const login = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: adminUsername, password: adminPassword }),
    });
    assert.equal(login.status, 200, 'Isolated Keycloak administrator must authenticate');
    const credentials = await login.json();
    adminToken = credentials.access_token;
    tokenExpiresAt = Date.now() + Math.max(5, credentials.expires_in - 10) * 1000;
  }
  return adminToken;
}

async function adminRequest(path, options = {}) {
  const token = await getAdminToken();
  return fetch(`${base}/admin/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  });
}

async function imageId(containerId) {
  return (await command('docker', ['inspect', '--format', '{{.Image}}', containerId], { cwd: root, env: environment })).trim();
}

async function dataVolume(containerId) {
  return (await command('docker', ['inspect', '--format', '{{range .Mounts}}{{if eq .Destination "/opt/keycloak/data"}}{{.Name}}{{end}}{{end}}', containerId], { cwd: root, env: environment })).trim();
}

try {
  await mkdir(secretsDirectory, { recursive: true });
  await writeFile(`${secretsDirectory}/keycloak-bootstrap-admin-password`, adminPassword, { flag: 'wx' });

  for (const [tag, revision] of [[imageA, 'primary'], [imageB, 'rollback']]) {
    await command('docker', [
      'build', '--file', 'keycloak/Dockerfile.rollback-test',
      '--build-arg', `KEYCLOAK_BASE=${keycloakImage}`,
      '--build-arg', `COMPATIBILITY_REVISION=${revision}`,
      '--tag', tag, 'keycloak',
    ], { cwd: root, env: environment });
  }

  const rendered = await compose('config');
  assert(!rendered.includes(adminPassword), 'Rendered Compose configuration must not contain the bootstrap secret');
  await compose('--profile', 'keycloak-bootstrap', 'run', '--rm', 'keycloak-bootstrap');
  await compose('up', '-d', '--wait', 'keycloak');
  await waitFor(`${base}/realms/invoices/.well-known/openid-configuration`);

  const created = await adminRequest('realms/invoices/users', {
    method: 'POST',
    body: JSON.stringify({ username: preservedUsername, enabled: true, email: `${preservedUsername}@example.invalid` }),
  });
  assert.equal(created.status, 201, 'Fixture user must exist before the image change');
  const userId = new URL(created.headers.get('location')).pathname.split('/').at(-1);
  assert(userId, 'Keycloak must return the fixture user id');

  const containerBefore = (await compose('ps', '-q', 'keycloak')).trim();
  assert(containerBefore, 'Primary Keycloak fixture must be running');
  const firstImageId = await imageId(containerBefore);
  const firstVolume = await dataVolume(containerBefore);
  assert(firstVolume.startsWith(`${project}_`), 'The test must use only its own named data volume');

  environment.KEYCLOAK_IMAGE = imageB;
  await compose('up', '-d', '--wait', '--no-deps', 'keycloak');
  await waitFor(`${base}/realms/invoices/.well-known/openid-configuration`);

  const containerAfter = (await compose('ps', '-q', 'keycloak')).trim();
  assert(containerAfter, 'Rollback Keycloak fixture must be running');
  const secondImageId = await imageId(containerAfter);
  const secondVolume = await dataVolume(containerAfter);
  assert.notEqual(secondImageId, firstImageId, 'Rollback must switch to the separately built compatible image');
  assert.equal(secondVolume, firstVolume, 'Rollback must reattach the same persistent volume');

  const preservedUser = await adminRequest(`realms/invoices/users/${userId}`);
  assert.equal(preservedUser.status, 200, 'Rollback must preserve data written before the image change');
  assert.equal((await preservedUser.json()).username, `${preservedUsername}@example.invalid`);

  const inspectedEnvironment = await command('docker', ['inspect', '--format', '{{json .Config.Env}}', containerAfter], { cwd: root, env: environment });
  assert(!inspectedEnvironment.includes(adminPassword), 'Persistent Keycloak configuration must not contain the secret');
  assert(!inspectedEnvironment.includes('KC_BOOTSTRAP_ADMIN_PASSWORD='), 'Persistent Keycloak must not receive an inline bootstrap password');
  const logs = await compose('logs', 'keycloak');
  assert(!logs.includes(adminPassword), 'Persistent Keycloak logs must not contain the secret');

  console.log('Keycloak image rollback passed: both images use the pinned 26.8.2 base digest, the same secret-file bootstrap works, the named volume and fixture user survive, and persistent config/logs contain no bootstrap secret.');
} catch (error) {
  throw new Error(redact(error.message));
} finally {
  if (!project.startsWith('keycloak-image-rollback-test-') || !imageA.includes(suffix) || !imageB.includes(suffix)) {
    throw new Error('Unsafe rollback fixture names; cleanup stopped');
  }
  try { await compose('down', '--volumes', '--remove-orphans'); }
  finally {
    try { await command('docker', ['image', 'rm', imageA, imageB], { cwd: root, env: environment }); }
    finally { await rm(artifacts, { recursive: true, force: true }); }
  }
}
