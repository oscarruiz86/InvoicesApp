import { Types, type Connection } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { createMongoInvoiceSyncFactsReader } from '@/modules/invoice-sync/infrastructure/mongodb/sync-facts';

const id = (digit: string) => digit.repeat(24);

describe('invoice sync historical assignment facts', () => {
  it('returns only readable driver and vehicle labels for assignments owned by the supplied subject and third party', async () => {
    const assignmentRow = { _id: new Types.ObjectId(id('c')), vehicleId: id('d'), driverName: 'Ana conductora' };
    const vehicleRow = { _id: new Types.ObjectId(id('d')), plate: 'ABC123' };
    const assignmentFind = vi.fn(() => ({ toArray: async () => [assignmentRow] }));
    const vehicleFind = vi.fn(() => ({ toArray: async () => [vehicleRow] }));
    const connection = { collection: vi.fn((name: string) => ({ find: name === 'vehicle_assignments' ? assignmentFind : vehicleFind })) };
    const reader = createMongoInvoiceSyncFactsReader(async () => connection as unknown as Connection);

    await expect(reader.historyAssignments({ thirdPartyId: id('b'), assignments: [{ subject: 'driver-subject', assignmentId: id('c'), vehicleId: id('d') }] }))
      .resolves.toEqual([{ assignmentId: id('c'), driverName: 'Ana conductora', vehiclePlate: 'ABC123' }]);
    expect(assignmentFind).toHaveBeenCalledWith({ thirdPartyId: id('b'), $or: [{ _id: new Types.ObjectId(id('c')), vehicleId: id('d'), subject: 'driver-subject' }] },
      { projection: { _id: 1, vehicleId: 1, driverName: 1 } });
    expect(vehicleFind).toHaveBeenCalledWith({ thirdPartyId: id('b'), _id: { $in: [new Types.ObjectId(id('d'))] } }, { projection: { _id: 1, plate: 1 } });
    expect(JSON.stringify(await reader.historyAssignments({ thirdPartyId: id('b'), assignments: [] }))).toBe('[]');
  });
});
