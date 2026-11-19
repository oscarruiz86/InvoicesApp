import { describe, expect, it, vi } from 'vitest';
import { grantCeiling, permissions, validGrants, type Permission } from '@/modules/identity/domain/permissions';
import { checkPermission, validOrganization } from '@/modules/identity/domain/authorization-policy';
import type { AuthenticatedActor, ApplicationRole } from '@/modules/identity/domain/actor';
import type { OrganizationEvidence, OrganizationScope, ResourceFacts } from '@/modules/identity/domain/authorization-facts';
import { createAuthorization } from '@/modules/identity/application/authorization';
import { createLimitedSecurityAudit } from '@/modules/identity/application/limited-security-audit';
import { AuthorizationUnavailable, PolicyConflict, ResourceNotFound } from '@/modules/identity/application/authorization-errors';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import type { AuthorizedMutation, SecurityEvent } from '@/modules/identity/application/authorization-ports';

const actor = (roles: ApplicationRole[]): AuthenticatedActor => ({ subject: 'u1', roles, permissions: ['invoices:delete'], name: null, email: null, username: null });
const globalScope = { kind: 'global', companyId: null, thirdPartyId: null } as const;
const selfScope = { kind: 'self', companyId: null, thirdPartyId: null } as const;
const scope = { kind: 'organization', companyId: 'c1', thirdPartyId: 't1' } as const;
const evidence = (role: ApplicationRole, selected: OrganizationScope = scope): OrganizationEvidence => ({ subject: 'u1', scope: selected, revision: 'r1', companyActive: true, thirdPartyActive: true, relationshipActive: true,
  capabilities: [{ role, companyId: selected.companyId, thirdPartyId: role === 'COMPANY_ADMIN' ? null : selected.thirdPartyId, active: true }] });
const policy = { version: '1', grants: grantCeiling };
const invoice: ResourceFacts = { type: 'invoices', id: 'i1', revision: 'v1', companyId: 'c1', thirdPartyId: 't1', ownerSubject: 'u1', origin: 'MANUAL', eligible: true, vehicleActive: true, assignmentActive: true, assignedSubject: 'u1' };
function service(options: Partial<Parameters<typeof createAuthorization>[0]> = {}) {
  return createAuthorization({ policies: { read: async () => policy }, organizations: { read: async (_subject, selected) => evidence('DRIVER', selected) }, audit: { record: vi.fn(async () => {}) }, clock: { now: () => new Date('2026-11-09T00:00:00Z') }, ids: { next: () => 'event-1' }, ...options });
}
describe('authorization matrix and evidence contracts', () => {
  const expected: Record<ApplicationRole, string[]> = {
    APP_ADMIN: ['companies:create', 'companies:read', 'companies:update', 'companies:deactivate', 'third-parties:create', 'third-parties:read', 'third-parties:update', 'third-parties:deactivate', 'users:create', 'users:read', 'users:update', 'users:associate', 'parameters:read', 'parameters:update', 'roles:read', 'roles:manage', 'associations:read', 'associations:manage'],
    COMPANY_ADMIN: ['companies:read', 'companies:update', 'third-parties:create', 'third-parties:read', 'third-parties:update', 'third-parties:deactivate', 'users:create', 'users:read', 'users:associate', 'associations:read', 'associations:manage'],
    THIRD_PARTY_ADMIN: ['third-parties:read', 'third-parties:update', 'drivers:create', 'drivers:read', 'drivers:update', 'drivers:deactivate', 'vehicles:create', 'vehicles:read', 'vehicles:update', 'vehicles:deactivate', 'vehicles:assign', 'vehicles:unassign', 'assignments:read', 'invoices:read', 'invoices:update'],
    DRIVER: ['users:read', 'drivers:read', 'vehicles:read', 'assignments:read', 'invoices:create', 'invoices:read', 'invoices:update'],
  };
  for (const role of Object.keys(expected) as ApplicationRole[]) for (const permission of permissions) {
    it(`${role} ${permission}`, () => {
      const selected = role === 'APP_ADMIN' ? globalScope : role === 'DRIVER' && ['users:read', 'drivers:read'].includes(permission) ? selfScope : scope;
      expect(checkPermission(actor(role === 'APP_ADMIN' ? [role] : []), policy, permission, selected, evidence(role, selected)).allowed).toBe(expected[role].includes(permission));
    });
  }
  it('keeps the catalog unique and cannot activate pending grants or unknown values', () => {
    expect(new Set(permissions).size).toBe(permissions.length);
    expect(validGrants([...grantCeiling, { role: 'APP_ADMIN', permission: 'invoices:delete', scope: 'global' }])).toBe(false);
    expect(validGrants([...grantCeiling, grantCeiling[0]])).toBe(false);
    for (const value of ['invoices:*', 'companies', 'unknown:read']) expect(checkPermission(actor(['APP_ADMIN']), policy, value, globalScope).allowed).toBe(false);
    expect(checkPermission(actor([]), policy, 'invoices:delete', selfScope).allowed).toBe(false);
  });
  it.each([{ kind: 'organization', companyId: 'c1', thirdPartyId: null }, { kind: 'organization', companyId: null, thirdPartyId: 't1' }, scope] as OrganizationScope[])('validates explicit organization shape %j', selected => {
    const role = selected.thirdPartyId ? 'THIRD_PARTY_ADMIN' : 'COMPANY_ADMIN';
    expect(validOrganization(actor([role]), selected, evidence(role, selected))).toBe(true);
    expect(validOrganization(actor([role]), selected, { ...evidence(role, selected), subject: 'another' })).toBe(false);
  });
  it('rejects inactive, incompatible, omitted and transitively inferred contexts', () => {
    const facts = evidence('DRIVER');
    for (const update of [{ relationshipActive: false }, { companyActive: false }, { thirdPartyActive: false }, { capabilities: [] }, { capabilities: [{ ...facts.capabilities[0], active: false }] }]) expect(validOrganization(actor(['DRIVER']), scope, { ...facts, ...update })).toBe(false);
    expect(validOrganization(actor(['DRIVER']), { kind: 'organization', companyId: null, thirdPartyId: null }, facts)).toBe(false);
    expect(checkPermission(actor(['COMPANY_ADMIN', 'DRIVER']), policy, 'companies:update', scope, facts).allowed).toBe(false);
    expect(checkPermission(actor(['APP_ADMIN']), policy, 'invoices:read', globalScope).allowed).toBe(false);
  });
  it('checks owner and delegates only the authorized role in the same scope', () => {
    const target: ResourceFacts = { type: 'users', id: 'u2', revision: '1', companyId: 'c1', thirdPartyId: 't1', targetSubject: 'u2', targetRole: 'THIRD_PARTY_ADMIN' };
    expect(checkPermission(actor([]), policy, 'users:associate', scope, evidence('COMPANY_ADMIN'), target).allowed).toBe(true);
    for (const change of [{ targetRole: 'APP_ADMIN' as const }, { targetSubject: 'u1' }, { companyId: 'c2' }]) expect(checkPermission(actor([]), policy, 'users:associate', scope, evidence('COMPANY_ADMIN'), { ...target, ...change }).allowed).toBe(false);
    expect(checkPermission(actor(['APP_ADMIN']), policy, 'users:create', globalScope, undefined, { ...target, targetRole: 'COMPANY_ADMIN' }).allowed).toBe(true);
    expect(checkPermission(actor([]), policy, 'users:read', selfScope, evidence('DRIVER', selfScope), { ...target, ownerSubject: 'u2' }).allowed).toBe(false);
    expect(checkPermission(actor([]), policy, 'users:read', selfScope, evidence('DRIVER', selfScope), { ...target, ownerSubject: 'u1' }).allowed).toBe(true);
  });
});
describe('resource coordination without business rule duplication', () => {
  it.each([
    ['invoices:create', { vehicleActive: false }], ['invoices:create', { assignmentActive: false }], ['invoices:create', { assignedSubject: 'u2' }],
    ['invoices:update', { eligible: false }], ['invoices:update', { origin: 'QR' }], ['invoices:read', { ownerSubject: 'u2' }],
    ['invoices:read', { companyId: 'c2' }], ['invoices:update', { thirdPartyId: 't2' }],
  ] as [Permission, Partial<ResourceFacts>][])('rejects %s with %j before writing', async (permission, change) => {
    const commit = vi.fn();
    await expect(service().authorizeResourceAccess(actor(['DRIVER']), permission, scope, 'i1', { read: async () => ({ ...invoice, ...change }) }).then(commit)).rejects.toBeInstanceOf(ResourceNotFound);
    expect(commit).not.toHaveBeenCalled();
  });
  it('accepts manual editing and manual/QR capture only with eligible active assignment', async () => {
    const auth = service();
    for (const origin of ['MANUAL', 'QR'] as const) expect(await auth.authorizeResourceAccess(actor(['DRIVER']), 'invoices:create', scope, 'i1', { read: async () => ({ ...invoice, origin }) })).toMatchObject({ policyVersion: '1', contextRevision: 'r1', resourceRevision: 'v1' });
    await expect(auth.authorizeResourceAccess(actor(['DRIVER']), 'invoices:update', scope, 'i1', { read: async () => invoice })).resolves.toBeDefined();
  });
  it('requires active assigned vehicle and assignment facts for reads', () => {
    const vehicle: ResourceFacts = { ...invoice, type: 'vehicles', active: true };
    expect(checkPermission(actor(['DRIVER']), policy, 'vehicles:read', scope, evidence('DRIVER'), vehicle).allowed).toBe(true);
    expect(checkPermission(actor(['DRIVER']), policy, 'vehicles:read', scope, evidence('DRIVER'), { ...vehicle, active: false }).allowed).toBe(false);
    expect(checkPermission(actor(['DRIVER']), policy, 'assignments:read', scope, evidence('DRIVER'), { ...vehicle, type: 'assignments', assignedSubject: 'other' }).allowed).toBe(false);
  });
  it('never reads resource existence without permission and hides absence', async () => {
    const read = vi.fn(async () => invoice);
    await expect(service().authorizeResourceAccess(actor(['DRIVER']), 'invoices:delete', scope, 'i1', { read })).rejects.toBeInstanceOf(AuthorizationError);
    expect(read).not.toHaveBeenCalled();
    await expect(service().authorizeResourceAccess(actor(['DRIVER']), 'invoices:read', scope, 'i1', { read: async () => null })).rejects.toBeInstanceOf(ResourceNotFound);
  });
  it('requires the mutation owner to reject a stale receipt at confirmation', async () => {
    const receipt = await service().authorizeResourceAccess(actor(['DRIVER']), 'invoices:update', scope, 'i1', { read: async () => invoice });
    let revision = 'r1'; let written = false;
    const mutation: AuthorizedMutation<void> = { commit: async proof => { if (proof.contextRevision !== revision) throw new PolicyConflict(); written = true; } };
    revision = 'r2';
    await expect(mutation.commit(receipt)).rejects.toBeInstanceOf(PolicyConflict);
    expect(written).toBe(false); // Contract fixture, not a real business transaction.
  });
});
describe('application and security events', () => {
  it('returns own empty permissions and fails closed for missing evidence', async () => {
    expect(await service({ organizations: { read: async () => null } }).getEffectivePermissions(actor(['DRIVER']), selfScope)).toMatchObject({ subject: 'u1', roles: [], permissions: [], contextRevision: null, refreshAfterSeconds: 30 });
    expect(await service().getEffectivePermissions(actor([]), selfScope)).toMatchObject({ roles: ['DRIVER'], permissions: expect.arrayContaining(['users:read', 'drivers:read']), contextRevision: 'r1' });
    await expect(service().getEffectivePermissions(actor(['DRIVER']), globalScope)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(service({ organizations: { read: async () => { throw new Error(); } } }).getEffectivePermissions(actor(['DRIVER']), scope)).rejects.toBeInstanceOf(AuthorizationUnavailable);
    await expect(service({ policies: { read: async () => { throw new Error(); } } }).getEffectivePermissions(actor([]), selfScope)).rejects.toBeInstanceOf(AuthorizationUnavailable);
  });
  it('rereads policies and associations on every request', async () => {
    let active = true; let current = policy;
    const auth = service({ organizations: { read: async () => active ? evidence('DRIVER') : null }, policies: { read: async () => current } });
    expect((await auth.getEffectivePermissions(actor(['DRIVER']), scope)).permissions).toContain('invoices:update');
    current = { version: '2', grants: [] };
    expect((await auth.getEffectivePermissions(actor(['DRIVER']), scope)).permissions).toEqual([]);
    active = false;
    await expect(auth.getEffectivePermissions(actor(['DRIVER']), scope)).rejects.toBeInstanceOf(AuthorizationError);
  });
  it('requires permission, ceiling, current version and durable capture for policy changes', async () => {
    const replace = vi.fn(async () => { throw new AuthorizationUnavailable(); });
    const auth = service();
    await expect(auth.updateRolePermissions(actor(['DRIVER']), '1', [], { replace })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(auth.updateRolePermissions(actor(['APP_ADMIN']), '0', [], { replace })).rejects.toBeInstanceOf(PolicyConflict);
    await expect(auth.updateRolePermissions(actor(['APP_ADMIN']), '1', [{ role: 'APP_ADMIN', permission: 'invoices:delete', scope: 'global' }], { replace })).rejects.toThrow('INVALID_REQUEST');
    expect(replace).not.toHaveBeenCalled();
    await expect(auth.updateRolePermissions(actor(['APP_ADMIN']), '1', grantCeiling, { replace })).rejects.toBeInstanceOf(AuthorizationUnavailable);
    expect(replace.mock.calls).toHaveLength(1);
  });
  it('sanitizes and bounds denials while preserving suppression and rejecting on sink failure', async () => {
    let now = 0; const record = vi.fn(async (_event: SecurityEvent) => { void _event; });
    const audit = createLimitedSecurityAudit({ record }, { now: () => new Date(now) }, 1, 100);
    const base: SecurityEvent = { eventId: 'e', at: new Date(0).toISOString(), subject: 'u', action: 'ACCESS_DENIED', result: 'denied', reason: 'PERMISSION', correlationId: 'c', suppressed: 0 };
    await audit.record(Object.assign({}, base, { token: 'SECRET', payload: { password: 'SECRET' } }));
    await audit.record(base); now = 101; await audit.record(base);
    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[1][0]).toMatchObject({ suppressed: 1 });
    expect(JSON.stringify(record.mock.calls)).not.toContain('SECRET');
    await expect(service({ audit: { record: async () => { throw new Error(); } } }).requirePermission(actor([]), 'roles:manage', selfScope)).rejects.toBeInstanceOf(AuthorizationError);
  });
  it('records validated denial scope without leaking rejected context identifiers', async () => {
    const record = vi.fn(async (_event: SecurityEvent) => { void _event; });
    const auth = service({ audit: createLimitedSecurityAudit({ record }, { now: () => new Date(0) }) });
    await expect(auth.requirePermission(actor(['DRIVER']), 'invoices:delete', scope)).rejects.toBeInstanceOf(AuthorizationError);
    expect(record.mock.calls[0][0]).toMatchObject({ permission: 'invoices:delete', scope });
    const rejected = service({ audit: { record }, organizations: { read: async () => null } });
    await expect(rejected.requirePermission(actor(['DRIVER']), 'invoices:read', scope)).rejects.toBeInstanceOf(AuthorizationError);
    expect(record.mock.calls[1][0]).not.toHaveProperty('scope');
    expect(record.mock.calls[1][0]).toMatchObject({ reason: 'CONTEXT' });
  });
});
