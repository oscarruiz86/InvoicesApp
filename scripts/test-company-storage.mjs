import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { startCompanyMongo } from './company-mongo-fixture.mjs';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const mongoose = require('mongoose');
const { companyReadiness, requireCompanyStorage } = await import('../backend/src/modules/organizations/infrastructure/mongodb/company-readiness.ts');
for (const replicaSet of [true, false]) {
  const fixture = await startCompanyMongo({ replicaSet });
  const database = `company_storage_${randomUUID().replaceAll('-', '')}_test`;
  const connection = mongoose.createConnection(fixture.uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
  try {
    await connection.asPromise();
    if (!replicaSet) {
      await assert.rejects(requireCompanyStorage(connection), /COMPANY_STORAGE_UNAVAILABLE/);
      continue;
    }
    assert.deepEqual(await companyReadiness(connection), { ready: true, incompatibleIds: [] });
    const companies = connection.collection('companies');
    const organizations = connection.collection('organizations');
    await companies.createIndex({ documentType: 1, documentNumber: 1 }, { unique: true });
    await organizations.createIndex({ id: 1 }, { unique: true });
    const id = new mongoose.Types.ObjectId();
    await connection.transaction(async session => {
      await companies.insertOne({ _id: id, documentType: 'NIT', documentNumber: '001' }, { session });
      await organizations.insertOne({ id: id.toString(), type: 'COMPANY' }, { session });
    }, { writeConcern: { w: 'majority', j: true } });
    assert.equal(await companies.countDocuments(), 1);
    assert.equal((await companyReadiness(connection)).ready, true);
    await assert.rejects(connection.transaction(async session => {
      await companies.insertOne({ documentType: 'NIT', documentNumber: '002' }, { session });
      await organizations.insertOne({ id: 'aborted', type: 'COMPANY' }, { session });
      throw new Error('intentional rollback');
    }), /intentional rollback/);
    assert.equal(await companies.countDocuments(), 1);
    assert.equal(await organizations.countDocuments(), 1);
    await organizations.insertOne({ id: 'legacy-company', type: 'COMPANY' });
    assert.deepEqual(await companyReadiness(connection), { ready: false, incompatibleIds: ['legacy-company'] });
    await assert.rejects(requireCompanyStorage(connection), /COMPANY_STORAGE_UNAVAILABLE/);
    assert.equal(await organizations.countDocuments(), 2);
    console.log('Company storage: transaction commit/rollback and read-only compatibility check passed.');
  } finally {
    if (connection.readyState === 1 && connection.name === database && /^company_storage_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
    await connection.close(); await fixture.stop();
  }
}
console.log('Company storage: standalone rejected; isolated containers removed.');
