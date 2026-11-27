import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createCatalogRepository } from '@/modules/parametric-catalogs/infrastructure/mongodb/catalog-repository';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Isolated _test database required');
const database = `catalog_audit_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const repository = createCatalogRepository(async () => connection, () => ({
  async read() { return { version: '1', grants: [
    { role: 'APP_ADMIN', permission: 'roles:read', scope: 'global' },
    { role: 'APP_ADMIN', permission: 'roles:manage', scope: 'global' },
  ] }; },
  async confirm() {},
}), createMongoAuditWriter);

beforeAll(async () => { await connection.asPromise(); });
beforeEach(async () => {
  await connection.collection('parametric_catalog_entries').deleteMany({});
  await connection.collection('parametric_catalog_events').deleteMany({});
  await connection.collection('audit_events').deleteMany({});
});
afterAll(async () => { if (connection.readyState === 1 && /^catalog_audit_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase(); await connection.close(); });

it('writes created, updated and deactivated catalog evidence atomically without labels', async () => {
  await repository.createEntry({ catalog: 'countries', code: 'ZZ', label: 'Label privado', parentCode: null, actor: 'admin:test', policyVersion: '1' });
  await repository.updateLabel({ catalog: 'countries', code: 'ZZ', parentCode: null, label: 'Nuevo label privado', expectedVersion: 1, actor: 'admin:test', policyVersion: '1' });
  await repository.deactivateEntry({ catalog: 'countries', code: 'ZZ', parentCode: null, expectedVersion: 2, actor: 'admin:test', policyVersion: '1' });
  const local = await connection.collection('parametric_catalog_events').find({ catalog: 'countries' }).sort({ at: 1 }).toArray();
  const central = await connection.collection('audit_events').find({ source: 'parametric-catalogs' }).sort({ occurredAt: 1 }).toArray();
  expect(central).toHaveLength(3);
  expect(central.map(event => event._id)).toEqual(local.map(event => event.eventId));
  expect(central.map(event => event.action)).toEqual(['CATALOG_ENTRY_CREATED', 'CATALOG_ENTRY_UPDATED', 'CATALOG_ENTRY_DEACTIVATED']);
  expect(central.map(event => event.afterVersion)).toEqual(['1', '2', '3']);
  expect(JSON.stringify(central)).not.toContain('label privado');
});
