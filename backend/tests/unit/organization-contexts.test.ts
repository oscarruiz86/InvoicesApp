import { describe, expect, it, vi } from 'vitest';
import { createOrganizationContexts } from '@/modules/organizations/application/organization-contexts';
import { createAuthorization } from '@/modules/identity/application/authorization';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import { grantCeiling } from '@/modules/identity/domain/permissions';
import { organizationEvidence, type Organization, type OrganizationAssociation } from '@/modules/organizations/domain/organization';
import type { OrganizationReader, ContextEvent } from '@/modules/organizations/application/context-ports';
import type { ApplicationRole, AuthenticatedActor } from '@/modules/identity/domain/actor';

const actor = (roles: ApplicationRole[]): AuthenticatedActor => ({ subject: 'u', roles, permissions: [], name: null, username: null, email: null });
function fixture() {
  const organizations: Organization[] = [{ id: 'c', type: 'COMPANY', name: 'Company', active: true, revision: 1 }, { id: 't', type: 'THIRD_PARTY', name: 'Third party', active: true, revision: 1 }];
  const associations: OrganizationAssociation[] = [{ id: 'a', subject: 'u', organizationId: 'c', capability: 'COMPANY_ADMIN', active: true, revision: 1 }, { id: 'b', subject: 'u', organizationId: 't', capability: 'DRIVER', active: true, revision: 1 }];
  const reader: OrganizationReader = {
    candidates: async subject => organizations.filter(org => associations.some(a => a.subject === subject && a.organizationId === org.id && a.active)),
    find: async id => organizations.find(org => org.id === id) ?? null,
    read: async (subject, scope) => organizationEvidence(subject, scope, organizations.filter(org => [scope.companyId, scope.thirdPartyId].includes(org.id)), associations, null),
  };
  const policies = { read: vi.fn(async () => ({ version: '1', grants: grantCeiling })) };
  const permissions = createAuthorization({ policies, organizations: reader, audit: { record: async () => {} }, clock: { now: () => new Date() }, ids: { next: () => 'id' } });
  const audit = { record: vi.fn(async (event: ContextEvent) => { void event; }) };
  const service = createOrganizationContexts({ organizations: reader, permissions, audit, now: () => new Date(), nextId: () => 'id' });
  return { organizations, associations, reader, policies, permissions, audit, service };
}
describe('organization context use cases with the real authorization policy', () => {
  it('lists zero, one and several destinations without combining local capabilities', async () => {
    const f = fixture();
    const all = await f.service.available(actor([]));
    expect(all.organizations).toHaveLength(2);
    expect(all.organizations[0].roles).toEqual(['COMPANY_ADMIN']);
    expect(all.organizations[1].roles).toEqual(['DRIVER']);
    expect((await f.service.available({ ...actor(['DRIVER']), subject: 'another' })).organizations).toEqual([]);
  });
  it('keeps GLOBAL explicit and never lists all organizations for APP_ADMIN', async () => {
    const f = fixture();
    expect(await f.service.available({ ...actor(['APP_ADMIN']), subject: 'app-admin' })).toEqual({ organizations: [], globalAvailable: true });
    expect((await f.service.resolve(actor(['APP_ADMIN']), { kind: 'GLOBAL' }, 'INITIAL')).kind).toBe('GLOBAL');
    expect((await f.service.resolve(actor(['APP_ADMIN']), { kind: 'ORGANIZATION', organizationId: 'c', organizationType: 'COMPANY' }, 'INITIAL')).roles).toEqual(['COMPANY_ADMIN']);
  });
  it('rejects unknown, inactive, wrong type and revoked associations uniformly', async () => {
    const f = fixture();
    const selection = { kind: 'ORGANIZATION', organizationId: 't', organizationType: 'THIRD_PARTY' } as const;
    for (const invalid of [{ ...selection, organizationId: 'foreign' }, { ...selection, organizationType: 'COMPANY' as const }]) {
      await expect(f.service.resolve(actor(['DRIVER']), invalid, 'INITIAL')).rejects.toBeInstanceOf(AuthorizationError);
    }
    f.organizations[1] = { ...f.organizations[1], active: false, revision: 2 };
    expect((await f.service.available(actor(['DRIVER']))).organizations.map(value => value.organizationId)).toEqual(['c']);
    f.organizations[1] = { ...f.organizations[1], active: true, revision: 3 };
    f.associations[1] = { ...f.associations[1], active: false, revision: 2 };
    await expect(f.service.resolve(actor(['DRIVER']), selection, 'RESTORE')).rejects.toBeInstanceOf(AuthorizationError);
    expect(f.audit.record.mock.calls.at(-1)?.[0]).toMatchObject({ action: 'CONTEXT_INVALIDATED', subject: 'u', result: 'denied' });
    expect(JSON.stringify(f.audit.record.mock.calls)).not.toContain('foreign');
  });
  it('re-reads policy and does not return a stale permission after revocation', async () => {
    const f = fixture();
    const selection = { kind: 'ORGANIZATION', organizationId: 't', organizationType: 'THIRD_PARTY' } as const;
    expect((await f.service.resolve(actor(['DRIVER']), selection, 'SWITCH')).authorization.permissions).toContain('invoices:create');
    f.policies.read.mockResolvedValue({ version: '2', grants: grantCeiling.filter(grant => grant.role !== 'DRIVER') });
    await expect(f.service.resolve(actor(['DRIVER']), selection, 'RESTORE')).rejects.toBeInstanceOf(AuthorizationError);
  });
  it('fails closed on dependencies and durable success capture, but preserves denial', async () => {
    const f = fixture();
    f.audit.record.mockRejectedValue(new Error('database down'));
    await expect(f.service.resolve(actor(['APP_ADMIN']), { kind: 'GLOBAL' }, 'INITIAL')).rejects.toThrow('AUTHORIZATION_UNAVAILABLE');
    await expect(f.service.resolve(actor([]), { kind: 'GLOBAL' }, 'INITIAL')).rejects.toBeInstanceOf(AuthorizationError);
    f.reader.candidates = async () => { throw new Error('down'); };
    await expect(f.service.available(actor(['APP_ADMIN']))).rejects.toThrow('AUTHORIZATION_UNAVAILABLE');
  });
  it('takes roles and permissions from one policy snapshot', async () => {
    const f = fixture(); let revision = 0;
    f.policies.read.mockImplementation(async () => ({ version: String(++revision), grants: grantCeiling }));
    const resolved = await f.service.resolve(actor(['APP_ADMIN']), { kind: 'GLOBAL' }, 'INITIAL');
    expect(resolved.authorization.policyVersion).toBe('1');
    expect(resolved.roles).toEqual(resolved.authorization.roles);
    expect(f.policies.read).toHaveBeenCalledTimes(1);
  });
});
