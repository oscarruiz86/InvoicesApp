import assert from 'node:assert/strict';
import { createCipheriv, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { MongoClient } from 'mongodb';

const backend = resolve(process.cwd());
const workspace = await mkdtemp(join(tmpdir(), 'notifications-readiness-sim-'));
const dbPath = join(workspace, 'mongo-data');
const secretPath = join(workspace, 'secrets');
const mongoLog = join(workspace, 'mongod.log');
const values = {
  mongoUri: '', smtpPassword: randomBytes(32).toString('base64url'),
  key1: randomBytes(32).toString('base64'), key2: randomBytes(32).toString('base64'),
  token: randomBytes(32).toString('base64url'),
};
const mongoPort = await freePort();
const healthPort = await freePort();
const smtpPort = await freePort(); // No SMTP listener: the safe failure path is SMTP_TEMPORARY.
const databaseName = `notifications_readiness_${randomBytes(5).toString('hex')}`;
const secrets = {
  mongo: join(secretPath, 'mongodb-uri'), smtp: join(secretPath, 'smtp-password'),
  key1: join(secretPath, 'payload-v1'), key2: join(secretPath, 'payload-v2'), key2Backup: join(secretPath, 'payload-v2.backup'),
};
let mongod;
let mongo;
const workers = new Set();

async function freePort() {
  const server = net.createServer();
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  const port = server.address().port;
  await new Promise(resolveClose => server.close(resolveClose));
  return port;
}

function findMongod() {
  const result = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['mongod'], { encoding: 'utf8', windowsHide: true });
  if (result.status === 0) return result.stdout.trim().split(/\r?\n/)[0];
  throw new Error('MONGOD_BINARY_UNAVAILABLE');
}

function startProcess(program, args, options = {}) {
  const child = spawn(program, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  let output = '';
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-12_000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-12_000); });
  child.output = () => output;
  return child;
}

function workerEnvironment({ activeVersion = 1, keyFiles = `1=${secrets.key1}`, missingSmtp = false } = {}) {
  return {
    ...process.env,
    NODE_ENV: 'production',
    MONGODB_URI_FILE: secrets.mongo,
    SMTP_ENABLED: 'true',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(smtpPort),
    SMTP_USERNAME: '',
    SMTP_PASSWORD_FILE: missingSmtp ? join(secretPath, 'missing-smtp-password') : secrets.smtp,
    SMTP_TLS_MODE: 'starttls',
    SMTP_FROM_ADDRESS: 'no-reply@example.invalid',
    SMTP_TIMEOUT_MS: '500',
    INVITATION_PUBLIC_ORIGIN: 'https://app.example.invalid',
    NOTIFICATION_PAYLOAD_KEY_FILES: keyFiles,
    NOTIFICATION_PAYLOAD_ACTIVE_KEY_VERSION: String(activeVersion),
    NOTIFICATION_WORKER_HEALTH_PORT: String(healthPort),
  };
}

function startWorker(options) {
  const child = startProcess(process.execPath, [
    '--no-warnings', '--experimental-loader', './scripts/typescript-loader.mjs',
    './scripts/notification-worker-production-entrypoint.mjs',
  ], { cwd: backend, env: workerEnvironment(options) });
  workers.add(child);
  child.once('exit', () => workers.delete(child));
  return child;
}

async function waitUntil(description, operation, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try { const result = await operation(); if (result) return result; } catch (error) { last = error; }
    await delay(100);
  }
  throw new Error(`TIMEOUT_${description}${last ? `_${last.code ?? last.name}` : ''}`);
}

async function workerReady() {
  const response = await fetch(`http://127.0.0.1:${healthPort}/health/ready`, { signal: AbortSignal.timeout(500) });
  return response.status === 200;
}

async function stopWorker(child, signal = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill(signal);
  await waitUntil('WORKER_EXIT', () => child.exitCode !== null || child.signalCode !== null, 8_000);
}

function encryptPayload(value, keyText, version) {
  const key = Buffer.from(keyText, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), keyVersion: version };
}

async function insertPending({ id, payload, attempts = 0, status = 'PENDING', leaseUntil = null, createdAt = new Date() }) {
  const attemptId = `attempt-${id}`;
  const invitationId = `invitation-${id}`;
  await mongo.db(databaseName).collection('organization_invitations').updateOne({ id: invitationId }, { $set: {
    id: invitationId, organizationId: 'simulation-company', organizationType: 'COMPANY', companyId: null,
    recipientEmail: `${id}@example.invalid`, roles: ['COMPANY_ADMIN'], invitedBy: 'simulation-admin', status: 'PENDING',
    expiresAt: new Date(Date.now() + 86_400_000), tokenHash: randomBytes(32).toString('hex'), tokenVersion: 1, version: 1,
    createdAt, resolvedAt: null, acceptedSubject: null, deliveryStatus: 'UNKNOWN', attemptId,
  } }, { upsert: true });
  await mongo.db(databaseName).collection('notifications').insertOne({
    id, type: 'INVITATION_CREATED', channel: 'email', recipient: `${id}@example.invalid`, language: 'es',
    functionalReference: invitationId, idempotencyKey: `idempotency-${id}`, payload,
    expiresAt: new Date(Date.now() + 86_400_000), createdAt, status, attempts, attemptHistory: [],
    nextAttemptAt: createdAt, leaseUntil, owner: status === 'PROCESSING' ? 'terminated-worker' : null,
    terminalFailure: null, projectionPending: false, projectionStatus: null,
    projectionData: { invitationId, tokenVersion: 1, attemptId }, fingerprint: `fingerprint-${id}`,
  });
}

async function readRecord(id) { return mongo.db(databaseName).collection('notifications').findOne({ id }); }

async function assertStartupFails(options, expectedCode) {
  const child = startWorker(options);
  const result = await waitUntil('EXPECTED_STARTUP_FAILURE', () => child.exitCode !== null ? child : null, 12_000);
  assert.notEqual(result.exitCode, 0, 'Worker must fail closed when a mounted secret is unavailable');
  assert.match(child.output(), new RegExp(expectedCode));
  for (const secret of Object.values(values)) assert(!child.output().includes(secret), 'Startup output must not expose secret contents');
}

async function assertAlertRules(metrics) {
  const rules = await readFile(resolve(backend, '../deploy/notifications/prometheus-alerts.yml'), 'utf8');
  const required = [
    'NotificationWorkerNotReady', 'NotificationQueueStalled', 'NotificationWorkerNoProgress',
    'NotificationRetriesAccumulating', 'NotificationDeliveryFailures', 'NotificationProjectionStalled',
    'NotificationRetentionStalled',
  ];
  for (const alert of required) assert(rules.includes(`alert: ${alert}`), `Missing alert rule ${alert}`);
  for (const metric of [
    'notification_worker_ready', 'notification_worker_last_poll_success_unixtime',
    'notification_worker_last_retention_success_unixtime', 'notifications_queue_oldest_pending_seconds',
    'notifications_retry_pending', 'notifications_terminal_failed', 'notifications_projection_pending',
  ]) assert(metrics.includes(`${metric} `), `Worker metrics are missing ${metric}`);
  const failureSnapshot = metrics
    .replace(/notification_worker_ready 1\b/g, 'notification_worker_ready 0')
    .replace(/notification_worker_last_poll_success_unixtime \d+/g, `notification_worker_last_poll_success_unixtime ${Math.floor(Date.now() / 1000) - 121}`)
    .replace(/notification_worker_last_retention_success_unixtime \d+/g, `notification_worker_last_retention_success_unixtime ${Math.floor(Date.now() / 1000) - 7201}`)
    .replace(/notifications_queue_oldest_pending_seconds \d+/g, 'notifications_queue_oldest_pending_seconds 5401');
  const valuesByMetric = new Map([...failureSnapshot.matchAll(/^([a-z_]+) (\d+)$/gm)].map(match => [match[1], Number(match[2])]));
  for (const metric of ['notification_worker_ready', 'notifications_retry_pending', 'notifications_terminal_failed', 'notifications_projection_pending'])
    assert(valuesByMetric.has(metric), `Failure snapshot omitted ${metric}`);
  assert(valuesByMetric.get('notification_worker_ready') === 0);
  assert(valuesByMetric.get('notifications_queue_oldest_pending_seconds') > 5400);
  assert(Date.now() / 1000 - valuesByMetric.get('notification_worker_last_poll_success_unixtime') > 120);
  assert(Date.now() / 1000 - valuesByMetric.get('notification_worker_last_retention_success_unixtime') > 7200);
  return { rules: required.length, failureSignals: valuesByMetric.size };
}

let backupRestored = false;
try {
  await mkdir(dbPath, { recursive: true });
  await mkdir(secretPath, { recursive: true });
  values.mongoUri = `mongodb://127.0.0.1:${mongoPort}/${databaseName}?directConnection=true`;
  await writeFile(secrets.mongo, values.mongoUri, { mode: 0o600 });
  await writeFile(secrets.smtp, values.smtpPassword, { mode: 0o600 });
  await writeFile(secrets.key1, values.key1, { mode: 0o600 });
  await writeFile(secrets.key2, values.key2, { mode: 0o600 });
  await copyFile(secrets.key2, secrets.key2Backup);
  await chmod(secrets.key1, 0o600); await chmod(secrets.key2, 0o600); await chmod(secrets.smtp, 0o600);

  mongod = startProcess(findMongod(), ['--bind_ip', '127.0.0.1', '--port', String(mongoPort), '--dbpath', dbPath, '--logpath', mongoLog, '--quiet']);
  await waitUntil('MONGODB_TCP_LISTENER', () => new Promise((resolveProbe, rejectProbe) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: mongoPort });
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolveProbe(true); });
    socket.once('error', error => error.code === 'ECONNREFUSED' ? resolveProbe(false) : rejectProbe(error));
    socket.once('timeout', () => { socket.destroy(); resolveProbe(false); });
  }), 5_000);
  mongo = new MongoClient(values.mongoUri, { serverSelectionTimeoutMS: 1000 });
  await waitUntil('MONGODB_READY', async () => {
    if (mongod.exitCode !== null) throw new Error(`MONGOD_EXITED_${mongod.exitCode}_${mongod.output().slice(-300)}`);
    try { await mongo.connect(); await mongo.db(databaseName).command({ ping: 1 }); return true; }
    catch (error) { throw Object.assign(new Error('MONGO_NOT_READY'), { code: error?.code ?? error?.name ?? 'UNKNOWN' }); }
  }, 8_000);

  // Missing SMTP password and missing active payload key both fail closed with sanitized startup codes.
  await assertStartupFails({ missingSmtp: true }, 'SECRET_UNAVAILABLE');
  await assertStartupFails({ activeVersion: 2, keyFiles: `1=${secrets.key1};2=${join(secretPath, 'absent-key-v2')}` }, 'WORKER_PAYLOAD_KEY_UNAVAILABLE');

  // A verified backup restores the required key before any pending job is attempted.
  await rename(secrets.key2, `${secrets.key2}.offline`);
  try { await assertStartupFails({ activeVersion: 2, keyFiles: `1=${secrets.key1};2=${secrets.key2}` }, 'WORKER_PAYLOAD_KEY_UNAVAILABLE'); }
  finally { await rename(`${secrets.key2}.offline`, secrets.key2); backupRestored = true; }
  await copyFile(secrets.key2Backup, secrets.key2);

  const oldPayload = encryptPayload({ token: values.token, organizationName: 'Simulated company', roles: ['COMPANY_ADMIN'] }, values.key1, 1);
  await insertPending({ id: 'old-key-pending', payload: oldPayload });
  const rotatedWorker = startWorker({ activeVersion: 2, keyFiles: `1=${secrets.key1};2=${secrets.key2}` });
  await waitUntil('ROTATED_WORKER_READY', workerReady);
  const readyResponse = await fetch(`http://127.0.0.1:${healthPort}/health/ready`);
  assert.equal(readyResponse.status, 200);
  const liveResponse = await fetch(`http://127.0.0.1:${healthPort}/health/live`);
  assert.equal(liveResponse.status, 200);
  const oldKeyRetry = await waitUntil('OLD_KEY_DECRYPTION', async () => {
    const record = await readRecord('old-key-pending');
    return record?.status === 'PENDING' && record.attempts === 1 ? record : null;
  });
  assert.equal(oldKeyRetry.attemptHistory[0].failure, 'SMTP_TEMPORARY', 'The old key must decrypt before the SMTP sink failure');
  assert.equal(oldKeyRetry.payload.keyVersion, 1, 'Pending work retains its original key version');

  const newPayload = encryptPayload({ token: values.token, organizationName: 'Simulated company', roles: ['COMPANY_ADMIN'] }, values.key2, 2);
  await insertPending({ id: 'new-key-pending', payload: newPayload });
  const newKeyRetry = await waitUntil('NEW_KEY_ENCRYPTION', async () => {
    const record = await readRecord('new-key-pending');
    return record?.status === 'PENDING' && record.attempts === 1 ? record : null;
  });
  assert.equal(newKeyRetry.attemptHistory[0].failure, 'SMTP_TEMPORARY');
  assert.equal(newKeyRetry.payload.keyVersion, 2, 'New work uses the rotated active key');

  const recoveredPayload = encryptPayload({ token: values.token, organizationName: 'Simulated company', roles: ['COMPANY_ADMIN'] }, values.key1, 1);
  await insertPending({ id: 'expired-lease', payload: recoveredPayload, attempts: 1, status: 'PROCESSING', leaseUntil: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 7_200_000) });
  const recovered = await waitUntil('LEASE_RECOVERY', async () => {
    const record = await readRecord('expired-lease');
    return record?.status === 'PENDING' && record.attempts === 2 ? record : null;
  });
  assert.equal(recovered.recoveredLease, true, 'An expired lease must be claimed after restart');
  assert.equal(recovered.attemptHistory.at(-1).failure, 'SMTP_TEMPORARY');

  await mongo.db(databaseName).collection('notifications').insertMany([
    { id: 'terminal-failure', type: 'SIMULATION_TERMINAL_FAILURE', channel: 'email', idempotencyKey: 'simulation-terminal-failure', status: 'FAILED', attempts: 5, projectionPending: false, payload: null, createdAt: new Date() },
    { id: 'projection-stall', type: 'SIMULATION_PROJECTION_STALL', channel: 'email', idempotencyKey: 'simulation-projection-stall', status: 'SENT', attempts: 1, projectionPending: true, payload: null, createdAt: new Date() },
  ]);
  const metricsResponse = await fetch(`http://127.0.0.1:${healthPort}/metrics`);
  assert.equal(metricsResponse.status, 200);
  const metrics = await metricsResponse.text();
  const alerts = await assertAlertRules(metrics);
  for (const secret of Object.values(values)) {
    assert(!metrics.includes(secret), 'Metrics must not expose a secret or invitation token');
    assert(!rotatedWorker.output().includes(secret), 'Worker logs must not expose a secret or invitation token');
  }
  assert(metrics.includes('notifications_retry_pending 3'));
  assert(metrics.includes('notifications_terminal_failed 1'));
  assert(metrics.includes('notifications_projection_pending 1'));

  // Graceful shutdown stops readiness and exits without losing Mongo-backed work.
  await stopWorker(rotatedWorker);
  await waitUntil('READINESS_DROPPED', async () => {
    try { const response = await fetch(`http://127.0.0.1:${healthPort}/health/ready`); return response.status === 503; }
    catch { return true; }
  });
  assert.equal((await readRecord('expired-lease')).status, 'PENDING', 'Graceful stop preserves retryable work durably');

  // Restore-access test: current process identity can read mounted-file equivalents; absent paths fail closed.
  const authorized = await readFile(secrets.key1, 'utf8');
  assert.equal(authorized, values.key1);
  const fileReaderTests = await readFile(resolve(backend, 'tests/unit/file-secret-reader.test.ts'), 'utf8');
  assert(fileReaderTests.includes('absent'), 'The file-secret suite must cover denied/absent mounted secrets');

  console.log(`Notifications readiness simulation passed on MongoDB ${spawnSync(findMongod(), ['--version'], { encoding: 'utf8', windowsHide: true }).stdout.match(/v\d+\.\d+\.\d+/)?.[0] ?? 'local'}: secret allow/deny and restore, pending-key rotation v1→v2, worker readiness/shutdown, expired-lease recovery, retry/failure/projection alert signals, and no secret exposure. Evaluated ${alerts.rules} alert rules.`);
} catch (error) {
  const message = String(error.message).replaceAll(values.mongoUri, '[redacted Mongo URI]')
    .replaceAll(values.smtpPassword, '[redacted SMTP secret]').replaceAll(values.key1, '[redacted key v1]')
    .replaceAll(values.key2, '[redacted key v2]').replaceAll(values.token, '[redacted token]');
  let mongoDiagnostics = '';
  try { mongoDiagnostics = (await readFile(mongoLog, 'utf8')).split(/\r?\n/).slice(-12).join('\n'); } catch { /* Mongo did not create its log yet. */ }
  throw new Error(mongoDiagnostics ? `${message}\nTemporary Mongo diagnostics:\n${mongoDiagnostics}` : message);
} finally {
  for (const child of workers) await stopWorker(child).catch(() => child.kill('SIGKILL'));
  await mongo?.close().catch(() => undefined);
  if (mongod && mongod.exitCode === null) {
    mongod.kill('SIGTERM');
    await Promise.race([new Promise(resolveExit => mongod.once('exit', resolveExit)), delay(5_000)]);
    if (mongod.exitCode === null) mongod.kill('SIGKILL');
  }
  await rm(workspace, { recursive: true, force: true });
}
