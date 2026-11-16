import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { command, createRealmFixture, freePort, startKeycloakFixture, waitFor } from './auth-fixture.mjs';
import { checkAuthentication } from './auth-browser-checks.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv.find(arg => arg.startsWith('--mode='))?.split('=')[1] ?? 'all';
if (!['all', 'host', 'compose'].includes(mode)) throw new Error('Use --mode=host, compose or all');

async function startApplication(directory, entry, args, env, readyUrl) {
  const child = spawn(process.execPath, [entry, ...args], { cwd: fileURLToPath(new URL(`../${directory}/`, import.meta.url)), env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  const record = data => { logs = (logs + data).slice(-4000); };
  child.stdout.on('data', record); child.stderr.on('data', record);
  const stop = async () => {
    if (child.exitCode !== null) return;
    if (process.platform === 'win32') await command('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']);
    else { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); }
  };
  try { await waitFor(readyUrl, 240_000, () => { if (child.exitCode !== null) throw new Error('Application stopped during startup'); }); }
  catch { await stop(); throw new Error(`Local ${directory} startup failed: ${logs}`); }
  stop.diagnostics = () => logs.split('\n').filter(line => line.includes('Identidad:') || line.includes('Variables inválidas:')).join('\n');
  return stop;
}

async function host() {
  const webPort = await freePort(); const apiPort = await freePort();
  const web = `http://localhost:${webPort}`; const api = `http://localhost:${apiPort}`;
  const fixture = await startKeycloakFixture([web]);
  let stopFrontend; let stopBackend;
  try {
    await fixture.verifyConfiguration();
    stopBackend = await startApplication('backend', 'node_modules/next/dist/bin/next', ['dev', '--hostname', '127.0.0.1', '--port', String(apiPort), '--webpack'], {
      NODE_ENV: 'development', MONGODB_URI: 'mongodb://127.0.0.1:1/invoices_auth_test', KEYCLOAK_ISSUER_URL: fixture.issuer, KEYCLOAK_AUDIENCE: 'invoices-api', KEYCLOAK_JWKS_URL: `${fixture.issuer}/protocol/openid-connect/certs`, NEXT_TELEMETRY_DISABLED: '1',
    }, `${api}/api/health`);
    stopFrontend = await startApplication('frontend', 'node_modules/vite/bin/vite.js', ['--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
      VITE_API_BASE_URL: '/api', API_PROXY_TARGET: api, VITE_KEYCLOAK_URL: fixture.base, VITE_KEYCLOAK_REALM: fixture.realm, VITE_KEYCLOAK_CLIENT_ID: 'invoices-web',
    }, web);
    console.log('Host: isolated applications and Keycloak ready.');
    await checkAuthentication({ web, api, fixture, label: 'Host', providerOutage: true });
  } catch (error) {
    if (stopBackend?.diagnostics()) console.error(stopBackend.diagnostics());
    throw error;
  } finally {
    try { await stopFrontend?.(); } finally {
      try { await stopBackend?.(); } finally { await fixture.start(); await fixture.close(); }
    }
  }
}

async function compose() {
  const suffix = randomBytes(5).toString('hex'); const project = `invoices-auth-test-${suffix}`;
  const webPort = await freePort(); const apiPort = await freePort(); const keycloakPort = await freePort(); const mongoPort = await freePort();
  const web = `http://localhost:${webPort}`; const api = `http://localhost:${apiPort}`; const keycloak = `http://localhost:${keycloakPort}`;
  const env = { ...process.env, FRONTEND_PORT: String(webPort), BACKEND_PORT: String(apiPort), MONGO_PORT: String(mongoPort), KEYCLOAK_PORT: String(keycloakPort), KEYCLOAK_PUBLIC_URL: keycloak, INVOICES_WEB_ORIGIN: web, KC_BOOTSTRAP_ADMIN_USERNAME: `bootstrap-${suffix}`, KC_BOOTSTRAP_ADMIN_PASSWORD: randomBytes(32).toString('base64url') };
  await mkdir(new URL('../.artifacts/', import.meta.url), { recursive: true });
  const override = fileURLToPath(new URL(`../.artifacts/${project}.json`, import.meta.url));
  const args = ['compose', '-p', project, '-f', 'compose.yaml', '-f', override];
  const run = (...tail) => command('docker', [...args, ...tail], { cwd: root, env });
  let fixture;
  const services = { frontend: { image: `${project}-frontend`, environment: {} }, backend: { image: `${project}-backend`, environment: { MONGODB_URI: 'mongodb://mongodb:27017/invoices_auth_test' } } };
  await writeFile(override, JSON.stringify({ services }));
  try {
    await run('up', '-d', '--wait', 'keycloak', 'mongodb');
    fixture = await createRealmFixture(keycloak, env.KC_BOOTSTRAP_ADMIN_USERNAME, env.KC_BOOTSTRAP_ADMIN_PASSWORD, [web]);
    await fixture.verifyConfiguration();
    await run('restart', 'keycloak'); await waitFor(`${fixture.issuer}/.well-known/openid-configuration`);
    await fixture.verifyConfiguration();
    services.frontend.environment = { VITE_KEYCLOAK_REALM: fixture.realm };
    services.backend.environment.KEYCLOAK_ISSUER_URL = fixture.issuer;
    services.backend.environment.KEYCLOAK_JWKS_URL = `http://keycloak:8080/realms/${fixture.realm}/protocol/openid-connect/certs`;
    await writeFile(override, JSON.stringify({ services }));
    console.log('Compose: building isolated application images.');
    await run('up', '--build', '-d', '--wait', 'backend', 'frontend');
    await waitFor(web); await waitFor(`${api}/api/health`);
    console.log('Compose: isolated applications and persistent Keycloak ready.');
    await checkAuthentication({ web, api, fixture: {
      ...fixture,
      stop: () => run('stop', 'keycloak'),
      async start() { await run('start', 'keycloak'); await waitFor(`${fixture.issuer}/.well-known/openid-configuration`); },
    }, label: 'Compose', providerOutage: true });
  } finally {
    try { if (fixture) await fixture.close(); } finally {
      // The random, task-owned project contains only disposable test data.
      if (!project.startsWith('invoices-auth-test-')) throw new Error('Unsafe fixture project');
      await run('down', '--volumes');
      await unlink(override);
    }
  }
}

try {
  if (mode !== 'compose') await host();
  if (mode !== 'host') await compose();
  console.log(`Authentication integration (${mode}) passed; temporary resources cleaned up.`);
} catch (error) {
  const message = String(error.message).replace(/([?&](?:code|state|session_state|id_token_hint)=)[^&#\s]+/g, '$1[redacted]').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted token]');
  console.error(message); process.exitCode = 1;
}
