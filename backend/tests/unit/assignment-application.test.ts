import { expect, it } from 'vitest';
import { assignmentView, validateAssignmentListCommand, validateCreateAssignmentCommand, validateCloseAssignmentCommand } from '@/modules/fleet/application/assignments';
import type { Assignment } from '@/modules/fleet/domain/assignment';

const validList = { thirdPartyId: 'a'.repeat(24), page: 1, pageSize: 25, sort: 'startedAt' as const, direction: 'desc' as const };

it('validates scoped pagination, filters and sortable fields', () => {
  expect(() => validateAssignmentListCommand(validList)).not.toThrow();
  expect(() => validateAssignmentListCommand({ ...validList, pageSize: 101 })).toThrow('INVALID_REQUEST');
  expect(() => validateAssignmentListCommand({ ...validList, sort: 'subject' as never })).toThrow('INVALID_REQUEST');
  expect(() => validateAssignmentListCommand({ ...validList, thirdPartyId: 'unknown', actor: 'injected' } as never)).toThrow('INVALID_REQUEST');
});

it('rejects client-controlled metadata on create and close commands', () => {
  expect(() => validateCreateAssignmentCommand({ thirdPartyId: 'a'.repeat(24), vehicleId: 'b'.repeat(24), driverId: 'c'.repeat(24) })).not.toThrow();
  expect(() => validateCreateAssignmentCommand({ thirdPartyId: 'a'.repeat(24), vehicleId: 'b'.repeat(24), driverId: 'c'.repeat(24), status: 'CLOSED' } as never))
    .toThrow('INVALID_REQUEST');
  expect(() => validateCloseAssignmentCommand({ id: 'd'.repeat(24), thirdPartyId: 'a'.repeat(24), expectedVersion: 1, actor: 'injected' } as never))
    .toThrow('INVALID_REQUEST');
});

it('keeps internal subject and audit actors out of transport views', () => {
  const assignment: Assignment = { id: 'd'.repeat(24), thirdPartyId: 'a'.repeat(24), vehicleId: 'b'.repeat(24), driverId: 'c'.repeat(24),
    subject: 'private-subject', driverName: 'Driver Name', status: 'ACTIVE', startedAt: new Date('2026-11-20T00:00:00Z'), endedAt: null,
    version: 1, createdBy: 'admin-subject', closedBy: null };
  const view = assignmentView(assignment);
  expect(view.driver).toEqual({ id: assignment.driverId, name: assignment.driverName });
  expect(view).not.toHaveProperty('subject');
  expect(view).not.toHaveProperty('createdBy');
});
