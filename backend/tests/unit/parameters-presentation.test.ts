import { expect, it, vi } from 'vitest';
import { authenticatedHandler } from '@/modules/identity/presentation/authenticated-handler';
import type { IdentityVerifier } from '@/modules/identity/application/identity-verifier';
import type { AuthenticatedActor, ApplicationRole } from '@/modules/identity/domain/actor';
import type { Authorization } from '@/modules/identity/application/authorization';
import { ParameterError, type createParameterUseCases } from '@/modules/configuration/application/parameters';
import { parameterCatalog } from '@/modules/configuration/domain/parameters';
import { parameterHandlers } from '@/modules/configuration/presentation/parameters';

const key = 'invoice.manual-edit-window-seconds';
const actor = (role: ApplicationRole, permissions: string[]): AuthenticatedActor => ({ subject: `actor:${role}`, username: null, name: null, email: null, roles: [role], permissions });
const admin = actor('APP_ADMIN', ['parameters:read', 'parameters:update']);
const record = { ...parameterCatalog[key], key, value: 43200, version: 1, effectiveFrom: new Date('2026-11-20T00:00:00.000Z'),
  createdAt: new Date('2026-11-20T00:00:00.000Z'), createdBy: 'technical:init', updatedAt: new Date('2026-11-20T00:00:00.000Z'), updatedBy: 'technical:init' };

function setup(options: { list?: () => Promise<unknown>; detail?: () => Promise<unknown>; history?: () => Promise<unknown>; update?: () => Promise<unknown> } = {}) {
  const useCases = {
    list: vi.fn(options.list ?? (async () => ({ items: [record], total: 1, page: 1, pageSize: 20 }))),
    detail: vi.fn(options.detail ?? (async () => record)),
    history: vi.fn(options.history ?? (async () => ({ items: [], total: 0, page: 1, pageSize: 20 }))),
    update: vi.fn(options.update ?? (async () => ({ ...record, value: 21600, version: 2 }))),
  } as unknown as ReturnType<typeof createParameterUseCases>;
  const auth = { requirePermission: vi.fn(async (candidate: AuthenticatedActor, permission: string, scope: { kind: string }) => {
    if (scope.kind !== 'global' || !candidate.roles.includes('APP_ADMIN') || !candidate.permissions.includes(permission)) throw new ParameterError('FORBIDDEN');
    return { policyVersion: '1', contextRevision: null };
  }) } as unknown as Authorization;
  return { handlers: parameterHandlers(useCases, auth), useCases, auth };
}

const request = (path: string, init?: RequestInit) => new Request(`https://app.invalid${path}`, init);

it.each([
  ['DRIVER', actor('DRIVER', ['invoices:read'])],
  ['THIRD_PARTY_ADMIN', actor('THIRD_PARTY_ADMIN', ['invoices:read'])],
  ['COMPANY_ADMIN', actor('COMPANY_ADMIN', ['companies:read'])],
] as const)('denies parameter reads to %s before looking up data', async (_label, candidate) => {
  const { handlers, useCases } = setup();
  expect((await handlers.list(candidate, request('/api/parameters?scope=global'))).status).toBe(403);
  expect(useCases.list).not.toHaveBeenCalled();
});

it('serves global list, detail, history and versioned updates only with their effective permissions', async () => {
  const { handlers, useCases } = setup();
  const list = await handlers.list(admin, request('/api/parameters?scope=global&page=1&pageSize=20'));
  expect(list.status).toBe(200); expect(list.headers.get('cache-control')).toBe('no-store');
  expect(useCases.list).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  expect((await handlers.detail(admin, request('/api/parameters?scope=global'), key)).status).toBe(200);
  expect((await handlers.history(admin, request('/api/parameters?scope=global&page=1&pageSize=20'), key)).status).toBe(200);
  const updated = await handlers.update(admin, request('/api/parameters?scope=global', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: 1, value: 21600 }) }), key);
  expect(updated.status).toBe(200);
  expect(useCases.update).toHaveBeenCalledWith({ key, expectedVersion: 1, value: 21600, actor: admin.subject, policyVersion: '1' });
  const readOnly = actor('APP_ADMIN', ['parameters:read']);
  expect((await handlers.update(readOnly, request('/api/parameters?scope=global', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: 1, value: 21600 }) }), key)).status).toBe(403);
});

it('rejects invalid scope, duplicate or unexpected fields, and mutation-shaped payloads', async () => {
  const { handlers, useCases } = setup();
  expect((await handlers.list(admin, request('/api/parameters?scope=organization'))).status).toBe(400);
  expect((await handlers.list(admin, request('/api/parameters?scope=global&scope=global'))).status).toBe(400);
  expect((await handlers.update(admin, request('/api/parameters?scope=global', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: 1, value: 21600, name: 'forged' }) }), key)).status).toBe(400);
  expect(useCases.update).not.toHaveBeenCalled();
});

it('maps unknown, unavailable, conflict, and unexpected failures to stable statuses', async () => {
  const missing = setup({ detail: async () => { throw new ParameterError('RESOURCE_NOT_FOUND'); } });
  expect((await missing.handlers.detail(admin, request('/api/parameters?scope=global'), 'unknown.setting')).status).toBe(404);
  const unavailable = setup({ list: async () => { throw new ParameterError('STORAGE_UNAVAILABLE'); } });
  expect((await unavailable.handlers.list(admin, request('/api/parameters?scope=global'))).status).toBe(503);
  const conflict = setup({ update: async () => { throw new ParameterError('PARAMETER_VERSION_CONFLICT'); } });
  expect((await conflict.handlers.update(admin, request('/api/parameters?scope=global', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: 1, value: 21600 }) }), key)).status).toBe(409);
  const failure = setup({ list: async () => { throw new Error('private detail'); } });
  expect((await failure.handlers.list(admin, request('/api/parameters?scope=global'))).status).toBe(500);
});

it('requires a bearer credential at the authenticated HTTP boundary', async () => {
  const verifier = { verify: vi.fn(async () => admin) } as unknown as IdentityVerifier;
  const endpoint = authenticatedHandler(verifier, async () => Response.json({ ok: true }));
  const response = await endpoint(request('/api/parameters?scope=global'));
  expect(response.status).toBe(401);
  expect(response.headers.get('www-authenticate')).toBe('Bearer');
  expect(verifier.verify).not.toHaveBeenCalled();
});
