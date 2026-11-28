import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const image = 'invoices-frontend:production-smoke';
const containerName = `invoices-nginx-smoke-${process.pid}`;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
function docker(args) {
  const result = spawnSync('docker', args, { cwd: repoRoot, encoding: 'utf8', windowsHide: true, timeout: 300_000 });
  if (result.status !== 0) throw new Error(`Docker command failed: ${result.stderr?.slice(-1200) || result.error?.message || result.status}`);
  return result.stdout.trim();
}
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

const port = await freePort();
docker(['build', '--target', 'production', '-f', 'frontend/Dockerfile', '-t', image,
  '--build-arg', 'VITE_API_BASE_URL=/api', '--build-arg', 'VITE_KEYCLOAK_URL=https://auth.oarg.casa',
  '--build-arg', 'VITE_KEYCLOAK_REALM=invoices', '--build-arg', 'VITE_KEYCLOAK_CLIENT_ID=smoke-test', '.']);
let container;
try {
  container = docker(['run', '-d', '--rm', '--name', containerName, '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--cpus', '1', '--memory', '256m', '--pids-limit', '64',
    '--add-host', 'backend:127.0.0.1', '-p', `127.0.0.1:${port}:8080`, image]);
  let response;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) }); if (response) break; }
    catch { await delay(250); }
  }
  assert(response, 'Nginx did not serve the frontend over HTTP');
  assert.equal(response.status, 200);
  const headers = response.headers;
  const csp = headers.get('content-security-policy') ?? '';
  assert(csp.includes("default-src 'self'") && csp.includes("frame-src 'self' https://auth.oarg.casa"));
  assert(!/script-src[^;]*unsafe-(?:inline|eval)/.test(csp));
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert(headers.get('permissions-policy')?.includes('camera=(self)'));
  const silentResponse = await fetch(`http://127.0.0.1:${port}/silent-check-sso.html`, { signal: AbortSignal.timeout(1000) });
  assert.equal(silentResponse.status, 200);
  const silentCsp = silentResponse.headers.get('content-security-policy') ?? '';
  assert(silentCsp.includes("script-src 'self'") && silentCsp.includes("frame-ancestors 'self'"));
  assert.equal(silentResponse.headers.get('x-frame-options'), 'SAMEORIGIN');
  const silentPage = await silentResponse.text();
  assert(silentPage.includes('src="/silent-check-sso.js"'));
  const silentScript = await fetch(`http://127.0.0.1:${port}/silent-check-sso.js`, { signal: AbortSignal.timeout(1000) });
  assert.equal(silentScript.status, 200);
  assert((await silentScript.text()).includes('parent.postMessage'));
  console.log('Restricted production Nginx served the frontend and required security headers over HTTP.');
} finally {
  if (container) spawnSync('docker', ['stop', container], { stdio: 'ignore', windowsHide: true, timeout: 20_000 });
}
