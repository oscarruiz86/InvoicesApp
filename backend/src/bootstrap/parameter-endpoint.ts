import { randomUUID } from 'node:crypto';
import { createParameterUseCases } from '@/modules/configuration/application/parameters';
import { createMongoParameterRepository } from '@/modules/configuration/infrastructure/mongodb/parameter-repository';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { authorization } from './authorization-endpoint';
import { authenticatedEndpoint } from './authenticated-endpoint';
import { parameterHandlers } from '@/modules/configuration/presentation/parameters';
import { policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';

const connect = () => { const env = readServerEnvironment(); return connectMongo({ uri: env.MONGODB_URI, file: env.MONGODB_URI_FILE }); };
export const parameterUseCases = createParameterUseCases(createMongoParameterRepository(connect, { next: randomUUID }, policyConfirmation), { now: () => new Date() }, { next: randomUUID });
const handlers = parameterHandlers(parameterUseCases, authorization);
export const parametersListEndpoint = authenticatedEndpoint(handlers.list);
const routeKey = (request: Request) => decodeURIComponent(new URL(request.url).pathname.split('/').filter(Boolean).at(-1) === 'history'
  ? new URL(request.url).pathname.split('/').filter(Boolean).at(-2)! : new URL(request.url).pathname.split('/').filter(Boolean).at(-1)!);
export const parameterDetailEndpoint = authenticatedEndpoint((actor, request) => handlers.detail(actor, request, routeKey(request)));
export const parameterHistoryEndpoint = authenticatedEndpoint((actor, request) => handlers.history(actor, request, routeKey(request)));
export const parameterUpdateEndpoint = authenticatedEndpoint((actor, request) => handlers.update(actor, request, routeKey(request)));
export { connect as connectParametersMongo };
