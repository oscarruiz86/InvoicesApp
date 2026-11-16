import { expect, it } from 'vitest';
import { checkPermission } from '@/modules/identity/domain/authorization-policy';
import { grantCeiling, type Permission } from '@/modules/identity/domain/permissions';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { OrganizationEvidence, OrganizationScope, ResourceFacts } from '@/modules/identity/domain/authorization-facts';
const policy = { version: '1', grants: grantCeiling };
const company = (roles: AuthenticatedActor['roles'], subject = 'actor'): AuthenticatedActor => ({ subject, roles, permissions: [], username: null, name: null, email: null });
const facts: ResourceFacts = { type: 'companies', id: 'a', revision: '1', companyId: 'a', thirdPartyId: null, active: true };
const local: OrganizationScope = { kind: 'organization', companyId: 'a', thirdPartyId: null };
const evidence: OrganizationEvidence = { subject: 'actor', scope: local, revision: '1', companyActive: true, thirdPartyActive: false, relationshipActive: false, capabilities: [{ role: 'COMPANY_ADMIN', companyId: 'a', thirdPartyId: null, active: true }] };
it('checks company permission, verified association and resource ownership as one decision', () => {
  expect(checkPermission(company([]), policy, 'companies:update', local, evidence, facts)).toEqual({ allowed: true });
  expect(checkPermission(company(['COMPANY_ADMIN']), policy, 'companies:update', local, evidence, { ...facts, companyId: 'b' })).toEqual({ allowed: false, reason: 'RESOURCE' });
  expect(checkPermission(company(['COMPANY_ADMIN']), policy, 'companies:update', local, { ...evidence, capabilities: [] }, facts)).toEqual({ allowed: false, reason: 'CONTEXT' });
  expect(checkPermission(company(['COMPANY_ADMIN']), policy, 'companies:create', { kind: 'global', companyId: null, thirdPartyId: null })).toEqual({ allowed: false, reason: 'PERMISSION' });
});
it.each(['THIRD_PARTY_ADMIN', 'DRIVER'] as const)('denies %s all company permissions', role => {
  for (const permission of ['companies:create', 'companies:read', 'companies:update', 'companies:deactivate'] as Permission[]) {
    expect(checkPermission(company([role]), policy, permission, { kind: 'global', companyId: null, thirdPartyId: null })).toEqual({ allowed: false, reason: 'PERMISSION' });
  }
});
it('keeps APP_ADMIN global while allowing a separately evidenced local membership', () => {
  const global = { kind: 'global', companyId: null, thirdPartyId: null } as const;
  expect(checkPermission(company(['APP_ADMIN']), policy, 'companies:read', global, undefined, facts)).toEqual({ allowed: true });
  expect(checkPermission(company(['APP_ADMIN']), policy, 'companies:read', local, evidence, facts)).toEqual({ allowed: true });
  expect(checkPermission(company(['APP_ADMIN', 'COMPANY_ADMIN']), policy, 'companies:read', local, undefined, facts)).toEqual({ allowed: false, reason: 'CONTEXT' });
});
