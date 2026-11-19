import { expect, it, vi } from 'vitest';
import { driverResponse } from '@/modules/fleet/presentation/drivers';
import { DriverUseCaseError } from '@/modules/fleet/application/drivers';
import { authenticatedHandler } from '@/modules/identity/presentation/authenticated-handler';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';

const actor: AuthenticatedActor = { subject: 'subject-1', username: null, name: null, email: null, roles: ['THIRD_PARTY_ADMIN'], permissions: [] };
const thirdPartyId = '0123456789abcdef01234567';
const driverId = '1123456789abcdef01234567';
function fixture() {
  const service = { list: vi.fn(async (_actor: AuthenticatedActor, input: Record<string, unknown>) => ({ items: [], total: 0, ...input })),
    detail: vi.fn(async (_actor: AuthenticatedActor, input: unknown) => input), transition: vi.fn(async (_actor: AuthenticatedActor, input: unknown) => input) };
  return service;
}
const request = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, init);

it('parses an explicit third-party list context and defaults pagination', async () => {
  const service = fixture();
  const response = await driverResponse(service as never, 'list', actor, request(`/api/drivers?scope=organization&thirdPartyId=${thirdPartyId}`));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ thirdPartyId, page: 1, pageSize: 20, sort: 'createdAt', direction: 'desc' });
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});

it.each([
  [`/api/drivers?scope=organization&thirdPartyId=${thirdPartyId}&unexpected=yes`, 'list'],
  [`/api/drivers?scope=organization&thirdPartyId=${thirdPartyId}&page=1&page=2`, 'list'],
  [`/api/drivers/${driverId}?scope=organization&thirdPartyId=${thirdPartyId}&page=1`, 'detail'],
  [`/api/drivers/${driverId}?scope=organization&thirdPartyId=${thirdPartyId}&thirdPartyId=${thirdPartyId}`, 'detail'],
  [`/api/drivers?thirdPartyId=${thirdPartyId}`, 'list'],
  [`/api/drivers?scope=global&thirdPartyId=${thirdPartyId}`, 'list'],
  [`/api/drivers?scope=organization&companyId=${thirdPartyId}`, 'list'],
] as const)('rejects unknown or duplicate query parameters: %s', async (url, operation) => {
  const service = fixture();
  const response = await driverResponse(service as never, operation, actor, request(url), operation === 'list' ? undefined : driverId);
  expect(response.status).toBe(400);
  expect(service.list).not.toHaveBeenCalled();
  expect(service.detail).not.toHaveBeenCalled();
});

it('requires a third-party context and validates path IDs for detail', async () => {
  const service = fixture();
  const missingContext = await driverResponse(service as never, 'detail', actor, request(`/api/drivers/${driverId}`), driverId);
  const invalidId = await driverResponse(service as never, 'detail', actor, request(`/api/drivers/not-an-id?scope=organization&thirdPartyId=${thirdPartyId}`), 'not-an-id');
  expect(missingContext.status).toBe(400);
  expect(invalidId.status).toBe(400);
  expect(service.detail).not.toHaveBeenCalled();
});

it('accepts only the versioned status body fields', async () => {
  const service = fixture();
  const invalid = await driverResponse(service as never, 'status', actor, request(`/api/drivers/${driverId}/status?scope=organization&thirdPartyId=${thirdPartyId}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: 1, status: 'INACTIVE', subject: 'attacker', name: 'Editado', documentNumber: '123', email: 'attacker@example.invalid' }),
  }), driverId);
  expect(invalid.status).toBe(400);
  expect(service.transition).not.toHaveBeenCalled();

  const valid = await driverResponse(service as never, 'status', actor, request(`/api/drivers/${driverId}/status?scope=organization&thirdPartyId=${thirdPartyId}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: 3, status: 'INACTIVE' }),
  }), driverId);
  expect(valid.status).toBe(200);
  expect(service.transition).toHaveBeenCalledWith(actor, expect.objectContaining({ id: driverId, thirdPartyId, expectedVersion: 3, status: 'INACTIVE' }));
});

it('maps neutral lookup, authorization, conflict, and unavailable errors to stable HTTP statuses', async () => {
  const cases = [
    ['NOT_FOUND', 404], ['FORBIDDEN', 403], ['CONFLICT', 409], ['UNAVAILABLE', 503],
  ] as const;
  for (const [code, expected] of cases) {
    const service = fixture();
    service.detail.mockRejectedValue(new DriverUseCaseError(code));
    const response = await driverResponse(service as never, 'detail', actor, request(`/api/drivers/${driverId}?scope=organization&thirdPartyId=${thirdPartyId}`), driverId);
    expect(response.status).toBe(expected);
  }
});

it('rejects malformed JSON as a closed request error', async () => {
  const service = fixture();
  const response = await driverResponse(service as never, 'status', actor, request(`/api/drivers/${driverId}/status?scope=organization&thirdPartyId=${thirdPartyId}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{',
  }), driverId);
  expect(response.status).toBe(400);
});
it('returns 401 through the shared Bearer authentication boundary before invoking Drivers', async () => {
  const service = fixture();
  const endpoint = authenticatedHandler({ verify: async () => actor } as never,
    (verifiedActor, req) => driverResponse(service as never, 'list', verifiedActor, req));
  const response = await endpoint(request(`/api/drivers?scope=organization&thirdPartyId=${thirdPartyId}`));
  expect(response.status).toBe(401);
  expect(service.list).not.toHaveBeenCalled();
});

it('does not reveal internal details when an unexpected server error occurs', async () => {
  const service = fixture();
  service.detail.mockRejectedValue(new Error('private database details'));
  const response = await driverResponse(service as never, 'detail', actor, request(`/api/drivers/${driverId}?scope=organization&thirdPartyId=${thirdPartyId}`), driverId);
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('private database details');
});
