import type { AuthenticatedActor, ApplicationRole } from '@/modules/identity/domain/actor';
import type { Authorization } from '@/modules/identity/application/authorization';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import { AuthorizationUnavailable } from '@/modules/identity/application/authorization-errors';
import type { PolicyReader } from '@/modules/identity/application/authorization-ports';
import type { Permission } from '@/modules/identity/domain/permissions';
import type { InvoiceAuthorizationPort, InvoicePermission } from './invoice-ports';

const allowedRoles: readonly ApplicationRole[] = ['DRIVER', 'THIRD_PARTY_ADMIN'];
const scopeFor = (thirdPartyId: string) => ({ kind: 'organization' as const, companyId: null, thirdPartyId });

export function createInvoiceAuthorizationPort(deps: { readonly authorization: Authorization; readonly policies: PolicyReader }): InvoiceAuthorizationPort {
  return {
    async authorize(input: { readonly actor: AuthenticatedActor; readonly thirdPartyId: string; readonly permission: InvoicePermission }) {
      if (!/^[a-f0-9]{24}$/.test(input.thirdPartyId)) throw new Error('INVALID_REQUEST');
      const scope = scopeFor(input.thirdPartyId);
      try {
        const [snapshot, policy, receipt] = await Promise.all([
          deps.authorization.getEffectivePermissions(input.actor, scope),
          deps.policies.read(),
          deps.authorization.requirePermission(input.actor, input.permission as Permission, scope),
        ]);
        if (snapshot.scope.kind !== 'organization' || snapshot.scope.thirdPartyId !== input.thirdPartyId
          || !snapshot.permissions.includes(input.permission as Permission) || snapshot.policyVersion !== policy.version
          || receipt.policyVersion !== policy.version || receipt.contextRevision !== snapshot.contextRevision) throw new AuthorizationUnavailable();
        const roles = snapshot.roles.filter(role => allowedRoles.includes(role)
          && policy.grants.some(grant => grant.role === role && grant.permission === input.permission && grant.scope === 'third-party'));
        if (!roles.length) throw new AuthorizationError();
        if (input.permission === 'invoices:create' && !roles.includes('DRIVER')) throw new AuthorizationError();
        return { roles, policyVersion: policy.version, contextRevision: snapshot.contextRevision };
      } catch (error) {
        if (error instanceof AuthorizationError || error instanceof AuthorizationUnavailable) throw error;
        throw new AuthorizationUnavailable();
      }
    },
  };
}
