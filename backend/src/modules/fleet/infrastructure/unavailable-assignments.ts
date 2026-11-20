import type { AssignmentAccessReader, AssignmentConfirmation } from '../application/vehicle-ports';
import { AssignmentConfirmationError } from '../application/assignment-ports';
/** Fail closed until Assignments supplies a transactionally coordinated implementation. */
export const unavailableAssignments: AssignmentAccessReader & AssignmentConfirmation = {
  async read() { return { state: 'UNAVAILABLE' }; },
  async confirmNoOpenForVehicle() { throw new AssignmentConfirmationError('ASSIGNMENT_EVIDENCE_UNAVAILABLE'); },
};
