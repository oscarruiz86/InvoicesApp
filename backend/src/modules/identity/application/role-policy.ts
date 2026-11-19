import { applicationRoles, type AuthenticatedActor } from '../domain/actor';
import { grantCeiling, permissions, type AuthorizationPolicy, type Grant } from '../domain/permissions';
import type { Authorization } from './authorization';
import type { PolicyReader, PolicyWriter } from './authorization-ports';

const globalScope = { kind: 'global', companyId: null, thirdPartyId: null } as const;

export function rolePolicyView(policy: AuthorizationPolicy) {
  return {
    policy: { version: policy.version, grants: policy.grants.map(grant => ({ ...grant })) },
    catalog: {
      roles: [...applicationRoles],
      permissions: [...permissions],
      grantCeiling: grantCeiling.map(grant => ({ ...grant })),
    },
  };
}

export function createRolePolicyUseCases(deps: {
  authorization: Authorization;
  policies: PolicyReader;
  writer: PolicyWriter;
}) {
  return {
    async read(actor: AuthenticatedActor) {
      await deps.authorization.requirePermission(actor, 'roles:read', globalScope);
      const policy = await deps.policies.read();
      return rolePolicyView(policy);
    },
    async replace(actor: AuthenticatedActor, expectedVersion: string, grants: readonly Grant[]) {
      const policy = await deps.authorization.updateRolePermissions(actor, expectedVersion, grants, deps.writer);
      return rolePolicyView(policy);
    },
  };
}
export type RolePolicyUseCases = ReturnType<typeof createRolePolicyUseCases>;
