import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { command, freePort, startKeycloakFixture, waitFor } from './auth-fixture.mjs';
import { grantCeiling } from '../backend/src/modules/identity/domain/permissions.ts';
const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const requireFrontend = createRequire(new URL('../frontend/package.json', import.meta.url));
const mongoose = requireBackend('mongoose');
const { chromium, expect: baseExpect } = requireFrontend('@playwright/test');
const expect = baseExpect.configure({ timeout: 30_000 });
const uri = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27019/invoices_context_test';
if (!new URL(uri).pathname.endsWith('_test')) throw new Error('Use an isolated _test database');
const database = `invoices_context_e2e_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const webPort = await freePort(); const apiPort = await freePort();
const web = `http://localhost:${webPort}`; const api = `http://127.0.0.1:${apiPort}`;
let fixture; let browser; let diagnosticPage; const network = []; const stops = [];
async function start(directory, entry, args, environment, url) {
  const child = spawn(process.execPath, [entry, ...args], { cwd: fileURLToPath(new URL(`../${directory}/`, import.meta.url)), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...environment } });
  let diagnostics = ''; child.stdout.on('data', value => { diagnostics = (diagnostics + value).slice(-3000); }); child.stderr.on('data', value => { diagnostics = (diagnostics + value).slice(-3000); });
  stops.push(async () => { if (child.exitCode === null) { if (process.platform === 'win32') await command('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']); else child.kill(); } });
  await waitFor(url, 180_000, () => { if (child.exitCode !== null) throw new Error(`${directory} startup failed: ${diagnostics}`); });
}
try {
  await connection.asPromise();
  await connection.collection('authorization_policies').insertOne({ _id: 'active', version: 1, grants: grantCeiling, pendingEvents: [] });
  fixture = await startKeycloakFixture([web]);
  console.log('Context fixture: isolated Keycloak ready.');
  const subject = await fixture.userId();
  const state = { active: true, revision: 1, updatedAt: new Date() };
  await connection.collection('organizations').insertMany([
    { id: 't1', type: 'THIRD_PARTY', name: 'Transportes Uno', ...state }, { id: 't2', type: 'THIRD_PARTY', name: 'Transportes Dos', ...state },
    { id: 'c1', type: 'COMPANY', name: 'Empresa Uno', ...state }, { id: 'c2', type: 'COMPANY', name: 'Empresa Dos', ...state },
  ]);
  await start('backend', 'node_modules/next/dist/bin/next', ['dev', '--hostname', '127.0.0.1', '--port', String(apiPort), '--webpack'], { NODE_ENV: 'development', MONGODB_URI: uri.replace(/\/[^/]+$/, '/' + database), KEYCLOAK_ISSUER_URL: fixture.issuer, KEYCLOAK_AUDIENCE: 'invoices-api', KEYCLOAK_JWKS_URL: `${fixture.issuer}/protocol/openid-connect/certs`, NEXT_TELEMETRY_DISABLED: '1' }, api + '/api/health');
  // Compile dev handlers before measuring the production transport's five-second timeout.
  for (const endpoint of ['/api/auth/me', '/api/auth/permissions', '/api/organization-contexts', '/api/organization-contexts/resolve']) {
    const warm = await fetch(api + endpoint, { method: endpoint.endsWith('/resolve') ? 'POST' : 'GET', signal: AbortSignal.timeout(120_000) });
    assert.equal(warm.status, 401);
  }
  await start('frontend', 'node_modules/vite/bin/vite.js', ['--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], { VITE_API_BASE_URL: '/api', API_PROXY_TARGET: api, VITE_KEYCLOAK_URL: fixture.base, VITE_KEYCLOAK_REALM: fixture.realm, VITE_KEYCLOAK_CLIENT_ID: 'invoices-web' }, web);
  console.log('Context fixture: API and frontend ready.');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const page = await context.newPage(); let token; let loginRequests = 0;
  diagnosticPage = page;
  page.on('pageerror', error => network.push('pageerror: ' + error.message));
  page.on('response', response => { if (new URL(response.url()).pathname.startsWith('/api/')) network.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  page.on('request', request => { if (request.url().includes('/protocol/openid-connect/auth?')) loginRequests++; });
  page.on('response', async response => { if (response.url().endsWith('/protocol/openid-connect/token') && response.ok()) { const body = await response.json(); token = body.access_token; } });
  const login = async target => {
    await target.goto(web + '/session');
    await target.locator('#username').fill(fixture.username); await target.locator('#password').fill(fixture.password); await target.locator('#kc-login').click();
  };
  await login(page);
  await expect(page.getByText('No tienes organizaciones ni contextos autorizados disponibles.')).toBeVisible();
  const associate = (id, capability) => connection.collection('organization_associations').insertOne({ id: randomUUID(), subject, organizationId: id, capability, ...state });
  await associate('t1', 'DRIVER');
  await page.reload();
  await expect(page.getByText('Contexto: Transportes Uno (Tercero)')).toBeVisible();
  await associate('t2', 'DRIVER');
  const before = loginRequests;
  await page.getByRole('button', { name: 'Cambiar organización' }).click();
  await expect(page.getByRole('button', { name: 'Seleccionar Transportes Dos' })).toBeVisible();
  await page.getByRole('button', { name: 'Seleccionar Transportes Dos' }).click();
  await expect(page.getByText('Contexto: Transportes Dos (Tercero)')).toBeVisible();
  assert.equal(loginRequests, before, 'Switch must not authenticate again');
  await page.reload(); await expect(page.getByText('Contexto: Transportes Dos (Tercero)')).toBeVisible();
  const second = await context.newPage(); await second.goto(web + '/session');
  await expect(second.getByRole('heading', { name: 'Selecciona una organización' })).toBeVisible();
  await second.getByRole('button', { name: 'Seleccionar Transportes Uno' }).click();
  await expect(second.getByText('Contexto: Transportes Uno (Tercero)')).toBeVisible();
  await expect(page.getByText('Contexto: Transportes Dos (Tercero)')).toBeVisible();
  const duplicated = await context.newPage();
  const copiedPreference = await page.evaluate(() => sessionStorage.getItem('invoices.organization-context.v1'));
  await duplicated.addInitScript(value => { if (value) sessionStorage.setItem('invoices.organization-context.v1', value); }, copiedPreference);
  await duplicated.goto(web + '/session'); await expect(duplicated.getByText('Contexto: Transportes Dos (Tercero)')).toBeVisible();
  await duplicated.close();
  const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
  assert(token, 'Real Keycloak token must be observed in memory only');
  let response = await fetch(api + '/api/organization-contexts', { headers: headers() });
  assert.equal(response.status, 200); assert.equal((await response.json()).organizations.length, 2);
  response = await fetch(api + '/api/organization-contexts/resolve', { method: 'POST', headers: headers(), body: JSON.stringify({ selection: { kind: 'ORGANIZATION', organizationId: 'c1', organizationType: 'COMPANY' }, reason: 'SWITCH' }) });
  assert.equal(response.status, 403);
  response = await fetch(api + '/api/organization-contexts/resolve', { method: 'POST', headers: headers(), body: '{' }); assert.equal(response.status, 400);
  assert.equal((await fetch(api + '/api/organization-contexts')).status, 401);
  await connection.collection('organization_associations').updateOne({ subject, organizationId: 't2' }, { $set: { active: false }, $inc: { revision: 1 } });
  response = await fetch(api + '/api/auth/permissions?scope=organization&thirdPartyId=t2', { headers: headers() }); assert.equal(response.status, 403);
  await page.reload(); await expect(page.getByText('Contexto: Transportes Uno (Tercero)')).toBeVisible();
  await page.evaluate(subject => sessionStorage.setItem('invoices.organization-context.v1', JSON.stringify({ version: 1, subject, selection: { kind: 'ORGANIZATION', organizationId: 'c1', organizationType: 'COMPANY' } })), subject);
  await page.reload(); await expect(page.getByText('Contexto: Transportes Uno (Tercero)')).toBeVisible();
  const artifactDirectory = new URL('../.artifacts/organization-context/', import.meta.url); await mkdir(artifactDirectory, { recursive: true });
  await page.getByRole('button', { name: 'Cambiar organización' }).click();
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.getByRole('heading', { name: 'Selecciona una organización' })).toBeVisible();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: fileURLToPath(new URL(`selector-${width}.png`, artifactDirectory)), fullPage: true, animations: 'disabled' });
    const button = page.getByRole('button', { name: 'Seleccionar Transportes Uno' }); assert((await button.boundingBox()).height >= 44);
    await button.focus(); await expect(button).toBeFocused();
    const accessible = await page.locator('body').ariaSnapshot(); assert(accessible.includes('Selecciona una organización') && accessible.includes('Seleccionar Transportes Uno'));
  }
  await page.getByRole('button', { name: 'Seleccionar Transportes Uno' }).press('Enter');
  await expect(page.getByText('Contexto: Transportes Uno (Tercero)')).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  assert(!stored.includes(token) && !stored.includes('permissions') && !stored.includes('Transportes'));
  const swagger = await context.newPage(); await swagger.goto(api + '/api/docs'); await swagger.locator('.swagger-ui').waitFor();
  await swagger.getByRole('button', { name: 'Authorize', exact: true }).first().click();
  await swagger.locator('.dialog-ux input').fill(token);
  await swagger.locator('.dialog-ux').getByRole('button', { name: 'Apply credentials', exact: true }).click();
  await swagger.locator('.dialog-ux').getByRole('button', { name: 'Close', exact: true }).click();
  for (const endpoint of ['/api/organization-contexts', '/api/organization-contexts/resolve']) {
    const operation = swagger.locator('.opblock').filter({ has: swagger.locator(`[data-path="${endpoint}"]`) });
    await operation.locator('.opblock-summary').click(); await operation.getByRole('button', { name: 'Try it out' }).click();
    if (endpoint.endsWith('/resolve')) await operation.locator('textarea').fill(JSON.stringify({ selection: { kind: 'ORGANIZATION', organizationId: 't1', organizationType: 'THIRD_PARTY' }, reason: 'RESTORE' }));
    const responsePromise = swagger.waitForResponse(response => response.url().endsWith(endpoint));
    await operation.getByRole('button', { name: 'Execute', exact: true }).click(); assert.equal((await responsePromise).status(), 200);
  }
  await swagger.reload(); await swagger.locator('.swagger-ui').waitFor();
  assert.equal(await swagger.evaluate(() => sessionStorage.getItem('authorized')), null);
  await swagger.close();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).first().click();
  await expect(second.getByText('Contexto: Transportes Uno (Tercero)')).toHaveCount(0);
  await context.close();
  // A fresh login picks up new provider roles without modifying a token to switch context.
  await fixture.setApplicationRoles(['APP_ADMIN', 'COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER']);
  await associate('c1', 'COMPANY_ADMIN'); await associate('c2', 'COMPANY_ADMIN');
  await connection.collection('organization_associations').updateOne({ subject, organizationId: 't2' }, { $set: { active: true }, $inc: { revision: 1 } });
  const adminContext = await browser.newContext(); const adminPage = await adminContext.newPage(); await login(adminPage);
  await expect(adminPage.getByText('Contexto: GLOBAL')).toBeVisible();
  await adminPage.getByRole('button', { name: 'Cambiar organización' }).click();
  await adminPage.getByRole('button', { name: 'Seleccionar Empresa Uno' }).click(); await expect(adminPage.getByText('Contexto: Empresa Uno (Empresa)')).toBeVisible();
  await adminPage.getByRole('button', { name: 'Cambiar organización' }).click();
  await adminPage.getByRole('button', { name: 'Seleccionar Empresa Dos' }).click(); await expect(adminPage.getByText('Contexto: Empresa Dos (Empresa)')).toBeVisible();
  await connection.collection('authorization_policies').updateOne({ _id: 'active' }, { $set: { grants: [] }, $inc: { version: 1 } });
  await adminPage.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(adminPage.getByText('Contexto: Empresa Dos (Empresa)')).toHaveCount(0);
  await connection.collection('authorization_policies').updateOne({ _id: 'active' }, { $set: { grants: grantCeiling }, $inc: { version: 1 } });
  await fixture.logoutSessions();
  await adminPage.reload(); await expect(adminPage.locator('#username')).toBeVisible();
  await adminContext.close();
  await fixture.setApplicationRoles(['COMPANY_ADMIN']);
  const companyContext = await browser.newContext(); const companyPage = await companyContext.newPage(); await login(companyPage);
  await expect(companyPage.getByRole('button', { name: 'Seleccionar Empresa Uno' })).toBeVisible();
  await expect(companyPage.getByRole('button', { name: 'Seleccionar Empresa Dos' })).toBeVisible();
  await connection.collection('organizations').updateOne({ id: 'c2' }, { $set: { active: false }, $inc: { revision: 1 } });
  await companyPage.reload(); await expect(companyPage.getByText('Contexto: Empresa Uno (Empresa)')).toBeVisible();
  await companyContext.close();
  assert(await connection.collection('organization_context_events').countDocuments({ result: 'allowed' }) > 0);
  console.log('Organization context: real Keycloak, MongoDB, REST and browser selection/switch/restore/revocation/tabs/mobile/logout checks passed.');
} catch (error) {
  if (diagnosticPage && !diagnosticPage.isClosed()) {
    console.error('UI diagnostic: ' + (await diagnosticPage.locator('body').innerText()).slice(0, 2000));
    console.error('API diagnostic: ' + network.slice(-20).join(', '));
  }
  console.error(String(error.message).replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted token]').replace(/([?&](?:code|state|session_state|id_token_hint)=)[^&#\s]+/g, '$1[redacted]'));
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const stop of stops.reverse()) await stop();
  await fixture?.close();
  if (connection.readyState === 1 && connection.name === database && /^invoices_context_e2e_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close();
}
