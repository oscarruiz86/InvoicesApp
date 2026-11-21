import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createAuthorization } from '@/modules/identity/application/authorization';
import { grantCeiling } from '@/modules/identity/domain/permissions';
import { permissionsResponse } from '@/modules/identity/presentation/permissions';
import { authenticatedHandler } from '@/modules/identity/presentation/authenticated-handler';
import { authorizedAction, resourceAuthorizedAction } from '@/modules/identity/presentation/authorized-handler';
import { createJwtIdentityVerifier } from '@/modules/identity/infrastructure/keycloak/jwt-identity-verifier';
import { AuthorizationUnavailable } from '@/modules/identity/application/authorization-errors';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { GET } from '@/app/api/auth/permissions/route';

const actor: AuthenticatedActor = { subject: 'u1', roles: ['APP_ADMIN'], permissions: [], name: null, username: null, email: null };
const auth = createAuthorization({ policies: { read: async () => ({ version: '1', grants: grantCeiling }) }, organizations: { read: async (_subject, scope) => { if (scope.kind === 'self') return null; throw new AuthorizationUnavailable(); } }, audit: { record: async () => {} }, clock: { now: () => new Date(0) }, ids: { next: () => 'e1' } });
const request = (query = '', bearer = 'aaa.bbb.ccc') => new Request(`https://app.invalid/api/auth/permissions${query}`, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
const handler = authenticatedHandler({ verify: async () => actor }, (identity, req) => permissionsResponse(auth, identity, req));
describe('permissions HTTP boundary', () => {
  it('returns own closed snapshot and preserves no-store', async () => {
    const response = await handler(request('?scope=global'));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(['subject', 'scope', 'roles', 'permissions', 'policyVersion', 'contextRevision', 'evaluatedAt', 'refreshAfterSeconds'].sort());
    expect(body).toMatchObject({ subject: 'u1', scope: { kind: 'global', companyId: null, thirdPartyId: null }, roles: ['APP_ADMIN'], contextRevision: null, refreshAfterSeconds: 30 });
    expect(body.permissions).not.toContain('invoices:read');
  });
  it.each(['?scope=organization', '?scope=global&companyId=c1', '?scope=self&thirdPartyId=t1', '?scope=self&scope=global', '?subject=other', '?roles=APP_ADMIN', '?scope=organization&companyId=', `?scope=organization&companyId=${'a'.repeat(129)}`, '?scope=invalid'])('rejects malformed query %s', async query => { expect((await handler(request(query))).status).toBe(400); });
  it('authenticates before parsing or querying policy and distinguishes unavailable', async () => {
    expect((await handler(request('?invalid=true', ''))).status).toBe(401);
    const response = await handler(request('?scope=organization&companyId=c1'));
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ error: { code: 'AUTHORIZATION_UNAVAILABLE' } });
    const noRoles = authenticatedHandler({ verify: async () => ({ ...actor, roles: [] }) }, (identity, req) => permissionsResponse(auth, identity, req));
    expect((await noRoles(request('?scope=global'))).status).toBe(403);
    expect((await (await noRoles(request())).json()).permissions).toEqual([]);
  });
  it('composes permission/resource wrappers without granting side effects on rejection', async () => {
    const action = vi.fn(async () => Response.json({ ok: true }));
    const permitted = authenticatedHandler({ verify: async () => actor }, authorizedAction(auth, 'companies:read', action));
    expect((await permitted(request('?scope=global'))).status).toBe(200);
    action.mockClear();
    const denied = authenticatedHandler({ verify: async () => actor }, authorizedAction(auth, 'invoices:read', action));
    expect((await denied(request('?scope=global'))).status).toBe(403); expect(action).not.toHaveBeenCalled();
    const absent = authenticatedHandler({ verify: async () => actor }, resourceAuthorizedAction(auth, 'companies:read', { read: async () => null }, () => 'missing', action));
    const response = await absent(request('?scope=global'));
    expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: { code: 'RESOURCE_NOT_FOUND', message: 'El recurso no está disponible.' } });
    expect(action).not.toHaveBeenCalled();
  });
  it('preserves configuration precedence in the actual endpoint', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://127.0.0.1:1/unreachable_test');
    for (const key of ['KEYCLOAK_ISSUER_URL', 'KEYCLOAK_AUDIENCE', 'KEYCLOAK_JWKS_URL']) vi.stubEnv(key, '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try { expect((await GET(request('', ''))).status).toBe(503); } finally { vi.unstubAllEnvs(); }
  });
  it('enforces signed roles and old/new token expiration using a controlled clock', async () => {
    const pair = await generateKeyPair('RS256'); const jwk = await exportJWK(pair.publicKey);
    let seconds = 1000;
    const config = { issuer: 'https://identity.invalid', audience: 'api', jwksUrl: 'https://identity.invalid/keys' };
    const verify = createJwtIdentityVerifier(config, { resolveKey: createLocalJWKSet({ keys: [{ ...jwk, kid: 'k' }] }), currentDate: () => new Date(seconds * 1000) });
    const signed = (roles: string[], exp: number) => new SignJWT({ sub: 'u1', iss: config.issuer, aud: config.audience, exp, typ: 'Bearer', realm_access: { roles } }).setProtectedHeader({ alg: 'RS256', kid: 'k' }).sign(pair.privateKey);
    const old = await signed(['APP_ADMIN'], 1300); const renewed = await signed([], 1500);
    const real = authenticatedHandler(verify, (identity, req) => permissionsResponse(auth, identity, req));
    seconds = 1329;
    expect((await real(request('?scope=global', old))).status).toBe(200);
    expect((await real(request('?scope=global', renewed))).status).toBe(403);
    seconds = 1331;
    expect((await real(request('?scope=global', old))).status).toBe(401);
    expect((await real(request('?scope=global', 'bad.signature.token'))).status).toBe(401);
  });
  it('inventories every implemented route and its explicit security contract', () => {
    const contract = JSON.parse(readFileSync('openapi/openapi.json', 'utf8'));
    const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : entry.name === 'route.ts' ? [join(directory, entry.name)] : []);
    const paths = files('src/app/api').map(file => '/api/' + file.replaceAll('\\', '/').split('src/app/api/')[1].replace('/route.ts', '').replace(/\[([^\]]+)\]/g, '{$1}'));
    expect(paths.sort()).toEqual(Object.keys(contract.paths).sort());
    for (const path of paths) {
      const operation = contract.paths[path].get ?? contract.paths[path].post ?? contract.paths[path].patch;
      if (path.startsWith('/api/auth/') || path.startsWith('/api/organization-contexts')) { expect(operation.security).toEqual([{ bearerAuth: [] }]); expect(operation['x-required-permissions']).toEqual([]); expect(operation['x-authorization-scope']).toBeDefined(); }
      else if (path.startsWith('/api/companies')) {
        for (const value of Object.values(contract.paths[path]) as { security: unknown; description?: string; responses: Record<string, unknown>; 'x-required-permissions': string[]; 'x-authorization-scope': string }[]) {
          expect(value.security).toEqual([{ bearerAuth: [] }]); expect(value['x-authorization-scope']).toBeDefined();
          if (path.includes('/administrators') && value['x-required-permissions'].length === 0) expect(value.description).toContain('410 INVITATION_FLOW_REQUIRED');
          else expect(value['x-required-permissions'].length).toBeGreaterThan(0);
        }
      } else if (path.startsWith('/api/invitations') || path.startsWith('/api/organization-memberships')) {
        if (path === '/api/invitations/preview') expect(operation.security).toEqual([]);
        else expect(operation.security).toEqual([{ bearerAuth: [] }]);
        expect(operation['x-authorization-scope']).toBeDefined();
        expect(operation['x-required-permissions']).toBeDefined();
      } else if (path.startsWith('/api/third-parties')) {
        for (const value of Object.values(contract.paths[path]) as { security: unknown; 'x-required-permissions': string[]; 'x-authorization-scope': string }[]) {
          expect(value.security).toEqual([{ bearerAuth: [] }]);
          expect(value['x-authorization-scope']).toBeDefined();
          expect(value['x-required-permissions']).toBeDefined();
        }
      } else if (path.startsWith('/api/drivers') || path.startsWith('/api/vehicles')) {
        for (const value of Object.values(contract.paths[path]) as { security: unknown; 'x-required-permissions': string[]; 'x-authorization-scope': string }[]) {
          expect(value.security).toEqual([{ bearerAuth: [] }]);
          expect(value['x-authorization-scope']).toBeDefined();
          expect(value['x-required-permissions'].length).toBeGreaterThan(0);
        }
      } else if (path.startsWith('/api/assignments') || path.startsWith('/api/invoices')) {
        for (const value of Object.values(contract.paths[path]) as { security: unknown; 'x-required-permissions': string[]; 'x-authorization-scope': string }[]) {
          expect(value.security).toEqual([{ bearerAuth: [] }]);
          expect(value['x-authorization-scope']).toBeDefined();
          expect(value['x-required-permissions'].length).toBeGreaterThan(0);
        }
      } else if (path === '/api/roles') {
        for (const value of Object.values(contract.paths[path]) as { security: unknown; 'x-required-permissions': string[]; 'x-authorization-scope': string }[]) {
          expect(value.security).toEqual([{ bearerAuth: [] }]);
          expect(value['x-authorization-scope']).toBeDefined();
          expect(value['x-required-permissions'].length).toBeGreaterThan(0);
        }
      } else if (path.startsWith('/api/parameters')) {
        for (const [method, value] of Object.entries(contract.paths[path]) as [string, { security: unknown; 'x-required-permissions': string[]; 'x-authorization-scope': string }][]) {
          expect(value.security).toEqual([{ bearerAuth: [] }]);
          expect(value['x-authorization-scope']).toBe('global');
          expect(value['x-required-permissions']).toEqual([method === 'patch' ? 'parameters:update' : 'parameters:read']);
        }
      } else expect(operation.security).toEqual([]);
    }
  });
});
