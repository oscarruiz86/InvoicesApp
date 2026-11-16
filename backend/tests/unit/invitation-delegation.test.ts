import { expect, it } from 'vitest';
import { createAuthorization } from '@/modules/identity/application/authorization';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { grantCeiling } from '@/modules/identity/domain/permissions';
import { createInvitationDelegation, InvitationDelegationDenied } from '@/modules/organizations/application/invitation-delegation';
import { organizationEvidence, type Organization, type OrganizationAssociation } from '@/modules/organizations/domain/organization';
import type { OrganizationReader } from '@/modules/organizations/application/context-ports';

const organizations: Organization[] = [
  { id: 'company-a', type: 'COMPANY', name: 'Company A', active: true, revision: 1 },
  { id: 'third-a', type: 'THIRD_PARTY', name: 'Third party A', active: true, revision: 1 },
  { id: 'third-b', type: 'THIRD_PARTY', name: 'Third party B', active: true, revision: 1 },
];
const associations: OrganizationAssociation[] = [
  { id: 'company-admin', subject: 'company-admin', organizationId: 'company-a', capability: 'COMPANY_ADMIN', active: true, revision: 1 },
  { id: 'third-party-admin', subject: 'third-party-admin', organizationId: 'third-a', capability: 'THIRD_PARTY_ADMIN', active: true, revision: 1 },
];
const reader: OrganizationReader = {
  candidates: async subject => organizations.filter(organization => associations.some(association => association.subject === subject && association.organizationId === organization.id && association.active)),
  find: async id => organizations.find(organization => organization.id === id) ?? null,
  read: async (subject, scope) => organizationEvidence(subject, scope, organizations.filter(organization => [scope.companyId, scope.thirdPartyId].includes(organization.id)), associations,
    scope.companyId && scope.thirdPartyId ? { companyId: scope.companyId, thirdPartyId: scope.thirdPartyId, active: scope.thirdPartyId === 'third-a', revision: 1 } : null),
};
const authorization = createAuthorization({ policies: { read: async () => ({ version: '1', grants: grantCeiling }) }, organizations: reader,
  audit: { record: async () => {} }, clock: { now: () => new Date('2026-11-13T00:00:00Z') }, ids: { next: () => 'event' } });
const delegation = createInvitationDelegation({ organizations: reader, authorization });
const actor = (subject: string, roles: AuthenticatedActor['roles'], email: string): AuthenticatedActor => ({ subject, roles, email, name: null, username: null, permissions: [] });
const invite = (organizationId: string, organizationType: 'COMPANY' | 'THIRD_PARTY', roles: string[], companyId: string | null = null) => ({
  organizationId, organizationType, companyId, recipientEmail: 'recipient@example.invalid', roles,
});

it('authorizes each invitation link with current global or local capabilities', async () => {
  await expect(delegation.invitation(actor('root', ['APP_ADMIN'], 'root@example.invalid'), invite('company-a', 'COMPANY', ['COMPANY_ADMIN'], 'company-a'))).resolves.toBeUndefined();
  await expect(delegation.invitation(actor('company-admin', [], 'company@example.invalid'), invite('third-a', 'THIRD_PARTY', ['THIRD_PARTY_ADMIN'], 'company-a'))).resolves.toBeUndefined();
  await expect(delegation.invitation(actor('third-party-admin', [], 'third@example.invalid'), invite('third-a', 'THIRD_PARTY', ['DRIVER']))).resolves.toBeUndefined();
});

it('applies the same delegation chain to membership role changes and blocks self changes', async () => {
  await expect(delegation.membershipRoles(actor('root', ['APP_ADMIN'], 'root@example.invalid'), { ...invite('company-a', 'COMPANY', ['COMPANY_ADMIN'], 'company-a'), subject: 'new-admin' })).resolves.toBeUndefined();
  await expect(delegation.membershipRoles(actor('company-admin', [], 'company@example.invalid'), { ...invite('third-a', 'THIRD_PARTY', ['THIRD_PARTY_ADMIN'], 'company-a'), subject: 'third-admin' })).resolves.toBeUndefined();
  await expect(delegation.membershipRoles(actor('third-party-admin', [], 'third@example.invalid'), { ...invite('third-a', 'THIRD_PARTY', ['DRIVER']), subject: 'driver' })).resolves.toBeUndefined();
  await expect(delegation.membershipRoles(actor('third-party-admin', [], 'third@example.invalid'), { ...invite('third-a', 'THIRD_PARTY', ['DRIVER']), subject: 'third-party-admin' })).rejects.toBeInstanceOf(InvitationDelegationDenied);
});

it('rejects stale local token roles, foreign organizations, role escalation and self invitations', async () => {
  await expect(delegation.invitation(actor('stale', ['COMPANY_ADMIN'], 'stale@example.invalid'), invite('third-a', 'THIRD_PARTY', ['THIRD_PARTY_ADMIN'], 'company-a'))).rejects.toBeInstanceOf(InvitationDelegationDenied);
  await expect(delegation.invitation(actor('company-admin', [], 'company@example.invalid'), invite('third-b', 'THIRD_PARTY', ['THIRD_PARTY_ADMIN'], 'company-a'))).rejects.toBeInstanceOf(InvitationDelegationDenied);
  await expect(delegation.invitation(actor('company-admin', [], 'company@example.invalid'), invite('third-a', 'THIRD_PARTY', ['DRIVER'], 'company-a'))).rejects.toBeInstanceOf(InvitationDelegationDenied);
  await expect(delegation.invitation(actor('root', ['APP_ADMIN'], 'root@example.invalid'), { ...invite('company-a', 'COMPANY', ['COMPANY_ADMIN']), recipientEmail: ' ROOT@example.invalid ' })).rejects.toBeInstanceOf(InvitationDelegationDenied);
});
