import { Types } from 'mongoose';
import { createInvoiceAuthorizationPort } from '@/modules/invoices/application/invoice-authorization';
import { createMongoInvoiceSubmissionRepository } from '@/modules/invoice-sync/infrastructure/mongodb/submission-repository';
import { createMongoInvoiceSyncFactsReader } from '@/modules/invoice-sync/infrastructure/mongodb/sync-facts';
import { createSubmissionImageStorage } from '@/modules/invoice-sync/infrastructure/submission-image-storage';
import { createOfflineInvoiceSubmissions } from '@/modules/invoice-sync/application/submissions';
import { adminConflictListResponse, adminSubmissionImageResponse, adminSubmissionResolutionResponse, submissionResponse } from '@/modules/invoice-sync/presentation/submissions';
import { authorization, policyRepository } from './authorization-endpoint';
import { authenticatedEndpoint } from './authenticated-endpoint';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { invoiceImageStorage, invoiceImageStorageCompanyId, invoices } from './invoice-endpoint';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';

const connect = () => { const env = readServerEnvironment(); return connectMongo({ uri: env.MONGODB_URI, file: env.MONGODB_URI_FILE }); };
const repository = createMongoInvoiceSubmissionRepository(connect, createMongoAuditWriter);
const imageStorage = createSubmissionImageStorage({ storage: invoiceImageStorage, companyId: invoiceImageStorageCompanyId });
const service = createOfflineInvoiceSubmissions({ repository, invoices, authorization: createInvoiceAuthorizationPort({ authorization, policies: policyRepository }),
  images: imageStorage, facts: createMongoInvoiceSyncFactsReader(connect), clock: { now: () => new Date() }, ids: { next: () => new Types.ObjectId().toString() } });

function endpoint(request: Request, actor: AuthenticatedActor, id?: string) { return submissionResponse(service, invoices, actor, request, id); }
export const offlineSubmissionEndpoint = authenticatedEndpoint((actor, request) => endpoint(request, actor));
export function offlineSubmissionByIdEndpoint(id: string) { return authenticatedEndpoint((actor, request) => endpoint(request, actor, id)); }
export const offlineConflictListEndpoint = authenticatedEndpoint((actor, request) => adminConflictListResponse(service, actor, request));
export function offlineSubmissionImageEndpoint(id: string) { return authenticatedEndpoint((actor, request) => adminSubmissionImageResponse(service, actor, request, id)); }
export function offlineSubmissionResolutionEndpoint(id: string) { return authenticatedEndpoint((actor, request) => adminSubmissionResolutionResponse(service, actor, request, id)); }
