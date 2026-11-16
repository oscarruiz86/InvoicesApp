import { z } from 'zod';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { InvalidAuthorizationRequest } from '@/modules/identity/application/authorization-errors';
import type { OrganizationContexts } from '../application/context-ports';

const id = z.string().min(1).max(128).refine(value => value.trim().length > 0);
const bodySchema = z.object({ selection: z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('GLOBAL') }).strict(),
  z.object({ kind: z.literal('ORGANIZATION'), organizationId: id, organizationType: z.enum(['COMPANY', 'THIRD_PARTY']) }).strict(),
]), reason: z.enum(['INITIAL', 'SWITCH', 'RESTORE']) }).strict();
function noQuery(request: Request) { if (new URL(request.url).searchParams.size) throw new InvalidAuthorizationRequest(); }
export async function availableContextsResponse(service: OrganizationContexts, actor: AuthenticatedActor, request: Request) {
  noQuery(request);
  return Response.json(await service.available(actor), { headers: { 'Cache-Control': 'no-store' } });
}
export async function resolveContextResponse(service: OrganizationContexts, actor: AuthenticatedActor, request: Request) {
  noQuery(request);
  let json: unknown;
  try { json = await request.json(); } catch { throw new InvalidAuthorizationRequest(); }
  const result = bodySchema.safeParse(json);
  if (!result.success) throw new InvalidAuthorizationRequest();
  return Response.json(await service.resolve(actor, result.data.selection, result.data.reason), { headers: { 'Cache-Control': 'no-store' } });
}
