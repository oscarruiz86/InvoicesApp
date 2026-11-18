/** Public API vocabulary; no role-to-permission matrix lives in the browser. */
export const permissions = [
  'companies:create', 'companies:read', 'companies:update', 'companies:deactivate',
  'third-parties:create', 'third-parties:read', 'third-parties:update', 'third-parties:deactivate',
  'users:create', 'users:read', 'users:update', 'users:associate',
  'drivers:create', 'drivers:read', 'drivers:update', 'drivers:deactivate',
  'vehicles:create', 'vehicles:read', 'vehicles:update', 'vehicles:deactivate', 'vehicles:assign', 'vehicles:unassign',
  'assignments:read', 'invoices:create', 'invoices:read', 'invoices:update', 'invoices:delete',
  'parameters:read', 'parameters:update', 'parameters:create', 'parameters:deactivate',
  'roles:read', 'roles:manage', 'associations:read', 'associations:manage', 'audit:read', 'notifications:deliveries:read',
] as const;
export type Permission = typeof permissions[number];
export const applicationRoles = ['APP_ADMIN', 'COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER'] as const;
export type ApplicationRole = typeof applicationRoles[number];
export type PermissionScope = { readonly kind: 'self' | 'global' | 'organization'; readonly companyId: string | null; readonly thirdPartyId: string | null };
export interface PermissionsSnapshot {
  readonly subject: string; readonly scope: PermissionScope; readonly roles: readonly ApplicationRole[]; readonly permissions: readonly Permission[];
  readonly policyVersion: string; readonly contextRevision: string | null; readonly evaluatedAt: string; readonly refreshAfterSeconds: 30;
}
export const selfScope: PermissionScope = { kind: 'self', companyId: null, thirdPartyId: null };
export const sameScope = (a: PermissionScope, b: PermissionScope) => a.kind === b.kind && a.companyId === b.companyId && a.thirdPartyId === b.thirdPartyId;
