import type { AuthenticatedActor } from './actor';
import type { AuthorizationPolicy, Grant, Permission } from './permissions';
import { isPermission, validPolicyGrants } from './permissions';
import { sameScope, validScope, type AuthorizationDecision, type OrganizationEvidence, type OrganizationScope, type ResourceFacts } from './authorization-facts';

export function effectiveRoles(actor: AuthenticatedActor, scope: OrganizationScope, evidence?: OrganizationEvidence): readonly AuthenticatedActor['roles'][number][] {
  if (scope.kind === 'global') return actor.roles.includes('APP_ADMIN') ? ['APP_ADMIN'] : [];
  if (!evidence || evidence.subject !== actor.subject || !sameScope(scope, evidence.scope) || !evidence.revision) return [];
  return [...new Set(evidence.capabilities.filter(capability => capability.active && capability.role !== 'APP_ADMIN').map(capability => capability.role))];
}

export function validOrganization(actor: AuthenticatedActor, scope: OrganizationScope, evidence?: OrganizationEvidence): boolean {
  if (!validScope(scope)) return false;
  if (scope.kind === 'global') return true;
  if (scope.kind === 'self') return effectiveRoles(actor, scope, evidence).length > 0;
  return Boolean(evidence && evidence.subject === actor.subject && sameScope(scope, evidence.scope) && evidence.revision
    && (!scope.companyId || evidence.companyActive) && (!scope.thirdPartyId || evidence.thirdPartyActive)
    && (!(scope.companyId && scope.thirdPartyId) || evidence.relationshipActive)
    && evidence.capabilities.some(capability => capability.active
      && (capability.role === 'COMPANY_ADMIN'
        ? Boolean(scope.companyId) && capability.companyId === scope.companyId && capability.thirdPartyId === null
        : ['THIRD_PARTY_ADMIN', 'DRIVER'].includes(capability.role) && Boolean(scope.thirdPartyId) && capability.thirdPartyId === scope.thirdPartyId
          && (capability.companyId === null || capability.companyId === scope.companyId))));
}

function applies(grant: Grant, scope: OrganizationScope, evidence?: OrganizationEvidence): boolean {
  if (scope.kind !== 'organization') return grant.scope === scope.kind;
  return Boolean(evidence?.capabilities.some(capability => capability.active && capability.role === grant.role
    && (grant.scope === 'company'
      ? Boolean(scope.companyId) && capability.companyId === scope.companyId && capability.thirdPartyId === null
      : grant.scope === 'third-party' && Boolean(scope.thirdPartyId) && capability.thirdPartyId === scope.thirdPartyId
        && (capability.companyId === null || capability.companyId === scope.companyId))));
}

export function matchingGrants(actor: AuthenticatedActor, policy: AuthorizationPolicy, permission: string, scope: OrganizationScope, evidence?: OrganizationEvidence): readonly Grant[] {
  if (!actor.subject || !policy.version || !validPolicyGrants(policy.grants) || !isPermission(permission) || !validOrganization(actor, scope, evidence)) return [];
  const roles = effectiveRoles(actor, scope, evidence);
  return policy.grants.filter(grant => grant.permission === permission && roles.includes(grant.role) && applies(grant, scope, evidence));
}

function resourceMatches(subject: string, permission: Permission, grant: Grant, scope: OrganizationScope, resource: ResourceFacts): boolean {
  if (!resource.id || !resource.revision || resource.type !== permission.split(':')[0]) return false;
  if (scope.kind === 'self') return resource.ownerSubject === subject;
  if (scope.kind === 'organization' && ((scope.companyId && resource.companyId !== scope.companyId) || (scope.thirdPartyId && resource.thirdPartyId !== scope.thirdPartyId))) return false;
  if (grant.role === 'COMPANY_ADMIN' && resource.type === 'users' && resource.targetRole !== 'THIRD_PARTY_ADMIN') return false;
  if (['users:create', 'users:associate', 'associations:manage'].includes(permission) && resource.type === 'users') {
    if (resource.targetSubject === subject || resource.targetRole !== (grant.role === 'APP_ADMIN' ? 'COMPANY_ADMIN' : 'THIRD_PARTY_ADMIN')) return false;
  }
  if (resource.type === 'associations' && permission === 'associations:manage') {
    if (!resource.associationKind) return false;
    if (resource.associationKind !== 'company-third-party' && (!resource.targetSubject || resource.targetSubject === subject
      || resource.targetRole !== (grant.role === 'APP_ADMIN' ? 'COMPANY_ADMIN' : 'THIRD_PARTY_ADMIN')
      || resource.associationKind !== (grant.role === 'APP_ADMIN' ? 'user-company' : 'user-third-party'))) return false;
  }
  if (resource.type === 'users' && permission === 'users:update' && resource.targetRole) return false; // Profile updates never assign roles.
  if (grant.role === 'THIRD_PARTY_ADMIN' && permission === 'invoices:update') return true;
  if (grant.role !== 'DRIVER') return !['invoices:update', 'invoices:create'].includes(permission) || resource.eligible === true;
  switch (permission) {
    case 'vehicles:read': return resource.active === true && resource.assignmentActive === true && resource.assignedSubject === subject;
    case 'assignments:read': return resource.active === true && resource.assignedSubject === subject;
    case 'invoices:create': return resource.ownerSubject === subject && resource.vehicleActive === true && resource.assignmentActive === true && resource.assignedSubject === subject && resource.eligible === true && ['MANUAL', 'QR'].includes(resource.origin ?? '');
    case 'invoices:read': return resource.ownerSubject === subject;
    case 'invoices:update': return resource.ownerSubject === subject && resource.origin === 'MANUAL' && resource.eligible === true;
    default: return false;
  }
}

export function checkPermission(actor: AuthenticatedActor, policy: AuthorizationPolicy, permission: string, scope: OrganizationScope, evidence?: OrganizationEvidence, resource?: ResourceFacts): AuthorizationDecision {
  if (!validOrganization(actor, scope, evidence)) return { allowed: false, reason: 'CONTEXT' };
  const grants = matchingGrants(actor, policy, permission, scope, evidence);
  if (!grants.length) return { allowed: false, reason: 'PERMISSION' };
  if (resource && !grants.some(grant => resourceMatches(actor.subject, grant.permission, grant, scope, resource))) return { allowed: false, reason: 'RESOURCE' };
  return { allowed: true };
}
