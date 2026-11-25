import { setTimeout as delay } from 'node:timers/promises';
import { closeMongo, connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { createMongoInvoiceSubmissionRepository } from '@/modules/invoice-sync/infrastructure/mongodb/submission-repository';
import { createSubmissionImageStorage } from '@/modules/invoice-sync/infrastructure/submission-image-storage';
import { createInvoiceSubmissionRetentionWorker } from '@/modules/invoice-sync/application/retention';
import { invoiceImageStorage, invoiceImageStorageCompanyId } from './invoice-endpoint';

const environment = readServerEnvironment();
const connect = () => connectMongo({ uri: environment.MONGODB_URI, file: environment.MONGODB_URI_FILE });
const worker = createInvoiceSubmissionRetentionWorker({ repository: createMongoInvoiceSubmissionRepository(connect),
  images: createSubmissionImageStorage({ storage: invoiceImageStorage, companyId: invoiceImageStorageCompanyId }), clock: { now: () => new Date() } });
let stopping = false;
process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });
const safeErrorCode = (error: unknown) => error instanceof Error ? error.message.replace(/[^A-Z0-9_]/g, '').slice(0, 64) || 'RETENTION_ERROR' : 'RETENTION_ERROR';
try {
  while (!stopping) {
    try {
      const result = await worker.runBatch(100);
      if (result.expired || result.removedImages) console.info('invoice_sync.retention.completed', result);
    } catch (error) { console.error('invoice_sync.retention.error', safeErrorCode(error)); }
    await delay(60_000);
  }
} finally { await closeMongo(); }
