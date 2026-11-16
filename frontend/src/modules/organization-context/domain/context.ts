import type { ApplicationRole } from '@/modules/authentication/domain/user';
import type { PermissionsSnapshot, PermissionScope } from '@/modules/authentication/domain/permissions';
export type ContextSelection = { readonly kind: 'GLOBAL' } | { readonly kind: 'ORGANIZATION'; readonly organizationId: string; readonly organizationType: 'COMPANY' | 'THIRD_PARTY' };
export interface OrganizationDestination { readonly organizationId: string; readonly organizationType: 'COMPANY' | 'THIRD_PARTY'; readonly organizationName: string; readonly roles: readonly ApplicationRole[] }
export type ResolvedContext = ({ readonly kind: 'GLOBAL'; readonly roles: readonly ApplicationRole[] } | ({ readonly kind: 'ORGANIZATION' } & OrganizationDestination)) & { readonly authorization: PermissionsSnapshot };
export interface AvailableContexts { readonly organizations: readonly OrganizationDestination[]; readonly globalAvailable: boolean }
export const selectionOf = (context: ContextSelection): ContextSelection => context.kind === 'GLOBAL' ? { kind: 'GLOBAL' } : { kind: 'ORGANIZATION', organizationId: context.organizationId, organizationType: context.organizationType };
export const scopeOf = (selection: ContextSelection): PermissionScope => selection.kind === 'GLOBAL' ? { kind: 'global', companyId: null, thirdPartyId: null } : { kind: 'organization', companyId: selection.organizationType === 'COMPANY' ? selection.organizationId : null, thirdPartyId: selection.organizationType === 'THIRD_PARTY' ? selection.organizationId : null };
