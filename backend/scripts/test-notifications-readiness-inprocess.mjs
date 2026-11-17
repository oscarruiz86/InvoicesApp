import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAesPayloadCipher } from '../src/modules/notifications/infrastructure/payload-cipher.ts';
import { NotificationTransportError } from '../src/modules/notifications/application/ports.ts';
import { createNotificationWorker } from '../src/modules/notifications/infrastructure/worker.ts';
import { createNotificationWorkerHealth } from '../src/modules/notifications/infrastructure/worker-health.ts';
import { fileSecretReader } from '../src/shared/infrastructure/file-secrets/file-secret-reader.ts';
import { readServerEnvironment } from '../src/shared/infrastructure/config/server-environment.ts';

const root = resolve(process.cwd(), '..');
const directory = await mkdtemp(join(tmpdir(), 'notifications-readiness-inprocess-'));
const secrets = {
  smtp: join(directory, 'smtp-password'),
  key1: join(directory, 'payload-v1'),
  key2: join(directory, 'payload-v2'),
  backup: join(directory, 'payload-v2.backup'),
};
const values = {
  smtp: randomBytes(32).toString('base64url'),
  key1: randomBytes(32).toString('base64'),
  key2: randomBytes(32).toString('base64'),
  token: randomBytes(32).toString('base64url'),
};

function notification(payload, overrides = {}) {
  return {
    id: 'simulated-pending', type: 'INVITATION_CREATED', channel: 'email', recipient: 'user@example.invalid',
    language: 'es', functionalReference: 'invitation-simulation', idempotencyKey: 'idempotency-simulation', payload,
    expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(Date.now() - 7_200_000), status: 'PROCESSING',
    attempts: 2, previousAttempts: 1, recoveredLease: true, nextAttemptAt: new Date(), leaseUntil: null, owner: 'sim-worker',
    terminalFailure: null, projectionPending: false, projectionStatus: null,
    projectionData: { invitationId: 'invitation-simulation', tokenVersion: 1, attemptId: 'attempt-simulation' },
    ...overrides,
  };
}

try {
  await writeFile(secrets.smtp, values.smtp, { mode: 0o600 });
  await writeFile(secrets.key1, values.key1, { mode: 0o600 });
  await writeFile(secrets.key2, values.key2, { mode: 0o600 });
  await copyFile(secrets.key2, secrets.backup);

  // Exercise the same production environment contract and file reader with throwaway files.
  const config = readServerEnvironment({
    NODE_ENV: 'production', MONGODB_URI_FILE: join(directory, 'mongodb-uri'),
    SMTP_ENABLED: 'true', SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '587', SMTP_TLS_MODE: 'starttls',
    SMTP_FROM_ADDRESS: 'no-reply@example.invalid', SMTP_PASSWORD_FILE: secrets.smtp,
    INVITATION_PUBLIC_ORIGIN: 'https://app.example.invalid',
    NOTIFICATION_PAYLOAD_KEY_FILES: `1=${secrets.key1};2=${secrets.key2}`,
    NOTIFICATION_PAYLOAD_ACTIVE_KEY_VERSION: '2',
  });
  assert.equal(config.NOTIFICATION_PAYLOAD_KEYRING.activeVersion, 2);
  assert.equal(await fileSecretReader.read(secrets.smtp), values.smtp);
  await assert.rejects(fileSecretReader.read(join(directory, 'missing-secret')), error => error.message === 'SECRET_UNAVAILABLE');

  const oldCipher = createAesPayloadCipher(fileSecretReader, { activeVersion: 1, keyFiles: { 1: secrets.key1 } });
  const pendingPayload = await oldCipher.encrypt({ token: values.token, organizationName: 'Empresa simulada', roles: ['COMPANY_ADMIN'] });
  const rotatedCipher = createAesPayloadCipher(fileSecretReader, config.NOTIFICATION_PAYLOAD_KEYRING);
  const newPayload = await rotatedCipher.encrypt({ token: 'new-test-token', organizationName: 'Empresa simulada', roles: ['DRIVER'] });
  assert.equal(pendingPayload.keyVersion, 1);
  assert.equal(newPayload.keyVersion, 2);
  assert.deepEqual(await rotatedCipher.decrypt(pendingPayload), { token: values.token, organizationName: 'Empresa simulada', roles: ['COMPANY_ADMIN'] });
  assert.deepEqual(await rotatedCipher.decrypt(newPayload), { token: 'new-test-token', organizationName: 'Empresa simulada', roles: ['DRIVER'] });

  // Simulate a controlled restore before resuming any pending delivery.
  const unavailableKeyring = createAesPayloadCipher(fileSecretReader, { activeVersion: 2, keyFiles: { 1: secrets.key1, 2: join(directory, 'temporarily-unavailable') } });
  await assert.rejects(unavailableKeyring.prepare(), error => error.message === 'SECRET_UNAVAILABLE');
  await copyFile(secrets.backup, secrets.key2);
  const restoredKeyring = createAesPayloadCipher(fileSecretReader, { activeVersion: 2, keyFiles: { 1: secrets.key1, 2: secrets.key2 } });
  await restoredKeyring.prepare();

  // The actual worker consumes an expired-lease record and retains the retry after SMTP fails.
  const recovered = notification(pendingPayload);
  const finishAttempt = [];
  const repository = {
    async claimProjection() { return null; },
    async claimDue() { const next = this.record; this.record = null; return next; },
    async finishAttempt(input) { finishAttempt.push(input); },
    async finishProjection() {},
    record: recovered,
  };
  const worker = createNotificationWorker({
    repository,
    cipher: restoredKeyring,
    configuration: { enabled: true, publicOrigin: 'https://app.example.invalid', fromAddress: 'no-reply@example.invalid', fromName: 'Simulación',
      smtp: { host: 'smtp.example.invalid', port: 587, tlsMode: 'starttls', timeoutMs: 500 } },
    projection: { async update() {} },
    async isDeliverable() { return true; },
    now: () => new Date(), owner: 'simulation-worker',
    transport: { async send() { throw new NotificationTransportError('SMTP_TEMPORARY'); } },
  });
  assert.equal(await worker.processOne(), true);
  assert.equal(finishAttempt.length, 1);
  assert.equal(finishAttempt[0].outcome, 'RETRY');
  assert.equal(finishAttempt[0].failure, 'SMTP_TEMPORARY');
  assert.equal(recovered.recoveredLease, true);
  assert.equal(recovered.previousAttempts, 1);

  // Readiness turns true after a successful poll, stale after the progress window, and false on shutdown.
  let now = 1_000_000;
  const health = createNotificationWorkerHealth(() => now, 180_000);
  assert.equal(health.ready(), false);
  health.markPollSuccess();
  health.markRetentionSuccess();
  assert.equal(health.ready(), true);
  now += 180_001;
  assert.equal(health.ready(), false);
  health.markPollSuccess();
  assert.equal(health.ready(), true);
  health.beginShutdown();
  assert.equal(health.snapshot().stopping, true);
  assert.equal(health.ready(), false);

  const rules = await readFile(resolve(root, 'deploy/notifications/prometheus-alerts.yml'), 'utf8');
  const requiredAlerts = ['NotificationWorkerNotReady', 'NotificationQueueStalled', 'NotificationWorkerNoProgress',
    'NotificationRetriesAccumulating', 'NotificationDeliveryFailures', 'NotificationProjectionStalled', 'NotificationRetentionStalled'];
  const parsedAlerts = [...rules.matchAll(/- alert: (\w+)([\s\S]*?)(?=\r?\n\s{6}- alert:|$)/g)].map(match => ({
    name: match[1], expression: /^\s+expr: ([^\r\n]+)/m.exec(match[2])?.[1] ?? '',
  }));
  for (const alert of requiredAlerts) assert(parsedAlerts.some(rule => rule.name === alert), `Missing alert ${alert}`);
  const currentSeconds = Math.floor(Date.now() / 1000);
  const failureMetrics = new Map([
    ['notification_worker_ready', 0], ['notifications_queue_oldest_pending_seconds', 5401],
    ['notification_worker_last_poll_success_unixtime', currentSeconds - 121],
    ['notification_worker_last_retention_success_unixtime', currentSeconds - 7201],
    ['notifications_retry_pending', 1], ['notifications_terminal_failed', 1], ['notifications_projection_pending', 1],
  ]);
  const firing = parsedAlerts.filter(({ expression }) => {
    let match = /^(\w+) == (\d+)$/.exec(expression);
    if (match) return failureMetrics.get(match[1]) === Number(match[2]);
    match = /^(\w+) > (\d+)$/.exec(expression);
    if (match) return (failureMetrics.get(match[1]) ?? 0) > Number(match[2]);
    match = /^time\(\) - (\w+) > (\d+)$/.exec(expression);
    if (match) return currentSeconds - (failureMetrics.get(match[1]) ?? currentSeconds) > Number(match[2]);
    return false;
  });
  assert.deepEqual(firing.map(rule => rule.name).sort(), [...requiredAlerts].sort(), 'Every configured alert must fire for its simulated failure metric');
  for (const secret of Object.values(values)) assert(!JSON.stringify(finishAttempt).includes(secret));

  console.log('In-process notification simulation passed: mounted-secret allow/missing/restore, v1→v2 pending-key rotation, actual worker retry after recovered lease, health/readiness transitions, and all seven alert expressions fired on synthetic failure metrics.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
