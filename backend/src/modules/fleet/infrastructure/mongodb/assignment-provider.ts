import { createHash } from 'node:crypto';
import type { ClientSession, Connection } from 'mongoose';
import { VehicleUseCaseError } from '../../application/vehicles';
import type { ActiveVehicleAssignment, AssignmentAccessReader, AssignmentConfirmation } from '../../application/vehicle-ports';

const collectionName = 'vehicle_assignments';
type AssignmentRow = Record<string, unknown>;

function validId(value: string): boolean { return /^[a-f0-9]{24}$/.test(value); }
function validateInput(input: { readonly thirdPartyId: string; readonly vehicleId?: string; readonly subject?: string }) {
  if (!validId(input.thirdPartyId) || (input.vehicleId !== undefined && !validId(input.vehicleId))
    || (input.subject !== undefined && (!input.subject || input.subject.length > 128))) {
    throw new VehicleUseCaseError('INVALID_REQUEST');
  }
}

function decode(row: AssignmentRow): ActiveVehicleAssignment {
  const vehicleId = typeof row.vehicleId === 'string' ? row.vehicleId : '';
  const thirdPartyId = typeof row.thirdPartyId === 'string' ? row.thirdPartyId : '';
  const subject = typeof row.subject === 'string' ? row.subject : '';
  const driverId = typeof row.driverId === 'string' ? row.driverId : '';
  const driverName = typeof row.driverName === 'string' ? row.driverName : '';
  if (!validId(vehicleId) || !validId(thirdPartyId) || !subject || subject.length > 128 || !validId(driverId) || !driverName || driverName.length > 200) {
    throw new VehicleUseCaseError('ASSIGNMENT_PROVIDER_UNAVAILABLE');
  }
  return { vehicleId, thirdPartyId, subject, driverId, driverName };
}

function revision(rows: readonly ActiveVehicleAssignment[]): string {
  const value = rows.map(row => `${row.vehicleId}:${row.thirdPartyId}:${row.subject}:${row.driverId}:${row.driverName}`).sort().join('|');
  return createHash('sha256').update(value).digest('hex');
}

async function activeRows(connection: Connection, input: { readonly thirdPartyId: string; readonly vehicleId?: string; readonly subject?: string }, session?: ClientSession) {
  const filter: Record<string, unknown> = { thirdPartyId: input.thirdPartyId, status: 'ACTIVE' };
  if (input.vehicleId) filter.vehicleId = input.vehicleId;
  if (input.subject) filter.subject = input.subject;
  return connection.collection(collectionName).find(filter, { session }).sort({ vehicleId: 1, driverId: 1, _id: 1 }).toArray();
}

export function createMongoAssignmentReader(connect: () => Promise<Connection>): AssignmentAccessReader {
  let initialized: Promise<void> | undefined;
  const ready = (connection: Connection) => {
    if (!initialized) initialized = connection.collection(collectionName).createIndex({ thirdPartyId: 1, status: 1, vehicleId: 1 }, { name: 'vehicle_assignments_active_lookup' })
      .then(async () => { await connection.collection(collectionName).createIndex({ thirdPartyId: 1, status: 1, subject: 1 }, { name: 'vehicle_assignments_subject_lookup' }); })
      .catch(error => { initialized = undefined; throw error; });
    return initialized;
  };
  return {
    async read(input) {
      validateInput(input);
      try {
        const connection = await connect();
        await ready(connection);
        const rows = await activeRows(connection, input);
        const assignments = rows.map(row => decode(row as AssignmentRow));
        return { state: 'CONFIRMED', revision: revision(assignments), assignments };
      } catch (error) {
        if (error instanceof VehicleUseCaseError) throw error;
        throw new VehicleUseCaseError('ASSIGNMENT_PROVIDER_UNAVAILABLE');
      }
    },
  };
}

export function createMongoAssignmentConfirmation(connection: Connection, session: ClientSession): AssignmentConfirmation {
  return {
    async confirmNoOpen(input) {
      if (!validId(input.thirdPartyId) || !validId(input.vehicleId) || !input.revision) throw new VehicleUseCaseError('INVALID_REQUEST');
      try {
        const rows = await activeRows(connection, { thirdPartyId: input.thirdPartyId, vehicleId: input.vehicleId }, session);
        if (rows.length > 0) throw new VehicleUseCaseError('VEHICLE_HAS_OPEN_ASSIGNMENT');
      } catch (error) {
        if (error instanceof VehicleUseCaseError) throw error;
        throw new VehicleUseCaseError('ASSIGNMENT_PROVIDER_UNAVAILABLE');
      }
    },
  };
}
