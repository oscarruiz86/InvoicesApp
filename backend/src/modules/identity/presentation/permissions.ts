import { z } from 'zod';
import type { AuthenticatedActor } from '../domain/actor';
import type { OrganizationScope } from '../domain/authorization-facts';
import type { Authorization } from '../application/authorization';
import { InvalidAuthorizationRequest } from '../application/authorization-errors';

const id = z.string().min(1).max(128).refine(value => value.trim().length > 0);
const querySchema = z.object({ scope: z.enum(['self', 'global', 'organization']).default('self'), companyId: id.optional(), thirdPartyId: id.optional() }).strict();
export function readPermissionScope(request: Request): OrganizationScope {
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some(key => query.getAll(key).length !== 1)) throw new InvalidAuthorizationRequest();
  const result = querySchema.safeParse(Object.fromEntries(query));
  if (!result.success) throw new InvalidAuthorizationRequest();
  const { scope, companyId, thirdPartyId } = result.data;
  if (scope === 'organization') {
    if (!companyId && !thirdPartyId) throw new InvalidAuthorizationRequest();
    return { kind: scope, companyId: companyId ?? null, thirdPartyId: thirdPartyId ?? null };
  }
  if (companyId || thirdPartyId) throw new InvalidAuthorizationRequest();
  return { kind: scope, companyId: null, thirdPartyId: null };
}
export async function permissionsResponse(authorization: Authorization, actor: AuthenticatedActor, request: Request) {
  return Response.json(await authorization.getEffectivePermissions(actor, readPermissionScope(request)), { headers: { 'Cache-Control': 'no-store' } });
}
