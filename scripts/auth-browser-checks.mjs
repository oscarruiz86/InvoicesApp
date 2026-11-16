import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 30_000 });

function validateSchema(value, schema, document) {
  if (schema.$ref) return validateSchema(value, schema.$ref.split('/').slice(1).reduce((node, part) => node[part], document), document);
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  assert([schema.type].flat().includes(type), 'Response type must match OpenAPI');
  if (schema.const !== undefined) assert(value === schema.const, 'Response constant must match OpenAPI');
  if (schema.enum) assert(schema.enum.includes(value), 'Response enum must match OpenAPI');
  if (type === 'object') {
    for (const key of schema.required ?? []) assert(Object.hasOwn(value, key), 'Required response property is missing');
    for (const key of Object.keys(value)) {
      if (schema.properties?.[key]) validateSchema(value[key], schema.properties[key], document);
      else assert(schema.additionalProperties !== false, 'Undocumented response property');
    }
  }
  if (type === 'array') { value.forEach(item => validateSchema(item, schema.items, document)); if (schema.uniqueItems) assert(new Set(value).size === value.length); }
  if (type === 'string' && schema.minLength) assert(value.length >= schema.minLength);
}
async function inspectResponse(response, status, document) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  if (status === 401) assert.equal(response.headers.get('www-authenticate'), 'Bearer');
  const body = await response.json();
  validateSchema(body, document.paths['/api/auth/me'].get.responses[status].content['application/json'].schema, document);
  return body;
}
async function submitLogin(page, fixture) {
  await page.locator('#username').fill(fixture.username);
  await page.locator('#password').fill(fixture.password);
  await page.locator('#kc-login').click();
}
async function assertNoPersistedTokens(page, tokens) {
  const leaked = await page.evaluate(values => {
    const storage = JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie });
    return values.filter(Boolean).some(value => storage.includes(value));
  }, [tokens.access_token, tokens.refresh_token, tokens.id_token]);
  assert.equal(leaked, false, 'Tokens must not be persisted');
  assert.equal(await page.evaluate(async () => (await indexedDB.databases()).length), 0, 'Authentication must not create an IndexedDB credential store');
}
async function checkSwagger(context, origin, token) {
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/api/docs`);
    await page.locator('.swagger-ui').waitFor();
    await page.getByRole('button', { name: 'Authorize', exact: true }).first().click();
    await page.locator('.dialog-ux input').fill(token);
    await page.locator('.dialog-ux').getByRole('button', { name: 'Apply credentials', exact: true }).click();
    await page.locator('.dialog-ux').getByRole('button', { name: 'Close', exact: true }).click();
    const execute = async expected => {
      const operation = page.locator('.opblock').filter({ has: page.locator('[data-path="/api/auth/me"]') });
      await operation.locator('.opblock-summary').click();
      await operation.getByRole('button', { name: 'Try it out' }).click();
      const response = page.waitForResponse(res => res.url().endsWith('/api/auth/me'));
      await operation.getByRole('button', { name: 'Execute', exact: true }).click();
      assert.equal((await response).status(), expected);
    };
    await execute(200);
    await page.reload(); await page.locator('.swagger-ui').waitFor();
    await execute(401);
  } finally { await page.close(); }
}

export async function checkAuthentication({ web, api, fixture, label, providerOutage = false }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(); // No trace, video, screenshots, HAR, or saved storage state.
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  let tokens;
  let tokenChecks;
  let refreshCount = 0;
  const statuses = [];
  page.on('response', async response => {
    if (response.url().endsWith('/api/auth/me') || response.url() === `${fixture.issuer}/protocol/openid-connect/token`) statuses.push({ endpoint: response.url().endsWith('/api/auth/me') ? 'me' : 'token', status: response.status() });
    if (response.url() === `${fixture.issuer}/protocol/openid-connect/token` && response.status() === 200) {
      tokens = await response.json();
      const payload = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString());
      tokenChecks = { issuerMatches: payload.iss === fixture.issuer, audienceMatches: [payload.aud].flat().includes('invoices-api'), bearer: payload.typ === 'Bearer', subjectPresent: Boolean(payload.sub), secondsRemaining: payload.exp - Math.floor(Date.now() / 1000) };
      if (response.request().postData()?.includes('grant_type=refresh_token')) refreshCount++;
    }
  });
  try {
    const document = await (await fetch(`${api}/api/openapi`)).json();
    assert.equal(document.openapi, '3.1.0');
    await inspectResponse(await fetch(`${api}/api/auth/me`), 401, document);
    // Authentication-only fixtures deliberately have no business database. The
    // confirmed identity now lands on context onboarding (with a recoverable
    // dependency error), rather than bypassing context selection at /session.
    await fetch(`${api}/api/auth/permissions`);
    await fetch(`${api}/api/organization-contexts`);
    assert.equal((await fetch(`${api}/api/health`)).status, 200);
    await page.goto(web);
    await expect(page.getByText('API disponible', { exact: true })).toBeVisible();
    let healthAttempts = 0;
    await page.route('**/api/health', route => ++healthAttempts === 1 ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue());
    await page.reload();
    await expect(page.getByText('API no disponible.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reintentar conexión' }).click();
    await expect(page.getByText('API disponible', { exact: true })).toBeVisible();
    await page.unroute('**/api/health');
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Public view must fit viewport');
    }
    await page.goto(`${web}/ruta-inexistente`);
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
    await page.getByRole('link', { name: 'Volver al inicio' }).click();
    await expect(page.getByText('API disponible', { exact: true })).toBeVisible();
    const authorization = page.waitForRequest(request => request.url().startsWith(`${fixture.issuer}/protocol/openid-connect/auth?`));
    await page.getByRole('link', { name: 'Mi sesión' }).click();
    const authorizationUrl = new URL((await authorization).url());
    assert.equal(authorizationUrl.searchParams.get('response_type'), 'code');
    assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
    assert(authorizationUrl.searchParams.get('state')); assert(authorizationUrl.searchParams.get('nonce'));
    assert.equal(authorizationUrl.searchParams.get('redirect_uri'), `${web}/auth/callback`);
    assert.equal(await page.getByRole('heading', { name: 'Selecciona una organización' }).count(), 0);
    await submitLogin(page, fixture);
    await expect(page.getByRole('heading', { name: 'Selecciona una organización' })).toBeVisible();
    await expect(page.getByText('Invoices App · Test Driver', { exact: true })).toBeVisible();
    await expect.poll(() => Boolean(tokens), { timeout: 5000 }).toBe(true);
    assert.equal(new URL(page.url()).pathname, '/organizations/select');
    assert.equal(new URL(page.url()).search, '');
    const claims = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString());
    assert.equal(claims.iss, fixture.issuer); assert([claims.aud].flat().includes('invoices-api'));
    const authenticated = await inspectResponse(await fetch(`${api}/api/auth/me`, { headers: { Authorization: `Bearer ${tokens.access_token}` } }), 200, document);
    assert.equal(authenticated.user.username, fixture.username); assert.deepEqual(authenticated.user.roles, ['DRIVER']);
    await inspectResponse(await fetch(`${api}/api/auth/me`, { headers: { Authorization: `Bearer ${tokens.id_token}` } }), 401, document);
    await inspectResponse(await fetch(`${api}/api/auth/me`, { headers: { Authorization: `Bearer ${tokens.refresh_token}` } }), 401, document);
    const badSignature = tokens.access_token.slice(0, -5) + 'xxxxx';
    await inspectResponse(await fetch(`${api}/api/auth/me`, { headers: { Authorization: `Bearer ${badSignature}`, 'X-Role': 'APP_ADMIN' } }), 401, document);
    await assertNoPersistedTokens(page, tokens);
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Session view must fit viewport');
    }
    console.log(`${label}: ten-step OIDC/API flow, profile, rejection and responsive view passed.`);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Selecciona una organización' })).toBeVisible();
    await expect.poll(() => refreshCount, { timeout: 60_000 }).toBeGreaterThan(0);
    await assertNoPersistedTokens(page, tokens);
    console.log(`${label}: SSO reload and automatic refresh passed.`);
    await checkSwagger(context, web, tokens.access_token);
    await checkSwagger(context, api, tokens.access_token);
    console.log(`${label}: Swagger direct/proxy 200 and 401 without persisted authorization passed.`);
    await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
    await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Mi sesión' }).click();
    await expect(page.locator('#username')).toBeVisible();
    await submitLogin(page, fixture); await expect(page.getByRole('heading', { name: 'Selecciona una organización' })).toBeVisible();
    await fixture.logoutSessions();
    await expect(page.getByText('La sesión terminó. Vuelve a iniciar sesión.', { exact: true })).toBeVisible({ timeout: 60_000 });
    assert.equal(await page.getByRole('heading', { name: 'Selecciona una organización' }).count(), 0);
    await page.getByRole('button', { name: 'Volver a iniciar sesión' }).click();
    await submitLogin(page, fixture); await expect(page.getByRole('heading', { name: 'Selecciona una organización' })).toBeVisible();
    console.log(`${label}: logout and rejected refresh recover without loops.`);
    if (providerOutage) {
      await fixture.stop();
      assert.equal((await fetch(`${api}/api/health`)).status, 200);
      for (const path of ['/api/docs', '/api/openapi', '/docs-assets/swagger-ui-bundle.js']) assert.equal((await fetch(`${api}${path}`)).status, 200, 'Technical documentation stays public during provider outage');
      await inspectResponse(await fetch(`${api}/api/auth/me`, { headers: { Authorization: `Bearer ${tokens.access_token}` } }), 200, document);
      await expect(page.getByText('La sesión terminó. Vuelve a iniciar sesión.', { exact: true })).toBeVisible({ timeout: 65_000 });
      await fixture.start();
      await page.getByRole('button', { name: 'Volver a iniciar sesión' }).click();
      // A provider restart can retain SSO; accept either SSO redirect or a login form.
      await Promise.race([page.locator('#username').waitFor(), page.getByRole('heading', { name: 'Selecciona una organización' }).waitFor()]);
      if (await page.locator('#username').isVisible()) await submitLogin(page, fixture);
      await expect(page.getByRole('heading', { name: 'Selecciona una organización' })).toBeVisible();
      console.log(`${label}: provider outage, cached JWT verification and recovery passed.`);
    }
    const invalid = await context.newPage();
    await invalid.goto(`${web}/auth/callback?error=access_denied&state=invalid`);
    await expect(invalid.getByText('No se pudo iniciar sesión. Puedes intentarlo nuevamente.')).toBeVisible();
    assert.equal(new URL(invalid.url()).search, ''); await invalid.close();
    const failure = await context.newPage();
    await failure.route('**/api/auth/me', route => route.fulfill({ status: 503, body: 'Temporarily unavailable' }));
    await failure.goto(`${web}/session`);
    await expect(failure.getByText('El servicio no está disponible. Puedes reintentar.')).toBeVisible();
    assert.equal(await failure.getByRole('heading', { name: 'Selecciona una organización' }).count(), 0);
    await failure.unroute('**/api/auth/me');
    await failure.getByRole('button', { name: 'Reintentar sesión' }).click();
    await expect(failure.getByRole('heading', { name: 'Selecciona una organización' })).toBeVisible(); await failure.close();
    const nonceContext = await browser.newContext();
    try {
      await nonceContext.addInitScript(origin => {
        if (location.origin !== origin || location.pathname !== '/auth/callback') return;
        for (const key of Object.keys(localStorage).filter(key => key.startsWith('kc-callback-'))) {
          const callback = JSON.parse(localStorage.getItem(key)); callback.nonce = 'invalid-test-nonce';
          localStorage.setItem(key, JSON.stringify(callback));
        }
      }, web);
      const noncePage = await nonceContext.newPage();
      let protectedRequest = false;
      noncePage.on('request', request => { if (request.url().endsWith('/api/auth/me')) protectedRequest = true; });
      await noncePage.goto(`${web}/session`); await submitLogin(noncePage, fixture);
      await expect(noncePage.getByText('No se pudo iniciar sesión. Puedes intentarlo nuevamente.')).toBeVisible();
      assert.equal(protectedRequest, false, 'A nonce mismatch must never reach the protected API');
    } finally { await nonceContext.close(); }
    console.log(`${label}: callback cancellation and API failure/retry passed.`);
  } catch (error) {
    console.error(`${label}: failure at ${new URL(page.url()).pathname}; endpoint statuses: ${JSON.stringify(statuses)}; token checks: ${JSON.stringify(tokenChecks)}; alerts: ${JSON.stringify(await page.getByRole('alert').allTextContents())}`);
    if (tokens?.access_token) {
      const { jwtVerify, createRemoteJWKSet } = await import('../backend/node_modules/jose/dist/webapi/index.js');
      try {
        await jwtVerify(tokens.access_token, createRemoteJWKSet(new URL(`${fixture.issuer}/protocol/openid-connect/certs`)), { issuer: fixture.issuer, audience: 'invoices-api', algorithms: ['RS256'], requiredClaims: ['exp', 'sub', 'iss', 'aud'], clockTolerance: 30 });
        console.error(`${label}: independent JWT verification succeeded; direct API status ${(await fetch(`${api}/api/auth/me`, { headers: { Authorization: `Bearer ${tokens.access_token}` } })).status}`);
      } catch (verificationError) { console.error(`${label}: independent JWT verification category ${verificationError.code ?? verificationError.name}`); }
    }
    const safeMessage = String(error.message).replaceAll(fixture.password, '[redacted credential]').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted token]');
    throw new Error(safeMessage);
  } finally { await context.close(); await browser.close(); }
}
