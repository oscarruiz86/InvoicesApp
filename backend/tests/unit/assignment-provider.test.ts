import { expect, it, vi } from 'vitest';
import { createMongoAssignmentConfirmation, createMongoAssignmentReader } from '@/modules/fleet/infrastructure/mongodb/assignment-provider';
import { VehicleUseCaseError } from '@/modules/fleet/application/vehicles';

const thirdPartyId = 'a'.repeat(24);
const vehicleId = 'b'.repeat(24);
const driverId = 'c'.repeat(24);
const active = { vehicleId, thirdPartyId, subject: 'driver-subject', driverId, driverName: 'Conductor', status: 'ACTIVE' };

function fakeConnection(rows: readonly Record<string, unknown>[]) {
  const find = vi.fn((filter: Record<string, unknown>) => ({
    sort: () => ({ toArray: async () => rows.filter(row => Object.entries(filter).every(([key, value]) => row[key] === value)) }),
  }));
  const connection = { collection: vi.fn(() => ({ createIndex: vi.fn(async () => 'index'), find })) };
  return { connection, find };
}

it('reads active assignments as confirmed evidence and applies filters', async () => {
  const f = fakeConnection([active, { ...active, vehicleId: 'd'.repeat(24), status: 'ENDED' }]);
  const reader = createMongoAssignmentReader(async () => f.connection as never);
  await expect(reader.read({ thirdPartyId, vehicleId })).resolves.toMatchObject({ state: 'CONFIRMED', assignments: [{ vehicleId, driverId }] });
  expect(f.find).toHaveBeenCalledWith({ thirdPartyId, status: 'ACTIVE', vehicleId }, { session: undefined });
});

it('confirms absence and rejects an active assignment inside the transaction session', async () => {
  const empty = fakeConnection([]);
  const confirmation = createMongoAssignmentConfirmation(empty.connection as never, { id: 'session' } as never);
  await expect(confirmation.confirmNoOpen({ vehicleId, thirdPartyId, revision: 'known' })).resolves.toBeUndefined();
  const occupied = fakeConnection([active]);
  const blocked = createMongoAssignmentConfirmation(occupied.connection as never, { id: 'session' } as never);
  await expect(blocked.confirmNoOpen({ vehicleId, thirdPartyId, revision: 'known' })).rejects.toMatchObject({ code: 'VEHICLE_HAS_OPEN_ASSIGNMENT' });
});

it('fails closed for malformed assignment documents or unavailable storage', async () => {
  const malformed = fakeConnection([{ ...active, driverId: 'invalid' }]);
  const reader = createMongoAssignmentReader(async () => malformed.connection as never);
  await expect(reader.read({ thirdPartyId })).rejects.toMatchObject({ code: 'ASSIGNMENT_PROVIDER_UNAVAILABLE' });
  const unavailable = createMongoAssignmentReader(async () => { throw new Error('offline'); });
  await expect(unavailable.read({ thirdPartyId })).rejects.toMatchObject({ code: 'ASSIGNMENT_PROVIDER_UNAVAILABLE' });
  await expect(unavailable.read({ thirdPartyId: 'bad' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  expect(new VehicleUseCaseError('ASSIGNMENT_PROVIDER_UNAVAILABLE')).toBeInstanceOf(Error);
});
