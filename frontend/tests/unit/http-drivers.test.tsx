import { describe, expect, it, vi } from 'vitest';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { SessionPort } from '@/modules/authentication/application/session-ports';
import { createProtectedHttp } from '@/modules/authentication/infrastructure/protected-http';
import { createDriverApi, type DriverTransport } from '@/modules/fleet/infrastructure/http-drivers';
import type { DriverDto } from '@/modules/fleet/application/fleet-api';

const thirdPartyId = '0123456789abcdef01234567';
const driverId = '1123456789abcdef01234567';
const scope: PermissionScope = { kind: 'organization', companyId: null, thirdPartyId };
const driver: DriverDto = { driver: { id: driverId, thirdPartyId, status: 'ACTIVE', version: 2,
  createdAt: '2026-11-19T00:00:00.000Z', updatedAt: '2026-11-19T00:00:00.000Z' },
  identity: { name: 'Ana Ruiz', documentType: null, documentNumber: null, email: 'ana@example.invalid' } };
function session() {
  const invalidate = vi.fn();
  const value: SessionPort = { snapshot: () => ({ status: 'authenticated', credentialRevision: 1 }), initialize: async () => {}, login: async () => {},
    logout: async () => {}, invalidate, subscribe: () => () => {} };
  return { value, invalidate };
}

describe('protected driver adapter', () => {
  it('uses only the explicit third-party destination and validates list/detail/status DTOs', async () => {
    const driverRequest = vi.fn<DriverTransport['driver']>(async (_method, path) =>
      path === 'drivers' ? { items: [driver], page: 1, pageSize: 20, total: 1 } : driver);
    const transport: DriverTransport = { driver: driverRequest };
    const api = createDriverApi(transport);
    const controller = new AbortController();
    await expect(api.listDrivers(scope, { page: 1, pageSize: 20, sort: 'createdAt', direction: 'desc' }, controller.signal))
      .resolves.toMatchObject({ items: [driver], total: 1 });
    await api.getDriver(scope, driverId, controller.signal);
    await api.setDriverStatus(scope, driverId, 2, 'INACTIVE', controller.signal);
    expect(driverRequest.mock.calls[0]).toEqual(['GET', 'drivers', `scope=organization&thirdPartyId=${thirdPartyId}&page=1&pageSize=20&sort=createdAt&direction=desc`, undefined, controller.signal]);
    expect(driverRequest.mock.calls[1]).toEqual(['GET', `drivers/${driverId}`, `scope=organization&thirdPartyId=${thirdPartyId}`, undefined, controller.signal]);
    expect(driverRequest.mock.calls[2]).toEqual(['PATCH', `drivers/${driverId}/status`, `scope=organization&thirdPartyId=${thirdPartyId}`, { expectedVersion: 2, status: 'INACTIVE' }, controller.signal]);
  });

  it('rejects global, company, invalid IDs, and malformed or open response bodies before exposing data', async () => {
    const driverRequest = vi.fn<DriverTransport['driver']>(async () => driver);
    const transport: DriverTransport = { driver: driverRequest };
    const api = createDriverApi(transport);
    await expect(api.listDrivers({ kind: 'global', companyId: null, thirdPartyId: null }, { page: 1, pageSize: 20, sort: 'status', direction: 'asc' }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(api.listDrivers({ kind: 'organization', companyId: 'company-1', thirdPartyId: null }, { page: 1, pageSize: 20, sort: 'status', direction: 'asc' }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(api.getDriver(scope, '../auth/me', new AbortController().signal)).rejects.toMatchObject({ code: 'CONFIGURATION' });
    expect(driverRequest).not.toHaveBeenCalled();
    driverRequest.mockResolvedValue({ ...driver, subject: 'must-not-pass' } as unknown as DriverDto);
    await expect(api.getDriver(scope, driverId, new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('allows only closed protected HTTP destinations and query parameters', async () => {
    const auth = session(); const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(driver));
    const http = createProtectedHttp('/api', { getAccessToken: async () => 'token' }, auth.value, fetcher);
    try {
      await expect(Promise.resolve().then(() => http.driver('GET', 'drivers/../auth/me', 'scope=organization&thirdPartyId=' + thirdPartyId))).rejects.toMatchObject({ code: 'CONFIGURATION' });
      await expect(Promise.resolve().then(() => http.driver('GET', 'drivers', 'scope=global&thirdPartyId=' + thirdPartyId))).rejects.toMatchObject({ code: 'CONFIGURATION' });
      await expect(Promise.resolve().then(() => http.driver('PATCH', `drivers/${driverId}/status`, `scope=organization&thirdPartyId=${thirdPartyId}`))).rejects.toMatchObject({ code: 'CONFIGURATION' });
      expect(fetcher).not.toHaveBeenCalled();
    } finally { http.dispose(); }
  });

  it.each([[401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [503, 'UNAVAILABLE']] as const)(
    'maps protected HTTP %i to %s', async (status, code) => {
      const auth = session(); const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code: status === 403 ? 'FORBIDDEN' : 'safe' } }, { status }));
      const http = createProtectedHttp('/api', { getAccessToken: async () => 'token' }, auth.value, fetcher);
      const denied = vi.fn(); http.subscribeForbidden(denied);
      try {
        await expect(createDriverApi(http).listDrivers(scope, { page: 1, pageSize: 20, sort: 'status', direction: 'desc' }, new AbortController().signal))
          .rejects.toMatchObject({ code });
        expect(auth.invalidate).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
        expect(denied).toHaveBeenCalledTimes(status === 403 ? 1 : 0);
      } finally { http.dispose(); }
    });

  it('preserves version conflicts and keeps the session active', async () => {
    const auth = session(); const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code: 'CONFLICT', message: 'safe' } }, { status: 409 }));
    const http = createProtectedHttp('/api', { getAccessToken: async () => 'token' }, auth.value, fetcher);
    try {
      await expect(createDriverApi(http).setDriverStatus(scope, driverId, 1, 'INACTIVE', new AbortController().signal))
        .rejects.toMatchObject({ businessCode: 'CONFLICT' });
      expect(auth.invalidate).not.toHaveBeenCalled();
    } finally { http.dispose(); }
  });

  it('propagates cancellation before requesting credentials or sending HTTP', async () => {
    const auth = session(); const credentials = { getAccessToken: vi.fn(async () => 'secret') }; const fetcher = vi.fn<typeof fetch>();
    const http = createProtectedHttp('/api', credentials, auth.value, fetcher);
    const controller = new AbortController(); controller.abort();
    try {
      await expect(createDriverApi(http).listDrivers(scope, { page: 1, pageSize: 20, sort: 'createdAt', direction: 'desc' }, controller.signal))
        .rejects.toMatchObject({ code: 'CANCELLED' });
      expect(credentials.getAccessToken).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
    } finally { http.dispose(); }
  });
});
