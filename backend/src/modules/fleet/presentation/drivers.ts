import { z } from 'zod';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { DriverUseCaseError } from '../application/drivers';
import type { DriverStatus } from '../domain/driver';
import { errorResponse } from '@/shared/presentation/http/errors';

const idSchema = z.string().regex(/^[a-f0-9]{24}$/);
const listSchema = z.object({
  scope: z.literal('organization'),
  thirdPartyId: idSchema,
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt', 'status']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).strict();
const selectedScopeSchema = z.object({ scope: z.literal('organization'), thirdPartyId: idSchema }).strict();
const statusSchema = z.object({ expectedVersion: z.number().int().safe().min(1), status: z.enum(['ACTIVE', 'INACTIVE']) }).strict();

export type DriverOperation = 'list' | 'detail' | 'status';
interface DriverUseCases {
  list(actor: AuthenticatedActor, input: { thirdPartyId: string; page: number; pageSize: number; sort: 'createdAt' | 'status'; direction: 'asc' | 'desc'; status?: DriverStatus }): Promise<unknown>;
  detail(actor: AuthenticatedActor, input: { id: string; thirdPartyId: string }): Promise<unknown>;
  transition(actor: AuthenticatedActor, input: { id: string; thirdPartyId: string; expectedVersion: number; status: DriverStatus }): Promise<unknown>;
}

function invalid(error: unknown): unknown {
  return error instanceof z.ZodError || error instanceof SyntaxError ? new DriverUseCaseError('INVALID_REQUEST') : error;
}

function respondError(error: unknown): Response {
  error = invalid(error);
  if (error instanceof DriverUseCaseError) {
    const status = error.code === 'UNAVAILABLE' ? 503 : error.code === 'CONFLICT' ? 409
      : error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400;
    const message = status === 503 ? 'El servicio no está disponible.' : status === 409 ? 'El conductor o la membership cambió.'
      : status === 403 ? 'No tienes permiso para esta operación.' : status === 404 ? 'No se encontró el conductor.' : 'Revisa los datos de la solicitud.';
    return Response.json({ error: { code: error.code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
  return errorResponse(error);
}

export function driverResponse(service: DriverUseCases, operation: DriverOperation, actor: AuthenticatedActor, request: Request, idValue?: string) {
  return respond();
  async function respond() {
    try {
      const url = new URL(request.url);
      const raw: Record<string, string> = {};
      for (const [key, value] of url.searchParams) {
        const allowed = operation === 'list' ? ['scope', 'thirdPartyId', 'page', 'pageSize', 'sort', 'direction', 'status'] : ['scope', 'thirdPartyId'];
        if (Object.hasOwn(raw, key) || !allowed.includes(key)) throw new DriverUseCaseError('INVALID_REQUEST');
        raw[key] = value;
      }
      if (operation !== 'list' && operation !== 'detail' && operation !== 'status') throw new DriverUseCaseError('INVALID_REQUEST');
      let result: unknown;
      if (operation === 'list') {
        const parsed = listSchema.parse(raw);
        const input = { thirdPartyId: parsed.thirdPartyId, page: parsed.page, pageSize: parsed.pageSize, sort: parsed.sort, direction: parsed.direction, ...(parsed.status ? { status: parsed.status } : {}) };
        result = await service.list(actor, input);
      } else {
        const { thirdPartyId } = selectedScopeSchema.parse(raw);
        const id = idSchema.parse(idValue);
        if (operation === 'detail') result = await service.detail(actor, { id, thirdPartyId });
        else {
          const input = statusSchema.parse(await request.json());
          result = await service.transition(actor, { id, thirdPartyId, ...input });
        }
      }
      return Response.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return respondError(error); }
  }
}
