import { randomUUID } from 'node:crypto';
import { Schema, Types, type ClientSession, type Connection } from 'mongoose';
import type { PolicyConfirmation } from '@/modules/identity/application/policy-confirmation';
import type { AssignmentConfirmation, VehicleAuthorityConfirmation, VehicleFactsReader, VehicleMutation, VehicleRepository } from '../../application/vehicle-ports';
import { VehicleUseCaseError, vehicleFailure } from '../../application/vehicles';
import { changeVehicle, createVehicle, isVehicleEligible, normalizeVehicleFields, type Vehicle } from '../../domain/vehicle';
const schema = new Schema({
  plate: { type: String, required: true, match: /^[A-Z]{3}\d{2,3}$/ },
  internalNumber: { type: String, required: true, match: /^[A-Z0-9-]{1,40}$/ },
  propertyCardNumber: { type: String, required: true, match: /^[A-Z0-9-]{1,64}$/ },
  thirdPartyId: { type: String, required: true, match: /^[a-f0-9]{24}$/ },
  status: { type: String, required: true, enum: ['ACTIVE', 'INACTIVE'] },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  createdAt: { type: Date, required: true }, updatedAt: { type: Date, required: true },
  createdBy: { type: String, required: true }, updatedBy: { type: String, required: true },
}, { strict: 'throw', versionKey: false, collection: 'vehicles', autoIndex: false, autoCreate: false });
schema.index({ plate: 1 }, { unique: true });
schema.index({ propertyCardNumber: 1 }, { unique: true });
schema.index({ thirdPartyId: 1, internalNumber: 1 }, { unique: true });
schema.index({ thirdPartyId: 1, status: 1, createdAt: 1, _id: 1 });
export const vehicleModel = (connection: Connection) => connection.models.Vehicle ?? connection.model('Vehicle', schema);
function decode(row: Record<string, unknown>): Vehicle {
  const fields = normalizeVehicleFields({ plate: row.plate as string, internalNumber: row.internalNumber as string, propertyCardNumber: row.propertyCardNumber as string });
  if (Object.entries(fields).some(([key, value]) => row[key] !== value) || !['ACTIVE', 'INACTIVE'].includes(String(row.status))
    || !Number.isSafeInteger(row.version) || Number(row.version) < 1 || !/^[a-f0-9]{24}$/.test(String(row.thirdPartyId))
    || !(row.createdAt instanceof Date) || !(row.updatedAt instanceof Date) || typeof row.createdBy !== 'string' || typeof row.updatedBy !== 'string') throw new VehicleUseCaseError('VEHICLE_STORAGE_UNAVAILABLE');
  return { id: String(row._id), ...fields, thirdPartyId: String(row.thirdPartyId), status: row.status as Vehicle['status'], version: Number(row.version),
    createdAt: row.createdAt, updatedAt: row.updatedAt, createdBy: row.createdBy, updatedBy: row.updatedBy };
}
const validId = (value: string) => { if (!/^[a-f0-9]{24}$/.test(value)) throw new VehicleUseCaseError('INVALID_REQUEST'); };
function failure(error: unknown): never {
  return vehicleFailure(error);
}
async function identifierWrite<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new VehicleUseCaseError('VEHICLE_IDENTIFIER_CONFLICT');
    throw error;
  }
}
type Participants = { policy: PolicyConfirmation; authority: VehicleAuthorityConfirmation; assignments: AssignmentConfirmation };
export function createVehicleRepository(connect: () => Promise<Connection>, participants: (connection: Connection, session: ClientSession) => Participants): VehicleRepository & VehicleFactsReader {
  let initialized: Promise<void> | undefined;
  async function ready(connection: Connection) {
    if (!initialized) initialized = (async () => {
      await vehicleModel(connection).createIndexes();
      await connection.collection('vehicle_management_events').createIndex({ eventId: 1 }, { unique: true });
      await connection.collection('vehicle_management_events').createIndex({ thirdPartyId: 1, at: 1, eventId: 1 });
    })().catch(error => { initialized = undefined; throw error; });
    await initialized;
  }
  async function mutate(input: VehicleMutation, action: 'CREATE' | 'UPDATE' | 'STATUS', work: (connection: Connection, session: ClientSession, ports: Participants) => Promise<{ vehicle: Vehicle; changed: boolean; beforeVersion: number | null }>) {
    validId(input.authority.thirdPartyId);
    if (!input.authority.subject || !input.authority.policyVersion || !input.correlationId) throw new VehicleUseCaseError('INVALID_REQUEST');
    try {
      const connection = await connect(); await ready(connection);
      return await connection.transaction(async session => {
        const ports = participants(connection, session);
        await ports.policy.confirm(input.authority.policyVersion);
        await ports.authority.confirm(input.authority);
        const result = await work(connection, session, ports);
        if (result.changed) await connection.collection('vehicle_management_events').insertOne({ eventId: randomUUID(), correlationId: input.correlationId,
          vehicleId: result.vehicle.id, thirdPartyId: input.authority.thirdPartyId, actorSubject: input.authority.subject,
          action, beforeVersion: result.beforeVersion, version: result.vehicle.version, at: result.vehicle.updatedAt }, { session });
        return result.vehicle;
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
    } catch (error) { return failure(error); }
  }
  async function change(input: Parameters<VehicleRepository['update']>[0] | Parameters<VehicleRepository['transition']>[0]) {
    validId(input.id);
    return mutate(input, 'changes' in input ? 'UPDATE' : 'STATUS', async (connection, session, ports) => {
      const model = vehicleModel(connection);
      const raw = await model.findOne({ _id: new Types.ObjectId(input.id), thirdPartyId: input.authority.thirdPartyId }).session(session).lean().exec();
      if (!raw) throw new VehicleUseCaseError('RESOURCE_NOT_FOUND');
      const current = decode(raw as Record<string, unknown>);
      const result = changeVehicle({ vehicle: current, expectedVersion: input.expectedVersion, changes: 'changes' in input ? input.changes : { status: input.status }, actor: input.authority.subject, now: new Date() });
      if (result.changed) {
        if ('status' in input && input.status === 'INACTIVE') {
          if (!input.assignmentRevision) throw new VehicleUseCaseError('ASSIGNMENT_PROVIDER_UNAVAILABLE');
          await ports.assignments.confirmNoOpenForVehicle({ vehicleId: input.id, thirdPartyId: current.thirdPartyId, revision: input.assignmentRevision });
        }
        const { id: ignoredId, ...document } = result.vehicle;
        void ignoredId;
        const updated = await identifierWrite(() => model.updateOne({ _id: new Types.ObjectId(input.id), thirdPartyId: current.thirdPartyId, version: input.expectedVersion }, { $set: document }, { session, runValidators: true }).exec());
        if (updated.modifiedCount !== 1) throw new VehicleUseCaseError('VEHICLE_VERSION_CONFLICT');
      }
      return { ...result, beforeVersion: current.version };
    });
  }
  const repository: VehicleRepository & VehicleFactsReader = {
    async list(input) {
      try {
        const connection = await connect(); await ready(connection);
        const filter = { thirdPartyId: input.thirdPartyId,
          ...(input.assignedVehicleIds !== undefined ? { _id: { $in: input.assignedVehicleIds.map(value => new Types.ObjectId(value)) }, status: 'ACTIVE' } : {}),
          ...(input.status ? { status: input.assignedVehicleIds !== undefined && input.status === 'INACTIVE' ? { $in: [] } : input.status } : {}),
          ...(input.q ? { $or: ['plate', 'internalNumber', 'propertyCardNumber'].map(field => ({ [field]: { $regex: input.q!.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } })) } : {}) };
        const sort: Record<string, 1 | -1> = { [input.sort]: input.direction === 'asc' ? 1 : -1, _id: 1 };
        const model = vehicleModel(connection);
        const [rows, total] = await Promise.all([model.find(filter).sort(sort).skip((input.page - 1) * input.pageSize).limit(input.pageSize).lean().exec(), model.countDocuments(filter)]);
        return { items: rows.map(row => decode(row as Record<string, unknown>)), total };
      } catch (error) { return failure(error); }
    },
    async find(input) {
      validId(input.id); validId(input.thirdPartyId);
      if (input.assignedVehicleIds !== undefined && !input.assignedVehicleIds.includes(input.id)) return null;
      try {
        const connection = await connect(); await ready(connection);
        const raw = await vehicleModel(connection).findOne({ _id: new Types.ObjectId(input.id), thirdPartyId: input.thirdPartyId,
          ...(input.assignedVehicleIds !== undefined ? { status: 'ACTIVE' } : {}) }).lean().exec();
        return raw ? decode(raw as Record<string, unknown>) : null;
      } catch (error) { return failure(error); }
    },
    async create(input) {
      return mutate(input, 'CREATE', async (connection, session) => {
        const vehicle = createVehicle({ id: new Types.ObjectId().toString(), thirdPartyId: input.authority.thirdPartyId, fields: input.fields, actor: input.authority.subject, now: new Date() });
        const { id, ...document } = vehicle;
        await identifierWrite(() => vehicleModel(connection).create([{ _id: new Types.ObjectId(id), ...document }], { session }));
        return { vehicle, changed: true, beforeVersion: null };
      });
    },
    update: change, transition: change,
    async eligibility(input) {
      const vehicle = await repository.find(input);
      return { vehicleId: vehicle?.id ?? null, version: vehicle?.version ?? null, eligible: isVehicleEligible(vehicle), plate: vehicle?.plate };
    },
  };
  return repository;
}
