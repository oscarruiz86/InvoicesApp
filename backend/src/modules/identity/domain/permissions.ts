import type { ApplicationRole } from './actor';

export const permissions = [
  'companies:create', 'companies:read', 'companies:update', 'companies:deactivate',
  'third-parties:create', 'third-parties:read', 'third-parties:update', 'third-parties:deactivate',
  'users:create', 'users:read', 'users:update', 'users:associate',
  'drivers:create', 'drivers:read', 'drivers:update', 'drivers:deactivate',
  'vehicles:create', 'vehicles:read', 'vehicles:update', 'vehicles:deactivate', 'vehicles:assign', 'vehicles:unassign',
  'assignments:read', 'invoices:create', 'invoices:read', 'invoices:update', 'invoices:delete',
  'parameters:read', 'parameters:update', 'parameters:create', 'parameters:deactivate',
  'roles:read', 'roles:manage', 'associations:read', 'associations:manage', 'audit:read',
] as const;
export type Permission = typeof permissions[number];
export const isPermission = (value: string): value is Permission => (permissions as readonly string[]).includes(value);
export type GrantScope = 'global' | 'self' | 'company' | 'third-party';
export interface Grant { readonly role: ApplicationRole; readonly permission: Permission; readonly scope: GrantScope }

const grants = (role: ApplicationRole, scope: GrantScope, values: readonly Permission[]): Grant[] => values.map(permission => ({ role, permission, scope }));
export const grantCeiling: readonly Grant[] = Object.freeze([
  ...grants('APP_ADMIN', 'global', ['companies:create', 'companies:read', 'companies:update', 'companies:deactivate', 'third-parties:create', 'third-parties:read', 'third-parties:update', 'third-parties:deactivate', 'users:create', 'users:read', 'users:update', 'users:associate', 'parameters:read', 'parameters:update', 'roles:read', 'roles:manage', 'associations:read', 'associations:manage']),
  ...grants('COMPANY_ADMIN', 'company', ['companies:read', 'companies:update', 'third-parties:create', 'third-parties:read', 'third-parties:update', 'third-parties:deactivate', 'users:create', 'users:read', 'users:associate', 'associations:read', 'associations:manage']),
  ...grants('THIRD_PARTY_ADMIN', 'third-party', ['third-parties:read', 'third-parties:update', 'drivers:create', 'drivers:read', 'drivers:update', 'drivers:deactivate', 'vehicles:create', 'vehicles:read', 'vehicles:update', 'vehicles:deactivate', 'vehicles:assign', 'vehicles:unassign', 'assignments:read', 'invoices:read', 'invoices:update']),
  ...grants('DRIVER', 'self', ['users:read', 'drivers:read']),
  ...grants('DRIVER', 'third-party', ['vehicles:read', 'assignments:read', 'invoices:create', 'invoices:read', 'invoices:update']),
].map(grant => Object.freeze(grant)));
export const grantKey = (grant: Grant) => `${grant.role}/${grant.permission}/${grant.scope}`;
export function validGrants(values: readonly Grant[]): boolean {
  const ceiling = new Set(grantCeiling.map(grantKey));
  const keys = values.map(grantKey);
  return keys.length === new Set(keys).size && keys.every(key => ceiling.has(key));
}

const requiredAdministrativeGrants = [
  'APP_ADMIN/roles:read/global',
  'APP_ADMIN/roles:manage/global',
] as const;

/** A persistible policy always retains the global administrator recovery path. */
export function validPolicyGrants(values: readonly Grant[]): boolean {
  if (!validGrants(values)) return false;
  const keys = new Set(values.map(grantKey));
  return requiredAdministrativeGrants.every(key => keys.has(key));
}

export interface AuthorizationPolicy { readonly version: string; readonly grants: readonly Grant[] }
