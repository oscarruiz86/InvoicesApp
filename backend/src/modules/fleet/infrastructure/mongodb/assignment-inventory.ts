import { Types, type Connection } from 'mongoose';

export interface AssignmentInventory {
  readonly total: number;
  readonly invalidIds: readonly string[];
  readonly duplicateActiveIds: readonly string[];
  readonly ready: boolean;
}

/** Read-only inspection used before enforcing the active-assignment indexes. */
export async function inventoryAssignments(connection: Connection): Promise<AssignmentInventory> {
  const rows = await connection.collection('vehicle_assignments').find({}).toArray();
  const invalidIds: string[] = [], duplicates = new Set<string>();
  const activePairs = new Map<string, string>();
  for (const row of rows) {
    const id = String(row._id);
    const valid = row._id instanceof Types.ObjectId
      && typeof row.thirdPartyId === 'string' && /^[a-f0-9]{24}$/.test(row.thirdPartyId)
      && typeof row.vehicleId === 'string' && /^[a-f0-9]{24}$/.test(row.vehicleId)
      && typeof row.driverId === 'string' && /^[a-f0-9]{24}$/.test(row.driverId)
      && typeof row.subject === 'string' && row.subject.length > 0 && row.subject.length <= 128
      && typeof row.driverName === 'string' && row.driverName.length > 0 && row.driverName.length <= 200
      && (row.status === 'ACTIVE' || row.status === 'CLOSED')
      && Number.isSafeInteger(row.version) && Number(row.version) >= 1
      && row.startedAt instanceof Date && Number.isFinite(row.startedAt.getTime())
      && (row.status === 'ACTIVE' ? row.endedAt === undefined || row.endedAt === null : row.endedAt instanceof Date && Number.isFinite(row.endedAt.getTime()));
    if (!valid) { invalidIds.push(id); continue; }
    if (row.status !== 'ACTIVE') continue;
    const pair = `${row.thirdPartyId}:${row.vehicleId}:${row.driverId}`;
    const prior = activePairs.get(pair);
    if (prior) { duplicates.add(prior); duplicates.add(id); } else activePairs.set(pair, id);
  }
  return { total: rows.length, invalidIds, duplicateActiveIds: [...duplicates], ready: !invalidIds.length && !duplicates.size };
}
