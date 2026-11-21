import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { createInvoices } from '@/modules/invoices/application/invoices';
import { createInvoiceAuthorizationPort } from '@/modules/invoices/application/invoice-authorization';
import { invoiceResponse, type InvoiceOperation } from '@/modules/invoices/presentation/invoices';
import { createMongoInvoiceAudit, createMongoInvoiceRepository } from '@/modules/invoices/infrastructure/mongodb/invoice-repository';
import { createMongoInvoiceAssignmentAuthority } from '@/modules/fleet/infrastructure/mongodb/invoice-assignment-authority';
import { normalizeInvoiceImage } from '@/modules/invoices/infrastructure/images/normalize-image';
import { policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { invoiceAuthorityConfirmation } from '@/modules/organizations/infrastructure/mongodb/invoice-authority';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { authorization, policyRepository } from './authorization-endpoint';
import { authenticatedEndpoint } from './authenticated-endpoint';
import { parameterUseCases } from './parameter-endpoint';

const connect = () => { const environment = readServerEnvironment(); return connectMongo({ uri: environment.MONGODB_URI, file: environment.MONGODB_URI_FILE }); };
const assignmentAuthority = createMongoInvoiceAssignmentAuthority(connect);
const repository = createMongoInvoiceRepository(connect, (connection, session) => ({ policy: policyConfirmation(connection, session),
  authority: invoiceAuthorityConfirmation(connection, session), assignments: assignmentAuthority,
  editPolicy: { async confirm(input) { await parameterUseCases.confirm({ ...input, transactionContext: input.transactionContext }); } }, audit: createMongoInvoiceAudit(connection, session) }));
const invoiceAuthorization = createInvoiceAuthorizationPort({ authorization, policies: policyRepository });

export const invoices = createInvoices({ repository, authorization: invoiceAuthorization, assignments: assignmentAuthority,
  editPolicy: { async read(input) { return parameterUseCases.readEffective(input.thirdPartyId); } }, imageNormalizer: { normalize: normalizeInvoiceImage }, clock: { now: () => new Date() },
  ids: { next: () => new Types.ObjectId().toString() }, correlationId: { next: randomUUID } });

export function invoicesEndpoint(operation: InvoiceOperation, id?: string) {
  return authenticatedEndpoint((actor, request) => invoiceResponse(invoices, operation, actor, request, id));
}
