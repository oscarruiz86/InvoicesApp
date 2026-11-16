import type { AuthenticatedActor } from '../domain/actor';
import { checkPermission, effectiveRoles, validOrganization } from '../domain/authorization-policy';
import type { ApplicationRole } from '../domain/actor';
import { permissions, validGrants, type AuthorizationPolicy, type Grant, type Permission } from '../domain/permissions';
import { validScope, type OrganizationEvidence, type OrganizationScope } from '../domain/authorization-facts';
import type { AuthorizationClock, AuthorizationReceipt, EventIdentity, OrganizationAccessReader, PolicyReader, PolicyWriter, ResourceAccessReader, SecurityAudit, SecurityEvent } from './authorization-ports';
import { AuthorizationError } from './authentication-error';
import { AuthorizationUnavailable, InvalidAuthorizationRequest, PolicyConflict, ResourceNotFound } from './authorization-errors';

export interface PermissionsSnapshot {
  readonly subject: string; readonly scope: OrganizationScope; readonly roles: readonly ApplicationRole[]; readonly permissions: readonly Permission[];
  readonly policyVersion: string; readonly contextRevision: string | null; readonly evaluatedAt: string; readonly refreshAfterSeconds: 30;
}
export function createAuthorization(deps: {
  policies: PolicyReader; organizations: OrganizationAccessReader; audit: SecurityAudit;
  clock: AuthorizationClock; ids: EventIdentity;
}) {
  async function policy() {
    try {
      const value = await deps.policies.read();
      if (!value.version || !validGrants(value.grants)) throw new AuthorizationUnavailable();
      return value;
    } catch { throw new AuthorizationUnavailable(); }
  }
  async function deny(actor: AuthenticatedActor, reason: SecurityEvent['reason'], permission?: Permission, scope?: OrganizationScope) {
    // No raw request, token, unverified organization/resource ID or provider claims enter this event.
    try { await deps.audit.record({ eventId: deps.ids.next(), at: deps.clock.now().toISOString(), subject: actor.subject,
      action: 'ACCESS_DENIED', result: 'denied', reason, correlationId: deps.ids.next(), suppressed: 0,
      ...(permission ? { permission } : {}), ...(scope ? { scope: { ...scope } } : {}) }); } catch { /* Audit failure never grants access. */ }
  }
  async function context(actor: AuthenticatedActor, scope: OrganizationScope) {
    if (!validScope(scope)) throw new InvalidAuthorizationRequest();
    if (scope.kind === 'global') return undefined;
    let value: OrganizationEvidence | null;
    try { value = await deps.organizations.read(actor.subject, scope); } catch { throw new AuthorizationUnavailable(); }
    if (!value && scope.kind === 'self') return undefined;
    if (!value || !validOrganization(actor, scope, value)) { await deny(actor, 'CONTEXT'); throw new AuthorizationError(); }
    return value;
  }
  async function prepare(actor: AuthenticatedActor, scope: OrganizationScope) {
    const evidence = await context(actor, scope);
    const current = await policy();
    return { evidence, current };
  }
  const getUserPermissions = (actor: AuthenticatedActor, current: AuthorizationPolicy) => current.grants.filter(grant => grant.role === 'APP_ADMIN' && actor.roles.includes('APP_ADMIN'));
  return {
    getUserPermissions: async (actor: AuthenticatedActor) => getUserPermissions(actor, await policy()),
    async getEffectivePermissions(actor: AuthenticatedActor, scope: OrganizationScope): Promise<PermissionsSnapshot> {
      const { evidence, current } = await prepare(actor, scope);
      if (scope.kind === 'global' && !getUserPermissions(actor, current).some(grant => grant.scope === 'global')) { await deny(actor, 'PERMISSION'); throw new AuthorizationError(); }
      return { subject: actor.subject, scope: { ...scope }, roles: effectiveRoles(actor, scope, evidence), permissions: permissions.filter(permission => checkPermission(actor, current, permission, scope, evidence).allowed),
        policyVersion: current.version, contextRevision: evidence?.revision ?? null, evaluatedAt: deps.clock.now().toISOString(), refreshAfterSeconds: 30 };
    },
    async requirePermission(actor: AuthenticatedActor, permission: Permission, scope: OrganizationScope) {
      const { evidence, current } = await prepare(actor, scope);
      const decision = checkPermission(actor, current, permission, scope, evidence);
      if (!decision.allowed) { await deny(actor, decision.reason, permission, scope); throw new AuthorizationError(); }
      return { policyVersion: current.version, contextRevision: evidence?.revision ?? null };
    },
    async authorizeResourceAccess(actor: AuthenticatedActor, permission: Permission, scope: OrganizationScope, id: string, reader: ResourceAccessReader): Promise<AuthorizationReceipt> {
      const { evidence, current } = await prepare(actor, scope);
      if (!checkPermission(actor, current, permission, scope, evidence).allowed) { await deny(actor, 'PERMISSION', permission, scope); throw new AuthorizationError(); }
      let resource;
      try { resource = await reader.read(actor.subject, scope, permission, id); } catch { throw new AuthorizationUnavailable(); }
      if (!resource || resource.id !== id || !checkPermission(actor, current, permission, scope, evidence, resource).allowed) {
        await deny(actor, 'RESOURCE', permission, scope); throw new ResourceNotFound();
      }
      return { subject: actor.subject, permission, scope: { ...scope }, policyVersion: current.version, contextRevision: evidence?.revision ?? null, resourceRevision: resource.revision };
    },
    async updateRolePermissions(actor: AuthenticatedActor, expectedVersion: string, grants: readonly Grant[], writer: PolicyWriter) {
      const current = await policy();
      const scope = { kind: 'global', companyId: null, thirdPartyId: null } as const;
      if (!checkPermission(actor, current, 'roles:manage', scope).allowed) { await deny(actor, 'PERMISSION'); throw new AuthorizationError(); }
      if (!validGrants(grants)) throw new InvalidAuthorizationRequest();
      if (current.version !== expectedVersion) throw new PolicyConflict();
      const event: SecurityEvent = { eventId: deps.ids.next(), at: deps.clock.now().toISOString(), subject: actor.subject,
        action: 'POLICY_CHANGED', result: 'allowed', reason: 'POLICY', correlationId: deps.ids.next(), suppressed: 0, beforeVersion: expectedVersion,
        permission: 'roles:manage', scope, resource: { type: 'authorization-policy', id: 'active' } };
      return writer.replace(expectedVersion, grants, event);
    },
  };
}
export type Authorization = ReturnType<typeof createAuthorization>;
