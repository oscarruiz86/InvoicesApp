import { expect, it, vi } from 'vitest';
import { createVehicleApi } from '@/modules/fleet/infrastructure/http-vehicles';
import { createProtectedHttp } from '@/modules/authentication/infrastructure/protected-http';
import type { SessionPort } from '@/modules/authentication/application/session-ports';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
const thirdPartyId = 'a'.repeat(24), id = 'b'.repeat(24);
const scope: PermissionScope = { kind: 'organization', companyId: null, thirdPartyId };
const record = { id, thirdPartyId, plate: 'ABC123', internalNumber: '001', propertyCardNumber: '0001', status: 'ACTIVE', version: 1, createdAt: '2026-11-19T00:00:00.000Z', updatedAt: '2026-11-19T00:00:00.000Z', createdBy: 'a', updatedBy: 'a', currentDriver: null, currentDrivers: [], assignmentState: 'UNAVAILABLE' };
const fields = { plate: record.plate, internalNumber: record.internalNumber, propertyCardNumber: record.propertyCardNumber };
const query = { page: 1, pageSize: 20, sort: 'internalNumber' as const, direction: 'asc' as const, q: '001' };
const signal = new AbortController().signal;
function fixture(fetcher: typeof fetch, timeout = 5000) {
  const invalidate = vi.fn();
  const session: SessionPort = { snapshot: () => ({ status: 'authenticated', credentialRevision: 1 }), subscribe: () => () => {}, initialize: async () => {}, login: async () => {}, logout: async () => {}, invalidate };
  const http = createProtectedHttp('/api', { getAccessToken: async () => 'token' }, session, fetcher, timeout);
  return { http, api: createVehicleApi(http), invalidate };
}
it('uses closed scoped CRUD routes and validates complete DTOs', async () => {
  const transport = { vehicle: vi.fn(async (method: string, path: string) => method === 'GET' && path === 'vehicles' ? { items: [record], total: 1, page: 1, pageSize: 20 } : record) };
  const api = createVehicleApi(transport);
  await api.listVehicles(scope, query, signal); await api.getVehicle(scope, id, signal); await api.createVehicle(scope, fields, signal); await api.updateVehicle(scope, id, 1, fields, signal); await api.setVehicleStatus(scope, id, 1, 'INACTIVE', signal);
  expect(transport.vehicle.mock.calls.map(c => c.slice(0, 2))).toEqual([['GET', 'vehicles'], ['GET', `vehicles/${id}`], ['POST', 'vehicles'], ['PATCH', `vehicles/${id}`], ['PATCH', `vehicles/${id}/status`]]);
});
it.each([[401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [503, 'UNAVAILABLE']] as const)('maps HTTP %i and invalidates authorization on 403', async (status, code) => {
  const f = fixture(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code: 'safe' } }, { status })));
  const forbidden = vi.fn(); f.http.subscribeForbidden(forbidden);
  try { await expect(f.api.getVehicle(scope, id, signal)).rejects.toMatchObject({ code }); expect(forbidden).toHaveBeenCalledTimes(status === 403 ? 1 : 0); expect(f.invalidate).toHaveBeenCalledTimes(status === 401 ? 1 : 0); } finally { f.http.dispose(); }
});
it('preserves identifier and version conflicts', async () => {
  for (const businessCode of ['VEHICLE_VERSION_CONFLICT', 'VEHICLE_IDENTIFIER_CONFLICT', 'VEHICLE_HAS_OPEN_ASSIGNMENT']) {
    const f = fixture(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code: businessCode } }, { status: 409 })));
    try { await expect(f.api.updateVehicle(scope, id, 1, fields, signal)).rejects.toMatchObject({ businessCode }); } finally { f.http.dispose(); }
  }
});
it('rejects open responses, context leakage and traversal routes', async () => {
  const transport = { vehicle: vi.fn(async () => ({ ...record, injected: true })) };
  await expect(createVehicleApi(transport).getVehicle(scope, id, signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  const f = fixture(vi.fn<typeof fetch>());
  try {
    for (const path of ['vehicles/../auth/me', 'vehicles/x', 'vehicles/' + id + '/transfer']) expect(() => f.http.vehicle('GET', path, `scope=organization&thirdPartyId=${thirdPartyId}`)).toThrow();
    expect(() => f.http.vehicle('GET', 'vehicles', `scope=organization&thirdPartyId=${thirdPartyId}&thirdPartyId=${thirdPartyId}`)).toThrow();
    await expect(f.api.getVehicle({ kind: 'global', companyId: null, thirdPartyId: null }, id, signal)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  } finally { f.http.dispose(); }
});
it('supports cancellation and timeout without publishing late malformed responses', async () => {
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
  const f = fixture(fetcher, 10);
  try {
    await expect(f.api.getVehicle(scope, id, signal)).rejects.toMatchObject({ code: 'TIMEOUT' });
    const controller = new AbortController(); controller.abort();
    await expect(f.api.getVehicle(scope, id, controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
  } finally { f.http.dispose(); }
});
