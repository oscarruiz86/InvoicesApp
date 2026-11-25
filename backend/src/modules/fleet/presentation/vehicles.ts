import { z } from 'zod';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { errorResponse } from '@/shared/presentation/http/errors';
import { VehicleUseCaseError, type createVehicles } from '../application/vehicles';
const id = z.string().regex(/^[a-f0-9]{24}$/);
const field = (max: number) => z.string().min(1).max(max + 20);
const fields = z.object({ plate: field(10), internalNumber: field(40), propertyCardNumber: field(64) }).strict();
const version = z.number().int().safe().positive();
const selected = z.object({ scope: z.literal('organization'), thirdPartyId: id }).strict();
const query = selected.extend({ page: z.coerce.number().int().min(1).max(1_000_000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['plate', 'internalNumber', 'propertyCardNumber', 'status', 'createdAt']).default('plate'), direction: z.enum(['asc', 'desc']).default('asc'),
  q: z.string().trim().min(1).max(100).optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional() });
const update = z.object({ expectedVersion: version, changes: fields.partial().refine(value => Object.keys(value).length > 0) }).strict();
const status = z.object({ expectedVersion: version, status: z.enum(['ACTIVE', 'INACTIVE']) }).strict();
export type VehicleOperation = 'list' | 'detail' | 'create' | 'update' | 'status';
export async function vehicleResponse(service: ReturnType<typeof createVehicles>, operation: VehicleOperation, actor: AuthenticatedActor, request: Request, idValue?: string): Promise<Response> {
  try {
    const parameters = new URL(request.url).searchParams;
    const raw: Record<string, string> = {};
    for (const [key, value] of parameters) {
      if (Object.hasOwn(raw, key)) throw new VehicleUseCaseError('INVALID_REQUEST');
      raw[key] = value;
    }
    let result;
    if (operation === 'list') {
      const { scope: ignored, ...input } = query.parse(raw); void ignored;
      result = await service.list(actor, input);
    } else {
      const { thirdPartyId } = selected.parse(raw);
      if (operation === 'create') result = await service.create(actor, { thirdPartyId, fields: fields.parse(await request.json()) });
      else {
        const input = { thirdPartyId, id: id.parse(idValue) };
        if (operation === 'detail') result = await service.detail(actor, input);
        else if (operation === 'update') result = await service.update(actor, { ...input, ...update.parse(await request.json()) });
        else result = await service.transition(actor, { ...input, ...status.parse(await request.json()) });
      }
    }
    return Response.json(result, { status: operation === 'create' ? 201 : 200, headers: { 'Cache-Control': 'no-store',
      ...(operation === 'create' && 'id' in result ? { Location: `/api/vehicles/${result.id}?scope=organization&thirdPartyId=${raw.thirdPartyId}` } : {}) } });
  } catch (failure) {
    const error = failure instanceof z.ZodError || failure instanceof SyntaxError ? new VehicleUseCaseError('INVALID_REQUEST') : failure;
    if (!(error instanceof VehicleUseCaseError)) return errorResponse(error);
    const status = error.code === 'INVALID_REQUEST' ? 400 : error.code === 'FORBIDDEN' ? 403 : error.code === 'RESOURCE_NOT_FOUND' ? 404
      : ['VEHICLE_VERSION_CONFLICT', 'VEHICLE_IDENTIFIER_CONFLICT', 'VEHICLE_HAS_OPEN_ASSIGNMENT'].includes(error.code) ? 409 : 503;
    return Response.json({ error: { code: error.code, message: status === 400 ? 'Revisa los datos de la solicitud.' : status === 403 ? 'No tienes permiso para esta operación.'
      : status === 404 ? 'No se encontró el vehículo.' : status === 409 ? 'No se pudo confirmar el cambio del vehículo.' : 'No se pudo verificar la disponibilidad del servicio.' } }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
