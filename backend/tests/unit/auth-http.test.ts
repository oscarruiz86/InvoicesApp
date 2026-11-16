import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticatedHandler } from '@/modules/identity/presentation/authenticated-handler';
import { currentUserResponse } from '@/modules/identity/presentation/current-user';
import { AuthenticationError } from '@/modules/identity/application/authentication-error';
import { requireRoles } from '@/modules/identity/application/require-roles';
import { GET } from '@/app/api/auth/me/route';

const actor = { subject: 'subject-1', name: null, username: null, email: null, roles: [] as const, permissions: [] };
afterEach(() => vi.unstubAllEnvs());
describe('protected HTTP boundary', () => {
  it.each([undefined, '', 'Basic abc', 'Bearer ', 'Bearer aaa.bbb.ccc, Bearer ddd.eee.fff', 'Bearer aaa.bbb.ccc extra'])('denies missing/malformed authorization before the use case', async authorization => {
    const verify = vi.fn(); const action = vi.fn();
    const response = await authenticatedHandler({ verify }, action)(new Request('https://app.invalid/api/auth/me?access_token=aaa.bbb.ccc', { headers: { Cookie: 'token=aaa.bbb.ccc', ...(authorization === undefined ? {} : { Authorization: authorization }) } }));
    expect(response.status).toBe(401); expect(response.headers.get('www-authenticate')).toBe('Bearer'); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: { code: 'UNAUTHENTICATED', message: 'Se requiere autenticación válida.' } });
    expect(verify).not.toHaveBeenCalled(); expect(action).not.toHaveBeenCalled();
  });
  it('returns a minimal uncached profile and ignores spoofed headers', async () => {
    const verify = vi.fn(async () => actor);
    const response = await authenticatedHandler({ verify }, currentUserResponse)(new Request('https://app.invalid/api/auth/me', { headers: { Authorization: 'Bearer aaa.bbb.ccc', 'X-Role': 'APP_ADMIN' } }));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ user: { id: actor.subject, name: null, username: null, email: null, roles: [] } });
  });
  it('maps verification and policy errors without creating another endpoint', async () => {
    const request = new Request('https://app.invalid', { headers: { Authorization: 'Bearer aaa.bbb.ccc' } });
    const invalid = authenticatedHandler({ verify: async () => { throw new AuthenticationError(); } }, currentUserResponse);
    expect((await invalid(request)).status).toBe(401);
    const forbidden = authenticatedHandler({ verify: async () => actor }, identity => { requireRoles(identity, ['APP_ADMIN']); return currentUserResponse(identity); });
    expect((await forbidden(request)).status).toBe(403);
  });
  it('checks runtime configuration before credentials and maps unexpected failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('MONGODB_URI', 'mongodb://127.0.0.1:1/unreachable');
    for (const key of ['KEYCLOAK_ISSUER_URL', 'KEYCLOAK_AUDIENCE', 'KEYCLOAK_JWKS_URL']) vi.stubEnv(key, '');
    expect((await GET(new Request('http://localhost/api/auth/me'))).status).toBe(503);
    vi.stubEnv('KEYCLOAK_ISSUER_URL', 'https://identity.invalid/realm'); vi.stubEnv('KEYCLOAK_AUDIENCE', 'invoices-api');
    expect((await GET(new Request('http://localhost/api/auth/me'))).status).toBe(401);
    const response = await authenticatedHandler({ verify: async () => actor }, () => { throw new Error('PRIVATE_DETAIL'); })(new Request('https://app.invalid', { headers: { Authorization: 'Bearer aaa.bbb.ccc' } }));
    expect(response.status).toBe(500); expect(await response.text()).not.toContain('PRIVATE_DETAIL');
  });
});
