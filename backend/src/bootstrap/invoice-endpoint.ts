import { createHash, randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { createInvoices } from '@/modules/invoices/application/invoices';
import { createInvoiceAuthorizationPort } from '@/modules/invoices/application/invoice-authorization';
import { invoiceResponse, type InvoiceOperation } from '@/modules/invoices/presentation/invoices';
import { createMongoInvoiceAudit, createMongoInvoiceRepository } from '@/modules/invoices/infrastructure/mongodb/invoice-repository';
import { createMongoInvoiceAssignmentAuthority } from '@/modules/fleet/infrastructure/mongodb/invoice-assignment-authority';
import { normalizeInvoiceImage } from '@/modules/invoices/infrastructure/images/normalize-image';
import { createLocalInvoiceImageStorage } from '@/modules/invoices/infrastructure/images/local-image-storage';
import type { InvoiceImageStoragePort } from '@/modules/invoices/application/invoice-ports';
import { policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { invoiceAuthorityConfirmation } from '@/modules/organizations/infrastructure/mongodb/invoice-authority';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { authorization, policyRepository } from './authorization-endpoint';
import { authenticatedEndpoint } from './authenticated-endpoint';
import { parameterUseCases } from './parameter-endpoint';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';

const connect = () => { const environment = readServerEnvironment(); return connectMongo({ uri: environment.MONGODB_URI, file: environment.MONGODB_URI_FILE }); };
let localStorageRoot: string | undefined;
let localStorageInstance: ReturnType<typeof createLocalInvoiceImageStorage> | undefined;
function configuredStorage() {
  const env = readServerEnvironment();
  if (env.INVOICE_IMAGE_STORAGE_PROVIDER !== 'local' || !env.INVOICE_IMAGE_STORAGE_LOCAL_ROOT || !env.INVOICE_IMAGE_STORAGE_COMPANY_ID)
    throw new Error('CONFIGURATION_ERROR');
  if (!localStorageInstance || localStorageRoot !== env.INVOICE_IMAGE_STORAGE_LOCAL_ROOT) {
    localStorageRoot = env.INVOICE_IMAGE_STORAGE_LOCAL_ROOT;
    localStorageInstance = createLocalInvoiceImageStorage(localStorageRoot);
  }
  return localStorageInstance;
}
export const invoiceImageStorage: InvoiceImageStoragePort = {
  async prepare(input) { return configuredStorage().prepare(input); },
  async read(reference) { return configuredStorage().read(reference); },
  async commit(prepared) { return configuredStorage().commit(prepared); },
  async compensate(prepared) { return configuredStorage().compensate(prepared); },
  async finalize(prepared) { return configuredStorage().finalize(prepared); },
  async remove(reference) { return configuredStorage().remove(reference); },
};
const assignmentAuthority = createMongoInvoiceAssignmentAuthority(connect);
const repository = createMongoInvoiceRepository(connect, (connection, session) => ({ policy: policyConfirmation(connection, session),
  authority: invoiceAuthorityConfirmation(connection, session), assignments: assignmentAuthority,
  editPolicy: { async confirm(input) { await parameterUseCases.confirm({ ...input, transactionContext: input.transactionContext }); } }, audit: createMongoInvoiceAudit(connection, session, createMongoAuditWriter(connection, session)) }),
  { auditFactory: createMongoAuditWriter });
const invoiceAuthorization = createInvoiceAuthorizationPort({ authorization, policies: policyRepository });

export function invoiceImageStorageCompanyId() { const env = readServerEnvironment(); if (!env.INVOICE_IMAGE_STORAGE_COMPANY_ID) throw new Error('CONFIGURATION_ERROR'); return env.INVOICE_IMAGE_STORAGE_COMPANY_ID; }

export const invoices = createInvoices({ repository, authorization: invoiceAuthorization, assignments: assignmentAuthority, imageStorage: invoiceImageStorage,
  imageStorageCompanyId: invoiceImageStorageCompanyId,
  editPolicy: { async read(input) { return parameterUseCases.readEffective(input.thirdPartyId); } }, imageNormalizer: { normalize: normalizeInvoiceImage }, clock: { now: () => new Date() },
  ids: { next: () => new Types.ObjectId().toString() }, correlationId: { next: randomUUID },
  qrContentHasher: { sha256: content => createHash('sha256').update(content, 'utf8').digest('hex') } });

export function invoicesEndpoint(operation: InvoiceOperation, id?: string) {
  return authenticatedEndpoint((actor, request) => invoiceResponse(invoices, operation, actor, request, id));
}
