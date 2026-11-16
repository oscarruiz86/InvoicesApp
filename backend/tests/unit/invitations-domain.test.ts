import { describe, expect, it } from 'vitest';
import {
  assertAdministratorContinuity, createInvitedMembership, expireInvitation, isInitialAdministratorAcceptance,
  normalizeRecipientEmail, normalizeRoles, replaceMembershipRoles, resolveInvitation, InvitationDomainError,
  type Invitation,
} from '@/modules/organizations/domain/invitations';

const now = new Date('2026-11-12T12:00:00.000Z');
const invitation = (overrides: Partial<Invitation> = {}): Invitation => ({
  id: 'invite-1', organizationId: 'company-1', organizationType: 'COMPANY', companyId: 'company-1',
  recipientEmail: 'person@example.com', roles: ['COMPANY_ADMIN'], invitedBy: 'admin-1', status: 'PENDING',
  expiresAt: new Date('2026-11-13T12:00:00.000Z'), tokenHash: '0'.repeat(64), tokenVersion: 1, version: 1,
  createdAt: now, resolvedAt: null, acceptedSubject: null, deliveryStatus: 'UNKNOWN', attemptId: null, ...overrides,
});

describe('invitation domain', () => {
  it('normalizes recipients and rejects invalid or non-delegable roles', () => {
    expect(normalizeRecipientEmail(' Person@Example.com ')).toBe('person@example.com');
    expect(normalizeRoles('THIRD_PARTY', ['DRIVER', 'THIRD_PARTY_ADMIN', 'DRIVER'])).toEqual(['DRIVER', 'THIRD_PARTY_ADMIN']);
    expect(() => normalizeRoles('COMPANY', ['DRIVER'])).toThrowError(InvitationDomainError);
    expect(() => normalizeRoles('COMPANY', ['APP_ADMIN'])).toThrowError(InvitationDomainError);
  });

  it('expires pending invitations effectively and keeps terminal states immutable', () => {
    const pending = invitation({ expiresAt: new Date(now.getTime()) });
    expect(expireInvitation(pending, now)).toMatchObject({ status: 'EXPIRED', version: 2, resolvedAt: now });
    expect(() => resolveInvitation(pending, 'ACCEPTED', now, 'subject-1')).toThrowError('INVITATION_EXPIRED');
    const accepted = resolveInvitation(invitation(), 'ACCEPTED', now, 'subject-1');
    expect(() => resolveInvitation(accepted, 'CANCELLED', now)).toThrowError('INVALID_TRANSITION');
    expect(createInvitedMembership({ id: 'membership-1', subject: 'subject-1', invitation: accepted, now })).toMatchObject({
      origin: 'INVITATION', status: 'ACTIVE', acceptedInvitationId: 'invite-1', subject: 'subject-1',
    });
    expect(() => createInvitedMembership({ id: 'membership-2', subject: 'other-subject', invitation: accepted, now })).toThrowError('INVALID_INVITATION');
  });

  it('allows the first administrator through an invitation and protects the last one', () => {
    expect(isInitialAdministratorAcceptance({ organizationType: 'COMPANY', activeAdministratorCount: 0, invitationRoles: ['COMPANY_ADMIN'], organizationActive: true })).toBe(true);
    expect(isInitialAdministratorAcceptance({ organizationType: 'COMPANY', activeAdministratorCount: 0, invitationRoles: ['COMPANY_ADMIN'], organizationActive: false })).toBe(false);
    expect(() => assertAdministratorContinuity({ organizationType: 'COMPANY', currentRoles: ['COMPANY_ADMIN'], nextRoles: [], membershipActive: true, activeAdministratorCount: 1 })).toThrowError('LAST_ADMINISTRATOR_REQUIRED');
    expect(() => replaceMembershipRoles('COMPANY', ['COMPANY_ADMIN'], [])).toThrowError('LAST_ROLE_REQUIRED');
    expect(replaceMembershipRoles('THIRD_PARTY', ['DRIVER'], ['THIRD_PARTY_ADMIN'])).toEqual(['THIRD_PARTY_ADMIN']);
    expect(() => replaceMembershipRoles('THIRD_PARTY', ['DRIVER'], ['COMPANY_ADMIN'])).toThrowError(InvitationDomainError);
  });
});
