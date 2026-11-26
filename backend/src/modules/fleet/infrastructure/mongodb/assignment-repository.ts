import { createHash, randomUUID } from 'node:crypto';
import { Types, type ClientSession, type Connection } from 'mongoose';
import { AssignmentError, closeAssignment, type Assignment } from '../../domain/assignment';
import { AssignmentConfirmationError, type AssignmentAuditEvent, type AssignmentAuditPort, type AssignmentAuthorityConfirmationPort, type AssignmentConfirmationPort, type AssignmentListQuery, type AssignmentPage, type AssignmentPolicyConfirmationPort, type AssignmentPresence, type AssignmentReadEvidence, type AssignmentReadPort, type AssignmentRepositoryPort } from '../../application/assignment-ports';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import { AuthorizationUnavailable } from '@/modules/identity/application/authorization-errors';
import { recordFleetAudit } from './fleet-audit';

const collectionName = 'vehicle_assignments';
type Row = Record<string, unknown>;

export class AssignmentRepositoryError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'RESOURCE_NOT_FOUND' | 'ASSIGNMENT_VERSION_CONFLICT' | 'ACTIVE_ASSIGNMENT_CONFLICT'
    | 'DRIVER_NOT_ELIGIBLE' | 'VEHICLE_NOT_ELIGIBLE' | 'FORBIDDEN' | 'AUTHORIZATION_UNAVAILABLE'
    | 'ASSIGNMENT_MIGRATION_REQUIRED' | 'ASSIGNMENT_STORAGE_UNAVAILABLE' | 'ASSIGNMENT_PROVIDER_UNAVAILABLE'
    | 'ASSIGNMENT_AUDIT_UNAVAILABLE') { super(code); }
}

export interface AssignmentTransactionPorts {
  readonly policy: AssignmentPolicyConfirmationPort;
  readonly authority: AssignmentAuthorityConfirmationPort;
  readonly audit: AssignmentAuditPort;
}
export type AssignmentTransactionParticipants = (connection: Connection, session: ClientSession) => AssignmentTransactionPorts;

const validId = (value: string) => /^[a-f0-9]{24}$/.test(value);
function decode(row: Row): Assignment {
  const id = String(row._id ?? '');
  const thirdPartyId = typeof row.thirdPartyId === 'string' ? row.thirdPartyId : '';
  const vehicleId = typeof row.vehicleId === 'string' ? row.vehicleId : '';
  const driverId = typeof row.driverId === 'string' ? row.driverId : '';
  const subject = typeof row.subject === 'string' ? row.subject : '';
  const driverName = typeof row.driverName === 'string' ? row.driverName : '';
  const endedAt = row.endedAt === undefined || row.endedAt === null ? null : row.endedAt;
  if (!(row._id instanceof Types.ObjectId) || ![thirdPartyId, vehicleId, driverId].every(validId)
    || !subject || subject.length > 128 || !driverName || driverName.length > 200
    || (row.status !== 'ACTIVE' && row.status !== 'CLOSED') || !(row.startedAt instanceof Date) || !Number.isFinite(row.startedAt.getTime())
    || (row.status === 'ACTIVE' && endedAt !== null) || (row.status === 'CLOSED' && (!(endedAt instanceof Date) || !Number.isFinite(endedAt.getTime())))
    || !Number.isSafeInteger(row.version) || Number(row.version) < 1 || typeof row.createdBy !== 'string' || !row.createdBy
    || (row.status === 'ACTIVE' && row.closedBy !== null && row.closedBy !== undefined)
    || (row.status === 'CLOSED' && (typeof row.closedBy !== 'string' || !row.closedBy))) {
    throw new AssignmentRepositoryError('ASSIGNMENT_PROVIDER_UNAVAILABLE');
  }
  return { id, thirdPartyId, vehicleId, driverId, subject, driverName, status: row.status, startedAt: row.startedAt,
    endedAt: endedAt as Date | null, version: Number(row.version), createdBy: row.createdBy, closedBy: typeof row.closedBy === 'string' ? row.closedBy : null };
}

function regex(value: string): RegExp { return new RegExp(value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
function queryFilter(input: AssignmentListQuery, plateVehicleIds: readonly string[] = []): Record<string, unknown> {
  return {
    thirdPartyId: input.thirdPartyId,
    ...(input.subject ? { subject: input.subject } : {}),
    ...(input.driverId ? { driverId: input.driverId } : {}),
    ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.q ? { $or: [{ driverName: regex(input.q) }, { vehicleId: regex(input.q) }, ...(plateVehicleIds.length ? [{ vehicleId: { $in: plateVehicleIds } }] : [])] } : {}),
  };
}

async function requireTransactionSupport(connection: Connection) {
  try {
    if (!connection.db) throw new Error('MONGODB_UNAVAILABLE');
    const hello = await connection.db.admin().command({ hello: 1 });
    if ((!hello.setName && hello.msg !== 'isdbgrid') || hello.isWritablePrimary !== true)
      throw new Error('MONGODB_TRANSACTIONS_UNAVAILABLE');
  } catch { throw new AssignmentRepositoryError('ASSIGNMENT_STORAGE_UNAVAILABLE'); }
}

const initializedConnections = new WeakMap<Connection, Promise<void>>();
function ensureReady(connection: Connection): Promise<void> {
  const existing = initializedConnections.get(connection);
  if (existing) return existing;
  const pending = (async () => {
    const collection = connection.collection(collectionName);
    let existingIndexes: Set<string>;
    try {
      existingIndexes = new Set((await collection.indexes()).flatMap(index => index.name ? [index.name] : []));
    } catch (error) {
      // listIndexes fails with NamespaceNotFound before the first assignment creates the collection.
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 26)) throw error;
      existingIndexes = new Set();
    }
    for (const obsolete of ['vehicle_assignments_active_vehicle_unique', 'vehicle_assignments_active_driver_unique'])
      if (existingIndexes.has(obsolete)) await collection.dropIndex(obsolete);
    await Promise.all([
      collection.createIndex({ thirdPartyId: 1, vehicleId: 1, driverId: 1 }, {
        name: 'vehicle_assignments_active_pair_unique', unique: true, partialFilterExpression: { status: 'ACTIVE' },
      }),
      collection.createIndex({ thirdPartyId: 1, vehicleId: 1, status: 1, startedAt: -1, _id: 1 }, { name: 'vehicle_assignments_vehicle_history' }),
      collection.createIndex({ thirdPartyId: 1, status: 1, startedAt: -1, _id: 1 }, { name: 'vehicle_assignments_third_party_history' }),
      collection.createIndex({ thirdPartyId: 1, subject: 1, status: 1, startedAt: -1, _id: 1 }, { name: 'vehicle_assignments_subject_history' }),
      collection.createIndex({ thirdPartyId: 1, driverId: 1, status: 1, startedAt: -1, _id: 1 }, { name: 'vehicle_assignments_driver_history' }),
      connection.collection('assignment_events').createIndex({ eventId: 1 }, { unique: true, name: 'assignment_events_event_id_unique' }),
      connection.collection('assignment_events').createIndex({ thirdPartyId: 1, at: 1, eventId: 1 }, { name: 'assignment_events_third_party_timeline' }),
    ]);
  })().catch(error => { initializedConnections.delete(connection); throw error; });
  initializedConnections.set(connection, pending);
  return pending;
}

export function createMongoAssignmentRepository(connect: () => Promise<Connection>, participants: AssignmentTransactionParticipants): AssignmentRepositoryPort {
  function fail(error: unknown): never {
    if (error instanceof AssignmentRepositoryError) throw error;
    if (error instanceof AssignmentError) throw new AssignmentRepositoryError(error.code);
    if (error instanceof AuthorizationError) throw new AssignmentRepositoryError('FORBIDDEN');
    if (error instanceof AuthorizationUnavailable) throw new AssignmentRepositoryError('AUTHORIZATION_UNAVAILABLE');
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new AssignmentRepositoryError('ACTIVE_ASSIGNMENT_CONFLICT');
    if (error instanceof Error && error.message === 'ASSIGNMENT_AUDIT_UNAVAILABLE') throw new AssignmentRepositoryError('ASSIGNMENT_AUDIT_UNAVAILABLE');
    throw new AssignmentRepositoryError('ASSIGNMENT_STORAGE_UNAVAILABLE');
  }
  async function audit(ports: AssignmentTransactionPorts, event: AssignmentAuditEvent) {
    try { await ports.audit.record(event); }
    catch { throw new AssignmentRepositoryError('ASSIGNMENT_AUDIT_UNAVAILABLE'); }
  }

  const repository: AssignmentRepositoryPort = {
    async list(input): Promise<AssignmentPage> {
      if (!validId(input.thirdPartyId) || !Number.isSafeInteger(input.page) || input.page < 1 || !Number.isSafeInteger(input.pageSize)
        || input.pageSize < 1 || input.pageSize > 100 || !['startedAt', 'status', 'driverName', 'vehicleId'].includes(input.sort)
        || !['asc', 'desc'].includes(input.direction)) throw new AssignmentRepositoryError('INVALID_REQUEST');
      try {
        const connection = await connect(); await ensureReady(connection);
        const plateRows = input.q ? await connection.collection('vehicles').find({ thirdPartyId: input.thirdPartyId, plate: regex(input.q) },
          { projection: { _id: 1 } }).toArray() : [];
        const plateVehicleIds = plateRows.flatMap(row => row._id instanceof Types.ObjectId ? [row._id.toString()] : []);
        const filter = queryFilter(input, plateVehicleIds);
        const direction: 1 | -1 = input.direction === 'asc' ? 1 : -1;
        const sort: Record<string, 1 | -1> = { [input.sort]: direction, _id: 1 };
        const [rows, total] = await Promise.all([
          connection.collection(collectionName).find(filter).sort(sort).skip((input.page - 1) * input.pageSize).limit(input.pageSize).toArray(),
          connection.collection(collectionName).countDocuments(filter),
        ]);
        return { items: rows.map(row => decode(row as Row)), total };
      } catch (error) { return fail(error); }
    },
    async find(input) {
      if (!validId(input.id) || !validId(input.thirdPartyId)) throw new AssignmentRepositoryError('INVALID_REQUEST');
      if (input.subject !== undefined && (!input.subject || input.subject.length > 128)) throw new AssignmentRepositoryError('INVALID_REQUEST');
      try {
        const connection = await connect(); await ensureReady(connection);
        const row = await connection.collection(collectionName).findOne({ _id: new Types.ObjectId(input.id), thirdPartyId: input.thirdPartyId,
          ...(input.subject ? { subject: input.subject } : {}), ...(input.activeOnly ? { status: 'ACTIVE' } : {}) });
        return row ? decode(row as Row) : null;
      } catch (error) { return fail(error); }
    },
    async create(input) {
      if (!validId(input.authority.thirdPartyId) || !input.authority.subject || !input.authority.policyVersion || !input.correlationId
        || !Number.isSafeInteger(input.expectedDriverVersion) || input.expectedDriverVersion < 1
        || !Number.isSafeInteger(input.expectedVehicleVersion) || input.expectedVehicleVersion < 1
        || input.assignment.thirdPartyId !== input.authority.thirdPartyId || input.assignment.createdBy !== input.authority.subject) {
        throw new AssignmentRepositoryError('INVALID_REQUEST');
      }
      try {
        const connection = await connect(); await ensureReady(connection);
        await requireTransactionSupport(connection);
        return await connection.transaction(async session => {
          const ports = participants(connection, session);
          await ports.policy.confirm(input.authority.policyVersion);
          await ports.authority.confirm(input.authority);
          const vehicleObjectId = new Types.ObjectId(input.assignment.vehicleId);
          const driverObjectId = new Types.ObjectId(input.assignment.driverId);
          const vehicle = await connection.collection('vehicles').findOne({ _id: vehicleObjectId, thirdPartyId: input.authority.thirdPartyId }, { session });
          const driver = await connection.collection('drivers').findOne({ _id: driverObjectId, thirdPartyId: input.authority.thirdPartyId }, { session });
          if (!vehicle || !driver) throw new AssignmentRepositoryError('RESOURCE_NOT_FOUND');
          if (vehicle.status !== 'ACTIVE') throw new AssignmentRepositoryError('VEHICLE_NOT_ELIGIBLE');
          if (driver.status !== 'ACTIVE') throw new AssignmentRepositoryError('DRIVER_NOT_ELIGIBLE');
          if (vehicle.version !== input.expectedVehicleVersion || driver.version !== input.expectedDriverVersion)
            throw new AssignmentRepositoryError('ASSIGNMENT_VERSION_CONFLICT');
          if (driver.subject !== input.assignment.subject) throw new AssignmentRepositoryError('DRIVER_NOT_ELIGIBLE');
          const membershipId = typeof driver.membershipId === 'string' ? driver.membershipId : '';
          const membership = membershipId ? await connection.collection('organization_memberships').findOne({ id: membershipId,
            subject: driver.subject, organizationId: input.authority.thirdPartyId, status: 'ACTIVE' }, { session }) : null;
          const driverRole = membership ? await connection.collection('organization_associations').findOne({ membershipId,
            subject: driver.subject, organizationId: input.authority.thirdPartyId, capability: 'DRIVER', assigned: { $ne: false }, active: true }, { session }) : null;
          if (!membership || !driverRole) throw new AssignmentRepositoryError('DRIVER_NOT_ELIGIBLE');
          if (!Number.isSafeInteger(membership.revision) || !Number.isSafeInteger(driverRole.revision))
            throw new AssignmentRepositoryError('ASSIGNMENT_STORAGE_UNAVAILABLE');
          const participantWrites = await Promise.all([
            connection.collection('vehicles').updateOne({ _id: vehicleObjectId, thirdPartyId: input.authority.thirdPartyId, status: 'ACTIVE', version: input.expectedVehicleVersion }, { $inc: { mutationFence: 1 } }, { session }),
            connection.collection('drivers').updateOne({ _id: driverObjectId, thirdPartyId: input.authority.thirdPartyId, status: 'ACTIVE', version: input.expectedDriverVersion }, { $inc: { mutationFence: 1 } }, { session }),
            connection.collection('organization_memberships').updateOne({ _id: membership._id, revision: membership.revision, status: 'ACTIVE' }, { $inc: { mutationFence: 1 } }, { session }),
            connection.collection('organization_associations').updateOne({ _id: driverRole._id, revision: driverRole.revision, active: true, assigned: { $ne: false } }, { $inc: { mutationFence: 1 } }, { session }),
          ]);
          if (participantWrites.some(result => result.modifiedCount !== 1)) throw new AssignmentRepositoryError('ASSIGNMENT_VERSION_CONFLICT');
          const { id, ...fields } = input.assignment;
          const document = { _id: new Types.ObjectId(id), ...fields };
          await connection.collection(collectionName).insertOne(document, { session });
          await audit(ports, { eventId: randomUUID(), correlationId: input.correlationId, action: 'ASSIGNMENT_CREATED',
            actorSubject: input.authority.subject, assignmentId: id, thirdPartyId: input.authority.thirdPartyId,
            vehicleId: input.assignment.vehicleId, driverId: input.assignment.driverId, beforeVersion: null,
            version: input.assignment.version, at: input.assignment.startedAt.toISOString() });
          return input.assignment;
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
      } catch (error) { return fail(error); }
    },
    async close(input) {
      if (!validId(input.authority.thirdPartyId) || !input.authority.subject || !input.authority.policyVersion || !input.correlationId
        || !validId(input.id) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1
        || input.actor !== input.authority.subject || !(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) throw new AssignmentRepositoryError('INVALID_REQUEST');
      try {
        const connection = await connect(); await ensureReady(connection);
        await requireTransactionSupport(connection);
        return await connection.transaction(async session => {
          const ports = participants(connection, session);
          await ports.policy.confirm(input.authority.policyVersion);
          await ports.authority.confirm(input.authority);
          const raw = await connection.collection(collectionName).findOne({ _id: new Types.ObjectId(input.id), thirdPartyId: input.authority.thirdPartyId }, { session });
          if (!raw) throw new AssignmentRepositoryError('RESOURCE_NOT_FOUND');
          const current = decode(raw as Row);
          const transition = closeAssignment({ assignment: current, expectedVersion: input.expectedVersion, actor: input.actor, now: input.now });
          if (!transition.changed) return transition.assignment;
          const vehicle = await connection.collection('vehicles').findOne({ _id: new Types.ObjectId(current.vehicleId), thirdPartyId: current.thirdPartyId }, { session });
          const driver = await connection.collection('drivers').findOne({ _id: new Types.ObjectId(current.driverId), thirdPartyId: current.thirdPartyId }, { session });
          if (!vehicle || !driver) throw new AssignmentRepositoryError('ASSIGNMENT_STORAGE_UNAVAILABLE');
          const fences = await Promise.all([
            connection.collection('vehicles').updateOne({ _id: vehicle._id, thirdPartyId: current.thirdPartyId, version: vehicle.version }, { $inc: { mutationFence: 1 } }, { session }),
            connection.collection('drivers').updateOne({ _id: driver._id, thirdPartyId: current.thirdPartyId, version: driver.version }, { $inc: { mutationFence: 1 } }, { session }),
          ]);
          if (fences.some(result => result.modifiedCount !== 1)) throw new AssignmentRepositoryError('ASSIGNMENT_VERSION_CONFLICT');
          const updated = await connection.collection(collectionName).updateOne({ _id: new Types.ObjectId(input.id), thirdPartyId: current.thirdPartyId,
            status: 'ACTIVE', version: input.expectedVersion }, { $set: { status: 'CLOSED', endedAt: transition.assignment.endedAt,
            version: transition.assignment.version, closedBy: transition.assignment.closedBy } }, { session });
          if (updated.modifiedCount !== 1) throw new AssignmentRepositoryError('ASSIGNMENT_VERSION_CONFLICT');
          await audit(ports, { eventId: randomUUID(), correlationId: input.correlationId, action: 'ASSIGNMENT_CLOSED',
            actorSubject: input.actor, assignmentId: current.id, thirdPartyId: current.thirdPartyId, vehicleId: current.vehicleId,
            driverId: current.driverId, beforeVersion: current.version, version: transition.assignment.version, at: input.now.toISOString() });
          return transition.assignment;
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
      } catch (error) { return fail(error); }
    },
  };
  return repository;
}

export function assignmentRevision(assignments: readonly Assignment[]): string {
  const value = assignments.map(item => [item.id, item.thirdPartyId, item.vehicleId, item.driverId, item.subject, item.status, item.version].join(':')).sort().join('|');
  return createHash('sha256').update(value).digest('hex');
}

export function createMongoAssignmentPresenceReader(connect: () => Promise<Connection>): Pick<AssignmentConfirmationPort, 'readForVehicle' | 'readForDriver'> {
  async function read(input: { readonly thirdPartyId: string; readonly vehicleId?: string; readonly driverId?: string }): Promise<AssignmentPresence> {
    if (!validId(input.thirdPartyId) || (input.vehicleId !== undefined && !validId(input.vehicleId))
      || (input.driverId !== undefined && !validId(input.driverId))) return { state: 'UNAVAILABLE' };
    try {
      const connection = await connect();
      await ensureReady(connection);
      const rows = await connection.collection(collectionName).find({ thirdPartyId: input.thirdPartyId, status: 'ACTIVE',
        ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}), ...(input.driverId ? { driverId: input.driverId } : {}) }).sort({ _id: 1 }).toArray();
      const assignments = rows.map(row => decode(row as Row));
      return { state: 'CONFIRMED', revision: assignmentRevision(assignments), hasActive: assignments.length > 0 };
    } catch { return { state: 'UNAVAILABLE' }; }
  }
  return {
    readForVehicle: input => read({ ...input, vehicleId: input.vehicleId }),
    readForDriver: input => read({ ...input, driverId: input.driverId }),
  };
}

export function createMongoAssignmentAccessReader(connect: () => Promise<Connection>): AssignmentReadPort {
  return {
    async read(input): Promise<AssignmentReadEvidence> {
      if (!validId(input.thirdPartyId) || (input.vehicleId !== undefined && !validId(input.vehicleId))
        || (input.subject !== undefined && (!input.subject || input.subject.length > 128))) return { state: 'UNAVAILABLE' };
      try {
        const connection = await connect();
        await ensureReady(connection);
        const rows = await connection.collection(collectionName).find({ thirdPartyId: input.thirdPartyId, status: 'ACTIVE',
          ...(input.subject ? { subject: input.subject } : {}), ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}) })
          .sort({ vehicleId: 1, driverId: 1, _id: 1 }).toArray();
        const assignments = rows.map(row => decode(row as Row));
        return { state: 'CONFIRMED', revision: assignmentRevision(assignments), assignments: assignments.map(({ vehicleId, thirdPartyId, subject, driverId, driverName }) =>
          ({ vehicleId, thirdPartyId, subject, driverId, driverName })) };
      } catch { return { state: 'UNAVAILABLE' }; }
    },
  };
}

export function createMongoAssignmentConfirmation(connection: Connection, session: ClientSession): Pick<AssignmentConfirmationPort, 'confirmNoOpenForVehicle' | 'confirmNoOpenForDriver'> {
  async function confirm(input: { readonly thirdPartyId: string; readonly participantId: string; readonly revision: string }, field: 'vehicleId' | 'driverId') {
    if (!validId(input.thirdPartyId) || !validId(input.participantId) || !input.revision)
      throw new AssignmentRepositoryError('INVALID_REQUEST');
    try {
      const rows = await connection.collection(collectionName).find({ thirdPartyId: input.thirdPartyId, [field]: input.participantId, status: 'ACTIVE' }, { session }).sort({ _id: 1 }).toArray();
      const assignments = rows.map(row => decode(row as Row));
      if (assignments.length) throw new AssignmentConfirmationError('ACTIVE_ASSIGNMENT_EXISTS');
    } catch (error) {
      if (error instanceof AssignmentConfirmationError) throw error;
      throw new AssignmentConfirmationError('ASSIGNMENT_EVIDENCE_UNAVAILABLE');
    }
  }
  return {
    confirmNoOpenForVehicle: input => confirm({ ...input, participantId: input.vehicleId }, 'vehicleId'),
    confirmNoOpenForDriver: input => confirm({ ...input, participantId: input.driverId }, 'driverId'),
  };
}

export function createMongoAssignmentAudit(connection: Connection, session: ClientSession): AssignmentAuditPort {
  return {
    async record(event) {
      await connection.collection('assignment_events').insertOne({ ...event, at: new Date(event.at) }, { session });
      await recordFleetAudit(connection, session, { eventId: event.eventId, correlationId: event.correlationId, at: event.at,
        action: event.action, actorSubject: event.actorSubject, resourceType: 'assignment', resourceId: event.assignmentId,
        thirdPartyId: event.thirdPartyId, beforeVersion: event.beforeVersion, afterVersion: event.version });
    },
  };
}
