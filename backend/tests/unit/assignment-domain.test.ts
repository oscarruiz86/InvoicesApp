import { describe, expect, it } from 'vitest';
import { closeAssignment, createAssignment, isAssignmentActive } from '@/modules/fleet/domain/assignment';

const now = new Date('2026-11-20T12:00:00.000Z');
const input = { id: 'a'.repeat(24), thirdPartyId: 'b'.repeat(24), vehicleId: 'c'.repeat(24),
  driverId: 'd'.repeat(24), subject: 'driver-subject', driverName: '  Jose\u0301   Perez  ', actor: 'admin-subject', now };
const create = () => createAssignment(input);

describe('assignment domain', () => {
  it('creates an ACTIVE assignment with normalized display text, immutable references and version one', () => {
    const assignment = create();
    expect(assignment).toEqual({ id: 'a'.repeat(24), thirdPartyId: 'b'.repeat(24), vehicleId: 'c'.repeat(24), driverId: 'd'.repeat(24),
      subject: 'driver-subject', driverName: 'José Perez', status: 'ACTIVE', startedAt: now, endedAt: null, version: 1,
      createdBy: 'admin-subject', closedBy: null });
    expect(isAssignmentActive(assignment)).toBe(true);
    expect(assignment.startedAt).not.toBe(now);
  });

  it('rejects malformed IDs, blank display values and injected fields', () => {
    expect(() => createAssignment({ ...input, driverName: ' ' })).toThrow('INVALID_REQUEST');
    expect(() => createAssignment({ ...input, id: 'invalid' })).toThrow('INVALID_REQUEST');
    expect(() => createAssignment({ ...({ id: 'a'.repeat(24), thirdPartyId: 'b'.repeat(24), vehicleId: 'c'.repeat(24),
      driverId: 'd'.repeat(24), subject: 'driver-subject', driverName: 'Driver', actor: 'admin-subject', now, status: 'CLOSED' }) } as never))
      .toThrow('INVALID_REQUEST');
  });

  it('closes once with UTC time and a version increment; repeated closure is idempotent', () => {
    const assignment = create();
    const closed = closeAssignment({ assignment, expectedVersion: 1, actor: 'admin-subject', now });
    expect(closed).toMatchObject({ changed: true, assignment: { status: 'CLOSED', endedAt: now, version: 2, closedBy: 'admin-subject' } });
    expect(isAssignmentActive(closed.assignment)).toBe(false);
    expect(closed.assignment).not.toBe(assignment);
    expect(closeAssignment({ assignment: closed.assignment, expectedVersion: 2, actor: 'another-admin', now }))
      .toEqual({ assignment: closed.assignment, changed: false });
    expect(() => closeAssignment({ assignment: closed.assignment, expectedVersion: 1, actor: 'admin-subject', now }))
      .toThrow('ASSIGNMENT_VERSION_CONFLICT');
  });
});
