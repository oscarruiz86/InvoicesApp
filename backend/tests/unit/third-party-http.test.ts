import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { AuthenticationError, AuthorizationError } from '@/modules/identity/application/authentication-error';
import { ResourceNotFound } from '@/modules/identity/application/authorization-errors';
import { ThirdPartyError } from '@/modules/organizations/domain/third-party';
import type { ThirdParties } from '@/modules/organizations/application/third-parties';
import { thirdPartyResponse, type ThirdPartyOperation } from '@/modules/organizations/presentation/third-parties';
import { errorResponse } from '@/shared/presentation/http/errors';

const actor = { subject: 'http-test', roles: ['APP_ADMIN'] as const, permissions: [], username: null, name: null, email: null };
const record = { thirdParty: { id: 'b'.repeat(24), documentType: 'NIT', documentNumber: '001', verificationDigit: null, businessName: 'Tercero', tradeName: null,
  email: 'contact@example.com', phone: null, address: null, country: 'Colombia', department: null, city: null, status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'http-test', updatedBy: null }, version: '1', relationship: null };
const emptyService = () => ({ list: vi.fn(async () => ({ items: [], page: 1, pageSize: 20, total: 0 })), create: vi.fn(async () => record), get: vi.fn(async () => record),
  update: vi.fn(async () => record), setStatus: vi.fn(async () => record), setRelationship: vi.fn(async () => record), getRelationship: vi.fn(async () => ({ relationship: null })), lookupForCompany: vi.fn() }) as unknown as ThirdParties;

async function call(service: ThirdParties, operation: ThirdPartyOperation, query: string, body?: unknown, id?: string, companyId?: string) {
  return thirdPartyResponse(service, operation, actor, new Request(`http://localhost/api/third-parties${query}`, {
    method: body === undefined ? operation === 'relationship' ? 'PUT' : 'GET' : operation === 'create' ? 'POST' : operation === 'update' ? 'PATCH' : 'POST',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  }), id, companyId);
}

it('returns safe JSON envelopes and no-store for validation, permission, resource, conflict and technical failures', async () => {
  const malformed = await call(emptyService(), 'list', '?scope=global&scope=global');
  expect(malformed.status).toBe(400);
  await expect(malformed.json()).resolves.toMatchObject({ error: { code: 'INVALID_REQUEST' } });

  const forbidden = emptyService(); vi.mocked(forbidden.create).mockRejectedValue(new AuthorizationError());
  const denied = await call(forbidden, 'create', '?scope=global', { documentNumber: '001' });
  expect(denied.status).toBe(403); await expect(denied.json()).resolves.toMatchObject({ error: { code: 'FORBIDDEN' } });

  const missing = emptyService(); vi.mocked(missing.get).mockRejectedValue(new ResourceNotFound());
  const notFound = await call(missing, 'get', '?scope=global', undefined, 'b'.repeat(24));
  expect(notFound.status).toBe(404); await expect(notFound.json()).resolves.toMatchObject({ error: { code: 'RESOURCE_NOT_FOUND' } });

  const conflict = emptyService(); vi.mocked(conflict.update).mockRejectedValue(new ThirdPartyError('THIRD_PARTY_VERSION_CONFLICT'));
  const conflicted = await call(conflict, 'update', '?scope=global', { expectedVersion: '1', changes: { city: 'Cali' } }, 'b'.repeat(24));
  expect(conflicted.status).toBe(409); await expect(conflicted.json()).resolves.toMatchObject({ error: { code: 'THIRD_PARTY_VERSION_CONFLICT' } });

  const unavailable = emptyService(); vi.mocked(unavailable.list).mockRejectedValue(new ThirdPartyError('THIRD_PARTY_STORAGE_UNAVAILABLE'));
  const down = await call(unavailable, 'list', '?scope=global');
  expect(down.status).toBe(503); await expect(down.json()).resolves.toMatchObject({ error: { code: 'THIRD_PARTY_STORAGE_UNAVAILABLE' } });

  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failure = emptyService(); vi.mocked(failure.list).mockRejectedValue(new Error('database secret'));
  const internal = await call(failure, 'list', '?scope=global');
  expect(internal.status).toBe(500); await expect(internal.json()).resolves.toEqual({ error: { code: 'INTERNAL_ERROR', message: 'No fue posible procesar la solicitud.' } });
  expect(log).toHaveBeenCalledOnce();

  for (const response of [malformed, denied, notFound, conflicted, down, internal]) {
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toContain('application/json');
  }
  const unauthenticated = errorResponse(new AuthenticationError());
  expect(unauthenticated.status).toBe(401); expect(unauthenticated.headers.get('WWW-Authenticate')).toBe('Bearer');
  expect(unauthenticated.headers.get('Cache-Control')).toBe('no-store');
  log.mockRestore();
});

it('keeps route relationship scope explicit and returns the OpenAPI response envelope', async () => {
  const service = emptyService(); const companyId = 'a'.repeat(24); const thirdPartyId = 'b'.repeat(24);
  const changed = await call(service, 'relationship', `?scope=organization&companyId=${companyId}`, { expectedVersion: null, status: 'ACTIVE' }, thirdPartyId, companyId);
  expect(changed.status).toBe(200);
  expect(service.setRelationship).toHaveBeenCalledWith(expect.objectContaining({ scope: { kind: 'organization', companyId, thirdPartyId: null } }), thirdPartyId, companyId, null, 'ACTIVE');
  const body = await changed.json(); expect(body).toEqual(record);

  const mismatch = await call(service, 'relationship', `?scope=organization&companyId=${companyId}`, { expectedVersion: null, status: 'ACTIVE' }, thirdPartyId, 'c'.repeat(24));
  expect(mismatch.status).toBe(400);

  type ApiResponse = { headers?: Record<string, { schema?: { const?: string } }>; content?: Record<string, { schema?: { $ref?: string } }> };
  type ApiOperation = { responses: Record<string, ApiResponse> };
  type ApiSpec = { paths: Record<string, Partial<Record<'get' | 'post' | 'patch' | 'put', ApiOperation>>> };
  const openapi = JSON.parse(readFileSync(new URL('../../openapi/openapi.json', import.meta.url), 'utf8')) as ApiSpec;
  const operation = openapi.paths['/api/third-parties/{id}/relationships/{companyId}']?.put;
  expect(operation?.responses['200']?.content?.['application/json']?.schema?.$ref).toBe('#/components/schemas/ThirdPartyRecord');
  expect(operation?.responses['400']?.content?.['application/json']?.schema?.$ref).toBe('#/components/schemas/ThirdPartyError');
  expect(operation?.responses['200']?.headers?.['Cache-Control']?.schema?.const).toBe('no-store');
  expect(['400', '401', '403', '404', '409', '500', '503'].every(code => Boolean(operation?.responses[code]))).toBe(true);
});
