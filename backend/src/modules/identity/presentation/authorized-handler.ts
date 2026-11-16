import type { AuthenticatedActor } from '../domain/actor';
import type { Permission } from '../domain/permissions';
import type { Authorization } from '../application/authorization';
import type { AuthorizationReceipt, ResourceAccessReader } from '../application/authorization-ports';
import { readPermissionScope } from './permissions';

/** Compose AFTER authenticatedEndpoint. Each endpoint declares its permission; never accept it from HTTP. */
export function authorizedAction(authorization: Authorization, permission: Permission, action: (actor: AuthenticatedActor, request: Request) => Promise<Response>) {
  return async (actor: AuthenticatedActor, request: Request) => {
    await authorization.requirePermission(actor, permission, readPermissionScope(request));
    return action(actor, request);
  };
}
export function resourceAuthorizedAction(authorization: Authorization, permission: Permission, reader: ResourceAccessReader, identify: (request: Request) => string, action: (receipt: AuthorizationReceipt) => Promise<Response>) {
  return async (actor: AuthenticatedActor, request: Request) => {
    const receipt = await authorization.authorizeResourceAccess(actor, permission, readPermissionScope(request), identify(request), reader);
    return action(receipt); // Mutation owners must validate receipt revisions atomically in commit.
  };
}
