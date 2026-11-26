import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createVehicleRepository } from '@/modules/fleet/infrastructure/mongodb/vehicle-repository';
import { inventoryVehicles } from '@/modules/fleet/infrastructure/mongodb/vehicle-inventory';
import { vehicleAuthorityConfirmation } from '@/modules/organizations/infrastructure/mongodb/vehicle-authority';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';
import { policyConfirmation, createPolicyRepository } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { unavailableAssignments } from '@/modules/fleet/infrastructure/unavailable-assignments';
const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Isolated _test database required');
const database = `vehicle_management_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const connect = async () => connection;
const repository = createVehicleRepository(connect, (c, s) => ({ policy: policyConfirmation(c, s), authority: vehicleAuthorityConfirmation(c, s), assignments: unavailableAssignments, audit: createMongoAuditWriter(c, s) }));
let version = '1';
beforeAll(async () => { await connection.asPromise(); version = (await createPolicyRepository(connect).initialize()).version; });
afterAll(async () => { if (connection.readyState === 1 && /^vehicle_management_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase(); await connection.close(); });
async function owner() {
  const thirdPartyId = new mongoose.Types.ObjectId().toString(), subject = randomUUID(), membershipId = randomUUID();
  await connection.collection('organizations').insertOne({ id: thirdPartyId, type: 'THIRD_PARTY', active: true, revision: 1 });
  await connection.collection('third_parties').insertOne({ _id: new mongoose.Types.ObjectId(thirdPartyId), status: 'ACTIVE', revision: 1 });
  await connection.collection('organization_memberships').insertOne({ id: membershipId, subject, organizationId: thirdPartyId, status: 'ACTIVE', revision: 1 });
  await connection.collection('organization_associations').insertOne({ id: randomUUID(), membershipId, subject, organizationId: thirdPartyId, capability: 'THIRD_PARTY_ADMIN', assigned: true, active: true, revision: 1 });
  return { authority: { subject, thirdPartyId, policyVersion: version, contextRevision: null }, correlationId: randomUUID() };
}
let sequence = 100;
const fields = () => { const n = String(sequence++); return { plate: `ABC${n}`, internalNumber: `000${n}`, propertyCardNumber: `0000${n}` }; };
it('arbitrates concurrent global identifiers and per-owner internal numbers, including inactive rows', async () => {
  const first = await owner(), second = await owner(), identifiers = fields();
  const results = await Promise.allSettled([repository.create({ ...first, fields: identifiers }), repository.create({ ...second, fields: { ...identifiers, propertyCardNumber: 'OTHER' } })]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'VEHICLE_IDENTIFIER_CONFLICT' } });
  const a = await repository.create({ ...first, fields: fields() });
  await repository.create({ ...second, fields: { ...fields(), internalNumber: a.internalNumber } });
  await expect(repository.create({ ...first, fields: { ...fields(), internalNumber: a.internalNumber } })).rejects.toMatchObject({ code: 'VEHICLE_IDENTIFIER_CONFLICT' });
  await connection.collection('vehicles').updateOne({ _id: new mongoose.Types.ObjectId(a.id) }, { $set: { status: 'INACTIVE' } });
  await expect(repository.create({ ...second, fields: { ...fields(), propertyCardNumber: a.propertyCardNumber } })).rejects.toMatchObject({ code: 'VEHICLE_IDENTIFIER_CONFLICT' });
  const raced = fields();
  const cards = await Promise.allSettled([repository.create({ ...first, fields: raced }), repository.create({ ...second, fields: { ...raced, plate: 'ZZZ987' } })]);
  expect(cards.filter(r => r.status === 'fulfilled')).toHaveLength(1);
});
it('versions own edits, keeps no-ops quiet and isolates IDs and paginated assignment filters', async () => {
  const auth = await owner(), record = await repository.create({ ...auth, fields: fields() });
  const input = { ...auth, id: record.id, expectedVersion: 1, changes: { plate: record.plate } };
  expect(await repository.update(input)).toMatchObject({ version: 1 });
  const localCreate = await connection.collection('vehicle_management_events').findOne({ vehicleId: record.id });
  expect(localCreate).toBeTruthy();
  const centralCreate = await connection.collection('audit_events').findOne({ _id: localCreate!.eventId as never });
  expect(centralCreate).toMatchObject({ source: 'fleet', action: 'VEHICLE_CREATED', resource: { type: 'vehicle', id: record.id }, scope: { thirdPartyId: auth.authority.thirdPartyId } });
  expect(centralCreate).not.toHaveProperty('plate'); expect(centralCreate).not.toHaveProperty('propertyCardNumber');
  expect(await repository.update({ ...input, changes: { internalNumber: 'NEW' } })).toMatchObject({ version: 2, internalNumber: 'NEW' });
  const localUpdate = await connection.collection('vehicle_management_events').findOne({ vehicleId: record.id, version: 2 });
  expect(await connection.collection('audit_events').findOne({ _id: localUpdate!.eventId as never })).toMatchObject({ action: 'VEHICLE_UPDATED', afterVersion: '2' });
  await expect(repository.update(input)).rejects.toMatchObject({ code: 'VEHICLE_VERSION_CONFLICT' });
  expect(await repository.find({ id: record.id, thirdPartyId: new mongoose.Types.ObjectId().toString() })).toBeNull();
  const query = { thirdPartyId: record.thirdPartyId, page: 1, pageSize: 1, sort: 'plate' as const, direction: 'asc' as const };
  expect(await repository.list({ ...query, assignedVehicleIds: [] })).toMatchObject({ total: 0, items: [] });
  expect(await repository.list({ ...query, assignedVehicleIds: [record.id] })).toMatchObject({ total: 1, items: [{ id: record.id }] });
  expect(await repository.list({ ...query, q: '.*' })).toMatchObject({ total: 0 });
  expect(await repository.eligibility({ id: record.id, thirdPartyId: record.thirdPartyId })).toMatchObject({ eligible: true, version: 2 });
});
it('rolls back vehicle state and its local capture when the central Audit writer fails', async () => {
  const auth = await owner();
  const failingRepository = createVehicleRepository(connect, (c, s) => ({ policy: policyConfirmation(c, s), authority: vehicleAuthorityConfirmation(c, s),
    assignments: unavailableAssignments, audit: { async record() { throw new Error('AUDIT_UNAVAILABLE'); } } }));
  const vehiclesBefore = await connection.collection('vehicles').countDocuments();
  const eventsBefore = await connection.collection('vehicle_management_events').countDocuments();
  await expect(failingRepository.create({ ...auth, fields: fields() })).rejects.toThrow();
  expect(await connection.collection('vehicles').countDocuments()).toBe(vehiclesBefore);
  expect(await connection.collection('vehicle_management_events').countDocuments()).toBe(eventsBefore);
});
it('confirms policy, membership, association and third-party fences before writes', async () => {
  for (const target of ['policy', 'membership', 'association', 'organization', 'thirdParty']) {
    const auth = await owner(), record = await repository.create({ ...auth, fields: fields() });
    if (target === 'membership') await connection.collection('organization_memberships').updateOne({ subject: auth.authority.subject }, { $set: { status: 'INACTIVE' }, $inc: { revision: 1 } });
    if (target === 'association') await connection.collection('organization_associations').updateOne({ subject: auth.authority.subject }, { $set: { active: false }, $inc: { revision: 1 } });
    if (target === 'organization') await connection.collection('organizations').updateOne({ id: auth.authority.thirdPartyId }, { $set: { active: false }, $inc: { revision: 1 } });
    if (target === 'thirdParty') await connection.collection('third_parties').updateOne({ _id: new mongoose.Types.ObjectId(auth.authority.thirdPartyId) }, { $set: { status: 'INACTIVE' }, $inc: { revision: 1 } });
    if (target === 'policy') auth.authority.policyVersion = '999';
    await expect(repository.update({ ...auth, id: record.id, expectedVersion: 1, changes: { internalNumber: 'REVOKED' } })).rejects.toMatchObject({ code: target === 'policy' ? 'AUTHORIZATION_UNAVAILABLE' : 'FORBIDDEN' });
    expect(await repository.find({ id: record.id, thirdPartyId: record.thirdPartyId })).toMatchObject({ version: 1, internalNumber: record.internalNumber });
  }
});
it('rolls back functional writes on durable event capture failure', async () => {
  const auth = await owner(), record = await repository.create({ ...auth, fields: fields() });
  await connection.collection('vehicle_management_events').createIndex({ vehicleId: 1 }, { unique: true, partialFilterExpression: { vehicleId: record.id } });
  try {
    await expect(repository.update({ ...auth, id: record.id, expectedVersion: 1, changes: { internalNumber: 'ROLLED-BACK' } })).rejects.toMatchObject({ code: 'VEHICLE_STORAGE_UNAVAILABLE' });
    expect(await repository.find({ id: record.id, thirdPartyId: record.thirdPartyId })).toMatchObject({ version: 1, internalNumber: record.internalNumber });
  } finally { await connection.collection('vehicle_management_events').dropIndex('vehicleId_1'); }
});
it('revalidates policy, membership, association, organization and third-party authority at commit', async () => {
  const stale = await owner();
  await expect(repository.create({ ...stale, authority: { ...stale.authority, policyVersion: '999999' }, fields: fields() })).rejects.toMatchObject({ code: 'AUTHORIZATION_UNAVAILABLE' });
  for (const collection of ['organization_memberships', 'organization_associations', 'organizations', 'third_parties']) {
    const auth = await owner();
    const filter = collection === 'organizations' ? { id: auth.authority.thirdPartyId } : collection === 'third_parties' ? { _id: new mongoose.Types.ObjectId(auth.authority.thirdPartyId) } : { subject: auth.authority.subject };
    const change = collection === 'organizations' || collection === 'organization_associations' ? { active: false } : { status: 'INACTIVE' };
    await connection.collection(collection).updateOne(filter, { $set: change, $inc: { revision: 1 } });
    await expect(repository.create({ ...auth, fields: fields() })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await connection.collection('vehicles').countDocuments({ thirdPartyId: auth.authority.thirdPartyId })).toBe(0);
    expect(await connection.collection('vehicle_management_events').countDocuments({ thirdPartyId: auth.authority.thirdPartyId })).toBe(0);
  }
});
it('arbitrates concurrent internal numbers inside one owner and concurrent versioned edits', async () => {
  const auth = await owner(), first = fields(), second = { ...fields(), internalNumber: first.internalNumber };
  const created = await Promise.allSettled([repository.create({ ...auth, fields: first }), repository.create({ ...auth, fields: second })]);
  expect(created.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  const record = created.find(r => r.status === 'fulfilled')!;
  if (record.status !== 'fulfilled') throw new Error('Missing winner');
  const changes = await Promise.allSettled(['ONE', 'TWO'].map(value => repository.update({ ...auth, id: record.value.id, expectedVersion: 1, changes: { internalNumber: value } })));
  expect(changes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(changes.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'VEHICLE_VERSION_CONFLICT' } });
});
it('fails closed without assignment confirmation; a coordinated double can deactivate and reactivate', async () => {
  const auth = await owner(), record = await repository.create({ ...auth, fields: fields() });
  await expect(repository.transition({ ...auth, id: record.id, expectedVersion: 1, status: 'INACTIVE' })).rejects.toMatchObject({ code: 'ASSIGNMENT_PROVIDER_UNAVAILABLE' });
  const withDouble = createVehicleRepository(connect, (c, s) => ({ policy: policyConfirmation(c, s), authority: vehicleAuthorityConfirmation(c, s), assignments: {
    async confirmNoOpenForVehicle(input) { expect(input).toMatchObject({ vehicleId: record.id, revision: 'test-only' }); },
  }, audit: createMongoAuditWriter(c, s) }));
  expect(await withDouble.transition({ ...auth, id: record.id, expectedVersion: 1, status: 'INACTIVE', assignmentRevision: 'test-only' })).toMatchObject({ version: 2, status: 'INACTIVE' });
  expect(await repository.eligibility({ id: record.id, thirdPartyId: record.thirdPartyId })).toMatchObject({ eligible: false });
  expect(await repository.transition({ ...auth, id: record.id, expectedVersion: 2, status: 'ACTIVE' })).toMatchObject({ version: 3, status: 'ACTIVE' });
});
it('inventories empty, valid, incomplete and normalized duplicate data without writes', async () => {
  const inventoryDb = mongoose.createConnection(uri!, { dbName: `vehicle_management_${randomUUID().replaceAll('-', '')}_test` });
  await inventoryDb.asPromise();
  try {
    expect(await inventoryVehicles(inventoryDb)).toMatchObject({ total: 0, ready: true });
    const valid = { ...fields(), thirdPartyId: new mongoose.Types.ObjectId().toString(), status: 'ACTIVE', version: 1, createdAt: new Date(), updatedAt: new Date(), createdBy: 'a', updatedBy: 'a' };
    await inventoryDb.collection('vehicles').insertOne({ ...valid });
    expect(await inventoryVehicles(inventoryDb)).toMatchObject({ total: 1, ready: true });
    await inventoryDb.collection('vehicles').insertMany([{ ...valid, plate: valid.plate.toLowerCase() }, { plate: 'INCOMPLETE' }]);
    const before = await inventoryDb.collection('vehicles').find({}).toArray();
    expect(await inventoryVehicles(inventoryDb)).toMatchObject({ total: 3, ready: false, invalidIds: [expect.any(String)], nonCanonicalIds: [expect.any(String)], duplicateIds: [expect.any(String), expect.any(String)] });
    expect(await inventoryDb.collection('vehicles').find({}).toArray()).toEqual(before);
    expect(await inventoryDb.collection('vehicles').indexes()).toHaveLength(1);
  } finally { await inventoryDb.dropDatabase(); await inventoryDb.close(); }
});
