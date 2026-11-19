import { z } from 'zod';
import { ApplicationError } from '@/shared/application/application-error';
import { applicationRoles, permissions } from '@/modules/authentication/domain/permissions';
import { requiredRoleManagementGrants, roleGrantKey, type RolePolicyPort, type RolePolicyResponse } from '../domain/role-policy';
import type { RolePolicyHttp } from '../application/role-policy-api';

const grantSchema = z.object({
  role: z.enum(applicationRoles),
  permission: z.enum(permissions),
  scope: z.enum(['global', 'self', 'company', 'third-party']),
}).strict();
const uniqueGrants = z.array(grantSchema).refine(grants => new Set(grants.map(roleGrantKey)).size === grants.length);
const policyResponseSchema = z.object({
  policy: z.object({ version: z.string().regex(/^[1-9]\d*$/), grants: uniqueGrants }).strict(),
  catalog: z.object({
    roles: z.array(z.enum(applicationRoles)).refine(roles => roles.length === applicationRoles.length && applicationRoles.every(role => roles.includes(role))),
    permissions: z.array(z.enum(permissions)).refine(values => values.length === new Set(values).size),
    grantCeiling: uniqueGrants,
  }).strict(),
}).strict().refine(value => {
  const ceiling = new Set(value.catalog.grantCeiling.map(roleGrantKey));
  const permissionSet = new Set(value.catalog.permissions);
  const grants = new Set(value.policy.grants.map(roleGrantKey));
  return value.policy.grants.every(grant => ceiling.has(roleGrantKey(grant)) && permissionSet.has(grant.permission))
    && requiredRoleManagementGrants.every(grant => grants.has(grant))
    && value.catalog.grantCeiling.every(grant => permissionSet.has(grant.permission));
});

function parse(value: unknown): RolePolicyResponse {
  const result = policyResponseSchema.safeParse(value);
  if (!result.success) throw new ApplicationError('INVALID_RESPONSE');
  return result.data as RolePolicyResponse;
}

export function createHttpRolePolicy(http: RolePolicyHttp): RolePolicyPort {
  return {
    async read(signal) {
      return parse(await http.roles('GET', 'scope=global', undefined, signal));
    },
    async replace(expectedVersion, grants, signal) {
      return parse(await http.roles('PUT', 'scope=global', { expectedVersion, grants }, signal));
    },
  };
}
