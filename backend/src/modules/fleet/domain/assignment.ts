export type AssignmentStatus = 'ACTIVE' | 'CLOSED';

export interface Assignment {
  readonly id: string;
  readonly thirdPartyId: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly subject: string;
  readonly driverName: string;
  readonly status: AssignmentStatus;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly version: number;
  readonly createdBy: string;
  readonly closedBy: string | null;
}

export class AssignmentError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'ASSIGNMENT_VERSION_CONFLICT') { super(code); }
}

function validId(value: string): boolean { return typeof value === 'string' && /^[a-f0-9]{24}$/.test(value); }
function validDate(value: Date): boolean { return value instanceof Date && Number.isFinite(value.getTime()); }
function normalizedDriverName(value: string): string {
  if (typeof value !== 'string') throw new AssignmentError('INVALID_REQUEST');
  const normalized = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) throw new AssignmentError('INVALID_REQUEST');
  return normalized;
}

export function createAssignment(input: {
  readonly id: string;
  readonly thirdPartyId: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly subject: string;
  readonly driverName: string;
  readonly actor: string;
  readonly now: Date;
}): Assignment {
  const allowed = ['id', 'thirdPartyId', 'vehicleId', 'driverId', 'subject', 'driverName', 'actor', 'now'];
  if (Object.keys(input).some(key => !allowed.includes(key))
    || !validId(input.id) || !validId(input.thirdPartyId) || !validId(input.vehicleId) || !validId(input.driverId)
    || typeof input.subject !== 'string' || input.subject.length < 1 || input.subject.length > 128
    || typeof input.actor !== 'string' || input.actor.length < 1 || input.actor.length > 128 || !validDate(input.now)) {
    throw new AssignmentError('INVALID_REQUEST');
  }
  return {
    id: input.id,
    thirdPartyId: input.thirdPartyId,
    vehicleId: input.vehicleId,
    driverId: input.driverId,
    subject: input.subject,
    driverName: normalizedDriverName(input.driverName),
    status: 'ACTIVE',
    startedAt: new Date(input.now),
    endedAt: null,
    version: 1,
    createdBy: input.actor,
    closedBy: null,
  };
}

export function closeAssignment(input: {
  readonly assignment: Assignment;
  readonly expectedVersion: number;
  readonly actor: string;
  readonly now: Date;
}): { readonly assignment: Assignment; readonly changed: boolean } {
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1
    || typeof input.actor !== 'string' || !input.actor || input.actor.length > 128 || !validDate(input.now)) {
    throw new AssignmentError('INVALID_REQUEST');
  }
  if (input.assignment.version !== input.expectedVersion) throw new AssignmentError('ASSIGNMENT_VERSION_CONFLICT');
  if (input.assignment.status === 'CLOSED') return { assignment: input.assignment, changed: false };
  if (input.assignment.status !== 'ACTIVE' || input.assignment.endedAt !== null) throw new AssignmentError('INVALID_REQUEST');
  return {
    changed: true,
    assignment: {
      ...input.assignment,
      status: 'CLOSED',
      endedAt: new Date(input.now),
      version: input.assignment.version + 1,
      closedBy: input.actor,
    },
  };
}

export const isAssignmentActive = (assignment: Assignment | null): boolean => assignment?.status === 'ACTIVE';
