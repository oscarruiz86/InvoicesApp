import { z } from 'zod';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { Authorization } from '@/modules/identity/application/authorization';
import type { createParameterUseCases } from '../application/parameters';
import { errorResponse } from '@/shared/presentation/http/errors';
import { ParameterError } from '../application/parameters';

type UseCases = ReturnType<typeof createParameterUseCases>;
const updateSchema = z.object({ expectedVersion: z.number().int().positive(), value: z.number().int().safe() }).strict();
function requireGlobal(request: Request, allowed: readonly string[] = ['scope']) {
  const q = new URL(request.url).searchParams;
  if (q.getAll('scope').length !== 1 || q.get('scope') !== 'global' || [...q.keys()].some(key => !allowed.includes(key) || q.getAll(key).length !== 1)) throw new ParameterError('INVALID_REQUEST');
}
const listQuery = z.object({ scope: z.literal('global'), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), q: z.string().max(100).optional() }).strict();
const historyQuery = z.object({ scope: z.literal('global'), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).strict();
function response(error: unknown) {
  if (error instanceof ParameterError) {
    const status = error.code === 'INVALID_REQUEST' ? 400 : error.code === 'RESOURCE_NOT_FOUND' || error.code === 'PARAMETER_NOT_INITIALIZED' ? 404
      : error.code === 'PARAMETER_VERSION_CONFLICT' ? 409 : error.code === 'FORBIDDEN' ? 403 : 503;
    const code = error.code === 'PARAMETER_NOT_INITIALIZED' ? 'PARAMETER_NOT_INITIALIZED' : error.code;
    return Response.json({ error: { code, message: 'No fue posible completar la operación.' } }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
  return errorResponse(error);
}
export function parameterHandlers(useCases: UseCases, auth: Authorization) {
  const authorize = (actor: AuthenticatedActor, permission: 'parameters:read'|'parameters:update') => auth.requirePermission(actor, permission, { kind: 'global', companyId: null, thirdPartyId: null });
  const headers = { 'Cache-Control': 'no-store' };
  return {
    async list(actor: AuthenticatedActor, request: Request) {
      try { requireGlobal(request, ['scope','page','pageSize','q']); const parsed = listQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams)); if (!parsed.success) throw new ParameterError('INVALID_REQUEST'); await authorize(actor, 'parameters:read');
        return Response.json(await useCases.list({ page: parsed.data.page, pageSize: parsed.data.pageSize, ...(parsed.data.q === undefined ? {} : { q: parsed.data.q }) }), { headers });
      } catch (error) { return response(error); }
    },
    async detail(actor: AuthenticatedActor, request: Request, key: string) {
      try { requireGlobal(request); await authorize(actor, 'parameters:read'); return Response.json(await useCases.detail(decodeURIComponent(key)), { headers }); }
      catch (error) { return response(error); }
    },
    async history(actor: AuthenticatedActor, request: Request, key: string) {
      try { requireGlobal(request, ['scope','page','pageSize']); const parsed = historyQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams)); if (!parsed.success) throw new ParameterError('INVALID_REQUEST'); await authorize(actor, 'parameters:read');
        return Response.json(await useCases.history(decodeURIComponent(key), parsed.data.page, parsed.data.pageSize), { headers });
      } catch (error) { return response(error); }
    },
    async update(actor: AuthenticatedActor, request: Request, key: string) {
      try { requireGlobal(request); await authorize(actor, 'parameters:update'); if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new ParameterError('INVALID_REQUEST');
        let body: unknown; try { body = await request.json(); } catch { throw new ParameterError('INVALID_REQUEST'); }
        const parsed = updateSchema.safeParse(body); if (!parsed.success) throw new ParameterError('INVALID_REQUEST');
        return Response.json(await useCases.update({ key: decodeURIComponent(key), ...parsed.data, actor: actor.subject }), { headers });
      } catch (error) { return response(error); }
    },
  };
}
