import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { inspectDriverMigration, migrateDriverMemberships } from '@/modules/fleet/infrastructure/mongodb/driver-migration';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Isolated _test database required');
const database = 'driver_migration_' + randomUUID().replaceAll('-', '') + '_test';
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const now = new Date('2026-11-19T12:00:00.000Z');

beforeAll(async () => { await connection.asPromise(); });
afterAll(async () => {
  if (connection.readyState === 1 && /^driver_migration_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close();
});

async function addDriverMembership(label: string, thirdPartyActive = true) {
  const thirdPartyId = new mongoose.Types.ObjectId().toString();
  const membershipId = 'membership-' + label;
  const subject = 'subject-' + label;
  await connection.collection('organizations').insertOne({ id: thirdPartyId, type: 'THIRD_PARTY', active: thirdPartyActive, revision: 1, updatedAt: now });
  await connection.collection('third_parties').insertOne({ _id: new mongoose.Types.ObjectId(thirdPartyId),
    status: thirdPartyActive ? 'ACTIVE' : 'INACTIVE', revision: 1 });
  await connection.collection('organization_memberships').insertOne({ id: membershipId, subject, organizationId: thirdPartyId, status: 'ACTIVE', revision: 1 });
  await connection.collection('organization_associations').insertOne({ id: 'role-' + label, subject, organizationId: thirdPartyId,
    capability: 'DRIVER', assigned: true, active: true, revision: 1, membershipId });
  return { membershipId, subject, thirdPartyId };
}

it('migrates only active eligible memberships by membershipId and is idempotent', async () => {
  const eligible = await addDriverMembership('eligible');
  const inactive = await addDriverMembership('inactive', false);
  const inventory = await inspectDriverMigration(connection);
  expect(inventory).toMatchObject({ ready: true, consideredDriverRoles: 2, eligibleMemberships: 1, alreadyProvisioned: 0, ineligibleThirdParties: 1 });
  expect(inventory.conflicts).toEqual([]);
  expect(await connection.collection('drivers').countDocuments()).toBe(0);

  expect(await migrateDriverMemberships(connection, now)).toMatchObject({ migrated: 1, alreadyPresent: 0, ineligibleThirdParties: 1 });
  expect(await migrateDriverMemberships(connection, new Date(now.getTime() + 1000))).toMatchObject({ migrated: 0, alreadyPresent: 1, ineligibleThirdParties: 1 });
  const driver = await connection.collection('drivers').findOne({ membershipId: eligible.membershipId });
  expect(driver).toMatchObject({ subject: eligible.subject, thirdPartyId: eligible.thirdPartyId, status: 'ACTIVE', version: 1, createdBy: 'system:driver-migration' });
  expect(await connection.collection('drivers').findOne({ membershipId: inactive.membershipId })).toBeNull();
  expect(await connection.collection('driver_management_events').countDocuments({ membershipId: eligible.membershipId, action: 'DRIVER_MIGRATED' })).toBe(1);
});

it('reports missing membership links and mismatched existing Drivers without merging by subject or profile', async () => {
  const missingLink = await addDriverMembership('missing-link');
  await connection.collection('organization_associations').updateOne({ id: 'role-missing-link' }, { $unset: { membershipId: '' } });

  const mismatch = await addDriverMembership('mismatch');
  await connection.collection('drivers').insertOne({ _id: new mongoose.Types.ObjectId(), subject: 'different-subject',
    membershipId: mismatch.membershipId, thirdPartyId: mismatch.thirdPartyId, status: 'ACTIVE', version: 1,
    createdAt: now, updatedAt: now, createdBy: 'existing', updatedBy: null });

  const inventory = await inspectDriverMigration(connection);
  expect(inventory.ready).toBe(false);
  expect(inventory.conflicts).toEqual(expect.arrayContaining([
    { reason: 'DRIVER_ROLE_MISSING_MEMBERSHIP_ID', count: 1 },
    { reason: 'DRIVER_MEMBERSHIP_CONFLICT', count: 1 },
  ]));
  await expect(migrateDriverMemberships(connection)).rejects.toMatchObject({ code: 'MIGRATION_CONFLICT' });
  expect(await connection.collection('drivers').countDocuments({ membershipId: missingLink.membershipId })).toBe(0);
  expect(await connection.collection('drivers').findOne({ membershipId: mismatch.membershipId })).toMatchObject({ subject: 'different-subject' });
});
