import type { PermissionScope } from '@/modules/authentication/domain/permissions';

export type InvitationRole = 'COMPANY_ADMIN' | 'THIRD_PARTY_ADMIN' | 'DRIVER';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
export interface InvitationRecord { readonly id: string; readonly organizationId: string; readonly organizationType: 'COMPANY' | 'THIRD_PARTY'; readonly companyId: string | null;
  readonly recipientEmail: string; readonly roles: readonly InvitationRole[]; readonly status: InvitationStatus; readonly expiresAt: string; readonly version: number;
  readonly deliveryStatus: 'UNKNOWN' | 'LOGGED' | 'FAILED'; readonly createdAt: string; readonly resolvedAt: string | null }
export interface OrganizationTarget { readonly organizationId: string; readonly organizationType: 'COMPANY' | 'THIRD_PARTY'; readonly companyId: string | null }
export interface InvitationPage { readonly items: readonly InvitationRecord[]; readonly page: number; readonly pageSize: number; readonly total: number }
export interface InvitationPreview { readonly organizationId: string; readonly organizationType: 'COMPANY' | 'THIRD_PARTY'; readonly organizationName: string; readonly recipientEmail: string; readonly roles: readonly InvitationRole[]; readonly expiresAt: string; readonly version: number }
export interface ReceivedInvitation { readonly id: string; readonly organizationId: string; readonly organizationType: 'COMPANY' | 'THIRD_PARTY'; readonly organizationName: string;
  readonly roles: readonly InvitationRole[]; readonly status: InvitationStatus; readonly expiresAt: string; readonly version: number; readonly createdAt: string; readonly resolvedAt: string | null }
export interface MembershipRecord { readonly id: string; readonly status: 'ACTIVE' | 'INACTIVE'; readonly roles: readonly InvitationRole[]; readonly revision: number;
  readonly profile: null | { readonly fullName: string; readonly documentType: 'CC' | 'CE' | 'TI' | 'PA' | 'NIT'; readonly documentNumber: string; readonly email: string } }
export interface Page<T> { readonly items: readonly T[]; readonly page: number; readonly pageSize: number; readonly total: number }
export interface InvitationTransport {
  organization(method: 'GET' | 'POST' | 'PATCH', path: string, query?: string, body?: unknown, signal?: AbortSignal): Promise<unknown>;
  previewInvitation(token: string, signal?: AbortSignal): Promise<unknown>;
}
export interface InvitationApi {
  list(scope: PermissionScope, target: OrganizationTarget, status: InvitationStatus | '', page: number, signal?: AbortSignal): Promise<InvitationPage>;
  create(scope: PermissionScope, target: OrganizationTarget, recipientEmail: string, roles: readonly InvitationRole[], signal?: AbortSignal): Promise<InvitationRecord>;
  cancel(scope: PermissionScope, id: string, version: number, signal?: AbortSignal): Promise<InvitationRecord>;
  resend(scope: PermissionScope, id: string, version: number, signal?: AbortSignal): Promise<InvitationRecord>;
  preview(token: string, signal?: AbortSignal): Promise<InvitationPreview>;
  accept(token: string, version: number, signal?: AbortSignal): Promise<{ readonly invitation: InvitationRecord; readonly membershipId: string; readonly membershipRevision: number }>;
  reject(token: string, version: number, signal?: AbortSignal): Promise<InvitationRecord>;
  received(page?: number, signal?: AbortSignal): Promise<Page<ReceivedInvitation>>;
  acceptReceived(id: string, version: number, signal?: AbortSignal): Promise<{ readonly invitation: InvitationRecord; readonly membershipId: string; readonly membershipRevision: number }>;
  rejectReceived(id: string, version: number, signal?: AbortSignal): Promise<InvitationRecord>;
  memberships(scope: PermissionScope, target: OrganizationTarget, status: 'ACTIVE' | 'INACTIVE' | '', page: number, signal?: AbortSignal): Promise<Page<MembershipRecord>>;
  profile(scope: PermissionScope, target: OrganizationTarget, id: string, signal?: AbortSignal): Promise<MembershipRecord>;
  changeRoles(scope: PermissionScope, target: OrganizationTarget, id: string, revision: number, roles: readonly InvitationRole[], signal?: AbortSignal): Promise<MembershipRecord>;
  changeStatus(scope: PermissionScope, target: OrganizationTarget, id: string, revision: number, status: 'ACTIVE' | 'INACTIVE', signal?: AbortSignal): Promise<MembershipRecord>;
}
