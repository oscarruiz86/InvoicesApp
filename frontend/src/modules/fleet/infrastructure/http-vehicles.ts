import { z } from 'zod';
import { ApplicationError } from '@/shared/application/application-error';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { VehicleApi, VehicleFields } from '../application/fleet-api';
export interface VehicleTransport { vehicle(method: 'GET' | 'POST' | 'PATCH', path: string, query: string, body?: unknown, signal?: AbortSignal): Promise<unknown> }
const id = z.string().regex(/^[a-f0-9]{24}$/);
const vehicle = z.object({ id, thirdPartyId: id, plate: z.string().regex(/^[A-Z]{3}\d{2,3}$/), internalNumber: z.string().regex(/^[A-Z0-9-]{1,40}$/), propertyCardNumber: z.string().regex(/^[A-Z0-9-]{1,64}$/),
  status: z.enum(['ACTIVE', 'INACTIVE']), version: z.number().int().safe().positive(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(), createdBy: z.string().min(1), updatedBy: z.string().min(1),
  currentDriver: z.object({ id: z.string().min(1), name: z.string().min(1) }).strict().nullable(), assignmentState: z.enum(['UNAVAILABLE', 'UNASSIGNED', 'ASSIGNED']) }).strict()
  .refine(value => (value.assignmentState === 'ASSIGNED') === (value.currentDriver !== null));
const page = z.object({ items: z.array(vehicle), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive().max(100) }).strict();
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success) throw new ApplicationError('INVALID_RESPONSE'); return result.data; }
function selected(scope: PermissionScope) {
  if (scope.kind !== 'organization' || scope.companyId !== null || !id.safeParse(scope.thirdPartyId).success) throw new ApplicationError('FORBIDDEN');
  return new URLSearchParams({ scope: 'organization', thirdPartyId: scope.thirdPartyId! });
}
function path(value: string) { if (!id.safeParse(value).success) throw new ApplicationError('CONFIGURATION'); return `vehicles/${value}`; }
function version(value: number) { if (!Number.isSafeInteger(value) || value < 1) throw new ApplicationError('CONFIGURATION'); return value; }
function scopedVehicle(scope: PermissionScope, input: unknown, expectedId?: string) {
  const result = parse(vehicle, input);
  if (result.thirdPartyId !== scope.thirdPartyId || (expectedId !== undefined && result.id !== expectedId)) throw new ApplicationError('INVALID_RESPONSE');
  return result;
}
function fields(input: Partial<VehicleFields>) {
  if (!Object.keys(input).length || Object.keys(input).some(key => !['plate', 'internalNumber', 'propertyCardNumber'].includes(key))) throw new ApplicationError('CONFIGURATION');
  return input;
}
export function createVehicleApi(http: VehicleTransport): VehicleApi {
  return {
    async listVehicles(scope, query, signal) {
      const search = selected(scope);
      for (const key of ['page', 'pageSize', 'sort', 'direction', 'status', 'q'] as const) if (query[key] !== undefined) search.set(key, String(query[key]));
      const result = parse(page, await http.vehicle('GET', 'vehicles', search.toString(), undefined, signal));
      if (result.items.some(item => item.thirdPartyId !== scope.thirdPartyId)) throw new ApplicationError('INVALID_RESPONSE');
      return result;
    },
    async getVehicle(scope, value, signal) { return scopedVehicle(scope, await http.vehicle('GET', path(value), selected(scope).toString(), undefined, signal), value); },
    async createVehicle(scope, input, signal) { return scopedVehicle(scope, await http.vehicle('POST', 'vehicles', selected(scope).toString(), fields(input), signal)); },
    async updateVehicle(scope, value, expectedVersion, changes, signal) { return scopedVehicle(scope, await http.vehicle('PATCH', path(value), selected(scope).toString(), { expectedVersion: version(expectedVersion), changes: fields(changes) }, signal), value); },
    async setVehicleStatus(scope, value, expectedVersion, status, signal) { return scopedVehicle(scope, await http.vehicle('PATCH', `${path(value)}/status`, selected(scope).toString(), { expectedVersion: version(expectedVersion), status }, signal), value); },
  };
}
