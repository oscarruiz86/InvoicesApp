import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:https';
import net from 'node:net';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import mongoose from 'mongoose';
const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Vehicle HTTP tests require MONGODB_TEST_URI ending _test');
const database = `vehicle_http_${randomUUID().replaceAll('-', '')}_test`;
const targetUri = new URL(uri); targetUri.pathname = '/' + database;
const connection = mongoose.createConnection(targetUri.toString());
const directory = await mkdtemp(join(tmpdir(), 'lola-vehicle-http-'));
let child, keys, output = '';
try {
  await connection.asPromise();
  const certificate = join(directory, 'certificate.pem'), key = join(directory, 'key.pem');
  const tlsConfig = join(directory, 'tls.cnf');
  await writeFile(tlsConfig, '[req]\ndistinguished_name=dn\nprompt=no\nx509_extensions=v3\n[dn]\nCN=localhost\n[v3]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n');
  const generated = spawnSync(process.env.OPENSSL_PATH ?? 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-keyout', key, '-out', certificate, '-days', '1', '-config', tlsConfig], { windowsHide: true, encoding: 'utf8' });
  if (generated.status !== 0) throw new Error('Cannot create disposable TLS fixture: ' + generated.stderr);
  const pair = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(pair.publicKey), kid: 'vehicle-http-test', alg: 'RS256', use: 'sig' };
  keys = createServer({ key: await readFile(key), cert: await readFile(certificate) }, (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] })); });
  await new Promise(resolve => keys.listen(0, '127.0.0.1', resolve));
  const issuer = `https://127.0.0.1:${keys.address().port}/realms/vehicle-test`;
  const portServer = net.createServer(); await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
  const mongoFile = join(directory, 'mongo-uri'); await writeFile(mongoFile, targetUri.toString(), { mode: 0o600 });
  child = spawn(process.execPath, ['.next/standalone/server.js'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
    NODE_ENV: 'production', PORT: String(port), HOSTNAME: '127.0.0.1', MONGODB_URI: '', MONGODB_URI_FILE: mongoFile, NEXT_DIST_DIR: '',
    KEYCLOAK_ISSUER_URL: issuer, KEYCLOAK_JWKS_URL: issuer + '/keys', KEYCLOAK_AUDIENCE: 'invoices-api', NODE_EXTRA_CA_CERTS: certificate,
    KEYCLOAK_DIRECTORY_ISSUER_URL: '', KEYCLOAK_DIRECTORY_CLIENT_ID: '', KEYCLOAK_DIRECTORY_CLIENT_SECRET: '', KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE: '', SMTP_ENABLED: 'false',
  } });
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 400; i++) {
    if (child.exitCode !== null) throw new Error('Standalone exited: ' + output);
    try { await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) }); ready = true; break; } catch { await delay(100); }
  }
  assert(ready, output);
  const { createServer: createViteServer } = await import('vite');
  const { resolve } = await import('node:path');
  const loader = await createViteServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, resolve: { alias: { '@': resolve('src') } } });
  try { const { grantCeiling } = await loader.ssrLoadModule('/src/modules/identity/domain/permissions.ts'); await connection.collection('authorization_policies').insertOne({ _id: 'active', version: 1, grants: grantCeiling, pendingEvents: [] }); } finally { await loader.close(); }
  const thirdPartyId = new mongoose.Types.ObjectId().toString();
  await connection.collection('organizations').insertOne({ id: thirdPartyId, type: 'THIRD_PARTY', name: 'HTTP test', active: true, revision: 1 });
  await connection.collection('third_parties').insertOne({ _id: new mongoose.Types.ObjectId(thirdPartyId), status: 'ACTIVE', revision: 1 });
  for (const [subject, capability] of [['admin-http', 'THIRD_PARTY_ADMIN'], ['driver-http', 'DRIVER']]) {
    const membershipId = randomUUID();
    await connection.collection('organization_memberships').insertOne({ id: membershipId, subject, organizationId: thirdPartyId, status: 'ACTIVE', revision: 1 });
    await connection.collection('organization_associations').insertOne({ id: randomUUID(), membershipId, subject, organizationId: thirdPartyId, capability, assigned: true, active: true, revision: 1 });
  }
  async function token(subject) { return new SignJWT({ typ: 'Bearer', realm_access: { roles: ['APP_ADMIN'] } }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(issuer).setAudience('invoices-api').setSubject(subject).setIssuedAt().setExpirationTime('5m').sign(pair.privateKey); }
  const admin = await token('admin-http'), driver = await token('driver-http');
  const context = `scope=organization&thirdPartyId=${thirdPartyId}`;
  async function request(method, path, body, credential = admin, expected = 200, query = context) {
    const response = await fetch(`${base}/api/vehicles${path}?${query}`, { method, headers: { ...(credential ? { Authorization: `Bearer ${credential}` } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const json = await response.json(); assert.equal(response.status, expected, JSON.stringify(json)); assert.equal(response.headers.get('cache-control'), 'no-store'); return { response, json };
  }
  const anonymous = await request('GET', '', undefined, '', 401); assert.equal(anonymous.response.headers.get('www-authenticate'), 'Bearer');
  const fields = { plate: ' abc123 ', internalNumber: '0001', propertyCardNumber: '000123' };
  for (const body of [{ plate: 'ABC123' }, { ...fields, thirdPartyId }, { ...fields, currentDriver: null }]) await request('POST', '', body, admin, 400);
  for (const query of [`scope=global&thirdPartyId=${thirdPartyId}`, `${context}&page=1&page=2`, `${context}&companyId=${thirdPartyId}`, `${context}&pageSize=101`]) await request('GET', '', undefined, admin, 400, query);
  const created = await request('POST', '', fields, admin, 201); const vehicle = created.json;
  assert.equal(vehicle.plate, 'ABC123'); assert.equal(vehicle.internalNumber, '0001'); assert.equal(vehicle.assignmentState, 'UNASSIGNED'); assert.match(created.response.headers.get('location'), new RegExp(vehicle.id));
  const conflict = await request('POST', '', fields, admin, 409); assert.equal(conflict.json.error.code, 'VEHICLE_IDENTIFIER_CONFLICT');
  const updated = await request('PATCH', '/' + vehicle.id, { expectedVersion: 1, changes: { internalNumber: '0002' } }); assert.equal(updated.json.version, 2);
  await request('PATCH', '/' + vehicle.id, { expectedVersion: 1, changes: { plate: 'NEW123' } }, admin, 409);
  await request('PATCH', '/' + vehicle.id, { expectedVersion: 2, changes: { thirdPartyId } }, admin, 400);
  const deactivated = await request('PATCH', '/' + vehicle.id + '/status', { expectedVersion: 2, status: 'INACTIVE' }, admin, 200); assert.equal(deactivated.json.status, 'INACTIVE'); assert.equal(deactivated.json.assignmentState, 'UNASSIGNED');
  const driverPage = await request('GET', '', undefined, driver, 200); assert.equal(driverPage.json.total, 0);
  await request('GET', '/' + vehicle.id, undefined, driver, 404);
  const absent = await request('GET', '/' + new mongoose.Types.ObjectId().toString(), undefined, admin, 404); assert.equal(absent.json.error.code, 'RESOURCE_NOT_FOUND');
  const page = await request('GET', '', undefined, admin, 200, context + '&q=0002&sort=internalNumber&direction=desc'); assert.equal(page.json.total, 1);
  console.log('Vehicle standalone HTTP passed: real JWT/TLS, CRUD, safe deactivation, conflicts, pagination and assignment filtering.');
} catch (error) {
  console.error('Standalone test runtime output:', output);
  throw error;
} finally {
  if (child && child.exitCode === null) { const closed = new Promise(resolve => child.once('close', resolve)); child.kill(); await closed; }
  keys?.closeAllConnections(); if (keys) await new Promise(resolve => keys.close(resolve));
  if (connection.readyState === 1 && /^vehicle_http_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close(); await rm(directory, { recursive: true, force: true });
}
