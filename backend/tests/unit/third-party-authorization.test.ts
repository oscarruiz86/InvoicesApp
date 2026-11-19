import { expect, it } from 'vitest';
import { checkPermission } from '@/modules/identity/domain/authorization-policy';
import { grantCeiling, type Permission } from '@/modules/identity/domain/permissions';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { OrganizationEvidence, OrganizationScope } from '@/modules/identity/domain/authorization-facts';

const policy = { version: '1', grants: grantCeiling };
const actor = (roles: AuthenticatedActor['roles']): AuthenticatedActor => ({ subject: 'actor', roles, permissions: [], username: null, name: null, email: null });
const global: OrganizationScope = { kind: 'global', companyId: null, thirdPartyId: null };
const company: OrganizationScope = { kind: 'organization', companyId: 'company-1', thirdPartyId: null };
const thirdParty: OrganizationScope = { kind: 'organization', companyId: null, thirdPartyId: '0123456789abcdef01234567' };
const companyEvidence: OrganizationEvidence = { subject: 'actor', scope: company, revision: '1', companyActive: true, thirdPartyActive: false, relationshipActive: false,
  capabilities: [{ role: 'COMPANY_ADMIN', companyId: 'company-1', thirdPartyId: null, active: true }] };
const thirdPartyEvidence: OrganizationEvidence = { subject: 'actor', scope: thirdParty, revision: '1', companyActive: false, thirdPartyActive: true, relationshipActive: false,
  capabilities: [{ role: 'THIRD_PARTY_ADMIN', companyId: null, thirdPartyId: thirdParty.thirdPartyId, active: true }] };

it('limits APP_ADMIN third-party administration to a global scope', () => {
  for (const permission of ['third-parties:create', 'third-parties:read', 'third-parties:update', 'third-parties:deactivate'] as Permission[]) {
    expect(checkPermission(actor(['APP_ADMIN']), policy, permission, global)).toEqual({ allowed: true });
    expect(checkPermission(actor(['APP_ADMIN']), policy, permission, company)).toEqual({ allowed: false, reason: 'CONTEXT' });
  }
});
it('keeps COMPANY_ADMIN relationship/profile grants inside its active company', () => {
  for (const permission of ['third-parties:create', 'third-parties:read', 'third-parties:update', 'third-parties:deactivate'] as Permission[]) {
    expect(checkPermission(actor(['COMPANY_ADMIN']), policy, permission, company, companyEvidence)).toEqual({ allowed: true });
    expect(checkPermission(actor(['COMPANY_ADMIN']), policy, permission, global)).toEqual({ allowed: false, reason: 'PERMISSION' });
  }
});
it('limits THIRD_PARTY_ADMIN to read and profile update in its own organization', () => {
  expect(checkPermission(actor(['THIRD_PARTY_ADMIN']), policy, 'third-parties:read', thirdParty, thirdPartyEvidence)).toEqual({ allowed: true });
  expect(checkPermission(actor(['THIRD_PARTY_ADMIN']), policy, 'third-parties:update', thirdParty, thirdPartyEvidence)).toEqual({ allowed: true });
  for (const permission of ['third-parties:create', 'third-parties:deactivate'] as Permission[]) {
    expect(checkPermission(actor(['THIRD_PARTY_ADMIN']), policy, permission, thirdParty, thirdPartyEvidence).allowed).toBe(false);
  }
  expect(checkPermission(actor(['THIRD_PARTY_ADMIN']), policy, 'third-parties:read', { ...thirdParty, thirdPartyId: 'fedcba987654321001234567' }, thirdPartyEvidence).allowed).toBe(false);
});
it('does not grant any third-party management permission to DRIVER', () => {
  for (const permission of ['third-parties:create', 'third-parties:read', 'third-parties:update', 'third-parties:deactivate'] as Permission[]) {
    expect(checkPermission(actor(['DRIVER']), policy, permission, global)).toEqual({ allowed: false, reason: 'PERMISSION' });
  }
});
