import { z } from 'zod';
import { applicationRoles, type AuthenticatedActor } from '../domain/actor';
import { grantCeiling, permissions, validPolicyGrants, type Grant } from '../domain/permissions';
import type { RolePolicyUseCases } from '../application/role-policy';
import { InvalidAuthorizationRequest } from '../application/authorization-errors';

const grantSchema = z.object({
  role: z.enum(applicationRoles),
  permission: z.enum(permissions),
  scope: z.enum(['self', 'global', 'company', 'third-party']),
}).strict();
const replaceSchema = z.object({
  expectedVersion: z.string().regex(/^[1-9]\d{0,15}$/),
  grants: z.array(grantSchema).max(grantCeiling.length),
}).strict();

function requireGlobalScope(request: Request): void {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => params.getAll(key).length !== 1)
    || params.size !== 1 || params.get('scope') !== 'global') throw new InvalidAuthorizationRequest();
}

export function rolePolicyHandlers(useCases: RolePolicyUseCases) {
  const headers = { 'Cache-Control': 'no-store' };
  return {
    async read(actor: AuthenticatedActor, request: Request): Promise<Response> {
      requireGlobalScope(request);
      return Response.json(await useCases.read(actor), { headers });
    },
    async replace(actor: AuthenticatedActor, request: Request): Promise<Response> {
      requireGlobalScope(request);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new InvalidAuthorizationRequest();
      let body: unknown;
      try { body = await request.json(); } catch { throw new InvalidAuthorizationRequest(); }
      const parsed = replaceSchema.safeParse(body);
      if (!parsed.success || !validPolicyGrants(parsed.data.grants as Grant[])) throw new InvalidAuthorizationRequest();
      return Response.json(await useCases.replace(actor, parsed.data.expectedVersion, parsed.data.grants as Grant[]), { headers });
    },
  };
}
