import { Types, type Connection } from 'mongoose';
import { normalizeVehicleFields } from '../../domain/vehicle';
export interface VehicleInventory { readonly total: number; readonly invalidIds: readonly string[]; readonly nonCanonicalIds: readonly string[]; readonly duplicateIds: readonly string[]; readonly ready: boolean }
/** Read-only: no model initialization, index creation, defaulting or functional writes. */
export async function inventoryVehicles(connection: Connection): Promise<VehicleInventory> {
  const rows = await connection.collection('vehicles').find({}).toArray();
  const invalidIds: string[] = [], nonCanonicalIds: string[] = [], duplicateIds = new Set<string>();
  const seen = new Map<string, string>();
  for (const row of rows) {
    const id = String(row._id);
    try {
      const fields = normalizeVehicleFields({ plate: row.plate, internalNumber: row.internalNumber, propertyCardNumber: row.propertyCardNumber });
      if (!(row._id instanceof Types.ObjectId) || !/^[a-f0-9]{24}$/.test(String(row.thirdPartyId)) || !['ACTIVE', 'INACTIVE'].includes(row.status)
        || !Number.isSafeInteger(row.version) || row.version < 1 || !(row.createdAt instanceof Date) || !(row.updatedAt instanceof Date)
        || !Number.isFinite(row.createdAt.getTime()) || !Number.isFinite(row.updatedAt.getTime())
        || typeof row.createdBy !== 'string' || !row.createdBy || typeof row.updatedBy !== 'string' || !row.updatedBy) invalidIds.push(id);
      if (Object.entries(fields).some(([key, value]) => row[key] !== value)) nonCanonicalIds.push(id);
      for (const key of [`plate:${fields.plate}`, `card:${fields.propertyCardNumber}`, `internal:${row.thirdPartyId}:${fields.internalNumber}`]) {
        const prior = seen.get(key);
        if (prior) { duplicateIds.add(prior); duplicateIds.add(id); } else seen.set(key, id);
      }
    } catch { invalidIds.push(id); }
  }
  return { total: rows.length, invalidIds, nonCanonicalIds, duplicateIds: [...duplicateIds], ready: !invalidIds.length && !nonCanonicalIds.length && !duplicateIds.size };
}
