import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createMongoParameterRepository, inventoryParameters } from '@/modules/configuration/infrastructure/mongodb/parameter-repository';
const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('MONGODB_TEST_URI must name an isolated _test database');
const database = `configuration_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const repository = createMongoParameterRepository(async () => connection);
beforeAll(async () => { await connection.asPromise(); });
beforeEach(async () => { await connection.collection('functional_parameters').deleteMany({}); await connection.collection('configuration_events').deleteMany({}); });
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
    expect(await inventoryParameters(isolated)).toMatchObject({ ready: false, issues: expect.arrayContaining(['duplicate:global:invoice.manual-edit-window-seconds', 'invalid:global:invoice.manual-edit-window-seconds', 'unknown-key:unknown.setting']) });
    expect(await isolated.collection('functional_parameters').find({}).toArray()).toEqual(before);
  } finally { await isolated.dropDatabase(); await isolated.close(); }
});

it('initializes once, preserves an edited value, versions updates and keeps no-op history quiet', async () => {
  expect(await repository.initialize('technical:test', randomUUID())).toBe(true);
  const initial = await repository.find('invoice.manual-edit-window-seconds');
  expect(initial).toMatchObject({ value: 43200, version: 1, createdBy: 'technical:test' });
  expect(await repository.update({ key: initial!.key, expectedVersion: 1, value: 21600, actor: 'admin:test', correlationId: randomUUID() })).toMatchObject({ value: 21600, version: 2 });
  expect(await repository.initialize('technical:repeat', randomUUID())).toBe(false);
  await expect(repository.update({ key: initial!.key, expectedVersion: 1, value: 43200, actor: 'admin:test', correlationId: randomUUID() })).rejects.toMatchObject({ code: 'PARAMETER_VERSION_CONFLICT' });
  const before = await repository.history(initial!.key, 1, 100);
  expect(before).toMatchObject({ total: 2 });
  expect(await repository.update({ key: initial!.key, expectedVersion: 2, value: 21600, actor: 'admin:test', correlationId: randomUUID() })).toMatchObject({ version: 2 });
  expect((await repository.history(initial!.key, 1, 100)).total).toBe(2);
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
  const update = connection.transaction(async session => {
    const current = await connection.collection('functional_parameters').findOne({ key: row!.key, scope: 'global' }, { session });
    await connection.collection('functional_parameters').updateOne({ key: row!.key, version: current!.version }, { $set: { value: 86400, version: current!.version + 1, effectiveFrom: new Date(), updatedAt: new Date(), updatedBy: 'admin:race' }, $inc: { mutationFence: 1 } }, { session });
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true } });
  release();
  const outcomes = await Promise.allSettled([confirm, update]);
  expect(outcomes.some(result => result.status === 'fulfilled')).toBe(true);
  const current = await repository.find(row!.key);
  expect(current?.value === 43200 || current?.value === 86400).toBe(true);
  expect(current?.version === 1 || current?.version === 2).toBe(true);
});
