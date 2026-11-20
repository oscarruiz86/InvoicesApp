import { Types } from 'mongoose';
import { expect, it } from 'vitest';
import { inspectAssignmentMigration } from '@/modules/fleet/infrastructure/mongodb/assignment-migration';

const id = () => new Types.ObjectId();
const thirdPartyId = id().toString();
const startedAt = new Date('2026-11-01T12:00:00.000Z');

function fakeConnection(rows: Record<string, unknown>[], vehicles: Record<string, unknown>[], drivers: Record<string, unknown>[]) {
  const values: Record<string, Record<string, unknown>[]> = { vehicle_assignments: rows, vehicles, drivers };
  const collection = (name: string) => ({ find: () => {
    const cursor = { sort: () => cursor, toArray: async () => values[name] ?? [] };
    return cursor;
  } });
  return { db: { collection }, collection } as never;
}

function participantRows(vehicleId: Types.ObjectId, driverId: Types.ObjectId, subject = 'driver-subject') {
  return {
    vehicles: [{ _id: vehicleId, thirdPartyId, status: 'ACTIVE' }],
    drivers: [{ _id: driverId, thirdPartyId, subject, status: 'ACTIVE' }],
  };
}

function legacyRow(vehicleId: Types.ObjectId, driverId: Types.ObjectId, subject = 'driver-subject') {
  return { _id: id(), thirdPartyId, vehicleId: vehicleId.toString(), driverId: driverId.toString(), subject,
    driverName: 'Driver', status: 'ACTIVE', createdAt: startedAt };
}

it('plans a reversible backfill from a trusted creation timestamp and defaults only a missing version', async () => {
  const vehicleId = id(), driverId = id();
  const refs = participantRows(vehicleId, driverId);
  const inventory = await inspectAssignmentMigration(fakeConnection([legacyRow(vehicleId, driverId)], refs.vehicles, refs.drivers), 'migration-test');
  expect(inventory).toMatchObject({ total: 1, ready: true, quarantined: [] });
  expect(inventory.candidates[0].normalized).toMatchObject({ startedAt, version: 1, status: 'ACTIVE' });
  expect(inventory.candidates[0].changes).toEqual(['startedAt', 'version', 'createdBy']);
});

it('quarantines invalid references, cross-third-party participants and untrusted timestamps instead of guessing', async () => {
  const vehicleId = id(), driverId = id();
  const invalidReference = legacyRow(id(), driverId);
  const otherParty = legacyRow(vehicleId, driverId);
  otherParty.thirdPartyId = id().toString();
  const noTimestamp: Record<string, unknown> = legacyRow(vehicleId, driverId);
  delete noTimestamp.createdAt;
  const refs = participantRows(vehicleId, driverId);
  const inventory = await inspectAssignmentMigration(fakeConnection([invalidReference, otherParty, noTimestamp], refs.vehicles, refs.drivers));
  expect(inventory.candidates).toEqual([]);
  expect(inventory.quarantined).toHaveLength(3);
  expect(inventory.quarantined.map(item => item.reasons)).toEqual(expect.arrayContaining([
    ['VEHICLE_REFERENCE_MISSING_OR_CROSS_THIRD_PARTY', 'DRIVER_REFERENCE_MISSING_OR_CROSS_THIRD_PARTY'],
    ['MISSING_TRUSTED_START_TIME'],
  ]));
});

it('allows shared participants but quarantines duplicate ACTIVE pairs during preflight', async () => {
  const vehicleId = id(), anotherVehicleId = id(), firstDriverId = id(), secondDriverId = id();
  const first = legacyRow(vehicleId, firstDriverId, 'first');
  const second = legacyRow(vehicleId, secondDriverId, 'second');
  const third = legacyRow(anotherVehicleId, firstDriverId, 'first');
  const refs = {
    vehicles: [{ _id: vehicleId, thirdPartyId, status: 'ACTIVE' }, { _id: anotherVehicleId, thirdPartyId, status: 'ACTIVE' }],
    drivers: [
      { _id: firstDriverId, thirdPartyId, subject: 'first', status: 'ACTIVE' },
      { _id: secondDriverId, thirdPartyId, subject: 'second', status: 'ACTIVE' },
    ],
  };
  const inventory = await inspectAssignmentMigration(fakeConnection([first, second, third], refs.vehicles, refs.drivers));
  expect(inventory.candidates).toHaveLength(3);
  expect(inventory.quarantined).toEqual([]);

  const duplicate = legacyRow(vehicleId, firstDriverId, 'first');
  const duplicateInventory = await inspectAssignmentMigration(fakeConnection([first, duplicate], refs.vehicles, refs.drivers));
  expect(duplicateInventory.candidates).toEqual([]);
  expect(duplicateInventory.quarantined).toHaveLength(2);
  expect(duplicateInventory.quarantined.every(item => item.reasons.includes('DUPLICATE_ACTIVE_PAIR'))).toBe(true);
});
