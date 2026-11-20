import { expect, it, vi } from 'vitest';
import { vehicleResponse } from '@/modules/fleet/presentation/vehicles';
import { VehicleUseCaseError } from '@/modules/fleet/application/vehicles';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
const thirdPartyId = 'a'.repeat(24), id = 'b'.repeat(24);
const actor: AuthenticatedActor = { subject: 'admin', roles: [], permissions: [], username: null, name: null, email: null };
const scope = `scope=organization&thirdPartyId=${thirdPartyId}`;
const request = (query = scope, body?: unknown) => new Request('http://localhost/api/vehicles?' + query, body === undefined ? {} : { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
function fixture() { return { list: vi.fn(async () => ({ items: [], page: 1, pageSize: 20, total: 0 })), detail: vi.fn(async () => ({ id })), create: vi.fn(async () => ({ id })), update: vi.fn(async () => ({ id })), transition: vi.fn(async () => ({ id })) }; }
it('parses pagination, search and sort defaults and exposes a 201 Location', async () => {
  const service = fixture();
  expect((await vehicleResponse(service as never, 'list', actor, request())).status).toBe(200);
  expect(service.list).toHaveBeenCalledWith(actor, { thirdPartyId, page: 1, pageSize: 20, sort: 'plate', direction: 'asc' });
  const created = await vehicleResponse(service as never, 'create', actor, request(scope, { plate: 'ABC123', internalNumber: '001', propertyCardNumber: '0001' }));
  expect(created.status).toBe(201); expect(created.headers.get('Location')).toContain(id); expect(created.headers.get('Cache-Control')).toBe('no-store');
});
it('rejects duplicate, unknown and cross-scope query parameters and invalid IDs', async () => {
  const service = fixture();
  for (const query of ['', scope + '&page=1&page=2', scope + '&companyId=' + id, scope + '&sort=subject', scope + '&q=', scope.replace('organization', 'self')]) expect((await vehicleResponse(service as never, 'list', actor, request(query))).status).toBe(400);
  expect((await vehicleResponse(service as never, 'detail', actor, request(), 'bad')).status).toBe(400);
  expect(service.list).not.toHaveBeenCalled(); expect(service.detail).not.toHaveBeenCalled();
});
it('rejects open bodies and empty edits', async () => {
  const service = fixture();
  for (const body of [{ expectedVersion: 1, changes: {} }, { expectedVersion: 1, changes: { thirdPartyId } }, { expectedVersion: '1', changes: { plate: 'ABC123' } }, { expectedVersion: 1, changes: { plate: 'ABC123' }, actor: 'bad' }]) expect((await vehicleResponse(service as never, 'update', actor, request(scope, body), id)).status).toBe(400);
  expect(service.update).not.toHaveBeenCalled();
});
it('maps all business failures and keeps unexpected failures safe', async () => {
  const service = fixture();
  for (const [code, status] of [['FORBIDDEN', 403], ['RESOURCE_NOT_FOUND', 404], ['VEHICLE_VERSION_CONFLICT', 409], ['VEHICLE_IDENTIFIER_CONFLICT', 409], ['VEHICLE_HAS_OPEN_ASSIGNMENT', 409], ['AUTHORIZATION_UNAVAILABLE', 503], ['VEHICLE_STORAGE_UNAVAILABLE', 503], ['ASSIGNMENT_PROVIDER_UNAVAILABLE', 503]] as const) {
    service.detail.mockRejectedValue(new VehicleUseCaseError(code));
    const response = await vehicleResponse(service as never, 'detail', actor, request(), id); expect(response.status).toBe(status); expect(await response.json()).toMatchObject({ error: { code } });
  }
  service.detail.mockRejectedValue(new Error('secret body'));
  const response = await vehicleResponse(service as never, 'detail', actor, request(), id); expect(response.status).toBe(500); expect(await response.text()).not.toContain('secret body');
});
