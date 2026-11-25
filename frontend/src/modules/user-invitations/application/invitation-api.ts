import type { PermissionScope } from '@/modules/authentication/domain/permissions';

export type InvitationRole = 'COMPANY_ADMIN' | 'THIRD_PARTY_ADMIN' | 'DRIVER';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
export interface InvitationRecord { readonly id: string; readonly organizationId: string; readonly organizationType: 'COMPANY' | 'THIRD_PARTY'; readonly companyId: string | null; readonly organizationName?: string; readonly companyName?: string;
  readonly recipientEmail: string; readonly roles: readonly InvitationRole[]; readonly status: InvitationStatus; readonly expiresAt: string; readonly version: number;
  readonly deliveryStatus: 'UNKNOWN' | 'LOGGED' | 'FAILED'; readonly createdAt: string; readonly resolvedAt: string | null }
export interface OrganizationTarget { readonly organizationId: string; readonly organizationType: 'COMPANY' | 'THIRD_PARTY'; readonly companyId: string | null }
export interface InvitationListTarget { readonly organizationId: string; readonly organizationType: 'ALL'; readonly companyId: string | null }
export interface InvitationSearchFilters {
  readonly email?: string;
  readonly role?: InvitationRole;
  readonly delivery?: InvitationRecord['deliveryStatus'];
}
export interface InvitationPage { readonly items: readonly InvitationRecord[]; readonly page: number; readonly pageSize: number; readonly total: number }
export interface InvitationPreview { readonly organizationId: string; readonly organizationType: 'COMPANY' | 'THIRD_PARTY'; readonly organizationName: string; readonly recipientEmail: string; readonly roles: readonly InvitationRole[]; readonly expiresAt: string; readonly version: number }
export interface ReceivedInvitation { readonly id: string; readonly organizationId: string; readonly organizationType: 'COMPANY' | 'THIRD_PARTY'; readonly organizationName: string;
  readonly roles: readonly InvitationRole[]; readonly status: InvitationStatus; readonly expiresAt: string; readonly version: number; readonly createdAt: string; readonly resolvedAt: string | null }
export interface MembershipRecord { readonly id: string; readonly status: 'ACTIVE' | 'INACTIVE'; readonly roles: readonly InvitationRole[]; readonly revision: number;
  readonly profile: null | { readonly fullName: string; readonly documentType: 'CC' | 'CE' | 'TI' | 'RC' | 'PA' | 'PPT'; readonly documentNumber: string; readonly email: string };
  readonly organization?: { readonly id: string; readonly organizationType: 'COMPANY' | 'THIRD_PARTY'; readonly name: string } }
export interface IdentityCandidate { readonly fullName: string; readonly documentType: 'CC' | 'CE' | 'TI' | 'RC' | 'PA' | 'PPT'; readonly documentNumber: string; readonly email: string }
export interface Page<T> { readonly items: readonly T[]; readonly page: number; readonly pageSize: number; readonly total: number }
export interface MembershipFilters { readonly search?: string; readonly role?: InvitationRole }
export interface InvitationTransport {
  organization(method: 'GET' | 'POST' | 'PATCH', path: string, query?: string, body?: unknown, signal?: AbortSignal): Promise<unknown>;
  previewInvitation(token: string, signal?: AbortSignal): Promise<unknown>;
}
export interface InvitationApi {
  list(scope: PermissionScope, target: OrganizationTarget | InvitationListTarget, status: InvitationStatus | '', page: number, signal?: AbortSignal, pageSize?: number, filters?: InvitationSearchFilters): Promise<InvitationPage>;
  create(scope: PermissionScope, target: OrganizationTarget, recipientEmail: string, roles: readonly InvitationRole[], signal?: AbortSignal): Promise<InvitationRecord>;
  cancel(scope: PermissionScope, id: string, version: number, signal?: AbortSignal): Promise<InvitationRecord>;
  resend(scope: PermissionScope, id: string, version: number, signal?: AbortSignal): Promise<InvitationRecord>;
  preview(token: string, signal?: AbortSignal): Promise<InvitationPreview>;
  accept(token: string, version: number, signal?: AbortSignal): Promise<{ readonly invitation: InvitationRecord; readonly membershipId: string; readonly membershipRevision: number }>;
  reject(token: string, version: number, signal?: AbortSignal): Promise<InvitationRecord>;
  received(page?: number, signal?: AbortSignal, pageSize?: number): Promise<Page<ReceivedInvitation>>;
  acceptReceived(id: string, version: number, signal?: AbortSignal): Promise<{ readonly invitation: InvitationRecord; readonly membershipId: string; readonly membershipRevision: number }>;
  rejectReceived(id: string, version: number, signal?: AbortSignal): Promise<InvitationRecord>;
  thirdParties(scope: PermissionScope, companyId: string, query: string, signal?: AbortSignal): Promise<readonly { readonly id: string; readonly name: string }[]>;
  searchUsers(scope: PermissionScope, target: OrganizationTarget, search: string, documentNumber: string, signal?: AbortSignal): Promise<readonly IdentityCandidate[]>;
  memberships(scope: PermissionScope, target: OrganizationTarget, status: 'ACTIVE' | 'INACTIVE' | '', page: number, filters?: MembershipFilters, signal?: AbortSignal, pageSize?: number): Promise<Page<MembershipRecord>>;
  membershipsByCompany(scope: PermissionScope, companyId: string, status: 'ACTIVE' | 'INACTIVE' | '', page: number, filters?: MembershipFilters, signal?: AbortSignal, pageSize?: number): Promise<Page<MembershipRecord>>;
  membershipsAll(scope: PermissionScope, status: 'ACTIVE' | 'INACTIVE' | '', page: number, filters?: MembershipFilters, signal?: AbortSignal, pageSize?: number): Promise<Page<MembershipRecord>>;
  profile(scope: PermissionScope, target: OrganizationTarget, id: string, signal?: AbortSignal): Promise<MembershipRecord>;
  changeRoles(scope: PermissionScope, target: OrganizationTarget, id: string, revision: number, roles: readonly InvitationRole[], signal?: AbortSignal): Promise<MembershipRecord>;
  changeStatus(scope: PermissionScope, target: OrganizationTarget, id: string, revision: number, status: 'ACTIVE' | 'INACTIVE', signal?: AbortSignal): Promise<MembershipRecord>;
}
