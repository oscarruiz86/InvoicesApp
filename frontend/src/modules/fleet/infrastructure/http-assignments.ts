import { z } from 'zod';
import { ApplicationError } from '@/shared/application/application-error';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { AssignmentApi, AssignmentDto, AssignmentListQuery, FleetPage } from '../application/fleet-api';

export interface AssignmentTransport {
  assignment(method: 'GET' | 'POST', path: string, query: string, body?: unknown, signal?: AbortSignal): Promise<unknown>;
}
const id = z.string().regex(/^[a-f0-9]{24}$/);
const assignment = z.object({ id, thirdPartyId: id, vehicleId: id, vehiclePlate: z.string().min(1).max(32).nullable().optional(),
  driver: z.object({ id, name: z.string().min(1).max(200) }).strict(), status: z.enum(['ACTIVE', 'CLOSED']),
  startedAt: z.string().datetime(), endedAt: z.string().datetime().nullable(), version: z.number().int().safe().positive() }).strict();
const page = z.object({ items: z.array(assignment), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive().max(100) }).strict();
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success) throw new ApplicationError('INVALID_RESPONSE'); return result.data; }
function selected(scope: PermissionScope) {
  if (scope.kind !== 'organization' || scope.companyId !== null || !id.safeParse(scope.thirdPartyId).success) throw new ApplicationError('FORBIDDEN');
  return new URLSearchParams({ scope: 'organization', thirdPartyId: scope.thirdPartyId! });
}
function resourcePath(value: string) { if (!id.safeParse(value).success) throw new ApplicationError('CONFIGURATION'); return `assignments/${value}`; }
function version(value: number) { if (!Number.isSafeInteger(value) || value < 1) throw new ApplicationError('CONFIGURATION'); return value; }
function scoped(scope: PermissionScope, raw: unknown, expectedId?: string): AssignmentDto {
  const result = parse(assignment, raw);
  if (result.thirdPartyId !== scope.thirdPartyId || (expectedId !== undefined && result.id !== expectedId)) throw new ApplicationError('INVALID_RESPONSE');
  return result;
}
export function createAssignmentApi(http: AssignmentTransport): AssignmentApi {
  return {
    async listAssignments(scope, query: AssignmentListQuery, signal) {
      const search = selected(scope);
      for (const key of ['page', 'pageSize', 'sort', 'direction', 'status', 'driverId', 'vehicleId', 'q'] as const)
        if (query[key] !== undefined) search.set(key, String(query[key]));
      const result = parse(page, await http.assignment('GET', 'assignments', search.toString(), undefined, signal));
      if (result.items.some(item => item.thirdPartyId !== scope.thirdPartyId)) throw new ApplicationError('INVALID_RESPONSE');
      return result as FleetPage<AssignmentDto>;
    },
    async getAssignment(scope, idValue, signal) { return scoped(scope, await http.assignment('GET', resourcePath(idValue), selected(scope).toString(), undefined, signal), idValue); },
    async createAssignment(scope, input, signal) {
      if (!id.safeParse(input.vehicleId).success || !id.safeParse(input.driverId).success) throw new ApplicationError('CONFIGURATION');
      return scoped(scope, await http.assignment('POST', 'assignments', selected(scope).toString(), input, signal));
    },
    async closeAssignment(scope, idValue, expectedVersion, signal) {
      return scoped(scope, await http.assignment('POST', `${resourcePath(idValue)}/close`, selected(scope).toString(),
        { expectedVersion: version(expectedVersion) }, signal), idValue);
    },
  };
}
