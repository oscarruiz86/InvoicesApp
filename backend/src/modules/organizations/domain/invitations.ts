import type { LocalRole, OrganizationType } from './organization';
import { compatibleCapability } from './organization';

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
export type InvitationDeliveryStatus = 'UNKNOWN' | 'LOGGED' | 'FAILED';
export interface Invitation {
  readonly id: string;
  readonly organizationId: string;
  readonly organizationType: OrganizationType;
  readonly companyId: string | null;
  readonly recipientEmail: string;
  readonly roles: readonly LocalRole[];
  readonly invitedBy: string;
  readonly status: InvitationStatus;
  readonly expiresAt: Date;
  readonly tokenHash: string;
  readonly tokenVersion: number;
  readonly version: number;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
  readonly acceptedSubject: string | null;
  readonly deliveryStatus: InvitationDeliveryStatus;
  readonly attemptId: string | null;
}
export interface Membership {
  readonly id: string;
  readonly subject: string;
  readonly organizationId: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly origin: 'INVITATION' | 'LEGACY';
  readonly acceptedInvitationId: string | null;
  readonly acceptedAt: Date | null;
  readonly revision: number;
}
export class InvitationDomainError extends Error {
  constructor(readonly code: 'INVALID_INVITATION' | 'INVITATION_EXPIRED' | 'INVALID_TRANSITION' | 'INVALID_ROLES' | 'LAST_ROLE_REQUIRED' | 'LAST_ADMINISTRATOR_REQUIRED') { super(code); }
}

export function normalizeRecipientEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new InvitationDomainError('INVALID_INVITATION');
  return normalized;
}

export function normalizeRoles(type: OrganizationType, roles: readonly string[]): LocalRole[] {
  const unique = [...new Set(roles)];
  if (!unique.length || unique.some(role => role === 'APP_ADMIN' || !compatibleCapability(type, role as LocalRole))) throw new InvitationDomainError('INVALID_ROLES');
  return unique.sort() as LocalRole[];
}

export function expireInvitation(invitation: Invitation, now: Date): Invitation {
  if (invitation.status !== 'PENDING' || invitation.expiresAt.getTime() > now.getTime()) return invitation;
  return { ...invitation, status: 'EXPIRED', resolvedAt: now, version: invitation.version + 1 };
}

export function resolveInvitation(invitation: Invitation, status: Extract<InvitationStatus, 'ACCEPTED' | 'REJECTED' | 'CANCELLED'>, now: Date, acceptedSubject: string | null = null): Invitation {
  if (invitation.status !== 'PENDING') throw new InvitationDomainError('INVALID_TRANSITION');
  if (invitation.expiresAt.getTime() <= now.getTime()) throw new InvitationDomainError('INVITATION_EXPIRED');
  if ((status === 'ACCEPTED') !== Boolean(acceptedSubject)) throw new InvitationDomainError('INVALID_INVITATION');
  return { ...invitation, status, resolvedAt: now, acceptedSubject, version: invitation.version + 1 };
}

export function createInvitedMembership(input: {
  id: string; subject: string; invitation: Invitation; now: Date;
}): Membership {
  if (!input.id || !input.subject || input.invitation.status !== 'ACCEPTED' || input.invitation.acceptedSubject !== input.subject
    || input.invitation.resolvedAt === null || input.invitation.resolvedAt.getTime() > input.now.getTime()) {
    throw new InvitationDomainError('INVALID_INVITATION');
  }
  return { id: input.id, subject: input.subject, organizationId: input.invitation.organizationId, status: 'ACTIVE',
    origin: 'INVITATION', acceptedInvitationId: input.invitation.id, acceptedAt: input.invitation.resolvedAt, revision: 1 };
}

export function replaceMembershipRoles(type: OrganizationType, current: readonly LocalRole[], requested: readonly string[]): LocalRole[] {
  if (!current.length) throw new InvitationDomainError('INVALID_ROLES');
  if (!requested.length) throw new InvitationDomainError('LAST_ROLE_REQUIRED');
  return normalizeRoles(type, requested);
}

export function assertAdministratorContinuity(input: {
  organizationType: OrganizationType;
  currentRoles: readonly LocalRole[];
  nextRoles: readonly LocalRole[];
  membershipActive: boolean;
  activeAdministratorCount: number;
  replacementInSameOperation?: boolean;
}): void {
  if (input.organizationType !== 'COMPANY' || !input.membershipActive || !input.currentRoles.includes('COMPANY_ADMIN')) return;
  if (input.nextRoles.includes('COMPANY_ADMIN') || input.activeAdministratorCount > 1 || input.replacementInSameOperation) return;
  throw new InvitationDomainError('LAST_ADMINISTRATOR_REQUIRED');
}

export function isInitialAdministratorAcceptance(input: {
  organizationType: OrganizationType;
  activeAdministratorCount: number;
  invitationRoles: readonly LocalRole[];
  organizationActive: boolean;
}): boolean {
  return input.organizationActive && input.organizationType === 'COMPANY' && input.activeAdministratorCount === 0
    && input.invitationRoles.includes('COMPANY_ADMIN');
}
