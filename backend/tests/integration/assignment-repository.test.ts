import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createAssignment } from '@/modules/fleet/domain/assignment';
import { createAssignments } from '@/modules/fleet/application/assignments';
import { createDrivers } from '@/modules/fleet/application/drivers';
import { createVehicles } from '@/modules/fleet/application/vehicles';
import { createMongoAssignmentAccessReader, createMongoAssignmentAudit, createMongoAssignmentConfirmation, createMongoAssignmentPresenceReader, createMongoAssignmentRepository } from '@/modules/fleet/infrastructure/mongodb/assignment-repository';
import { createMongoInvoiceAssignmentAuthority } from '@/modules/fleet/infrastructure/mongodb/invoice-assignment-authority';
import { createDriverRepository, driverModel } from '@/modules/fleet/infrastructure/mongodb/driver-repository';
import { createVehicleRepository } from '@/modules/fleet/infrastructure/mongodb/vehicle-repository';
import { createPolicyRepository, policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { vehicleAuthorityConfirmation } from '@/modules/organizations/infrastructure/mongodb/vehicle-authority';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Isolated _test database required');
const database = `assignment_repository_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const connect = async () => connection;
let policyVersion = '1';
const assignments = createMongoAssignmentRepository(connect, (c, s) => ({ policy: policyConfirmation(c, s),
  authority: vehicleAuthorityConfirmation(c, s), audit: createMongoAssignmentAudit(c, s) }));
const drivers = createDriverRepository(connect, policyConfirmation, createMongoAssignmentConfirmation);
const presence = createMongoAssignmentPresenceReader(connect);
const invoiceAssignmentAuthority = createMongoInvoiceAssignmentAuthority(connect);
const vehicleRepository = createVehicleRepository(connect, (c, s) => ({ policy: policyConfirmation(c, s),
  authority: vehicleAuthorityConfirmation(c, s), assignments: createMongoAssignmentConfirmation(c, s) }));
const now = new Date('2026-11-20T12:00:00.000Z');
let vehicleSequence = 100;

beforeAll(async () => {
  await connection.asPromise();
  policyVersion = (await createPolicyRepository(connect).initialize()).version;
  await driverModel(connection).init();
});
afterAll(async () => {
  if (connection.readyState === 1 && /^assignment_repository_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close();
});

async function owner(label: string) {
  const thirdPartyId = new mongoose.Types.ObjectId().toString();
  const subject = `admin-${label}`, adminMembership = `admin-membership-${label}`;
  await connection.collection('organizations').insertOne({ id: thirdPartyId, type: 'THIRD_PARTY', active: true, revision: 1 });
  await connection.collection('third_parties').insertOne({ _id: new mongoose.Types.ObjectId(thirdPartyId), status: 'ACTIVE', revision: 1 });
  await connection.collection('organization_memberships').insertOne({ id: adminMembership, subject, organizationId: thirdPartyId, status: 'ACTIVE', revision: 1 });
  await connection.collection('organization_associations').insertOne({ id: `admin-role-${label}`, membershipId: adminMembership, subject,
    organizationId: thirdPartyId, capability: 'THIRD_PARTY_ADMIN', assigned: true, active: true, revision: 1 });
  return { thirdPartyId, subject, authority: { subject, thirdPartyId, policyVersion, contextRevision: null }, correlationId: randomUUID() };
}

async function participants(auth: Awaited<ReturnType<typeof owner>>, label: string) {
  const vehicleId = new mongoose.Types.ObjectId().toString(), driverId = new mongoose.Types.ObjectId().toString();
  const subject = `driver-${label}`, membershipId = `driver-membership-${label}`;
  const n = String(vehicleSequence++);
  await connection.collection('vehicles').insertOne({ _id: new mongoose.Types.ObjectId(vehicleId), thirdPartyId: auth.thirdPartyId,
    plate: `TST${n}`, internalNumber: `ASSIGN-${n}`, propertyCardNumber: `CARD-${n}`, status: 'ACTIVE', version: 1,
    createdAt: now, updatedAt: now, createdBy: auth.subject, updatedBy: auth.subject, mutationFence: 0 });
  await connection.collection('drivers').insertOne({ _id: new mongoose.Types.ObjectId(driverId), subject, membershipId, thirdPartyId: auth.thirdPartyId,
    status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now, createdBy: auth.subject, updatedBy: null, mutationFence: 0 });
  await connection.collection('organization_memberships').insertOne({ id: membershipId, subject, organizationId: auth.thirdPartyId, status: 'ACTIVE', revision: 1 });
  await connection.collection('organization_associations').insertOne({ id: `driver-role-${label}`, membershipId, subject,
    organizationId: auth.thirdPartyId, capability: 'DRIVER', assigned: true, active: true, revision: 1 });
  return { vehicleId, driverId, subject, plate: `TST${n}` };
}

function createInput(auth: Awaited<ReturnType<typeof owner>>, pair: Awaited<ReturnType<typeof participants>>) {
  const assignment = createAssignment({ id: new mongoose.Types.ObjectId().toString(), thirdPartyId: auth.thirdPartyId,
    vehicleId: pair.vehicleId, driverId: pair.driverId, subject: pair.subject, driverName: 'Driver Name', actor: auth.subject, now });
  return { authority: auth.authority, assignment, expectedDriverVersion: 1, expectedVehicleVersion: 1, correlationId: randomUUID() };
}

it('allows many-to-many active relations and arbitrates only duplicate pair races', async () => {
  const auth = await owner('unique');
  const first = await participants(auth, 'unique-one'), second = await participants(auth, 'unique-two');
  second.vehicleId = first.vehicleId;
  await assignments.create(createInput(auth, first));
  await assignments.create(createInput(auth, second));
  expect(await connection.collection('vehicle_assignments').countDocuments({ vehicleId: first.vehicleId, status: 'ACTIVE' })).toBe(2);

  const third = await participants(auth, 'unique-three'), anotherVehicle = await participants(auth, 'unique-four');
  third.driverId = anotherVehicle.driverId; third.subject = anotherVehicle.subject;
  await assignments.create(createInput(auth, third));
  await assignments.create(createInput(auth, anotherVehicle));
  expect(await connection.collection('vehicle_assignments').countDocuments({ driverId: third.driverId, status: 'ACTIVE' })).toBe(2);

  const raceFirst = await participants(auth, 'unique-race-first'), raceDuplicate = await participants(auth, 'unique-race-duplicate');
  raceDuplicate.vehicleId = raceFirst.vehicleId; raceDuplicate.driverId = raceFirst.driverId; raceDuplicate.subject = raceFirst.subject;
  const results = await Promise.allSettled([assignments.create(createInput(auth, raceFirst)), assignments.create(createInput(auth, raceDuplicate))]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'ACTIVE_ASSIGNMENT_CONFLICT' } });
});

it('rejects cross-third-party participant IDs without writing assignment or audit records', async () => {
  const authA = await owner('scope-a'), authB = await owner('scope-b');
  const foreign = await participants(authB, 'foreign');
  const input = createInput(authA, { ...foreign });
  await expect(assignments.create(input)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  expect(await connection.collection('vehicle_assignments').countDocuments({ thirdPartyId: authA.thirdPartyId })).toBe(0);
  expect(await connection.collection('assignment_events').countDocuments({ thirdPartyId: authA.thirdPartyId })).toBe(0);
});

it('confirms the chosen assignment only and fences close or deactivation in the same transaction', async () => {
  const auth = await owner('invoice-assignment'), first = await participants(auth, 'invoice-assignment-first');
  const second = await participants(auth, 'invoice-assignment-second');
  const wrongVehicle = await participants(auth, 'invoice-assignment-wrong-vehicle');
  second.vehicleId = first.vehicleId;
  const firstAssignment = await assignments.create(createInput(auth, first));
  await assignments.create(createInput(auth, second));

  const selected = await invoiceAssignmentAuthority.readOwnActive({ actorSubject: first.subject, thirdPartyId: auth.thirdPartyId,
    assignmentId: firstAssignment.id, vehicleId: first.vehicleId });
  expect(selected).toMatchObject({ assignmentId: firstAssignment.id, driverId: first.driverId, vehicleId: first.vehicleId, subject: first.subject });
  expect(await invoiceAssignmentAuthority.readOwnActive({ actorSubject: second.subject, thirdPartyId: auth.thirdPartyId,
    assignmentId: firstAssignment.id, vehicleId: first.vehicleId })).toBeNull();
  expect(await invoiceAssignmentAuthority.readOwnActive({ actorSubject: first.subject, thirdPartyId: auth.thirdPartyId,
    assignmentId: firstAssignment.id, vehicleId: wrongVehicle.vehicleId })).toBeNull();
  if (!selected) throw new Error('Invoice assignment evidence unavailable');

  const markerId = new mongoose.Types.ObjectId().toString();
  await connection.transaction(async session => {
    await invoiceAssignmentAuthority.confirmInTransaction({ ...selected, actorSubject: first.subject, policyVersion, contextRevision: null, transactionContext: { connection, session } });
    await connection.collection('invoice_assignment_confirmation_test').insertOne({ _id: new mongoose.Types.ObjectId(markerId),
      assignmentId: selected.assignmentId, driverId: selected.driverId }, { session });
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true } });
  expect(await connection.collection('invoice_assignment_confirmation_test').findOne({ _id: new mongoose.Types.ObjectId(markerId) }))
    .toMatchObject({ assignmentId: firstAssignment.id, driverId: first.driverId });

  const racing = await participants(auth, 'invoice-assignment-race');
  const raceAssignment = await assignments.create(createInput(auth, racing));
  const raceFacts = await invoiceAssignmentAuthority.readOwnActive({ actorSubject: racing.subject, thirdPartyId: auth.thirdPartyId,
    assignmentId: raceAssignment.id, vehicleId: racing.vehicleId });
  if (!raceFacts) throw new Error('Race assignment evidence unavailable');
  const confirmAndWrite = connection.transaction(async session => {
    await invoiceAssignmentAuthority.confirmInTransaction({ ...raceFacts, actorSubject: racing.subject, policyVersion, contextRevision: null, transactionContext: { connection, session } });
    await connection.collection('invoice_assignment_confirmation_test').insertOne({ _id: new mongoose.Types.ObjectId(), assignmentId: raceFacts.assignmentId }, { session });
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true } });
  const concurrentClose = assignments.close({ authority: auth.authority, id: raceAssignment.id, expectedVersion: 1, actor: auth.subject,
    now: new Date(now.getTime() + 1000), correlationId: randomUUID() });
  const outcomes = await Promise.allSettled([confirmAndWrite, concurrentClose]);
  expect(outcomes.some(result => result.status === 'fulfilled')).toBe(true);
  const markerCount = await connection.collection('invoice_assignment_confirmation_test').countDocuments({ assignmentId: raceFacts.assignmentId });
  const current = await assignments.find({ id: raceAssignment.id, thirdPartyId: auth.thirdPartyId });
  expect(markerCount === 0 || current?.version === 2).toBe(true);

  const deactivationPair = await participants(auth, 'invoice-assignment-deactivation');
  const deactivationAssignment = await assignments.create(createInput(auth, deactivationPair));
  const deactivationFacts = await invoiceAssignmentAuthority.readOwnActive({ actorSubject: deactivationPair.subject, thirdPartyId: auth.thirdPartyId,
    assignmentId: deactivationAssignment.id, vehicleId: deactivationPair.vehicleId });
  const activeEvidence = await presence.readForDriver({ driverId: deactivationPair.driverId, thirdPartyId: auth.thirdPartyId });
  if (!deactivationFacts || activeEvidence.state !== 'CONFIRMED') throw new Error('Deactivation evidence unavailable');
  const deactivationMarkerId = new mongoose.Types.ObjectId().toString();
  const confirmDuringDeactivation = connection.transaction(async session => {
    await invoiceAssignmentAuthority.confirmInTransaction({ ...deactivationFacts, actorSubject: deactivationPair.subject,
      policyVersion, contextRevision: null, transactionContext: { connection, session } });
    await connection.collection('invoice_assignment_confirmation_test').insertOne({ _id: new mongoose.Types.ObjectId(deactivationMarkerId),
      assignmentId: deactivationFacts.assignmentId }, { session });
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true } });
  const deactivateDriver = drivers.transition({ id: deactivationPair.driverId, thirdPartyId: auth.thirdPartyId,
    actorSubject: auth.subject, actor: auth.subject, expectedVersion: 1, status: 'INACTIVE', policyVersion, contextRevision: null,
    scope: { kind: 'organization', companyId: null, thirdPartyId: auth.thirdPartyId }, assignmentRevision: activeEvidence.revision });
  await Promise.allSettled([confirmDuringDeactivation, deactivateDriver]);
  const inactive = await connection.collection('drivers').findOne({ _id: new mongoose.Types.ObjectId(deactivationPair.driverId), status: 'INACTIVE' });
  const deactivationMarker = await connection.collection('invoice_assignment_confirmation_test').findOne({ _id: new mongoose.Types.ObjectId(deactivationMarkerId) });
  expect(Boolean(inactive && deactivationMarker)).toBe(false);
});

it('serializes concurrent assignment creation and driver deactivation', async () => {
  const auth = await owner('driver-race'), pair = await participants(auth, 'driver-race');
  const evidence = await presence.readForDriver({ driverId: pair.driverId, thirdPartyId: auth.thirdPartyId });
  if (evidence.state !== 'CONFIRMED') throw new Error('Test assignment evidence unavailable');
  const deactivation = drivers.transition({ id: pair.driverId, thirdPartyId: auth.thirdPartyId, actorSubject: auth.subject, actor: auth.subject,
    expectedVersion: 1, status: 'INACTIVE', policyVersion, contextRevision: null,
    scope: { kind: 'organization', companyId: null, thirdPartyId: auth.thirdPartyId }, assignmentRevision: evidence.revision });
  const results = await Promise.allSettled([assignments.create(createInput(auth, pair)), deactivation]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  const driver = await connection.collection('drivers').findOne({ _id: new mongoose.Types.ObjectId(pair.driverId) });
  const activeAssignments = await connection.collection('vehicle_assignments').countDocuments({ driverId: pair.driverId, status: 'ACTIVE' });
  expect(driver?.status === 'INACTIVE' && activeAssignments > 0).toBe(false);
});

it('rolls back assignment and participant changes when durable audit capture fails', async () => {
  const auth = await owner('audit-create'), pair = await participants(auth, 'audit-create');
  const failingAudit = createMongoAssignmentRepository(connect, (c, s) => ({ policy: policyConfirmation(c, s),
    authority: vehicleAuthorityConfirmation(c, s), audit: { async record() { throw new Error('audit unavailable'); } } }));
  await expect(failingAudit.create(createInput(auth, pair))).rejects.toMatchObject({ code: 'ASSIGNMENT_AUDIT_UNAVAILABLE' });
  expect(await connection.collection('vehicle_assignments').countDocuments({ thirdPartyId: auth.thirdPartyId })).toBe(0);
  expect(await connection.collection('drivers').findOne({ _id: new mongoose.Types.ObjectId(pair.driverId) })).toMatchObject({ mutationFence: 0 });
  expect(await connection.collection('vehicles').findOne({ _id: new mongoose.Types.ObjectId(pair.vehicleId) })).toMatchObject({ mutationFence: 0 });

  const created = await assignments.create(createInput(auth, pair));
  const failingClose = createMongoAssignmentRepository(connect, (c, s) => ({ policy: policyConfirmation(c, s),
    authority: vehicleAuthorityConfirmation(c, s), audit: { async record() { throw new Error('audit unavailable'); } } }));
  await expect(failingClose.close({ authority: auth.authority, id: created.id, expectedVersion: 1, actor: auth.subject,
    now: new Date(now.getTime() + 1000), correlationId: randomUUID() })).rejects.toMatchObject({ code: 'ASSIGNMENT_AUDIT_UNAVAILABLE' });
  expect(await assignments.find({ id: created.id, thirdPartyId: auth.thirdPartyId })).toMatchObject({ status: 'ACTIVE', version: 1 });
});

it('smokes assignment creation, Driver and Vehicle queries, blocked deactivation, explicit close, reassignment and audit', async () => {
  const auth = await owner('smoke'), pair = await participants(auth, 'smoke');
  const actor = { subject: auth.subject, roles: ['THIRD_PARTY_ADMIN'] as const, username: null, name: null, email: null, permissions: [] };
  const authorization = {
    async requirePermission() { return { policyVersion, contextRevision: null }; },
    async getEffectivePermissions() { return { subject: auth.subject, scope: { kind: 'organization', companyId: null, thirdPartyId: auth.thirdPartyId },
      roles: ['THIRD_PARTY_ADMIN'], permissions: ['vehicles:read', 'vehicles:deactivate'], policyVersion, contextRevision: null }; },
  };
  const identity = { async read(subject: string) { return { subject, enabled: true, email: null, emailVerified: true, fullName: 'Driver Name', documentType: 'CC' as const, documentNumber: '123456', profileComplete: true }; } };
  const driverService = createDrivers({ repository: drivers, facts: drivers, assignments: presence, authorization: authorization as never, identity });
  const vehicleService = createVehicles({ repository: vehicleRepository, assignments: createMongoAssignmentAccessReader(connect), drivers,
    authorization: authorization as never, policies: { async read() { return { version: policyVersion, grants: [
      { role: 'THIRD_PARTY_ADMIN', permission: 'vehicles:read', scope: 'third-party' },
      { role: 'THIRD_PARTY_ADMIN', permission: 'vehicles:deactivate', scope: 'third-party' },
    ] }; } }, correlationId: randomUUID });
  const assignmentService = createAssignments({ repository: assignments,
    authorization: { async authorize() { return { roles: ['THIRD_PARTY_ADMIN'], policyVersion, contextRevision: null }; } },
    drivers: { async read(input) {
      const driver = await drivers.find(input); if (!driver) return null;
      const eligibility = await drivers.eligibility({ subject: driver.subject, thirdPartyId: input.thirdPartyId });
      return { id: driver.id, thirdPartyId: driver.thirdPartyId, subject: driver.subject, displayName: 'Driver Name', version: driver.version, eligible: eligibility.eligible };
    } },
    vehicles: { async read(input) {
      const facts = await vehicleRepository.eligibility(input); return facts.vehicleId && facts.version !== null
        ? { id: facts.vehicleId, thirdPartyId: input.thirdPartyId, version: facts.version, eligible: facts.eligible, plate: facts.plate } : null;
    } }, ids: { next: () => new mongoose.Types.ObjectId().toString() }, clock: { now: () => now }, correlationId: randomUUID,
  });

  const created = await assignmentService.create(actor, { thirdPartyId: auth.thirdPartyId, vehicleId: pair.vehicleId, driverId: pair.driverId });
  expect(created.vehiclePlate).toBe(pair.plate);
  expect(await assignmentService.list(actor, { thirdPartyId: auth.thirdPartyId, page: 1, pageSize: 20, sort: 'startedAt', direction: 'desc', status: 'ACTIVE' }))
    .toMatchObject({ total: 1, items: [{ id: created.id, status: 'ACTIVE' }] });
  expect(await assignmentService.list(actor, { thirdPartyId: auth.thirdPartyId, page: 1, pageSize: 20, sort: 'startedAt', direction: 'desc',
    status: 'ACTIVE', q: pair.plate })).toMatchObject({ total: 1, items: [{ id: created.id, vehiclePlate: pair.plate }] });
  expect(await driverService.list(actor, { thirdPartyId: auth.thirdPartyId, page: 1, pageSize: 20, sort: 'createdAt', direction: 'desc' }))
    .toMatchObject({ total: 1, items: [{ driver: { id: pair.driverId, status: 'ACTIVE' }, identity: { name: 'Driver Name' } }] });
  expect(await vehicleService.list(actor, { thirdPartyId: auth.thirdPartyId, page: 1, pageSize: 20, sort: 'plate', direction: 'asc' }))
    .toMatchObject({ total: 1, items: [{ id: pair.vehicleId, assignmentState: 'ASSIGNED', currentDriver: { id: pair.driverId, name: 'Driver Name' },
      currentDrivers: [{ id: pair.driverId, name: 'Driver Name' }] }] });
  await expect(driverService.transition(actor, { id: pair.driverId, thirdPartyId: auth.thirdPartyId, expectedVersion: 1, status: 'INACTIVE' }))
    .rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(vehicleService.transition(actor, { id: pair.vehicleId, thirdPartyId: auth.thirdPartyId, expectedVersion: 1, status: 'INACTIVE' }))
    .rejects.toMatchObject({ code: 'VEHICLE_HAS_OPEN_ASSIGNMENT' });

  const closed = await assignmentService.close(actor, { id: created.id, thirdPartyId: auth.thirdPartyId, expectedVersion: 1 });
  expect(closed).toMatchObject({ status: 'CLOSED', version: 2, endedAt: now.toISOString() });
  const reassigned = await assignmentService.create(actor, { thirdPartyId: auth.thirdPartyId, vehicleId: pair.vehicleId, driverId: pair.driverId });
  expect(reassigned).toMatchObject({ status: 'ACTIVE', vehicleId: pair.vehicleId, driver: { id: pair.driverId } });
  const events = await connection.collection('assignment_events').find({ assignmentId: { $in: [created.id, reassigned.id] } }).toArray();
  expect(events).toHaveLength(3);
  expect(events.map(event => [event.assignmentId, event.action]).sort((a, b) => String(a[0]).localeCompare(String(b[0]) || String(a[1])))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual([
      [created.id, 'ASSIGNMENT_CLOSED'], [created.id, 'ASSIGNMENT_CREATED'], [reassigned.id, 'ASSIGNMENT_CREATED'],
    ].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
});
