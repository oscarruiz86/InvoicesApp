import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function withServer(uri, action, identity = {}) {
  const port = await freePort(); const base = `http://127.0.0.1:${port}`;
  const secretDirectory = await mkdtemp(join(tmpdir(), 'invoices-http-'));
  const mongoUriFile = uri === null ? '' : join(secretDirectory, 'mongo-uri');
  if (uri !== null) await writeFile(mongoUriFile, uri, { mode: 0o600 });
  let output = '';
  // Standalone enforces production mode (and HTTPS). The disposable local JWKS
  // fixture runs through Next dev so the existing local-only HTTP rule applies.
  const entry = identity.NODE_ENV === 'development'
    ? ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port), '--webpack']
    : ['.next/standalone/server.js'];
  const developmentRuntime = identity.NODE_ENV === 'development';
  const generatedConfig = developmentRuntime ? await Promise.all(['next-env.d.ts', 'tsconfig.json'].map(async name => [name, await readFile(join(process.cwd(), name))])) : [];
  const child = spawn(process.execPath, entry, {
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOSTNAME: '127.0.0.1', NEXT_TELEMETRY_DISABLED: '1',
      MONGODB_URI_FILE: developmentRuntime ? '' : mongoUriFile, MONGODB_URI: developmentRuntime ? uri ?? '' : '',
      NEXT_DIST_DIR: developmentRuntime ? '.next-http-test' : '',
      KEYCLOAK_ISSUER_URL: '', KEYCLOAK_AUDIENCE: '', KEYCLOAK_JWKS_URL: '', KEYCLOAK_DIRECTORY_ISSUER_URL: '',
      KEYCLOAK_DIRECTORY_CLIENT_ID: '', KEYCLOAK_DIRECTORY_CLIENT_SECRET: '', KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE: '', ...identity }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  try {
    let ready = false;
    let connectionFailure = '';
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error('Next stopped before listening: ' + output);
      try { await fetch(base + '/api/health', { signal: AbortSignal.timeout(10_000) }); ready = true; break; } catch (error) { connectionFailure = error.cause?.code ?? error.name; await delay(250); }
    }
    assert(ready, `Next did not become reachable (${connectionFailure}): ${output}`);
    await action(base);
  } finally {
    const exited = new Promise(resolve => child.once('exit', resolve));
    if (child.exitCode === null) { child.kill(); await exited; }
    await rm(secretDirectory, { recursive: true, force: true });
    if (developmentRuntime) {
      for (const [name, contents] of generatedConfig) await writeFile(join(process.cwd(), name), contents);
      await rm(join(process.cwd(), '.next-http-test'), { recursive: true, force: true });
    }
  }
}

async function inspect(base) {
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200); assert.match(health.headers.get('content-type'), /application\/json/);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await health.json(), { status: 'ok' });
  const specification = await (await fetch(base + '/api/openapi')).json();
  assert.equal(specification.openapi, '3.1.0');
  assert.equal(specification.components.schemas.Health.properties.status.const, 'ok');
  assert(specification.paths['/api/health'].get.responses['503']);
  assert.deepEqual(specification.paths['/api/auth/me'].get.security, [{ bearerAuth: [] }]);
  assert.equal(specification.components.securitySchemes.bearerAuth.scheme, 'bearer');
  for (const status of ['200', '401', '503', '500']) assert(specification.paths['/api/auth/me'].get.responses[status]);
  assert.deepEqual(specification.paths['/api/auth/permissions'].get.security, [{ bearerAuth: [] }]);
  for (const status of ['200', '400', '401', '403', '503', '500']) assert(specification.paths['/api/auth/permissions'].get.responses[status]);
  const docs = await fetch(base + '/api/docs'); assert.equal(docs.status, 200);
  const html = await docs.text(); assert(html.includes('/api/openapi')); assert(!html.includes('https://'));
  assert(html.includes('persistAuthorization:false'));
  for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js']) assert.equal((await fetch(base + '/docs-assets/' + asset)).status, 200);
  assert.equal((await fetch(base + '/api/auth/login')).status, 404);
  assert.equal((await fetch(base + '/api/invoices')).status, 404);
}

if (process.env.TEST_API_BASE_URL) await inspect(process.env.TEST_API_BASE_URL);
// An unreachable MongoDB proves that liveness does not connect to external services.
await withServer('mongodb://127.0.0.1:1/unreachable', inspect);
await withServer(null, async base => {
  for (const endpoint of ['health', 'openapi', 'docs']) {
    const response = await fetch(base + '/api/' + endpoint); assert.equal(response.status, 503);
    const body = await response.json(); assert.equal(body.error.code, 'CONFIGURATION_ERROR');
    assert(!JSON.stringify(body).includes('MONGODB_URI_FILE'));
  }
});
console.log('Real Next HTTP, OpenAPI, local Swagger assets and invalid-runtime checks passed.');

// Disposable signing keys exercise the real JWT and HTTP boundary; no user credential is used.
const pair = await generateKeyPair('RS256');
const publicKey = { ...await exportJWK(pair.publicKey), kid: 'authorization-http-test', alg: 'RS256' };
const keys = createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ keys: [publicKey] })); });
await new Promise(resolve => keys.listen(0, '127.0.0.1', resolve));
const issuer = `http://127.0.0.1:${keys.address().port}`;
try {
  const token = await new SignJWT({ sub: 'authorization-http-subject', typ: 'Bearer', realm_access: { roles: ['DRIVER'] } }).setProtectedHeader({ alg: 'RS256', kid: publicKey.kid }).setIssuer(issuer).setAudience('invoices-api').setExpirationTime('5m').sign(pair.privateKey);
  const testUri = process.env.AUTHORIZATION_TEST_MONGODB_URI;
  if (testUri && !new URL(testUri).pathname.endsWith('_test')) throw new Error('Authorization HTTP tests require an isolated _test database');
  await withServer(testUri ?? 'mongodb://127.0.0.1:1/unreachable_test', async base => {
    const url = base + '/api/auth/permissions';
    const anonymous = await fetch(url); assert.equal(anonymous.status, 401, JSON.stringify(await anonymous.clone().json()));
    assert.equal((await fetch(url, { headers: { Authorization: 'Bearer invalid.token.value' } })).status, 401);
    const headers = { Authorization: `Bearer ${token}` };
    const me = await fetch(base + '/api/auth/me', { headers }); assert.equal(me.status, 200);
    assert.equal((await me.json()).user.id, 'authorization-http-subject');
    if (testUri) {
      const permissions = await fetch(url, { headers }); assert.equal(permissions.status, 200);
      const body = await permissions.json(); assert.deepEqual(body.permissions, ['users:read', 'drivers:read']);
      assert.equal(body.subject, 'authorization-http-subject'); assert.equal(body.refreshAfterSeconds, 30);
      assert.equal((await fetch(url + '?scope=global', { headers })).status, 403);
    }
    assert.equal((await fetch(url + '?scope=organization', { headers })).status, 400);
    const unavailable = await fetch(url + '?scope=organization&companyId=c1', { headers });
    assert.equal(unavailable.status, testUri ? 403 : 503); assert.equal(unavailable.headers.get('cache-control'), 'no-store');
    assert.equal((await unavailable.json()).error.code, testUri ? 'FORBIDDEN' : 'AUTHORIZATION_UNAVAILABLE');
  }, { NODE_ENV: 'development', KEYCLOAK_ISSUER_URL: issuer, KEYCLOAK_AUDIENCE: 'invoices-api', KEYCLOAK_JWKS_URL: issuer + '/keys' });
} finally { keys.closeAllConnections(); await new Promise(resolve => keys.close(resolve)); }
console.log('Real authorization HTTP: JWT, configuration, request validation and unavailable organization checks passed.');
