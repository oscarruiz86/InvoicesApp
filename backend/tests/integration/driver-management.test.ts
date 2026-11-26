import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createDriverRepository, driverModel, provisionDriverInSession } from '@/modules/fleet/infrastructure/mongodb/driver-repository';
import { createMongoAssignmentConfirmation, createMongoAssignmentPresenceReader } from '@/modules/fleet/infrastructure/mongodb/assignment-repository';
import { createPolicyRepository, policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { grantCeiling } from '@/modules/identity/domain/permissions';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Isolated _test database required');
const database = 'driver_management_' + randomUUID().replaceAll('-', '') + '_test';
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const connect = async () => connection;
const policies = createPolicyRepository(connect);
const repository = createDriverRepository(connect, policyConfirmation, createMongoAssignmentConfirmation);
const assignmentPresence = createMongoAssignmentPresenceReader(connect);
const now = new Date('2026-11-19T12:00:00.000Z');
const adminSubject = 'third-party-admin';
let policyVersion = '1';

beforeAll(async () => {
  await connection.asPromise();
  policyVersion = (await policies.initialize()).version;
  await driverModel(connection).init();
  await connection.collection('driver_management_events').createIndex({ eventId: 1 }, { unique: true });
  await connection.collection('driver_management_events').createIndex({ thirdPartyId: 1, at: 1, eventId: 1 });
});

afterAll(async () => {
  if (connection.readyState === 1 && /^driver_management_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close();
});

async function createEligibleDriver(label: string) {
  const thirdPartyId = new mongoose.Types.ObjectId().toString();
  const subject = 'driver-' + label;
  const membershipId = 'membership-' + label;
  await connection.collection('organizations').insertOne({ id: thirdPartyId, type: 'THIRD_PARTY', name: 'Tercero de prueba',
    active: true, revision: 1, updatedAt: now });
  await connection.collection('third_parties').insertOne({ _id: new mongoose.Types.ObjectId(thirdPartyId), status: 'ACTIVE',
    revision: 1, mutationFence: 0 });
  await connection.collection('organization_memberships').insertMany([
    { id: membershipId, subject, organizationId: thirdPartyId, status: 'ACTIVE', revision: 1 },
    { id: 'admin-membership-' + label, subject: adminSubject, organizationId: thirdPartyId, status: 'ACTIVE', revision: 1 },
  ]);
  await connection.collection('organization_associations').insertMany([
    { id: 'driver-role-' + label, subject, organizationId: thirdPartyId, capability: 'DRIVER', assigned: true,
      active: true, revision: 1, membershipId },
    { id: 'admin-role-' + label, subject: adminSubject, organizationId: thirdPartyId, capability: 'THIRD_PARTY_ADMIN',
      assigned: true, active: true, revision: 1, membershipId: 'admin-membership-' + label },
  ]);
  const driverId = new mongoose.Types.ObjectId().toString();
  let driver;
  await connection.transaction(async session => {
    driver = await provisionDriverInSession(connection, session, { id: driverId, subject, membershipId, thirdPartyId,
      actor: adminSubject, now, source: 'INVITATION' });
  });
  return { driver: driver!, thirdPartyId, subject, membershipId };
}

const transition = async (input: { id: string; thirdPartyId: string; subject: string }, status: 'ACTIVE' | 'INACTIVE', expectedVersion: number) => {
  const evidence = status === 'INACTIVE' ? await assignmentPresence.readForDriver({ driverId: input.id, thirdPartyId: input.thirdPartyId }) : null;
  if (evidence?.state === 'UNAVAILABLE') throw new Error('Assignment presence unavailable in test');
  return repository.transition({ id: input.id, thirdPartyId: input.thirdPartyId, actorSubject: adminSubject, expectedVersion, status, actor: adminSubject,
    policyVersion, contextRevision: null, scope: { kind: 'organization', companyId: null, thirdPartyId: input.thirdPartyId },
    ...(evidence?.state === 'CONFIRMED' ? { assignmentRevision: evidence.revision } : {}),
  });
};

it('enforces unique membership ownership and records a durable local provisioning event', async () => {
  const first = await createEligibleDriver('unique');
  const duplicate = await connection.transaction(session => provisionDriverInSession(connection, session, {
    id: new mongoose.Types.ObjectId().toString(), subject: first.subject, membershipId: first.membershipId,
    thirdPartyId: first.thirdPartyId, actor: adminSubject, now, source: 'MEMBERSHIP',
  }));
  expect(duplicate.id).toBe(first.driver.id);
  await expect(connection.transaction(session => provisionDriverInSession(connection, session, {
    id: new mongoose.Types.ObjectId().toString(), subject: 'other-subject', membershipId: first.membershipId,
    thirdPartyId: first.thirdPartyId, actor: adminSubject, now, source: 'MEMBERSHIP',
  }))).rejects.toMatchObject({ code: 'DUPLICATE_MEMBERSHIP' });
  expect(await connection.collection('drivers').countDocuments({ membershipId: first.membershipId })).toBe(1);
  expect(await connection.collection('driver_management_events').countDocuments({ membershipId: first.membershipId })).toBe(1);
  expect(await connection.collection('audit_events').countDocuments({ membershipId: first.membershipId })).toBe(0);
  const localEvent = await connection.collection('driver_management_events').findOne({ membershipId: first.membershipId });
  expect(await connection.collection('audit_events').findOne({ _id: localEvent!.eventId as never })).toMatchObject({ source: 'fleet',
    action: 'DRIVER_PROVISIONED', resource: { type: 'driver', id: first.driver.id }, scope: { thirdPartyId: first.thirdPartyId } });
  expect(await connection.collection('audit_events').findOne({ _id: localEvent!.eventId as never })).not.toHaveProperty('subject');
});

it('versions status changes, keeps no-op requests quiet, and rejects stale versions', async () => {
  const seeded = await createEligibleDriver('version');
  const inactive = await transition({ id: seeded.driver.id, thirdPartyId: seeded.thirdPartyId, subject: seeded.subject }, 'INACTIVE', 1);
  expect(inactive).toMatchObject({ status: 'INACTIVE', version: 2, updatedBy: adminSubject });
  const eventCount = await connection.collection('driver_management_events').countDocuments({ driverId: seeded.driver.id });
  const noOp = await transition({ id: seeded.driver.id, thirdPartyId: seeded.thirdPartyId, subject: seeded.subject }, 'INACTIVE', 2);
  expect(noOp).toMatchObject({ status: 'INACTIVE', version: 2 });
  expect(await connection.collection('driver_management_events').countDocuments({ driverId: seeded.driver.id })).toBe(eventCount);
  const reactivated = await transition({ id: seeded.driver.id, thirdPartyId: seeded.thirdPartyId, subject: seeded.subject }, 'ACTIVE', 2);
  expect(reactivated).toMatchObject({ status: 'ACTIVE', version: 3, updatedBy: adminSubject });
  await expect(transition({ id: seeded.driver.id, thirdPartyId: seeded.thirdPartyId, subject: seeded.subject }, 'ACTIVE', 1))
    .rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
});

it('rechecks membership eligibility and actor authority inside the mutation transaction', async () => {
  const seeded = await createEligibleDriver('revoked');
  await transition({ id: seeded.driver.id, thirdPartyId: seeded.thirdPartyId, subject: seeded.subject }, 'INACTIVE', 1);
  await connection.collection('organization_memberships').updateOne({ id: seeded.membershipId }, { $set: { status: 'INACTIVE' } });
  await expect(transition({ id: seeded.driver.id, thirdPartyId: seeded.thirdPartyId, subject: seeded.subject }, 'ACTIVE', 2))
    .rejects.toMatchObject({ code: 'MEMBERSHIP_NOT_ELIGIBLE' });

  const second = await createEligibleDriver('authority-revoked');
  await connection.collection('organization_associations').updateOne({ organizationId: second.thirdPartyId, subject: adminSubject },
    { $set: { active: false } });
  await expect(transition({ id: second.driver.id, thirdPartyId: second.thirdPartyId, subject: second.subject }, 'INACTIVE', 1))
    .rejects.toMatchObject({ code: 'FORBIDDEN' });
});

it('rejects a stale authorization policy version before changing Driver', async () => {
  const seeded = await createEligibleDriver('stale-policy');
  const priorVersion = policyVersion;
  await policies.replace(priorVersion, grantCeiling, {
    eventId: randomUUID(), correlationId: randomUUID(), at: now.toISOString(), subject: adminSubject,
    action: 'POLICY_CHANGED', result: 'allowed', reason: 'POLICY', suppressed: 0, beforeVersion: priorVersion,
    permission: 'roles:manage', scope: { kind: 'global', companyId: null, thirdPartyId: null },
    resource: { type: 'authorization-policy', id: 'active' },
  });
  await expect(transition({ id: seeded.driver.id, thirdPartyId: seeded.thirdPartyId, subject: seeded.subject }, 'INACTIVE', 1))
    .rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  expect(await connection.collection('drivers').findOne({ _id: new mongoose.Types.ObjectId(seeded.driver.id) })).toMatchObject({ status: 'ACTIVE', version: 1 });
});

it('publishes read-only eligibility facts and excludes inactive driver, membership, or third party', async () => {
  const operationalCollections = ['assignments', 'vehicles', 'invoices'];
  const countOperationalRecords = async () => Promise.all(operationalCollections.map(name => connection.collection(name).countDocuments({})));
  const countsBefore = await countOperationalRecords();

  const driverInactive = await createEligibleDriver('facts-driver-inactive');
  expect(await repository.eligibility({ subject: driverInactive.subject, thirdPartyId: driverInactive.thirdPartyId })).toMatchObject({
    driverId: driverInactive.driver.id, eligible: true, driverStatus: 'ACTIVE', membershipRevision: 1, thirdPartyRevision: 1,
  });
  await connection.collection('drivers').updateOne({ _id: new mongoose.Types.ObjectId(driverInactive.driver.id) }, { $set: { status: 'INACTIVE' }, $inc: { version: 1 } });
  expect(await repository.eligibility({ subject: driverInactive.subject, thirdPartyId: driverInactive.thirdPartyId })).toMatchObject({
    driverId: driverInactive.driver.id, eligible: false, driverStatus: 'INACTIVE',
  });

  const membershipInactive = await createEligibleDriver('facts-membership-inactive');
  await connection.collection('organization_memberships').updateOne({ id: membershipInactive.membershipId }, { $set: { status: 'INACTIVE' }, $inc: { revision: 1 } });
  expect(await repository.eligibility({ subject: membershipInactive.subject, thirdPartyId: membershipInactive.thirdPartyId })).toMatchObject({
    driverId: membershipInactive.driver.id, eligible: false, driverStatus: 'ACTIVE', membershipRevision: 2,
  });

  const organizationInactive = await createEligibleDriver('facts-organization-inactive');
  await connection.collection('organizations').updateOne({ id: organizationInactive.thirdPartyId }, { $set: { active: false } });
  expect(await repository.eligibility({ subject: organizationInactive.subject, thirdPartyId: organizationInactive.thirdPartyId })).toMatchObject({
    driverId: organizationInactive.driver.id, eligible: false, driverStatus: 'ACTIVE',
  });

  const recordInactive = await createEligibleDriver('facts-record-inactive');
  await connection.collection('third_parties').updateOne({ _id: new mongoose.Types.ObjectId(recordInactive.thirdPartyId) }, { $set: { status: 'INACTIVE' }, $inc: { revision: 1 } });
  expect(await repository.eligibility({ subject: recordInactive.subject, thirdPartyId: recordInactive.thirdPartyId })).toMatchObject({
    driverId: recordInactive.driver.id, eligible: false, driverStatus: 'ACTIVE', thirdPartyRevision: 2,
  });

  const missingDriver = await createEligibleDriver('facts-missing-driver');
  await connection.collection('drivers').deleteOne({ membershipId: missingDriver.membershipId });
  expect(await repository.eligibility({ subject: missingDriver.subject, thirdPartyId: missingDriver.thirdPartyId })).toMatchObject({
    driverId: null, eligible: false, driverStatus: null,
  });
  expect(await countOperationalRecords()).toEqual(countsBefore);
});
