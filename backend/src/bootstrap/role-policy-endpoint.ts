import { rolePolicyUseCases } from '@/bootstrap/authorization-endpoint';
import { rolePolicyHandlers } from '@/modules/identity/presentation/role-policy';
import { authenticatedEndpoint } from './authenticated-endpoint';

const handlers = rolePolicyHandlers(rolePolicyUseCases);
export const readRolePolicyEndpoint = authenticatedEndpoint(handlers.read);
export const replaceRolePolicyEndpoint = authenticatedEndpoint(handlers.replace);
