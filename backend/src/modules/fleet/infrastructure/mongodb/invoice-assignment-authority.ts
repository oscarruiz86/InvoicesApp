import { Types, type ClientSession, type Connection } from 'mongoose';
import type { InvoiceAssignmentAuthority, InvoiceAssignmentFacts } from '../../application/assignment-ports';

const validId = (value: string) => /^[a-f0-9]{24}$/.test(value);
export class InvoiceAssignmentAuthorityError extends Error {
  constructor(readonly code: 'ASSIGNMENT_NOT_ELIGIBLE' | 'ASSIGNMENT_EVIDENCE_UNAVAILABLE' | 'ASSIGNMENT_VERSION_CONFLICT') { super(code); }
}

function factsFromRows(input: { assignment: Record<string, unknown>; vehicle: Record<string, unknown>; driver: Record<string, unknown> }): InvoiceAssignmentFacts {
  const { assignment, vehicle, driver } = input;
  if (!(assignment._id instanceof Types.ObjectId) || !(vehicle._id instanceof Types.ObjectId) || !(driver._id instanceof Types.ObjectId)
    || ![assignment.thirdPartyId, assignment.vehicleId, assignment.driverId].every(value => typeof value === 'string' && validId(value))
    || typeof assignment.subject !== 'string' || !assignment.subject
    || !Number.isSafeInteger(assignment.version) || !Number.isSafeInteger(vehicle.version) || !Number.isSafeInteger(driver.version)) {
    throw new InvoiceAssignmentAuthorityError('ASSIGNMENT_EVIDENCE_UNAVAILABLE');
  }
  return { assignmentId: assignment._id.toString(), thirdPartyId: String(assignment.thirdPartyId), vehicleId: String(assignment.vehicleId),
    driverId: String(assignment.driverId), subject: assignment.subject, assignmentVersion: Number(assignment.version),
    vehicleVersion: Number(vehicle.version), driverVersion: Number(driver.version), vehiclePlate: typeof vehicle.plate === 'string' ? vehicle.plate : null,
    ...(assignment.startedAt instanceof Date ? { assignmentStartedAt: new Date(assignment.startedAt) } : {}),
    assignmentEndedAt: assignment.endedAt instanceof Date ? new Date(assignment.endedAt) : null };
}

export function createMongoInvoiceAssignmentAuthority(connect: () => Promise<Connection>): InvoiceAssignmentAuthority {
  return {
    async readOwnActive(input) {
      if (!validId(input.thirdPartyId) || !validId(input.assignmentId) || !validId(input.vehicleId) || !input.actorSubject || input.actorSubject.length > 128)
        throw new InvoiceAssignmentAuthorityError('ASSIGNMENT_NOT_ELIGIBLE');
      try {
        const connection = await connect();
        const assignment = await connection.collection('vehicle_assignments').findOne({ _id: new Types.ObjectId(input.assignmentId),
          thirdPartyId: input.thirdPartyId, vehicleId: input.vehicleId, subject: input.actorSubject, status: 'ACTIVE' });
        if (!assignment) return null;
        const [vehicle, driver] = await Promise.all([
          connection.collection('vehicles').findOne({ _id: new Types.ObjectId(input.vehicleId), thirdPartyId: input.thirdPartyId, status: 'ACTIVE' }),
          connection.collection('drivers').findOne({ _id: new Types.ObjectId(String(assignment.driverId)), thirdPartyId: input.thirdPartyId,
            subject: input.actorSubject, status: 'ACTIVE' }),
        ]);
        if (!vehicle || !driver) return null;
        return factsFromRows({ assignment: assignment as Record<string, unknown>, vehicle: vehicle as Record<string, unknown>, driver: driver as Record<string, unknown> });
      } catch (error) {
        if (error instanceof InvoiceAssignmentAuthorityError) throw error;
        throw new InvoiceAssignmentAuthorityError('ASSIGNMENT_EVIDENCE_UNAVAILABLE');
      }
    },
    async readOwnForOfflineRetry(input) {
      if (!validId(input.thirdPartyId) || !validId(input.assignmentId) || !validId(input.vehicleId) || !input.actorSubject || input.actorSubject.length > 128)
        throw new InvoiceAssignmentAuthorityError('ASSIGNMENT_NOT_ELIGIBLE');
      try {
        const connection = await connect();
        const assignment = await connection.collection('vehicle_assignments').findOne({ _id: new Types.ObjectId(input.assignmentId),
          thirdPartyId: input.thirdPartyId, vehicleId: input.vehicleId, subject: input.actorSubject, status: { $in: ['ACTIVE', 'CLOSED'] } });
        if (!assignment) return null;
        const [vehicle, driver] = await Promise.all([
          connection.collection('vehicles').findOne({ _id: new Types.ObjectId(input.vehicleId), thirdPartyId: input.thirdPartyId }),
          connection.collection('drivers').findOne({ _id: new Types.ObjectId(String(assignment.driverId)), thirdPartyId: input.thirdPartyId, subject: input.actorSubject }),
        ]);
        if (!vehicle || !driver) return null;
        return factsFromRows({ assignment: assignment as Record<string, unknown>, vehicle: vehicle as Record<string, unknown>, driver: driver as Record<string, unknown> });
      } catch (error) {
        if (error instanceof InvoiceAssignmentAuthorityError) throw error;
        throw new InvoiceAssignmentAuthorityError('ASSIGNMENT_EVIDENCE_UNAVAILABLE');
      }
    },
    async confirmInTransaction(input) {
      const context = input.transactionContext as { readonly connection: Connection; readonly session: ClientSession };
      const { transactionContext: _transactionContext, ...expected } = input;
      const { connection, session } = context;
      if (!validId(expected.assignmentId) || !validId(expected.thirdPartyId) || !validId(expected.vehicleId) || !validId(expected.driverId)
        || !expected.actorSubject || !expected.policyVersion || !expected.assignmentVersion || !expected.vehicleVersion || !expected.driverVersion) {
        throw new InvoiceAssignmentAuthorityError('ASSIGNMENT_NOT_ELIGIBLE');
      }
      try {
        const assignments = connection.collection('vehicle_assignments');
        const vehicles = connection.collection('vehicles');
        const drivers = connection.collection('drivers');
        const memberships = connection.collection('organization_memberships');
        const associations = connection.collection('organization_associations');
        const organizations = connection.collection('organizations');
        const thirdParties = connection.collection('third_parties');
        const assignment = await assignments.findOne({ _id: new Types.ObjectId(expected.assignmentId), thirdPartyId: expected.thirdPartyId, vehicleId: expected.vehicleId,
          driverId: expected.driverId, subject: expected.actorSubject, status: 'ACTIVE', version: expected.assignmentVersion }, { session });
        const vehicle = await vehicles.findOne({ _id: new Types.ObjectId(expected.vehicleId), thirdPartyId: expected.thirdPartyId, status: 'ACTIVE', version: expected.vehicleVersion }, { session });
        const driver = await drivers.findOne({ _id: new Types.ObjectId(expected.driverId), thirdPartyId: expected.thirdPartyId, subject: expected.actorSubject,
          status: 'ACTIVE', version: expected.driverVersion }, { session });
        const organization = await organizations.findOne({ id: expected.thirdPartyId, type: 'THIRD_PARTY', active: true }, { session });
        const thirdParty = await thirdParties.findOne({ _id: new Types.ObjectId(expected.thirdPartyId), status: 'ACTIVE' }, { session });
        if (!assignment || !vehicle || !driver || !organization || !thirdParty) throw new InvoiceAssignmentAuthorityError('ASSIGNMENT_VERSION_CONFLICT');
        const membershipId = typeof driver.membershipId === 'string' ? driver.membershipId : '';
        const membership = membershipId ? await memberships.findOne({ id: membershipId, subject: expected.actorSubject,
          organizationId: expected.thirdPartyId, status: 'ACTIVE' }, { session }) : null;
        const association = membership ? await associations.findOne({ membershipId, subject: expected.actorSubject,
          organizationId: expected.thirdPartyId, capability: 'DRIVER', assigned: { $ne: false }, active: true }, { session }) : null;
        if (!membership || !association) throw new InvoiceAssignmentAuthorityError('ASSIGNMENT_NOT_ELIGIBLE');

        const fences = [
          await assignments.updateOne({ _id: assignment._id, status: 'ACTIVE', version: expected.assignmentVersion }, { $inc: { mutationFence: 1 } }, { session }),
          await vehicles.updateOne({ _id: vehicle._id, status: 'ACTIVE', version: expected.vehicleVersion }, { $inc: { mutationFence: 1 } }, { session }),
          await drivers.updateOne({ _id: driver._id, status: 'ACTIVE', version: expected.driverVersion }, { $inc: { mutationFence: 1 } }, { session }),
          await memberships.updateOne({ _id: membership._id, status: 'ACTIVE', revision: membership.revision }, { $inc: { mutationFence: 1 } }, { session }),
          await associations.updateOne({ _id: association._id, active: true, revision: association.revision, assigned: { $ne: false } }, { $inc: { mutationFence: 1 } }, { session }),
          await organizations.updateOne({ _id: organization._id, active: true, revision: organization.revision }, { $inc: { mutationFence: 1 } }, { session }),
          await thirdParties.updateOne({ _id: thirdParty._id, status: 'ACTIVE', revision: thirdParty.revision }, { $inc: { mutationFence: 1 } }, { session }),
        ];
        if (fences.some(result => result.modifiedCount !== 1)) throw new InvoiceAssignmentAuthorityError('ASSIGNMENT_VERSION_CONFLICT');
      } catch (error) {
        if (error instanceof InvoiceAssignmentAuthorityError) throw error;
        throw error;
      }
    },
    async confirmClosedInTransaction(input) {
      const context = input.transactionContext as { readonly connection: Connection; readonly session: ClientSession };
      const { transactionContext: _transactionContext, ...expected } = input;
      const { connection, session } = context;
      if (!validId(expected.assignmentId) || !validId(expected.thirdPartyId) || !validId(expected.vehicleId) || !validId(expected.driverId)
        || !expected.actorSubject || !Number.isSafeInteger(expected.assignmentVersion) || !Number.isSafeInteger(expected.vehicleVersion)
        || !Number.isSafeInteger(expected.driverVersion) || !(expected.assignmentStartedAt instanceof Date) || !(expected.assignmentEndedAt instanceof Date)) {
        throw new InvoiceAssignmentAuthorityError('ASSIGNMENT_NOT_ELIGIBLE');
      }
      const assignments = connection.collection('vehicle_assignments');
      const vehicles = connection.collection('vehicles');
      const drivers = connection.collection('drivers');
      const organizations = connection.collection('organizations');
      const thirdParties = connection.collection('third_parties');
      const assignment = await assignments.findOne({ _id: new Types.ObjectId(expected.assignmentId), thirdPartyId: expected.thirdPartyId,
        vehicleId: expected.vehicleId, driverId: expected.driverId, subject: expected.actorSubject, status: 'CLOSED',
        version: expected.assignmentVersion, startedAt: expected.assignmentStartedAt, endedAt: expected.assignmentEndedAt }, { session });
      const vehicle = await vehicles.findOne({ _id: new Types.ObjectId(expected.vehicleId), thirdPartyId: expected.thirdPartyId,
        version: expected.vehicleVersion }, { session });
      const driver = await drivers.findOne({ _id: new Types.ObjectId(expected.driverId), thirdPartyId: expected.thirdPartyId,
        subject: expected.actorSubject, version: expected.driverVersion }, { session });
      const organization = await organizations.findOne({ id: expected.thirdPartyId, type: 'THIRD_PARTY', active: true }, { session });
      const thirdParty = await thirdParties.findOne({ _id: new Types.ObjectId(expected.thirdPartyId), status: 'ACTIVE' }, { session });
      if (!assignment || !vehicle || !driver || !organization || !thirdParty) throw new InvoiceAssignmentAuthorityError('ASSIGNMENT_VERSION_CONFLICT');
      const fences = [
        await assignments.updateOne({ _id: assignment._id, status: 'CLOSED', version: expected.assignmentVersion, endedAt: expected.assignmentEndedAt }, { $inc: { mutationFence: 1 } }, { session }),
        await vehicles.updateOne({ _id: vehicle._id, version: expected.vehicleVersion }, { $inc: { mutationFence: 1 } }, { session }),
        await drivers.updateOne({ _id: driver._id, version: expected.driverVersion }, { $inc: { mutationFence: 1 } }, { session }),
        await organizations.updateOne({ _id: organization._id, active: true, revision: organization.revision }, { $inc: { mutationFence: 1 } }, { session }),
        await thirdParties.updateOne({ _id: thirdParty._id, status: 'ACTIVE', revision: thirdParty.revision }, { $inc: { mutationFence: 1 } }, { session }),
      ];
      if (fences.some(result => result.modifiedCount !== 1)) throw new InvoiceAssignmentAuthorityError('ASSIGNMENT_VERSION_CONFLICT');
    },
  };
}
