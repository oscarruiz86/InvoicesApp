import { z } from 'zod';
import { ApplicationError } from '@/shared/application/application-error';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { DriverApi, DriverDto, DriverListQuery, FleetPage, FleetStatus } from '../application/fleet-api';

export interface DriverTransport {
  driver(method: 'GET' | 'PATCH', path: string, query?: string, body?: unknown, signal?: AbortSignal): Promise<unknown>;
}

const idSchema = z.string().regex(/^[a-f0-9]{24}$/);
const driverSchema = z.object({
  driver: z.object({ id: idSchema, thirdPartyId: idSchema, status: z.enum(['ACTIVE', 'INACTIVE']), version: z.number().int().positive(),
    createdAt: z.string().datetime(), updatedAt: z.string().datetime() }).strict(),
  identity: z.object({ name: z.string().min(1), documentType: z.string().nullable(), documentNumber: z.string().nullable(), email: z.string().email().nullable() }).strict().nullable(),
}).strict();
const pageSchema = z.object({ items: z.array(driverSchema), page: z.number().int().positive(), pageSize: z.number().int().positive().max(100), total: z.number().int().nonnegative() }).strict();

function thirdPartyScope(scope: PermissionScope): string {
  if (scope.kind !== 'organization' || scope.companyId !== null || !idSchema.safeParse(scope.thirdPartyId).success) throw new ApplicationError('FORBIDDEN');
  return new URLSearchParams({ scope: 'organization', thirdPartyId: scope.thirdPartyId! }).toString();
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApplicationError('INVALID_RESPONSE');
  return result.data;
}

export function createDriverApi(transport: DriverTransport): DriverApi {
  return {
    async listDrivers(scope, query: DriverListQuery, signal) {
      const search = new URLSearchParams(thirdPartyScope(scope));
      search.set('page', String(query.page)); search.set('pageSize', String(query.pageSize));
      search.set('sort', query.sort); search.set('direction', query.direction);
      if (query.status) search.set('status', query.status);
      return parse(pageSchema, await transport.driver('GET', 'drivers', search.toString(), undefined, signal)) as FleetPage<DriverDto>;
    },
    async getDriver(scope, id, signal) {
      if (!idSchema.safeParse(id).success) throw new ApplicationError('CONFIGURATION');
      return parse(driverSchema, await transport.driver('GET', `drivers/${id}`, thirdPartyScope(scope), undefined, signal)) as DriverDto;
    },
    async setDriverStatus(scope, id, version, status: FleetStatus, signal) {
      if (!idSchema.safeParse(id).success || !Number.isSafeInteger(version) || version < 1 || !['ACTIVE', 'INACTIVE'].includes(status)) throw new ApplicationError('CONFIGURATION');
      return parse(driverSchema, await transport.driver('PATCH', `drivers/${id}/status`, thirdPartyScope(scope), { expectedVersion: version, status }, signal)) as DriverDto;
    },
  };
}
