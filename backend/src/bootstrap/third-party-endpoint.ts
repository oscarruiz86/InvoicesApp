import { randomUUID } from 'node:crypto';
import { createThirdParties } from '@/modules/organizations/application/third-parties';
import { createThirdPartyRepository } from '@/modules/organizations/infrastructure/mongodb/third-party-repository';
import { createCatalogRepository } from '@/modules/parametric-catalogs/infrastructure/mongodb/catalog-repository';
import { policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { thirdPartyResponse, type ThirdPartyOperation } from '@/modules/organizations/presentation/third-parties';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { authenticatedEndpoint } from './authenticated-endpoint';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';

const now = () => new Date();
const connect = () => { const env = readServerEnvironment(); return connectMongo({ uri: env.MONGODB_URI, file: env.MONGODB_URI_FILE }); };
const catalogs = createCatalogRepository(connect, policyConfirmation, createMongoAuditWriter);
const service = createThirdParties({ repository: createThirdPartyRepository(connect, policyConfirmation), validateLocation: catalogs.validateLocation, now, nextEventId: randomUUID });
export const thirdPartyUseCases = () => service;
export const thirdPartyEndpoint = (operation: ThirdPartyOperation, id?: string, companyId?: string) => authenticatedEndpoint((actor, request) => thirdPartyResponse(service, operation, actor, request, id, companyId, catalogs.resolveLocation));
