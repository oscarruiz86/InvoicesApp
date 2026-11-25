import { describe, expect, it, vi } from 'vitest';
import { createAuthorization } from '@/modules/identity/application/authorization';
import { createRolePolicyUseCases } from '@/modules/identity/application/role-policy';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import { PolicyAuditCapacity } from '@/modules/identity/application/authorization-errors';
import type { ApplicationRole, AuthenticatedActor } from '@/modules/identity/domain/actor';
import { grantCeiling } from '@/modules/identity/domain/permissions';
import { rolePolicyHandlers } from '@/modules/identity/presentation/role-policy';
import { errorResponse } from '@/shared/presentation/http/errors';

const actor: AuthenticatedActor = { subject: 'admin-1', roles: ['APP_ADMIN'], permissions: [], username: null, name: null, email: null };
const policy = { version: '7', grants: grantCeiling.map(grant => ({ ...grant })) };
const roleCatalog: ApplicationRole[] = ['APP_ADMIN', 'COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER'];
const policyView = { policy, catalog: { roles: roleCatalog, permissions: [], grantCeiling: grantCeiling.map(grant => ({ ...grant })) } };

function request(url = 'https://lola.test/api/roles?scope=global', body?: unknown) {
  return new Request(url, body === undefined ? undefined : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

describe('role policy administrative contract', () => {
  it('requires an explicit global scope and rejects identifiers, unknown parameters and duplicates', async () => {
    const read = vi.fn(async () => policyView);
    const handlers = rolePolicyHandlers({ read, replace: vi.fn(async () => policyView) });
    for (const url of [
      'https://lola.test/api/roles',
      'https://lola.test/api/roles?scope=self',
      'https://lola.test/api/roles?scope=global&companyId=c1',
      'https://lola.test/api/roles?scope=global&other=x',
      'https://lola.test/api/roles?scope=global&scope=global',
    ]) await expect(handlers.read(actor, request(url))).rejects.toThrow('INVALID_REQUEST');
    expect(read).not.toHaveBeenCalled();
  });

  it('returns the policy without caching only after the application authorizes read', async () => {
    const policies = { read: vi.fn(async () => policy) };
    const authorization = createAuthorization({ policies, organizations: { read: async () => null }, audit: { record: async () => {} }, clock: { now: () => new Date(0) }, ids: { next: () => 'event' } });
    const useCases = createRolePolicyUseCases({ authorization, policies, writer: { replace: vi.fn() } });
    const result = await rolePolicyHandlers(useCases).read(actor, request());
    expect(result.status).toBe(200);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(await result.json()).toMatchObject({ policy: { version: '7', grants: grantCeiling }, catalog: { roles: ['APP_ADMIN', 'COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER'], grantCeiling } });
    await expect(useCases.read({ ...actor, roles: ['DRIVER'] })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('accepts only a closed complete update body and delegates versioned grants', async () => {
    const replace = vi.fn(async () => policyView);
    const handlers = rolePolicyHandlers({ read: vi.fn(async () => policyView), replace });
    const success = await handlers.replace(actor, request(undefined, { expectedVersion: '7', grants: grantCeiling }));
    expect(success.status).toBe(200);
    expect(success.headers.get('Cache-Control')).toBe('no-store');
    expect(replace).toHaveBeenCalledWith(actor, '7', grantCeiling);
    for (const body of [
      { expectedVersion: 7, grants: grantCeiling },
      { expectedVersion: '0', grants: grantCeiling },
      { expectedVersion: '7', grants: grantCeiling, token: 'secret' },
      { expectedVersion: '7', grants: [{ role: 'CUSTOM', permission: 'roles:read', scope: 'global' }] },
      { expectedVersion: '7', grants: [] },
    ]) await expect(handlers.replace(actor, request(undefined, body))).rejects.toThrow('INVALID_REQUEST');
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('reports exhausted audit capacity as a distinct no-store 503', async () => {
    const response = errorResponse(new PolicyAuditCapacity());
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ error: { code: 'POLICY_AUDIT_CAPACITY', message: 'La política no se actualizó porque la capacidad de auditoría está agotada.' } });
  });
});
