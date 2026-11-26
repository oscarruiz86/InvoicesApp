import { randomUUID } from 'node:crypto';
import { createCompanies } from '@/modules/organizations/application/companies';
import { createCompanyRepository } from '@/modules/organizations/infrastructure/mongodb/company-repository';
import { createCatalogRepository } from '@/modules/parametric-catalogs/infrastructure/mongodb/catalog-repository';
import { policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { createLimitedSecurityAudit } from '@/modules/identity/application/limited-security-audit';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';
import { authorizationAuditEvent } from '@/modules/identity/infrastructure/audit-event';
import { companyResponse, type CompanyOperation } from '@/modules/organizations/presentation/companies';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { authenticatedEndpoint } from './authenticated-endpoint';
const now = () => new Date();
const connect = () => { const env = readServerEnvironment(); return connectMongo({ uri: env.MONGODB_URI, file: env.MONGODB_URI_FILE }); };
const catalogs = createCatalogRepository(connect, policyConfirmation, createMongoAuditWriter);
const service = createCompanies({ repository: createCompanyRepository(connect, policyConfirmation),
  audit: createLimitedSecurityAudit({ async record(event) { await createMongoAuditWriter(await connect()).record(authorizationAuditEvent(event)); } }, { now }),
  validateLocation: catalogs.validateLocation, now, nextEventId: randomUUID });
export const companyEndpoint = (operation: CompanyOperation, id?: string) => authenticatedEndpoint((actor, request) => companyResponse(service, operation, actor, request, id, catalogs.resolveLocation));
