import type { ApplicationRole } from '@/modules/identity/domain/actor';
import type { OrganizationEvidence, OrganizationScope } from '@/modules/identity/domain/authorization-facts';

export type OrganizationType = 'COMPANY' | 'THIRD_PARTY';
export type LocalRole = Exclude<ApplicationRole, 'APP_ADMIN'>;
export interface Organization {
  readonly id: string; readonly type: OrganizationType; readonly name: string;
  readonly active: boolean; readonly revision: number;
}
export interface OrganizationAssociation {
  readonly id: string; readonly subject: string; readonly organizationId: string;
  readonly capability: LocalRole; readonly active: boolean; readonly revision: number;
}
export interface OrganizationRelationship {
  readonly companyId: string; readonly thirdPartyId: string; readonly active: boolean; readonly revision: number;
}
export type ContextSelection = { readonly kind: 'GLOBAL' } | {
  readonly kind: 'ORGANIZATION'; readonly organizationId: string; readonly organizationType: OrganizationType;
};
export interface OrganizationDestination {
  readonly organizationId: string; readonly organizationType: OrganizationType;
  readonly organizationName: string; readonly roles: readonly ApplicationRole[];
}
export const globalScope = { kind: 'global', companyId: null, thirdPartyId: null } as const;
export function contextScope(selection: ContextSelection): OrganizationScope {
  return selection.kind === 'GLOBAL' ? globalScope : { kind: 'organization',
    companyId: selection.organizationType === 'COMPANY' ? selection.organizationId : null,
    thirdPartyId: selection.organizationType === 'THIRD_PARTY' ? selection.organizationId : null };
}
export function compatibleCapability(type: OrganizationType, role: ApplicationRole): boolean {
  return type === 'COMPANY' ? role === 'COMPANY_ADMIN' : role === 'THIRD_PARTY_ADMIN' || role === 'DRIVER';
}
/** Input is owned by Organizations. No roles or organization facts come from browser state. */
export function organizationEvidence(subject: string, scope: OrganizationScope, organizations: readonly Organization[], associations: readonly OrganizationAssociation[], relationship: OrganizationRelationship | null): OrganizationEvidence {
  const company = organizations.find(value => value.id === scope.companyId && value.type === 'COMPANY');
  const thirdParty = organizations.find(value => value.id === scope.thirdPartyId && value.type === 'THIRD_PARTY');
  const relevant = associations.filter(value => value.subject === subject && organizations.some(org => org.id === value.organizationId && compatibleCapability(org.type, value.capability)));
  const revision = JSON.stringify([
    [...organizations].sort((a, b) => a.id.localeCompare(b.id)).map(org => [org.id, org.revision]),
    [...relevant].sort((a, b) => a.id.localeCompare(b.id)).map(value => [value.id, value.revision]),
    relationship ? [relationship.companyId, relationship.thirdPartyId, relationship.revision] : null,
  ]);
  return { subject, scope: { ...scope }, revision, companyActive: company?.active === true,
    thirdPartyActive: thirdParty?.active === true,
    relationshipActive: Boolean(relationship?.active && relationship.companyId === scope.companyId && relationship.thirdPartyId === scope.thirdPartyId),
    capabilities: relevant.map(value => ({ role: value.capability, active: value.active,
      companyId: value.capability === 'COMPANY_ADMIN' ? value.organizationId : null,
      thirdPartyId: value.capability === 'COMPANY_ADMIN' ? null : value.organizationId })) };
}
