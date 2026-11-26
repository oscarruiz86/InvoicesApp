import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createMongoParameterRepository, inventoryParameters } from '@/modules/configuration/infrastructure/mongodb/parameter-repository';
import { createPolicyRepository, policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { grantCeiling } from '@/modules/identity/domain/permissions';
const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('MONGODB_TEST_URI must name an isolated _test database');
const database = `configuration_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const policies = createPolicyRepository(async () => connection);
let policyVersion = '1';
const repository = createMongoParameterRepository(async () => connection, undefined, policyConfirmation);
beforeAll(async () => { await connection.asPromise(); });
beforeEach(async () => {
  await connection.collection('functional_parameters').deleteMany({}); await connection.collection('configuration_events').deleteMany({}); await connection.collection('audit_events').deleteMany({});
  await policies.initialize();
  const current = await connection.collection('authorization_policies').findOne({ _id: 'active' as never });
  if (JSON.stringify(current?.grants) !== JSON.stringify(grantCeiling)) {
    await connection.collection('authorization_policies').updateOne({ _id: 'active' as never }, { $set: { grants: grantCeiling }, $inc: { version: 1 } });
  }
  policyVersion = String((await policies.read()).version);
});
afterAll(async () => { if (connection.readyState === 1 && /^configuration_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase(); await connection.close(); });

it('inventories malformed and duplicate keys without modifying collections', async () => {
  const isolated = mongoose.createConnection(uri!, { dbName: `configuration_inventory_${randomUUID().replaceAll('-', '')}_test` }); await isolated.asPromise();
  try {
    await isolated.collection('functional_parameters').insertMany([
      { key: 'invoice.manual-edit-window-seconds', scope: 'global', value: 43200 },
      { key: 'invoice.manual-edit-window-seconds', scope: 'global', value: 0 },
      { key: 'unknown.setting', scope: 'global', value: 1 },
    ]);
    const before = await isolated.collection('functional_parameters').find({}).toArray();
    const indexesBefore = await isolated.collection('functional_parameters').listIndexes().toArray();
    expect(await inventoryParameters(isolated)).toMatchObject({ ready: false, issues: expect.arrayContaining(['duplicate:global:invoice.manual-edit-window-seconds', 'invalid:global:invoice.manual-edit-window-seconds', 'unknown-key:unknown.setting']) });
    expect(await isolated.collection('functional_parameters').find({}).toArray()).toEqual(before);
    expect(await isolated.collection('functional_parameters').listIndexes().toArray()).toEqual(indexesBefore);
  } finally { await isolated.dropDatabase(); await isolated.close(); }
});

it('creates unique parameter and event indexes when the repository becomes ready', async () => {
  await repository.list({ page: 1, pageSize: 20 });
  const parameterIndexes = await connection.collection('functional_parameters').listIndexes().toArray();
  const eventIndexes = await connection.collection('configuration_events').listIndexes().toArray();
  expect(parameterIndexes).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'functional_parameters_scope_key_unique', unique: true })]));
  expect(eventIndexes).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'configuration_events_event_id_unique', unique: true })]));
  expect(eventIndexes).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'configuration_events_timeline' })]));
});

it('initializes once, preserves an edited value, versions updates and keeps no-op history quiet', async () => {
  expect(await repository.initialize('technical:test', randomUUID())).toBe(true);
  const initial = await repository.find('invoice.manual-edit-window-seconds');
  expect(initial).toMatchObject({ value: 43200, version: 1, createdBy: 'technical:test' });
  expect(await repository.update({ key: initial!.key, expectedVersion: 1, value: 21600, actor: 'admin:test', correlationId: randomUUID(), policyVersion })).toMatchObject({ value: 21600, version: 2 });
  expect(await repository.initialize('technical:repeat', randomUUID())).toBe(false);
  await expect(repository.update({ key: initial!.key, expectedVersion: 1, value: 43200, actor: 'admin:test', correlationId: randomUUID(), policyVersion })).rejects.toMatchObject({ code: 'PARAMETER_VERSION_CONFLICT' });
  const before = await repository.history(initial!.key, 1, 100);
  expect(before).toMatchObject({ total: 2 });
  expect(await repository.update({ key: initial!.key, expectedVersion: 2, value: 21600, actor: 'admin:test', correlationId: randomUUID(), policyVersion })).toMatchObject({ version: 2 });
  expect((await repository.history(initial!.key, 1, 100)).total).toBe(2);
  const central = await connection.collection('audit_events').find({ source: 'configuration' }).sort({ occurredAt: 1 }).toArray();
  expect(central).toHaveLength(2);
  expect(central[0]).toMatchObject({ action: 'PARAMETER_INITIALIZED', resource: { type: 'functional-parameter', id: 'invoice:manual-edit-window-seconds' }, beforeVersion: '0', afterVersion: '1' });
  expect(central[1]).toMatchObject({ action: 'PARAMETER_UPDATED', beforeVersion: '1', afterVersion: '2' });
  expect(JSON.stringify(central)).not.toContain('43200');
  expect(JSON.stringify(central)).not.toContain('21600');
});

it('rolls back initialization and updates when their audit event cannot be written', async () => {
  const key = 'invoice.manual-edit-window-seconds';
  await connection.collection('configuration_events').insertOne({ eventId: 'collision', correlationId: 'seed', key, actor: 'seed', at: new Date(), previousValue: 43200, value: 43200, previousVersion: 0, version: 1 });
  const collisionRepository = createMongoParameterRepository(async () => connection, { next: () => 'collision' }, policyConfirmation);

  await expect(collisionRepository.initialize('technical:test', randomUUID())).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  expect(await connection.collection('functional_parameters').findOne({ key, scope: 'global' })).toBeNull();
  expect(await connection.collection('configuration_events').countDocuments({})).toBe(1);

  await repository.initialize('technical:test', randomUUID());
  await expect(collisionRepository.update({ key, expectedVersion: 1, value: 21600, actor: 'admin:test', correlationId: randomUUID(), policyVersion }))
    .rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  expect(await repository.find(key)).toMatchObject({ value: 43200, version: 1 });
  expect((await repository.history(key, 1, 100)).total).toBe(2);
});

it('rejects an administrator write if its authorization policy was revoked before the transaction commits', async () => {
  const key = 'invoice.manual-edit-window-seconds';
  await repository.initialize('technical:test', randomUUID());
  await connection.collection('authorization_policies').updateOne({ _id: 'active' as never }, { $set: { grants: grantCeiling.filter(grant => grant.permission !== 'parameters:update') }, $inc: { version: 1 } });
  await expect(repository.update({ key, expectedVersion: 1, value: 21600, actor: 'admin:test', correlationId: randomUUID(), policyVersion }))
    .rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await repository.find(key)).toMatchObject({ value: 43200, version: 1 });
  expect((await repository.history(key, 1, 100)).total).toBe(1);
});

it('serializes policy confirmation against an administrator update on the same fenced document', async () => {
  await repository.initialize('technical:test', randomUUID());
  const row = await repository.find('invoice.manual-edit-window-seconds');
  let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void; const waiting = new Promise<void>(resolve => { entered = resolve; });
  const confirm = connection.transaction(async session => {
    await repository.confirm({ key: row!.key, revision: String(row!.version), session: { connection, session } });
    entered(); await barrier;
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true } });
  await waiting;
  const update = repository.update({ key: row!.key, expectedVersion: row!.version, value: 86400, actor: 'admin:race', correlationId: randomUUID(), policyVersion });
  release();
  const outcomes = await Promise.allSettled([confirm, update]);
  expect(outcomes.some(result => result.status === 'fulfilled')).toBe(true);
  const current = await repository.find(row!.key);
  expect(current?.value === 43200 || current?.value === 86400).toBe(true);
  expect(current?.version === 1 || current?.version === 2).toBe(true);
  expect((await repository.history(row!.key, 1, 100)).total).toBe(current?.version === 2 ? 2 : 1);
});
