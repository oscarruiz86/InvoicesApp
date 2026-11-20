import { z } from 'zod';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { errorResponse } from '@/shared/presentation/http/errors';
import { AssignmentUseCaseError, type createAssignments } from '../application/assignments';

const id = z.string().regex(/^[a-f0-9]{24}$/);
const selected = z.object({ scope: z.literal('organization'), thirdPartyId: id }).strict();
const listQuery = selected.extend({
  driverId: id.optional(), vehicleId: id.optional(), status: z.enum(['ACTIVE', 'CLOSED']).optional(),
  q: z.string().trim().min(1).max(100).optional(), page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['startedAt', 'status', 'driverName', 'vehicleId']).default('startedAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});
const createBody = z.object({ vehicleId: id, driverId: id }).strict();
const closeBody = z.object({ expectedVersion: z.number().int().safe().min(1) }).strict();
export type AssignmentOperation = 'list' | 'detail' | 'create' | 'close';
type AssignmentUseCases = ReturnType<typeof createAssignments>;

function invalid(error: unknown) {
  return error instanceof z.ZodError || error instanceof SyntaxError ? new AssignmentUseCaseError('INVALID_REQUEST') : error;
}

function respondError(failure: unknown): Response {
  const error = invalid(failure);
  if (!(error instanceof AssignmentUseCaseError)) return errorResponse(error);
  const status = error.code === 'INVALID_REQUEST' ? 400 : error.code === 'FORBIDDEN' ? 403
    : error.code === 'RESOURCE_NOT_FOUND' ? 404
      : ['ACTIVE_ASSIGNMENT_CONFLICT', 'ASSIGNMENT_VERSION_CONFLICT'].includes(error.code) ? 409 : 503;
  const message = status === 400 ? 'Revisa los datos de la solicitud.' : status === 403 ? 'No tienes permiso para esta operación.'
    : status === 404 ? 'No se encontró la asignación.' : status === 409 ? 'La asignación cambió o el mismo par ya tiene una relación activa.'
      : 'No fue posible confirmar la asignación.';
  return Response.json({ error: { code: error.code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function assignmentResponse(service: AssignmentUseCases, operation: AssignmentOperation, actor: AuthenticatedActor,
  request: Request, idValue?: string): Promise<Response> {
  try {
    const url = new URL(request.url);
    const raw: Record<string, string> = {};
    for (const [key, value] of url.searchParams) {
      if (Object.hasOwn(raw, key)) throw new AssignmentUseCaseError('INVALID_REQUEST');
      raw[key] = value;
    }
    let result: unknown;
    if (operation === 'list') {
      const { scope: ignored, ...input } = listQuery.parse(raw); void ignored;
      result = await service.list(actor, input);
    } else {
      const { thirdPartyId } = selected.parse(raw);
      if (operation === 'create') result = await service.create(actor, { thirdPartyId, ...createBody.parse(await request.json()) });
      else {
        const idValueParsed = id.parse(idValue);
        if (operation === 'detail') result = await service.detail(actor, { id: idValueParsed, thirdPartyId });
        else result = await service.close(actor, { id: idValueParsed, thirdPartyId, ...closeBody.parse(await request.json()) });
      }
    }
    const status = operation === 'create' ? 201 : 200;
    return Response.json(result, { status, headers: { 'Cache-Control': 'no-store',
      ...(operation === 'create' && result && typeof result === 'object' && 'id' in result
        ? { Location: `/api/assignments/${result.id}?scope=organization&thirdPartyId=${raw.thirdPartyId}` } : {}) } });
  } catch (error) { return respondError(error); }
}
