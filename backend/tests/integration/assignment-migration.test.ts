import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { applyAssignmentMigration, inspectAssignmentMigration, rollbackAssignmentMigration } from '@/modules/fleet/infrastructure/mongodb/assignment-migration';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Isolated _test database required');
const database = 'assignment_migration_' + randomUUID().replaceAll('-', '') + '_test';
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const createdAt = new Date('2026-11-01T12:00:00.000Z');

beforeAll(async () => { await connection.asPromise(); });
afterAll(async () => {
  if (connection.readyState === 1 && /^assignment_migration_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close();
});

it('backfills trusted timestamps and missing versions, quarantines invalid references, and restores exact snapshots on rollback', async () => {
  const thirdPartyId = new mongoose.Types.ObjectId().toString();
  const vehicleId = new mongoose.Types.ObjectId();
  const driverId = new mongoose.Types.ObjectId();
  const invalidVehicleId = new mongoose.Types.ObjectId();
  const validId = new mongoose.Types.ObjectId();
  const invalidId = new mongoose.Types.ObjectId();
  const valid = { _id: validId, thirdPartyId, vehicleId: vehicleId.toString(), driverId: driverId.toString(),
    subject: 'driver-a', driverName: 'Driver A', status: 'ACTIVE', createdAt };
  const invalid = { _id: invalidId, thirdPartyId, vehicleId: invalidVehicleId.toString(), driverId: driverId.toString(),
    subject: 'driver-a', driverName: 'Driver A', status: 'ACTIVE', createdAt };
  await connection.collection('vehicles').insertOne({ _id: vehicleId, thirdPartyId, status: 'ACTIVE' });
  await connection.collection('drivers').insertOne({ _id: driverId, thirdPartyId, subject: 'driver-a', status: 'ACTIVE' });
  await connection.collection('vehicle_assignments').insertMany([valid, invalid]);

  const inventory = await inspectAssignmentMigration(connection, 'test-migration');
  expect(inventory).toMatchObject({ total: 2, candidates: [{ id: validId.toString(), changes: ['startedAt', 'version', 'createdBy'] }] });
  expect(inventory.quarantined.map(value => value.id)).toEqual([invalidId.toString()]);

  await expect(applyAssignmentMigration(connection, 'test-migration')).resolves.toMatchObject({ backfilled: 1, quarantined: [expect.objectContaining({ id: invalidId.toString() })] });
  expect(await connection.collection('vehicle_assignments').findOne({ _id: validId })).toMatchObject({ startedAt: createdAt, version: 1, createdBy: 'system:assignment-migration' });
  expect(await connection.collection('vehicle_assignments').findOne({ _id: invalidId })).toBeNull();
  expect(await connection.collection('vehicle_assignment_quarantine').countDocuments({ migrationId: 'test-migration' })).toBe(1);

  await expect(rollbackAssignmentMigration(connection, 'test-migration')).resolves.toEqual({ migrationId: 'test-migration', restored: 2 });
  expect(await connection.collection('vehicle_assignments').find({}).sort({ _id: 1 }).toArray()).toEqual([valid, invalid]);
  expect(await connection.collection('vehicle_assignment_quarantine').countDocuments({ migrationId: 'test-migration' })).toBe(0);
});
