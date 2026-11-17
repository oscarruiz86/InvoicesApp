import { randomUUID } from 'node:crypto';
import { createAuthorization } from '@/modules/identity/application/authorization';
import { createLimitedSecurityAudit } from '@/modules/identity/application/limited-security-audit';
import { createOrganizationRepository } from '@/modules/organizations/infrastructure/mongodb/organization-repository';
import { createPolicyRepository } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { permissionsResponse } from '@/modules/identity/presentation/permissions';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { authenticatedEndpoint } from './authenticated-endpoint';

const clock = { now: () => new Date() };
const connect = () => { const env = readServerEnvironment(); return connectMongo({ uri: env.MONGODB_URI, file: env.MONGODB_URI_FILE }); };
export const organizationReader = createOrganizationRepository(connect);
export const authorization = createAuthorization({
  policies: createPolicyRepository(connect),
  organizations: organizationReader,
  audit: createLimitedSecurityAudit({ record: async event => { console.info('authorization.security', JSON.stringify(event)); } }, clock),
  clock, ids: { next: randomUUID },
});
export const permissionsEndpoint = authenticatedEndpoint((actor, request) => permissionsResponse(authorization, actor, request));
