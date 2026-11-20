import type { AssignmentAccessReader, AssignmentConfirmation } from '../application/vehicle-ports';
import { VehicleUseCaseError } from '../application/vehicles';
/** Fail closed until Assignments supplies a transactionally coordinated implementation. */
export const unavailableAssignments: AssignmentAccessReader & AssignmentConfirmation = {
  async read() { return { state: 'UNAVAILABLE' }; },
  async confirmNoOpen() { throw new VehicleUseCaseError('ASSIGNMENT_PROVIDER_UNAVAILABLE'); },
};
