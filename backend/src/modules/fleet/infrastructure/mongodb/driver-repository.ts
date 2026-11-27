import { randomUUID } from 'node:crypto';
import { Schema, Types, type ClientSession, type Connection } from 'mongoose';
import type { PolicyConfirmation } from '@/modules/identity/application/policy-confirmation';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import { AuthorizationUnavailable } from '@/modules/identity/application/authorization-errors';
import { AssignmentConfirmationError, type AssignmentConfirmationPort } from '../../application/assignment-ports';
import { createDriver, DriverError, isDriverEligible, transitionDriver, type Driver, type DriverMembershipFacts } from '../../domain/driver';
import type { DriverFactsReader, DriverRepositoryPort } from '../../application/driver-ports';
import { recordFleetAudit } from './fleet-audit';
import type { AuditWriter } from '@/modules/audit/application/audit-ports';

export class DriverRepositoryError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'NOT_FOUND' | 'FORBIDDEN' | 'VERSION_CONFLICT'
    | 'MEMBERSHIP_NOT_ELIGIBLE' | 'DUPLICATE_MEMBERSHIP' | 'OPEN_ASSIGNMENT' | 'ASSIGNMENT_PROVIDER_UNAVAILABLE' | 'STORAGE_UNAVAILABLE') { super(code); }
}

const schema = new Schema({
  subject: { type: String, required: true, maxlength: 128 },
  membershipId: { type: String, required: true, maxlength: 128 },
  thirdPartyId: { type: String, required: true, match: /^[a-f0-9]{24}$/ },
  status: { type: String, required: true, enum: ['ACTIVE', 'INACTIVE'] },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
  createdBy: { type: String, required: true, maxlength: 128 },
  updatedBy: { type: String, default: null, maxlength: 128 },
}, { strict: 'throw', versionKey: false, collection: 'drivers' });
schema.index({ membershipId: 1 }, { unique: true });
schema.index({ thirdPartyId: 1, createdAt: -1, _id: 1 });
schema.index({ thirdPartyId: 1, status: 1, createdAt: -1, _id: 1 });
schema.index({ subject: 1, thirdPartyId: 1 });
export const driverModel = (connection: Connection) => connection.models.Driver ?? connection.model('Driver', schema);

function decode(raw: Record<string, unknown>): Driver {
  const createdAt = new Date(raw.createdAt as string | Date);
  const updatedAt = new Date(raw.updatedAt as string | Date);
  if (typeof raw.subject !== 'string' || typeof raw.membershipId !== 'string' || typeof raw.thirdPartyId !== 'string'
    || !['ACTIVE', 'INACTIVE'].includes(String(raw.status)) || !Number.isSafeInteger(raw.version) || Number(raw.version) < 1
    || !Number.isFinite(createdAt.getTime()) || !Number.isFinite(updatedAt.getTime()) || typeof raw.createdBy !== 'string') {
    throw new DriverRepositoryError('STORAGE_UNAVAILABLE');
  }
  return {
    id: String(raw._id), subject: raw.subject, membershipId: raw.membershipId, thirdPartyId: raw.thirdPartyId,
    status: raw.status as Driver['status'], version: Number(raw.version), createdAt, updatedAt, createdBy: raw.createdBy,
    updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : null,
  };
}

function mapError(error: unknown): never {
  if (error instanceof DriverRepositoryError) throw error;
  if (error instanceof DriverError) throw new DriverRepositoryError(error.code);
  if (error instanceof AssignmentConfirmationError) throw new DriverRepositoryError(error.code === 'ACTIVE_ASSIGNMENT_EXISTS' ? 'OPEN_ASSIGNMENT' : 'ASSIGNMENT_PROVIDER_UNAVAILABLE');
  if (error instanceof AuthorizationError) throw new DriverRepositoryError('FORBIDDEN');
  if (error instanceof AuthorizationUnavailable) throw new DriverRepositoryError('STORAGE_UNAVAILABLE');
  if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new DriverRepositoryError('DUPLICATE_MEMBERSHIP');
  throw new DriverRepositoryError('STORAGE_UNAVAILABLE');
}

const currentMembership = async (connection: Connection, session: ClientSession, membershipId: string, subject: string, thirdPartyId: string) =>
  connection.collection('organization_memberships').findOne({ id: membershipId, subject, organizationId: thirdPartyId }, { session });

const activeDriverRole = async (connection: Connection, session: ClientSession, membershipId: string, subject: string, thirdPartyId: string) =>
  connection.collection('organization_associations').findOne({ membershipId, subject, organizationId: thirdPartyId, capability: 'DRIVER', assigned: { $ne: false }, active: true }, { session });

export async function provisionDriverInSession(connection: Connection, session: ClientSession, input: {
  readonly id: string;
  readonly subject: string;
  readonly membershipId: string;
  readonly thirdPartyId: string;
  readonly actor: string;
  readonly now: Date;
  readonly source: 'INVITATION' | 'MEMBERSHIP' | 'MIGRATION';
}, audit: AuditWriter): Promise<Driver> {
  const model = driverModel(connection);
  const existing = await model.findOne({ membershipId: input.membershipId }).session(session).lean().exec();
  if (existing) {
    const driver = decode(existing as Record<string, unknown>);
    if (driver.subject !== input.subject || driver.thirdPartyId !== input.thirdPartyId) throw new DriverRepositoryError('DUPLICATE_MEMBERSHIP');
    return driver;
  }
  const membership = await currentMembership(connection, session, input.membershipId, input.subject, input.thirdPartyId);
  const role = membership ? await activeDriverRole(connection, session, input.membershipId, input.subject, input.thirdPartyId) : null;
  const organization = await connection.collection('organizations').findOne({ id: input.thirdPartyId, type: 'THIRD_PARTY', active: true }, { session });
  const thirdParty = /^[a-f0-9]{24}$/.test(input.thirdPartyId)
    ? await connection.collection('third_parties').findOne({ _id: new Types.ObjectId(input.thirdPartyId), status: 'ACTIVE' }, { session })
    : null;
  if (!membership || membership.status !== 'ACTIVE' || !role || !organization || !thirdParty) throw new DriverRepositoryError('MEMBERSHIP_NOT_ELIGIBLE');
  const facts: DriverMembershipFacts = { id: input.membershipId, subject: input.subject, organizationId: input.thirdPartyId,
    status: 'ACTIVE', roles: ['DRIVER'] };
  const driver = createDriver({ id: input.id, subject: input.subject, membership: facts, thirdPartyId: input.thirdPartyId,
    thirdPartyActive: true, actor: input.actor, now: input.now });
  await model.create([{ _id: new Types.ObjectId(driver.id), subject: driver.subject, membershipId: driver.membershipId,
    thirdPartyId: driver.thirdPartyId, status: driver.status, version: driver.version, createdAt: driver.createdAt,
    updatedAt: driver.updatedAt, createdBy: driver.createdBy, updatedBy: driver.updatedBy }], { session });
  const eventId = randomUUID(); const action = input.source === 'MIGRATION' ? 'DRIVER_MIGRATED' : 'DRIVER_PROVISIONED';
  await connection.collection('driver_management_events').insertOne({ eventId, driverId: driver.id,
    membershipId: driver.membershipId, subject: driver.subject, thirdPartyId: driver.thirdPartyId, actorSubject: input.actor,
    action, source: input.source,
    beforeVersion: null, version: driver.version, at: input.now }, { session });
  await recordFleetAudit(audit, { eventId, correlationId: eventId, at: input.now, action,
    actorSubject: input.actor, actorKind: input.source === 'MIGRATION' ? 'system' : 'user', resourceType: 'driver', resourceId: driver.id,
    thirdPartyId: driver.thirdPartyId, beforeVersion: null, afterVersion: driver.version });
  return driver;
}

export async function synchronizeDriverMembershipInSession(connection: Connection, session: ClientSession, input: {
  readonly membershipId: string;
  readonly subject: string;
  readonly thirdPartyId: string;
  readonly beforeRoles: readonly string[];
  readonly afterRoles: readonly string[];
  readonly membershipStatus: 'ACTIVE' | 'INACTIVE';
  readonly actor: string;
  readonly now: Date;
}, audit: AuditWriter): Promise<void> {
  const hadDriver = input.beforeRoles.includes('DRIVER');
  const hasDriver = input.afterRoles.includes('DRIVER');
  if (hadDriver === hasDriver) return;
  const model = driverModel(connection);
  if (hasDriver) {
    if (input.membershipStatus !== 'ACTIVE') throw new DriverRepositoryError('MEMBERSHIP_NOT_ELIGIBLE');
    await provisionDriverInSession(connection, session, { ...input, id: new Types.ObjectId().toString(), source: 'MEMBERSHIP' }, audit);
    return;
  }
  const raw = await model.findOne({ membershipId: input.membershipId, subject: input.subject, thirdPartyId: input.thirdPartyId }).session(session).lean().exec();
  if (!raw) return;
  const driver = decode(raw as Record<string, unknown>);
  if (driver.status === 'INACTIVE') return;
  const result = await model.updateOne({ _id: new Types.ObjectId(driver.id), version: driver.version }, {
    $set: { status: 'INACTIVE', version: driver.version + 1, updatedAt: input.now, updatedBy: input.actor },
  }, { session, runValidators: true });
  if (result.modifiedCount !== 1) throw new DriverRepositoryError('VERSION_CONFLICT');
  const eventId = randomUUID();
  await connection.collection('driver_management_events').insertOne({ eventId, driverId: driver.id,
    membershipId: driver.membershipId, subject: driver.subject, thirdPartyId: driver.thirdPartyId, actorSubject: input.actor,
    action: 'DRIVER_DEACTIVATED', source: 'MEMBERSHIP_ROLE_REMOVED', beforeVersion: driver.version,
    version: driver.version + 1, at: input.now }, { session });
  await recordFleetAudit(audit, { eventId, correlationId: eventId, at: input.now, action: 'DRIVER_DEACTIVATED',
    actorSubject: input.actor, resourceType: 'driver', resourceId: driver.id, thirdPartyId: driver.thirdPartyId,
    beforeVersion: driver.version, afterVersion: driver.version + 1 });
}

export function createDriverRepository(connect: () => Promise<Connection>, policyFactory: (connection: Connection, session: ClientSession) => PolicyConfirmation,
  assignmentConfirmation: (connection: Connection, session: ClientSession) => Pick<AssignmentConfirmationPort, 'confirmNoOpenForDriver'>,
  auditFactory: (connection: Connection, session: ClientSession) => AuditWriter): DriverRepositoryPort & DriverFactsReader & {
  nextId(): string;
} {
  let initialized: Promise<void> | undefined;
  const initialize = (connection: Connection) => {
    if (!initialized) initialized = (async () => {
      await driverModel(connection).init();
      await connection.collection('driver_management_events').createIndex({ eventId: 1 }, { unique: true });
      await connection.collection('driver_management_events').createIndex({ thirdPartyId: 1, at: 1, eventId: 1 });
    })().catch(error => { initialized = undefined; throw error; });
    return initialized;
  };
  return {
    nextId: () => new Types.ObjectId().toString(),
    async list(input) {
      if (!/^[a-f0-9]{24}$/.test(input.thirdPartyId) || !Number.isSafeInteger(input.page) || input.page < 1
        || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100
        || !['createdAt', 'status'].includes(input.sort) || !['asc', 'desc'].includes(input.direction)
        || (input.status !== undefined && input.status !== 'ACTIVE' && input.status !== 'INACTIVE')
        || (input.subjects !== undefined && (!input.subjects.length || input.subjects.length > 100 || input.subjects.some(subject => !subject || subject.length > 128)))) throw new DriverRepositoryError('INVALID_REQUEST');
      try {
        const connection = await connect();
        await initialize(connection);
        const filter = { thirdPartyId: input.thirdPartyId, ...(input.subject ? { subject: input.subject } : {}),
          ...(input.subjects ? { subject: { ...(input.subject ? { $eq: input.subject } : {}), $in: input.subjects } } : {}), ...(input.status ? { status: input.status } : {}) };
        const direction: 1 | -1 = input.direction === 'asc' ? 1 : -1;
        const sort: Record<string, 1 | -1> = { [input.sort]: direction, _id: 1 };
        const [rows, total] = await Promise.all([
          driverModel(connection).find(filter).sort(sort).skip((input.page - 1) * input.pageSize).limit(input.pageSize).lean().exec(),
          driverModel(connection).countDocuments(filter).exec(),
        ]);
        return { items: rows.map(value => decode(value as Record<string, unknown>)), total };
      } catch (error) { return mapError(error); }
    },
    async find(input) {
      if (!/^[a-f0-9]{24}$/.test(input.id) || !/^[a-f0-9]{24}$/.test(input.thirdPartyId)) throw new DriverRepositoryError('INVALID_REQUEST');
      try {
        const connection = await connect();
        await initialize(connection);
        const raw = await driverModel(connection).findOne({ _id: new Types.ObjectId(input.id), thirdPartyId: input.thirdPartyId,
          ...(input.subject ? { subject: input.subject } : {}) }).lean().exec();
        return raw ? decode(raw as Record<string, unknown>) : null;
      } catch (error) { return mapError(error); }
    },
    async eligibility(input) {
      try {
        if (!/^[a-f0-9]{24}$/.test(input.thirdPartyId) || !input.subject) throw new DriverRepositoryError('INVALID_REQUEST');
        const connection = await connect();
        await initialize(connection);
        const rawDriver = await driverModel(connection).findOne({ subject: input.subject, thirdPartyId: input.thirdPartyId }).lean().exec();
        const driver = rawDriver ? decode(rawDriver as Record<string, unknown>) : null;
        const organization = await connection.collection('organizations').findOne({ id: input.thirdPartyId, type: 'THIRD_PARTY' });
        const thirdParty = await connection.collection('third_parties').findOne({ _id: new Types.ObjectId(input.thirdPartyId) });
        const membership = driver ? await connection.collection('organization_memberships').findOne({ id: driver.membershipId,
          subject: input.subject, organizationId: input.thirdPartyId }) : null;
        const role = driver && membership ? await connection.collection('organization_associations').findOne({ membershipId: driver.membershipId,
          subject: input.subject, organizationId: input.thirdPartyId, capability: 'DRIVER', assigned: { $ne: false }, active: true }) : null;
        const membershipFacts = membership ? { id: String(membership.id), subject: String(membership.subject), organizationId: String(membership.organizationId),
          status: membership.status === 'ACTIVE' && role ? 'ACTIVE' as const : 'INACTIVE' as const, roles: role ? ['DRIVER'] : [] } : null;
        const activeThirdParty = organization?.active === true && thirdParty?.status === 'ACTIVE';
        return { driverId: driver?.id ?? null, eligible: isDriverEligible({ driver, membership: membershipFacts, thirdPartyActive: activeThirdParty }),
          driverStatus: driver?.status ?? null, membershipRevision: membership && Number.isSafeInteger(membership.revision) ? Number(membership.revision) : null,
          thirdPartyRevision: thirdParty && Number.isSafeInteger(thirdParty.revision) ? Number(thirdParty.revision) : null };
      } catch (error) { return mapError(error); }
    },
    async transition(input) {
      if (!/^[a-f0-9]{24}$/.test(input.id) || !/^[a-f0-9]{24}$/.test(input.thirdPartyId)
        || input.scope.kind !== 'organization' || input.scope.companyId !== null || input.scope.thirdPartyId !== input.thirdPartyId) {
        throw new DriverRepositoryError('INVALID_REQUEST');
      }
      try {
        const connection = await connect();
        await initialize(connection);
        return await connection.transaction(async session => {
          await policyFactory(connection, session).confirm(input.policyVersion);
          const organizations = connection.collection('organizations');
          const thirdParties = connection.collection('third_parties');
          const memberships = connection.collection('organization_memberships');
          const associations = connection.collection('organization_associations');
          const organization = await organizations.findOne({ id: input.thirdPartyId, type: 'THIRD_PARTY', active: true }, { session });
          const thirdParty = await thirdParties.findOne({ _id: new Types.ObjectId(input.thirdPartyId), status: 'ACTIVE' }, { session });
          const actorAssociation = await associations.findOne({ subject: input.actorSubject, organizationId: input.thirdPartyId,
            capability: 'THIRD_PARTY_ADMIN', assigned: { $ne: false }, active: true }, { session });
          const actorMembership = actorAssociation && typeof actorAssociation.membershipId === 'string'
            ? await memberships.findOne({ id: actorAssociation.membershipId, subject: input.actorSubject, organizationId: input.thirdPartyId, status: 'ACTIVE' }, { session })
            : null;
          if (!organization || !thirdParty || !actorAssociation || !actorMembership) throw new DriverRepositoryError('FORBIDDEN');
          const orgFence = await organizations.updateOne({ id: input.thirdPartyId, type: 'THIRD_PARTY', active: true, revision: organization.revision },
            { $inc: { mutationFence: 1 } }, { session });
          const thirdPartyFence = await thirdParties.updateOne({ _id: new Types.ObjectId(input.thirdPartyId), status: 'ACTIVE', revision: thirdParty.revision },
            { $inc: { mutationFence: 1 } }, { session });
          const actorMembershipFence = await memberships.updateOne({ id: actorMembership.id, status: 'ACTIVE', revision: actorMembership.revision },
            { $inc: { mutationFence: 1 } }, { session });
          const actorAssociationFence = await associations.updateOne({ id: actorAssociation.id, active: true, revision: actorAssociation.revision },
            { $inc: { mutationFence: 1 } }, { session });
          if ([orgFence, thirdPartyFence, actorMembershipFence, actorAssociationFence].some(value => value.modifiedCount !== 1)) throw new DriverRepositoryError('FORBIDDEN');

          const raw = await driverModel(connection).findOne({ _id: new Types.ObjectId(input.id), thirdPartyId: input.thirdPartyId }).session(session).lean().exec();
          if (!raw) throw new DriverRepositoryError('NOT_FOUND');
          const driver = decode(raw as Record<string, unknown>);
          const membership = await currentMembership(connection, session, driver.membershipId, driver.subject, input.thirdPartyId);
          const role = membership && membership.status === 'ACTIVE'
            ? await activeDriverRole(connection, session, driver.membershipId, driver.subject, input.thirdPartyId) : null;
          // Eligibility for an activation must not depend on the current driver
          // status; an inactive driver is precisely the record being reactivated.
          const eligible = isDriverEligible({ driver: { ...driver, status: 'ACTIVE' }, membership: membership && role ? {
            id: String(membership.id), subject: String(membership.subject), organizationId: String(membership.organizationId),
            status: 'ACTIVE', roles: ['DRIVER'],
          } : null, thirdPartyActive: true });
          const changed = transitionDriver({ driver, expectedVersion: input.expectedVersion, status: input.status,
            actor: input.actor, now: new Date(), eligible });
          if (!changed.changed) return changed.driver;
          if (input.status === 'INACTIVE') {
            if (!input.assignmentRevision) throw new DriverRepositoryError('ASSIGNMENT_PROVIDER_UNAVAILABLE');
            await assignmentConfirmation(connection, session).confirmNoOpenForDriver({ driverId: driver.id,
              thirdPartyId: driver.thirdPartyId, revision: input.assignmentRevision });
          }
          const update = await driverModel(connection).updateOne({ _id: new Types.ObjectId(input.id), thirdPartyId: input.thirdPartyId,
            version: input.expectedVersion }, { $set: { status: changed.driver.status, version: changed.driver.version,
              updatedAt: changed.driver.updatedAt, updatedBy: changed.driver.updatedBy } }, { session, runValidators: true });
          if (update.modifiedCount !== 1) throw new DriverRepositoryError('VERSION_CONFLICT');
          const eventId = randomUUID(); const correlationId = randomUUID();
          await connection.collection('driver_management_events').insertOne({ eventId, correlationId, driverId: driver.id,
            membershipId: driver.membershipId, subject: driver.subject, thirdPartyId: driver.thirdPartyId, actorSubject: input.actor,
            action: input.status === 'ACTIVE' ? 'DRIVER_ACTIVATED' : 'DRIVER_DEACTIVATED', source: 'STATUS_TRANSITION',
            beforeVersion: driver.version, version: changed.driver.version, at: changed.driver.updatedAt }, { session });
          await recordFleetAudit(auditFactory(connection, session), { eventId, correlationId, at: changed.driver.updatedAt,
            action: input.status === 'ACTIVE' ? 'DRIVER_ACTIVATED' : 'DRIVER_DEACTIVATED', actorSubject: input.actorSubject,
            resourceType: 'driver', resourceId: driver.id, thirdPartyId: driver.thirdPartyId, beforeVersion: driver.version, afterVersion: changed.driver.version });
          return changed.driver;
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
      } catch (error) { return mapError(error); }
    },
  };
}
