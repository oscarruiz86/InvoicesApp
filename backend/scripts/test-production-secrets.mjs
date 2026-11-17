import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(process.cwd(), '..');
const suffix = randomBytes(8).toString('hex');
const project = `runtime-secrets-${suffix}`;
const port = 18090 + Number.parseInt(suffix.slice(0, 3), 16) % 1000;
const secretDirectory = await mkdtemp(join(tmpdir(), `runtime-secrets-${suffix}-`));
const mongoUri = `mongodb://mongodb:27017/invoices_${suffix}?replicaSet=runtime-rs`;
const composeFile = join(root, 'compose.runtime-secrets.simulation.yaml');
const composeEnv = { ...process.env, SIMULATION_PROJECT: project, SIMULATION_SECRET_DIR: secretDirectory, SIMULATION_PORT: String(port) };

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: root, env: composeEnv, windowsHide: true, ...options });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.once('error', rejectRun);
    child.once('close', code => code === 0 ? resolveRun(stdout) : rejectRun(new Error(`Command failed (${code}): ${stderr.slice(-2000)}`)));
  });
}

// Docker's production worker runs as UID 1000; the host temp directory is private and mounts remain read-only.
await writeFile(join(secretDirectory, 'mongodb-uri'), mongoUri, { mode: 0o444 });
await writeFile(join(secretDirectory, 'payload-key'), randomBytes(32).toString('base64'), { mode: 0o444 });
let started = false;
try {
  started = true;
  await run('docker', ['compose', '--profile', 'worker', '-f', composeFile, 'up', '--build', '-d']);
  const container = (await run('docker', ['compose', '--profile', 'worker', '-f', composeFile, 'ps', '--all', '-q', 'notification-worker'])).trim();
  assert(container, 'worker container was not created');
  const deadline = Date.now() + 240_000;
  let metrics = '';
  while (Date.now() < deadline) {
    const state = JSON.parse(await run('docker', ['inspect', container]))[0].State;
    if (!state.Running) {
      const logs = await run('docker', ['compose', '--profile', 'worker', '-f', composeFile, 'logs', '--no-color', 'notification-worker']);
      const match = /notifications\.worker\.startup\.error ([A-Za-z0-9_]+)/.exec(logs);
      const safeCodes = new Set(['SECRET_UNAVAILABLE', 'MONGODB_CONFIGURATION_INVALID', 'MONGODB_CONNECTION_FAILED', 'NOTIFICATION_CONFIGURATION_INVALID', 'INVALID_ENCRYPTION_KEY', 'UNSUPPORTED_ENCRYPTION_KEY_VERSION', 'ERR_MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED', 'EACCES', 'ENOENT', 'MODULE_NOT_FOUND', 'WORKER_CONFIGURATION_INVALID', 'WORKER_MONGODB_UNAVAILABLE', 'WORKER_PAYLOAD_KEY_UNAVAILABLE', 'WORKER_HEALTH_LISTENER_FAILED', 'ConfigurationError', 'NotificationConfigurationError', 'IdentityProfileUnavailable']);
      const code = match && (safeCodes.has(match[1]) || match[1].startsWith('MODULE_NOT_FOUND_') || match[1].startsWith('STARTUP_')) ? match[1] : 'WORKER_STARTUP_FAILED';
      throw new Error(`production worker exited: ${code}`);
    }
    try {
      metrics = await run('docker', ['exec', container, 'node', '-e', "fetch('http://127.0.0.1:8090/metrics').then(async r=>{if(!r.ok)process.exitCode=1;process.stdout.write(await r.text())})"]);
      if (metrics.includes('notification_worker_ready 1')) break;
    } catch { /* Wait for the isolated worker to connect and poll Mongo. */ }
    await delay(1000);
  }
  if (!metrics.includes('notification_worker_ready 1')) {
    const logs = await run('docker', ['compose', '--profile', 'worker', '-f', composeFile, 'logs', '--no-color', 'notification-worker']);
    const codes = [...logs.matchAll(/notifications\.worker\.error ([A-Z0-9_]+)/g)].map(match => match[1]);
    const safeCodes = new Set(['MONGODB_CONNECTION_FAILED', 'SECRET_UNAVAILABLE', 'NOTIFICATION_CONFIGURATION_INVALID', 'WORKER_ERROR']);
    const code = codes.find(value => safeCodes.has(value)) ?? 'WORKER_NOT_READY';
    throw new Error(`production worker did not become ready: ${code}`);
  }
  assert(!metrics.includes(mongoUri), 'Mongo URI appeared in metrics');
  const inspect = JSON.parse(await run('docker', ['inspect', container]))[0];
  const observable = JSON.stringify({ env: inspect.Config.Env, cmd: inspect.Config.Cmd, entrypoint: inspect.Config.Entrypoint });
  assert(!observable.includes(mongoUri), 'Mongo URI appeared in container environment or command');
  const logs = await run('docker', ['compose', '--profile', 'worker', '-f', composeFile, 'logs', '--no-color', 'notification-worker']);
  assert(!logs.includes(mongoUri), 'Mongo URI appeared in worker logs');

  // Verify actual permission denial under the same UID that runs the worker. The
  // temporary file stays inside the container's tmpfs and is never a host secret.
  const deniedSecretPath = '/tmp/notification-secret-denied';
  await run('docker', ['exec', '--user', '0:0', container, 'sh', '-ceu', `printf 'denied-secret-value' > ${deniedSecretPath}; chmod 000 ${deniedSecretPath}`]);
  const deniedReadCheck = [
    "import { fileSecretReader } from './src/shared/infrastructure/file-secrets/file-secret-reader.ts';",
    `try { await fileSecretReader.read('${deniedSecretPath}'); process.stderr.write('secret unexpectedly readable'); process.exitCode = 1; }`,
    "catch (error) { if (error?.message !== 'SECRET_UNAVAILABLE') { process.stderr.write('unexpected secret-reader result'); process.exitCode = 2; } }",
  ].join(' ');
  await run('docker', ['exec', '--user', '1000:1000', container, 'node', '--no-warnings', '--experimental-loader', './scripts/typescript-loader.mjs', '--input-type=module', '-e', deniedReadCheck]);
  console.log('Production secret simulation passed: permitted mounted secret, denied secret under the worker UID, worker readiness, and no URI in container config, logs, or metrics.');
} finally {
  if (started) await run('docker', ['compose', '--profile', 'worker', '-f', composeFile, 'down', '--volumes', '--remove-orphans']).catch(() => undefined);
  await rm(secretDirectory, { recursive: true, force: true });
}
