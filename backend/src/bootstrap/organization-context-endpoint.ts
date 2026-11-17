import { randomUUID } from 'node:crypto';
import { createOrganizationContexts } from '@/modules/organizations/application/organization-contexts';
import { createLimitedContextAudit } from '@/modules/organizations/application/limited-context-audit';
import { createContextAudit } from '@/modules/organizations/infrastructure/mongodb/context-audit';
import { availableContextsResponse, resolveContextResponse } from '@/modules/organizations/presentation/contexts';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { authorization, organizationReader } from './authorization-endpoint';
import { authenticatedEndpoint } from './authenticated-endpoint';

const connect = () => { const env = readServerEnvironment(); return connectMongo({ uri: env.MONGODB_URI, file: env.MONGODB_URI_FILE }); };
const contexts = createOrganizationContexts({ organizations: organizationReader, permissions: authorization,
  audit: createLimitedContextAudit(createContextAudit(connect), Date.now),
  now: () => new Date(), nextId: randomUUID });
export const availableContextsEndpoint = authenticatedEndpoint((actor, request) => availableContextsResponse(contexts, actor, request));
export const resolveContextEndpoint = authenticatedEndpoint((actor, request) => resolveContextResponse(contexts, actor, request));
