import { describe, expect, it } from 'vitest';
import { compatibleCapability, contextScope, organizationEvidence, type Organization, type OrganizationAssociation } from '@/modules/organizations/domain/organization';
import { validOrganization } from '@/modules/identity/domain/authorization-policy';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';

const actor: AuthenticatedActor = { subject: 'u', roles: ['COMPANY_ADMIN', 'DRIVER'], name: null, username: null, email: null, permissions: [] };
const organizations: Organization[] = [{ id: 'c', type: 'COMPANY', name: 'Company', active: true, revision: 1 }, { id: 't', type: 'THIRD_PARTY', name: 'Third party', active: true, revision: 2 }];
const associations: OrganizationAssociation[] = [{ id: 'a', subject: 'u', organizationId: 'c', capability: 'COMPANY_ADMIN', active: true, revision: 1 }, { id: 'b', subject: 'u', organizationId: 't', capability: 'DRIVER', active: true, revision: 1 }];
describe('organization domain', () => {
  it('maps explicit contexts without an implicit global fallback', () => {
    expect(contextScope({ kind: 'GLOBAL' })).toEqual({ kind: 'global', companyId: null, thirdPartyId: null });
    expect(contextScope({ kind: 'ORGANIZATION', organizationId: 'c', organizationType: 'COMPANY' })).toEqual({ kind: 'organization', companyId: 'c', thirdPartyId: null });
    expect(contextScope({ kind: 'ORGANIZATION', organizationId: 't', organizationType: 'THIRD_PARTY' })).toEqual({ kind: 'organization', companyId: null, thirdPartyId: 't' });
  });
  it('rejects incompatible capabilities and never treats APP_ADMIN as a local role', () => {
    expect(compatibleCapability('COMPANY', 'DRIVER')).toBe(false);
    expect(compatibleCapability('THIRD_PARTY', 'COMPANY_ADMIN')).toBe(false);
    expect(compatibleCapability('COMPANY', 'APP_ADMIN')).toBe(false);
    expect(compatibleCapability('THIRD_PARTY', 'THIRD_PARTY_ADMIN')).toBe(true);
  });
  it('keeps roles local and requires a relationship only for paired scopes', () => {
    for (const scope of [{ kind: 'organization', companyId: 'c', thirdPartyId: null }, { kind: 'organization', companyId: null, thirdPartyId: 't' }] as const) {
      expect(validOrganization(actor, scope, organizationEvidence('u', scope, organizations, associations, null))).toBe(true);
    }
    const scope = { kind: 'organization', companyId: 'c', thirdPartyId: 't' } as const;
    const relation = { companyId: 'c', thirdPartyId: 't', active: true, revision: 1 };
    expect(validOrganization(actor, scope, organizationEvidence('u', scope, organizations, associations, null))).toBe(false);
    expect(validOrganization(actor, scope, organizationEvidence('u', scope, organizations, associations, relation))).toBe(true);
    expect(validOrganization(actor, scope, organizationEvidence('another', scope, organizations, associations, relation))).toBe(false);
    const before = organizationEvidence('u', scope, organizations, associations, relation);
    expect(organizationEvidence('u', scope, organizations, [...associations].reverse(), relation).revision).toBe(before.revision);
    expect(organizationEvidence('u', scope, organizations, associations, { ...relation, revision: 2 }).revision).not.toBe(before.revision);
  });
});
