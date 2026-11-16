import { randomUUID } from 'node:crypto';
import { createCompanies } from '@/modules/organizations/application/companies';
import { createCompanyRepository } from '@/modules/organizations/infrastructure/mongodb/company-repository';
import { policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { createLimitedSecurityAudit } from '@/modules/identity/application/limited-security-audit';
import { companyResponse, type CompanyOperation } from '@/modules/organizations/presentation/companies';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { authenticatedEndpoint } from './authenticated-endpoint';
const now = () => new Date();
const service = createCompanies({ repository: createCompanyRepository(() => connectMongo(readServerEnvironment().MONGODB_URI), policyConfirmation),
  audit: createLimitedSecurityAudit({ record: async event => { console.info('authorization.security', JSON.stringify(event)); } }, { now }), now, nextEventId: randomUUID });
export const companyEndpoint = (operation: CompanyOperation, id?: string) => authenticatedEndpoint((actor, request) => companyResponse(service, operation, actor, request, id));
