import { describe, expect, it, vi } from 'vitest';
import { availableContextsResponse, resolveContextResponse } from '@/modules/organizations/presentation/contexts';
import { authenticatedHandler } from '@/modules/identity/presentation/authenticated-handler';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import { AuthorizationUnavailable } from '@/modules/identity/application/authorization-errors';
import type { OrganizationContexts, ContextEvent } from '@/modules/organizations/application/context-ports';
import { createLimitedContextAudit } from '@/modules/organizations/application/limited-context-audit';

const actor = { subject: 'u', roles: [] as const, permissions: [], name: null, email: null, username: null };
const service: OrganizationContexts = {
  available: async () => ({ organizations: [], globalAvailable: false }),
  resolve: async () => ({ kind: 'GLOBAL', roles: ['APP_ADMIN'], authorization: { subject: 'u', scope: { kind: 'global', companyId: null, thirdPartyId: null }, roles: ['APP_ADMIN'], permissions: ['companies:read'], policyVersion: '1', contextRevision: null, evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 } }),
};
const handler = (method: 'get' | 'post', target = service) => authenticatedHandler({ verify: async () => actor }, (identity, request) => method === 'get' ? availableContextsResponse(target, identity, request) : resolveContextResponse(target, identity, request));
const request = (body?: unknown, query = '', token = 'a.b.c') => new Request('http://localhost/api/organization-contexts' + query, { method: body === undefined ? 'GET' : 'POST', headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {}, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
describe('organization HTTP contract', () => {
  it('returns empty 200, no-store and validates identity first', async () => {
    const response = await handler('get')(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ organizations: [], globalAvailable: false });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await handler('get')(request(undefined, '?subject=foreign'))).status).toBe(400);
    expect((await handler('get')(request(undefined, '?bad=1', ''))).status).toBe(401);
  });
  it.each([
    { selection: { kind: 'GLOBAL', subject: 'foreign' }, reason: 'INITIAL' },
    { selection: { kind: 'GLOBAL' }, reason: 'INVALID' },
    { selection: { kind: 'GLOBAL' }, reason: 'SWITCH', permissions: [] },
    { selection: { kind: 'ORGANIZATION', organizationId: ' ', organizationType: 'COMPANY' }, reason: 'INITIAL' },
    { selection: { kind: 'ORGANIZATION', organizationId: 'a'.repeat(129), organizationType: 'COMPANY' }, reason: 'INITIAL' },
    { selection: { kind: 'ORGANIZATION', organizationId: 'a', organizationType: 'GLOBAL' }, reason: 'INITIAL' },
  ])('rejects malformed input %j', async body => expect((await handler('post')(request(body))).status).toBe(400));
  it.each(['INITIAL', 'SWITCH', 'RESTORE'])('resolves %s without creating server selection', async reason => {
    const resolve = vi.fn(service.resolve);
    const response = await handler('post', { ...service, resolve })(request({ selection: { kind: 'GLOBAL' }, reason }));
    expect(response.status).toBe(200); expect(resolve).toHaveBeenCalledWith(actor, { kind: 'GLOBAL' }, reason);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it.each([[new AuthorizationError(), 403, 'FORBIDDEN'], [new AuthorizationUnavailable(), 503, 'AUTHORIZATION_UNAVAILABLE'], [new Error('private'), 500, 'INTERNAL_ERROR']] as const)('preserves neutral errors', async (error, status, code) => {
    const response = await handler('post', { ...service, resolve: async () => { throw error; } })(request({ selection: { kind: 'GLOBAL' }, reason: 'INITIAL' }));
    expect(response.status).toBe(status); expect((await response.json()).error.code).toBe(code);
  });
  it('rejects invalid JSON', async () => {
    expect((await handler('post')(new Request('http://localhost/api/organization-contexts/resolve', { method: 'POST', headers: { Authorization: 'Bearer a.b.c' }, body: '{' }))).status).toBe(400);
  });
  it('limits denied events, reports suppression and never samples successful capture', async () => {
    let now = 0; const record = vi.fn(async (event: ContextEvent) => { void event; });
    const limited = createLimitedContextAudit({ record }, () => now);
    const event: ContextEvent = { eventId: 'e', correlationId: 'c', subject: 'u', at: new Date(0).toISOString(), result: 'denied', action: 'CONTEXT_DENIED', suppressed: 0 };
    for (let i = 0; i < 105; i++) await limited.record(event);
    expect(record).toHaveBeenCalledTimes(100);
    await limited.record({ ...event, result: 'allowed', action: 'CONTEXT_SELECTED', selection: { kind: 'GLOBAL' } });
    expect(record).toHaveBeenCalledTimes(101);
    now = 60_000; await limited.record(event);
    expect(record.mock.calls.at(-1)?.[0].suppressed).toBe(5);
  });
});
