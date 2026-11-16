import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { closeMongo, connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { createNotificationRepository } from '@/modules/notifications/infrastructure/mongodb/notification-repository';
import { createAesPayloadCipher } from '@/modules/notifications/infrastructure/payload-cipher';
import { fileSecretReader } from '@/modules/notifications/infrastructure/file-secret-reader';
import { createNotificationWorker } from '@/modules/notifications/infrastructure/worker';
import { createInvitationRepository } from '@/modules/organizations/infrastructure/mongodb/invitation-repository';
import { createSmtpTransport, type SmtpConfiguration } from '@/modules/notifications/infrastructure/smtp-transport';
import type { MailTransport } from '@/modules/notifications/application/ports';

const environment = readServerEnvironment();
const connect = () => connectMongo(environment.MONGODB_URI);
const cipher = createAesPayloadCipher(fileSecretReader, environment.NOTIFICATION_PAYLOAD_KEYRING);
const notifications = createNotificationRepository(connect, cipher);
const invitations = createInvitationRepository(connect);
let transport: MailTransport | undefined;
let smtp: SmtpConfiguration | undefined;
if (environment.SMTP_ENABLED) {
  const password = environment.SMTP_PASSWORD_FILE ? await fileSecretReader.read(environment.SMTP_PASSWORD_FILE) : undefined;
  smtp = { host: environment.SMTP_HOST!, port: environment.SMTP_PORT!, username: environment.SMTP_USERNAME, password,
    tlsMode: environment.SMTP_TLS_MODE!, timeoutMs: environment.SMTP_TIMEOUT_MS! };
  transport = createSmtpTransport(smtp);
}
const worker = createNotificationWorker({ repository: notifications, cipher, now: () => new Date(), owner: randomUUID(),
  configuration: { enabled: environment.SMTP_ENABLED, publicOrigin: environment.INVITATION_PUBLIC_ORIGIN ?? '',
    fromAddress: environment.SMTP_FROM_ADDRESS ?? '', fromName: environment.SMTP_FROM_NAME, smtp: smtp ?? null },
  projection: { async update(input) { await invitations.updateDeliveryStatus({ id: input.invitationId, tokenVersion: input.tokenVersion,
    attemptId: input.attemptId, status: input.status, now: input.now }); } },
  async isDeliverable(input) { const invitation = await invitations.findInvitation(input.invitationId); return Boolean(invitation && invitation.status === 'PENDING'
    && invitation.tokenVersion === input.tokenVersion && invitation.attemptId === input.attemptId && invitation.expiresAt.getTime() > Date.now()); },
  ...(transport ? { transport } : {}) });

await notifications.prepare();
await cipher.prepare?.();
let stopping = false;
let lastPollSuccess = 0;
let lastRetentionSuccess = 0;
let nextRetentionAt = 0;
let processed = 0;
let pollErrors = 0;
let retained = 0;
const ready = () => !stopping && lastPollSuccess > 0 && Date.now() - lastPollSuccess <= 180_000;
const healthServer = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/health/live') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{"status":"alive"}'); return; }
  if (request.url === '/health/ready') {
    response.writeHead(ready() ? 200 : 503, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ status: ready() ? 'ready' : 'not-ready' })); return;
  }
  if (request.url === '/metrics') {
    try {
      const stats = await notifications.operationalStats(new Date());
      const metrics = [
        '# TYPE notification_worker_ready gauge', 'notification_worker_ready ' + (ready() ? 1 : 0),
        '# TYPE notification_worker_last_poll_success_unixtime gauge', 'notification_worker_last_poll_success_unixtime ' + (lastPollSuccess ? Math.floor(lastPollSuccess / 1000) : 0),
        '# TYPE notification_worker_last_retention_success_unixtime gauge', 'notification_worker_last_retention_success_unixtime ' + (lastRetentionSuccess ? Math.floor(lastRetentionSuccess / 1000) : 0),
        '# TYPE notification_worker_processed_total counter', 'notification_worker_processed_total ' + processed,
        '# TYPE notification_worker_poll_errors_total counter', 'notification_worker_poll_errors_total ' + pollErrors,
        '# TYPE notification_worker_retained_records_total counter', 'notification_worker_retained_records_total ' + retained,
        '# TYPE notifications_queue_pending gauge', 'notifications_queue_pending ' + stats.pending,
        '# TYPE notifications_queue_processing gauge', 'notifications_queue_processing ' + stats.processing,
        '# TYPE notifications_retry_pending gauge', 'notifications_retry_pending ' + stats.retryPending,
        '# TYPE notifications_terminal_failed gauge', 'notifications_terminal_failed ' + stats.terminalFailed,
        '# TYPE notifications_projection_pending gauge', 'notifications_projection_pending ' + stats.projectionPending,
        '# TYPE notifications_queue_oldest_pending_seconds gauge', 'notifications_queue_oldest_pending_seconds ' + stats.oldestPendingSeconds,
      ].join('\n') + '\n';
      response.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' }); response.end(metrics);
    } catch { response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('notification_worker_metrics_unavailable\n'); }
    return;
  }
  response.writeHead(404); response.end();
});
await new Promise<void>((resolve, reject) => { healthServer.once('error', reject); healthServer.listen(8090, '0.0.0.0', resolve); });
process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });
const safeErrorCode = (error: unknown) => error instanceof Error ? error.message.replace(/[^A-Z0-9_]/g, '').slice(0, 64) || 'WORKER_ERROR' : 'WORKER_ERROR';
try {
  while (!stopping) {
    try {
      const handled = await worker.processOne();
      lastPollSuccess = Date.now();
      if (Date.now() >= nextRetentionAt) {
        nextRetentionAt = Date.now() + 60 * 60 * 1000;
        try {
          const count = await notifications.purgeExpired(new Date());
          retained += count; lastRetentionSuccess = Date.now();
          if (count > 0) console.info('notifications.retention.purged', count);
        } catch (error) { console.error('notifications.retention.error', safeErrorCode(error)); }
      }
      if (handled) { processed++; continue; }
    } catch (error) { pollErrors++; console.error('notifications.worker.error', safeErrorCode(error)); }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
} finally {
  await new Promise<void>(resolve => { if (!healthServer.listening) { resolve(); return; } healthServer.close(() => resolve()); });
  await closeMongo();
}