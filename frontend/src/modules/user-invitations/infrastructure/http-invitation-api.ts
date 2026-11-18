import { z } from 'zod';
import { ApplicationError } from '@/shared/application/application-error';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { InvitationApi, InvitationPage, InvitationPreview, InvitationRecord, InvitationRole, InvitationStatus, InvitationTransport, MembershipRecord, OrganizationTarget, Page, ReceivedInvitation } from '../application/invitation-api';

const role = z.enum(['COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER']);
const invitation = z.object({ id: z.string(), organizationId: z.string(), organizationType: z.enum(['COMPANY', 'THIRD_PARTY']), companyId: z.string().nullable(),
  recipientEmail: z.string().email(), roles: z.array(role).min(1).max(3), status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED']),
  expiresAt: z.string(), version: z.number().int().positive(), deliveryStatus: z.enum(['UNKNOWN', 'LOGGED', 'FAILED']), createdAt: z.string(), resolvedAt: z.string().nullable() }).strict();
const preview = z.object({ organizationId: z.string(), organizationType: z.enum(['COMPANY', 'THIRD_PARTY']), organizationName: z.string(), recipientEmail: z.string().email(), roles: z.array(role), expiresAt: z.string(), version: z.number().int().positive() }).strict();
const receivedInvitation = z.object({ id: z.string(), organizationId: z.string(), organizationType: z.enum(['COMPANY', 'THIRD_PARTY']), organizationName: z.string(), roles: z.array(role).min(1).max(3),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED']), expiresAt: z.string(), version: z.number().int().positive(), createdAt: z.string(), resolvedAt: z.string().nullable() }).strict();
const membership = z.object({ id: z.string(), status: z.enum(['ACTIVE', 'INACTIVE']), roles: z.array(role).min(1), revision: z.number().int().positive(), profile: z.object({
  fullName: z.string(), documentType: z.enum(['CC', 'CE', 'TI', 'RC', 'PA', 'PPT']), documentNumber: z.string(), email: z.string().email() }).strict().nullable(),
  organization: z.object({ id: z.string(), organizationType: z.enum(['COMPANY', 'THIRD_PARTY']), name: z.string() }).strict().optional() }).strict();
const page = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative() }).strict();
const parse = async <T>(schema: z.ZodType<T>, work: Promise<unknown>): Promise<T> => {
  const result = schema.safeParse(await work);
  if (!result.success) throw new ApplicationError('INVALID_RESPONSE');
  return result.data;
};
const targetQuery = (target: OrganizationTarget, status: string, pageNumber: number, extra: Record<string, string> = {}, pageSize = 20) => new URLSearchParams({ organizationId: target.organizationId,
  organizationType: target.organizationType, ...(target.companyId ? { companyId: target.companyId } : {}), ...(status ? { status } : {}), ...extra, page: String(pageNumber), pageSize: String(pageSize) }).toString();
const assertScope = (scope: PermissionScope, target: OrganizationTarget) => {
  if (scope.kind === 'self' || (target.organizationType === 'COMPANY' && target.companyId !== null)
    || (target.organizationType === 'THIRD_PARTY' && target.companyId !== null && scope.companyId !== target.companyId)) throw new ApplicationError('FORBIDDEN');
  if (scope.kind === 'organization' && (target.organizationType === 'COMPANY'
    ? scope.companyId !== target.organizationId
    : scope.thirdPartyId !== target.organizationId && !(scope.companyId && target.companyId === scope.companyId))) throw new ApplicationError('FORBIDDEN');
};

export function createInvitationApi(http: InvitationTransport): InvitationApi {
  return {
    list(scope, target, status, pageNumber, signal, pageSize = 20) { assertScope(scope, target); return parse(page(invitation), http.organization('GET', 'invitations', targetQuery(target, status, pageNumber, {}, pageSize), undefined, signal)) as Promise<InvitationPage>; },
    create(scope, target, recipientEmail, roles, signal) {
      assertScope(scope, target);
      const invitationTarget = target.organizationType === 'COMPANY' ? { ...target, companyId: target.organizationId } : target;
      return parse(invitation, http.organization('POST', 'invitations', '', { ...invitationTarget, recipientEmail, roles }, signal));
    },
    cancel(scope, id, version, signal) { if (scope.kind === 'self') throw new ApplicationError('FORBIDDEN'); return parse(invitation, http.organization('POST', `invitations/${encodeURIComponent(id)}/cancel`, '', { expectedVersion: version }, signal)); },
    resend(scope, id, version, signal) { if (scope.kind === 'self') throw new ApplicationError('FORBIDDEN'); return parse(invitation, http.organization('POST', `invitations/${encodeURIComponent(id)}/resend`, '', { expectedVersion: version }, signal)); },
    preview(token, signal) { return parse(preview, http.previewInvitation(token, signal)); },
    accept(token, version, signal) { return parse(z.object({ invitation, membershipId: z.string(), membershipRevision: z.number().int().positive() }).strict(), http.organization('POST', 'invitations/accept', '', { token, expectedVersion: version }, signal)); },
    reject(token, version, signal) { return parse(invitation, http.organization('POST', 'invitations/reject', '', { token, expectedVersion: version }, signal)); },
    received(pageNumber = 1, signal, pageSize = 20) { const query = new URLSearchParams({ page: String(pageNumber), pageSize: String(pageSize) }).toString(); return parse(page(receivedInvitation), http.organization('GET', 'invitations/received', query, undefined, signal)) as Promise<Page<ReceivedInvitation>>; },
    acceptReceived(id, version, signal) { return parse(z.object({ invitation, membershipId: z.string(), membershipRevision: z.number().int().positive() }).strict(), http.organization('POST', `invitations/received/${encodeURIComponent(id)}/accept`, '', { expectedVersion: version }, signal)); },
    rejectReceived(id, version, signal) { return parse(invitation, http.organization('POST', `invitations/received/${encodeURIComponent(id)}/reject`, '', { expectedVersion: version }, signal)); },
    thirdParties(scope, companyId, search, signal) {
      if (scope.kind === 'self' || scope.thirdPartyId || (scope.kind === 'organization' && scope.companyId !== companyId)) throw new ApplicationError('FORBIDDEN');
      const query = new URLSearchParams({ lookup: 'third-parties', companyId, q: search }).toString();
      return parse(z.object({ items: z.array(z.object({ id: z.string(), name: z.string() }).strict()) }).strict(), http.organization('GET', 'organization-memberships', query, undefined, signal)).then(value => value.items);
    },
    searchUsers(scope, target, search, documentNumber, signal) {
      assertScope(scope, target);
      const query = new URLSearchParams({ lookup: 'users', organizationId: target.organizationId, organizationType: target.organizationType,
        ...(target.companyId ? { companyId: target.companyId } : {}), ...(search.trim() ? { search: search.trim() } : {}), ...(documentNumber.trim() ? { documentNumber: documentNumber.trim() } : {}) }).toString();
      const profile = z.object({ fullName: z.string(), documentType: z.enum(['CC', 'CE', 'TI', 'RC', 'PA', 'PPT']), documentNumber: z.string(), email: z.string().email() }).strict();
      return parse(z.object({ items: z.array(profile) }).strict(), http.organization('GET', 'organization-memberships', query, undefined, signal)).then(value => value.items);
    },
    memberships(scope, target, status, pageNumber, filters = {}, signal, pageSize = 20) { assertScope(scope, target); const extra = Object.fromEntries(Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1]))); return parse(page(membership), http.organization('GET', 'organization-memberships', targetQuery(target, status, pageNumber, extra, pageSize), undefined, signal)) as Promise<Page<MembershipRecord>>; },
    membershipsByCompany(scope, companyId, status, pageNumber, filters = {}, signal, pageSize = 20) {
      if (scope.kind === 'self' || scope.thirdPartyId || (scope.kind === 'organization' && scope.companyId !== companyId)) throw new ApplicationError('FORBIDDEN');
      const extra = Object.fromEntries(Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1])));
      const query = new URLSearchParams({ lookup: 'by-company', companyId, ...(status ? { status } : {}), ...extra, page: String(pageNumber), pageSize: String(pageSize) }).toString();
      return parse(page(membership), http.organization('GET', 'organization-memberships', query, undefined, signal)) as Promise<Page<MembershipRecord>>;
    },
    profile(scope, target, id, signal) { assertScope(scope, target); const query = new URLSearchParams({ organizationId: target.organizationId, organizationType: target.organizationType, ...(target.companyId ? { companyId: target.companyId } : {}) }).toString(); return parse(membership, http.organization('GET', `organization-memberships/${encodeURIComponent(id)}/profile`, query, undefined, signal)); },
    changeRoles(scope, target, id, revision, roles, signal) { assertScope(scope, target); return parse(membership, http.organization('PATCH', `organization-memberships/${encodeURIComponent(id)}/roles`, '', { expectedRevision: revision, ...target, roles }, signal)); },
    changeStatus(scope, target, id, revision, status, signal) { assertScope(scope, target); return parse(membership, http.organization('PATCH', `organization-memberships/${encodeURIComponent(id)}/status`, '', { expectedRevision: revision, ...target, status }, signal)); },
  };
}
export type { InvitationStatus, InvitationRole, InvitationRecord, InvitationPreview, MembershipRecord, OrganizationTarget };
