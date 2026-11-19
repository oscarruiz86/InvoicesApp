import type { ApplicationRole, Permission } from '@/modules/authentication/domain/permissions';

export type RoleGrantScope = 'global' | 'self' | 'company' | 'third-party';
export interface RoleGrant {
  readonly role: ApplicationRole;
  readonly permission: Permission;
  readonly scope: RoleGrantScope;
}
export interface RolePolicy {
  readonly version: string;
  readonly grants: readonly RoleGrant[];
}
export interface RolePolicyCatalog {
  readonly roles: readonly ApplicationRole[];
  readonly permissions: readonly Permission[];
  readonly grantCeiling: readonly RoleGrant[];
}
export interface RolePolicyResponse {
  readonly policy: RolePolicy;
  readonly catalog: RolePolicyCatalog;
}
export interface RolePolicyPort {
  read(signal?: AbortSignal): Promise<RolePolicyResponse>;
  replace(expectedVersion: string, grants: readonly RoleGrant[], signal?: AbortSignal): Promise<RolePolicyResponse>;
}

export const roleGrantKey = (grant: RoleGrant) => `${grant.role}/${grant.permission}/${grant.scope}`;
export const requiredRoleManagementGrants = [
  'APP_ADMIN/roles:read/global',
  'APP_ADMIN/roles:manage/global',
] as const;
