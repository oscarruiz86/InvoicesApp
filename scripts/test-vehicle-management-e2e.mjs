import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { command, freePort } from './auth-fixture.mjs';
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run npm --prefix frontend run test:e2e:prepared');
const backend = fileURLToPath(new URL('../backend/', import.meta.url));
const frontend = fileURLToPath(new URL('../frontend/', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'vehicle-e2e-'));
const processes = [];
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let failure;
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  child.once('error', error => { failure = error; });
  const stopped = new Promise(resolve => { child.once('close', resolve); });
  const handle = { process: child, stopped, output: () => output, failure: () => failure }; processes.push(handle); return handle;
}
async function ready(url, handle) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (handle.failure()) throw handle.failure();
    if (handle.process.exitCode !== null) throw new Error('Test server stopped: ' + handle.output());
    try { const response = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (response.ok) return; } catch { /* Wait for readiness. */ }
    await delay(200);
  }
  throw new Error('Test server did not become ready: ' + handle.output());
}
try {
  const backendPort = await freePort(), frontendPort = await freePort();
  const backendUrl = `http://127.0.0.1:${backendPort}`, frontendUrl = `http://127.0.0.1:${frontendPort}`;
  const mongoFile = join(temporary, 'mongo-uri');
  // Health/OpenAPI/Swagger do not open a database; every business scenario uses an explicit test harness.
  await writeFile(mongoFile, 'mongodb://127.0.0.1:1/vehicle_e2e_test', { mode: 0o600 });
  const api = start(['.next/standalone/server.js'], backend, { ...process.env,
    NODE_ENV: 'production', PORT: String(backendPort), HOSTNAME: '127.0.0.1', MONGODB_URI: '', MONGODB_URI_FILE: mongoFile,
    KEYCLOAK_ISSUER_URL: '', KEYCLOAK_AUDIENCE: '', KEYCLOAK_JWKS_URL: '', KEYCLOAK_DIRECTORY_ISSUER_URL: '', KEYCLOAK_DIRECTORY_CLIENT_ID: '',
    KEYCLOAK_DIRECTORY_CLIENT_SECRET: '', KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE: '', SMTP_ENABLED: 'false', NEXT_DIST_DIR: '',
  });
  await ready(backendUrl + '/api/health', api);
  const web = start(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'], frontend,
    { ...process.env, API_PROXY_TARGET: backendUrl });
  await ready(frontendUrl, web);
  console.log('Running complete browser suite through the isolated Vite/standalone proxy.');
  console.log(await command(process.execPath, [npm, 'run', 'test:e2e'], { cwd: frontend, env: { ...process.env, E2E_BASE_URL: frontendUrl } }));
} finally {
  for (const handle of processes.reverse()) {
    if (handle.process.exitCode === null) handle.process.kill();
    await handle.stopped;
  }
  await rm(temporary, { recursive: true, force: true });
}
