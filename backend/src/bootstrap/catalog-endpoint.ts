import { createCatalogRepository } from '@/modules/parametric-catalogs/infrastructure/mongodb/catalog-repository';
import { catalogHandlers } from '@/modules/parametric-catalogs/presentation/catalogs';
import { policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { authorization } from './authorization-endpoint';
import { authenticatedEndpoint } from './authenticated-endpoint';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';

const connect = () => { const env = readServerEnvironment(); return connectMongo({ uri: env.MONGODB_URI, file: env.MONGODB_URI_FILE }); };
const repository = createCatalogRepository(connect, policyConfirmation, createMongoAuditWriter);
const handlers = catalogHandlers(repository, authorization);
export const catalogListEndpoint = (catalog: string) => authenticatedEndpoint((actor, request) => handlers.list(actor, request, catalog));
export const catalogLabelEndpoint = (catalog: string, code: string) => authenticatedEndpoint((actor, request) => handlers.updateLabel(actor, request, catalog, code));
export const catalogCreateEntryEndpoint = (catalog: string) => authenticatedEndpoint((actor, request) => handlers.createEntry(actor, request, catalog));
export const catalogDeactivateEntryEndpoint = (catalog: string, code: string) => authenticatedEndpoint((actor, request) => handlers.deactivateEntry(actor, request, catalog, code));
