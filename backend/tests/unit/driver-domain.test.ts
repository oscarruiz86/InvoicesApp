import { describe, expect, it } from 'vitest';
import { createDriver, isDriverEligible, transitionDriver, type DriverMembershipFacts } from '@/modules/fleet/domain/driver';

const now = new Date('2026-11-19T12:00:00.000Z');
const membership: DriverMembershipFacts = { id: 'membership-1', subject: 'subject-1', organizationId: 'third-party-1', status: 'ACTIVE', roles: ['DRIVER'] };
const create = () => createDriver({ id: 'driver-1', subject: 'subject-1', membership, thirdPartyId: 'third-party-1', thirdPartyActive: true, actor: 'admin-1', now });

describe('driver domain', () => {
  it('creates an operational driver without storing identity profile data', () => {
    expect(create()).toEqual({
      id: 'driver-1', subject: 'subject-1', membershipId: 'membership-1', thirdPartyId: 'third-party-1',
      status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now, createdBy: 'admin-1', updatedBy: null,
    });
  });

  it('rejects ineligible membership and duplicate membership ownership', () => {
    expect(() => createDriver({ id: 'd', subject: 'subject-1', membership: { ...membership, roles: [] }, thirdPartyId: 'third-party-1',
      thirdPartyActive: true, actor: 'admin-1', now })).toThrow('MEMBERSHIP_NOT_ELIGIBLE');
    expect(() => createDriver({ id: 'd', subject: 'subject-1', membership, thirdPartyId: 'third-party-1',
      thirdPartyActive: true, actor: 'admin-1', now }, ['membership-1'])).toThrow('INVALID_REQUEST');
    expect(() => createDriver({ ...({ id: 'd', subject: 'subject-1', membership, thirdPartyId: 'third-party-1',
      thirdPartyActive: true, actor: 'admin-1', now, name: 'Editable profile' } as unknown as Parameters<typeof createDriver>[0]) }))
      .toThrow('INVALID_REQUEST');
  });

  it('uses current membership and third-party facts for eligibility', () => {
    const driver = create();
    expect(isDriverEligible({ driver, membership, thirdPartyActive: true })).toBe(true);
    expect(isDriverEligible({ driver, membership: { ...membership, status: 'INACTIVE' }, thirdPartyActive: true })).toBe(false);
    expect(isDriverEligible({ driver, membership: { ...membership, roles: [] }, thirdPartyActive: true })).toBe(false);
    expect(isDriverEligible({ driver, membership, thirdPartyActive: false })).toBe(false);
  });

  it('versions real status transitions and preserves no-op requests', () => {
    const driver = create();
    const changed = transitionDriver({ driver, expectedVersion: 1, status: 'INACTIVE', actor: 'admin-1', now, eligible: true });
    expect(changed).toMatchObject({ changed: true, driver: { status: 'INACTIVE', version: 2, updatedBy: 'admin-1' } });
    const noOp = transitionDriver({ driver: changed.driver, expectedVersion: 2, status: 'INACTIVE', actor: 'admin-1', now, eligible: true });
    expect(noOp).toEqual({ driver: changed.driver, changed: false });
    expect(() => transitionDriver({ driver: changed.driver, expectedVersion: 1, status: 'ACTIVE', actor: 'admin-1', now, eligible: true }))
      .toThrow('VERSION_CONFLICT');
    expect(() => transitionDriver({ driver: changed.driver, expectedVersion: 2, status: 'ACTIVE', actor: 'admin-1', now, eligible: false }))
      .toThrow('MEMBERSHIP_NOT_ELIGIBLE');
  });
});
