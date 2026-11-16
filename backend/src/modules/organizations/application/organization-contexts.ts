import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import { AuthorizationUnavailable } from '@/modules/identity/application/authorization-errors';
import { contextScope, type ContextSelection, type OrganizationDestination } from '../domain/organization';
import type { ContextAudit, ContextEvent, ContextPermissions, OrganizationContexts, OrganizationReader, ResolvedContext } from './context-ports';

export function createOrganizationContexts(deps: {
  organizations: OrganizationReader; permissions: ContextPermissions; audit: ContextAudit;
  now(): Date; nextId(): string;
}): OrganizationContexts {
  async function evaluate(actor: AuthenticatedActor, selection: ContextSelection): Promise<ResolvedContext> {
    // A role is displayed only if it has a complete effective grant in this scope.
    // Concurrent revisions are retried, never combined into a fabricated snapshot.
    for (let attempt = 0; attempt < 3; attempt++) {
      const scope = contextScope(selection);
      const organization = selection.kind === 'ORGANIZATION' ? await deps.organizations.find(selection.organizationId) : null;
      if (selection.kind === 'ORGANIZATION' && (!organization?.active || organization.type !== selection.organizationType)) throw new AuthorizationError();
      const authorization = await deps.permissions.getEffectivePermissions(actor, scope);
      if (!authorization.permissions.length) throw new AuthorizationError();
      const roles = authorization.roles;
      let stable = true;
      if (selection.kind === 'ORGANIZATION') {
        const current = await deps.organizations.find(selection.organizationId);
        if (!current?.active || current.revision !== organization?.revision) stable = false;
      }
      if (!stable) continue;
      if (!roles.length) throw new AuthorizationError();
      return selection.kind === 'GLOBAL' ? { kind: 'GLOBAL', roles, authorization } : {
        kind: 'ORGANIZATION', organizationId: selection.organizationId, organizationType: selection.organizationType,
        organizationName: organization!.name, roles, authorization,
      };
    }
    throw new AuthorizationUnavailable();
  }
  async function safe<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) {
      if (error instanceof AuthorizationError || error instanceof AuthorizationUnavailable) throw error;
      throw new AuthorizationUnavailable();
    }
  }
  return {
    available: actor => safe(async () => {
      let globalAvailable = false;
      try { await evaluate(actor, { kind: 'GLOBAL' }); globalAvailable = true; }
      catch (error) { if (!(error instanceof AuthorizationError)) throw error; }
      const candidates = await deps.organizations.candidates(actor.subject);
      const organizations: OrganizationDestination[] = [];
      for (const candidate of [...new Map(candidates.map(value => [value.id, value])).values()]) {
        try {
          const resolved = await evaluate(actor, { kind: 'ORGANIZATION', organizationId: candidate.id, organizationType: candidate.type });
          if (resolved.kind === 'ORGANIZATION') organizations.push({ organizationId: resolved.organizationId, organizationType: resolved.organizationType, organizationName: resolved.organizationName, roles: resolved.roles });
        } catch (error) { if (!(error instanceof AuthorizationError)) throw error; }
      }
      return { organizations, globalAvailable };
    }),
    resolve: (actor, selection, reason) => safe(async () => {
      let resolved: ResolvedContext;
      try { resolved = await evaluate(actor, selection); }
      catch (error) {
        if (error instanceof AuthorizationError) {
          const event: ContextEvent = { eventId: deps.nextId(), correlationId: deps.nextId(), at: deps.now().toISOString(), subject: actor.subject,
            action: reason === 'RESTORE' ? 'CONTEXT_INVALIDATED' : 'CONTEXT_DENIED', result: 'denied', suppressed: 0 };
          try { await deps.audit.record(event); } catch { /* Denial remains denial. Unverified IDs are never logged. */ }
        }
        throw error;
      }
      await deps.audit.record({ eventId: deps.nextId(), correlationId: deps.nextId(), at: deps.now().toISOString(), subject: actor.subject,
        action: reason === 'SWITCH' ? 'CONTEXT_SWITCH_REQUESTED' : reason === 'RESTORE' ? 'CONTEXT_RESTORED' : 'CONTEXT_SELECTED',
        result: 'allowed', selection: { ...selection }, suppressed: 0 });
      return resolved;
    }),
  };
}
