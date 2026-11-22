import { setTimeout as delay } from 'node:timers/promises';
import { closeMongo, connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';
import { createPolicyAuditOutboxWorker, runPolicyAuditOutboxLoop } from '@/modules/audit/application/policy-outbox-worker';
import { authorizationAuditEvent } from '@/modules/identity/infrastructure/audit-event';
import { createPolicyRepository } from '@/modules/identity/infrastructure/mongodb/policy-repository';

const environment = readServerEnvironment();
const connect = () => connectMongo({ uri: environment.MONGODB_URI, file: environment.MONGODB_URI_FILE });
const policy = createPolicyRepository(connect);
const worker = createPolicyAuditOutboxWorker({ outbox: policy, audit: { async record(event) { await createMongoAuditWriter(await connect()).record(event); } }, map: authorizationAuditEvent });
let stopping = false;
process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });
const safeErrorCode = (error: unknown) => error instanceof Error ? error.message.replace(/[^A-Z0-9_]/g, '').slice(0, 64) || 'AUDIT_WORKER_ERROR' : 'AUDIT_WORKER_ERROR';
try {
  await runPolicyAuditOutboxLoop({ deliverBatch: () => worker.deliverBatch(100), isStopping: () => stopping, wait: ms => delay(ms),
    onDelivered: count => console.info('audit.outbox.delivered', count), onError: error => console.error('audit.outbox.error', safeErrorCode(error)) });
} finally { await closeMongo(); }
