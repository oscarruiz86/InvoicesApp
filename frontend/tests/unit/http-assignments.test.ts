import { expect, it, vi } from 'vitest';
import { createAssignmentApi } from '@/modules/fleet/infrastructure/http-assignments';
import { createProtectedHttp } from '@/modules/authentication/infrastructure/protected-http';
import type { SessionPort } from '@/modules/authentication/application/session-ports';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';

const thirdPartyId = 'a'.repeat(24), id = 'b'.repeat(24), driverId = 'c'.repeat(24), vehicleId = 'd'.repeat(24);
const scope: PermissionScope = { kind: 'organization', companyId: null, thirdPartyId };
const record = { id, thirdPartyId, vehicleId, vehiclePlate: 'ABC123', driver: { id: driverId, name: 'Conductor Uno' }, status: 'ACTIVE',
  startedAt: '2026-11-20T00:00:00.000Z', endedAt: null, version: 1 };
const signal = new AbortController().signal;
function fixture(fetcher: typeof fetch, timeout = 5000) {
  const invalidate = vi.fn();
  const session: SessionPort = { snapshot: () => ({ status: 'authenticated', credentialRevision: 1 }), subscribe: () => () => {}, initialize: async () => {}, login: async () => {}, logout: async () => {}, invalidate };
  const http = createProtectedHttp('/api', { getAccessToken: async () => 'token' }, session, fetcher, timeout);
  return { http, api: createAssignmentApi(http), invalidate };
}

it('uses only scoped list, detail, create and explicit close routes', async () => {
  const transport = { assignment: vi.fn(async (method: string, path: string) => method === 'GET' && path === 'assignments'
    ? { items: [record], total: 1, page: 1, pageSize: 20 } : record) };
  const api = createAssignmentApi(transport);
  const result = await api.listAssignments(scope, { page: 1, pageSize: 20, sort: 'startedAt', direction: 'desc' }, signal);
  expect(result.items[0].vehiclePlate).toBe('ABC123');
  await api.getAssignment(scope, id, signal);
  await api.createAssignment(scope, { vehicleId, driverId }, signal);
  await api.closeAssignment(scope, id, 1, signal);
  expect(transport.assignment.mock.calls.map(call => call.slice(0, 2))).toEqual([
    ['GET', 'assignments'], ['GET', `assignments/${id}`], ['POST', 'assignments'], ['POST', `assignments/${id}/close`],
  ]);
});

it.each([[401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND']] as const)('normalizes assignment HTTP %i', async (status, code) => {
  const f = fixture(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code: 'ASSIGNMENT_STORAGE_UNAVAILABLE' } }, { status })));
  try { await expect(f.api.getAssignment(scope, id, signal)).rejects.toMatchObject({ code }); expect(f.invalidate).toHaveBeenCalledTimes(status === 401 ? 1 : 0); }
  finally { f.http.dispose(); }
});

it('preserves assignment evidence unavailability as a business error', async () => {
  const f = fixture(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code: 'ASSIGNMENT_STORAGE_UNAVAILABLE' } }, { status: 503 })));
  try { await expect(f.api.getAssignment(scope, id, signal)).rejects.toMatchObject({ businessCode: 'ASSIGNMENT_STORAGE_UNAVAILABLE' }); }
  finally { f.http.dispose(); }
});

it('preserves assignment conflicts and rejects foreign or malformed DTOs and paths', async () => {
  const conflict = fixture(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code: 'ACTIVE_ASSIGNMENT_CONFLICT' } }, { status: 409 })));
  try { await expect(conflict.api.createAssignment(scope, { vehicleId, driverId }, signal)).rejects.toMatchObject({ businessCode: 'ACTIVE_ASSIGNMENT_CONFLICT' }); }
  finally { conflict.http.dispose(); }
  const transport = { assignment: vi.fn(async () => ({ ...record, injected: true })) };
  await expect(createAssignmentApi(transport).getAssignment(scope, id, signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  const f = fixture(vi.fn<typeof fetch>());
  try {
    for (const path of ['assignments/../auth/me', 'assignments/x', `assignments/${id}/reopen`])
      expect(() => f.http.assignment('GET', path, `scope=organization&thirdPartyId=${thirdPartyId}`)).toThrow();
    await expect(f.api.getAssignment({ kind: 'global', companyId: null, thirdPartyId: null }, id, signal)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  } finally { f.http.dispose(); }
});

it('honors cancellation and timeout signals', async () => {
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
  const f = fixture(fetcher, 10);
  try {
    await expect(f.api.getAssignment(scope, id, signal)).rejects.toMatchObject({ code: 'TIMEOUT' });
    const controller = new AbortController(); controller.abort();
    await expect(f.api.getAssignment(scope, id, controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
  } finally { f.http.dispose(); }
});
