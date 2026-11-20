import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Types, type Connection } from 'mongoose';
import type { Collection, Document } from 'mongodb';

const idPattern = /^[a-f0-9]{24}$/;
const migrationCollection = 'vehicle_assignment_migrations';
const backupCollection = 'vehicle_assignment_migration_backups';
const quarantineCollection = 'vehicle_assignment_quarantine';
function collection(connection: Connection, name: string): Collection<Document> {
  if (!connection.db) throw new Error('ASSIGNMENT_MIGRATION_STORAGE_UNAVAILABLE');
  return connection.db.collection(name);
}

export interface AssignmentMigrationCandidate {
  readonly id: string;
  readonly normalized: Record<string, unknown>;
  readonly changes: readonly string[];
}

export interface AssignmentMigrationInventory {
  readonly migrationId: string;
  readonly total: number;
  readonly candidates: readonly AssignmentMigrationCandidate[];
  readonly quarantined: readonly { readonly id: string; readonly originalId: unknown; readonly reasons: readonly string[] }[];
  readonly ready: boolean;
}

function isDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function normalize(row: Record<string, unknown>): { normalized?: Record<string, unknown>; changes: string[]; reasons: string[] } {
  const changes: string[] = [];
  const reasons: string[] = [];
  if (!(row._id instanceof Types.ObjectId)) reasons.push('INVALID_ID');
  for (const field of ['thirdPartyId', 'vehicleId', 'driverId'] as const) {
    if (typeof row[field] !== 'string' || !idPattern.test(row[field] as string)) reasons.push(`INVALID_${field.replace(/[A-Z]/g, match => `_${match}`).toUpperCase()}`);
  }
  if (typeof row.subject !== 'string' || row.subject.length < 1 || row.subject.length > 128) reasons.push('INVALID_SUBJECT');
  if (typeof row.driverName !== 'string' || row.driverName.trim().length < 1 || row.driverName.length > 200) reasons.push('INVALID_DRIVER_NAME');
  if (row.status !== 'ACTIVE' && row.status !== 'CLOSED') reasons.push('INVALID_STATUS');

  const startedAt = isDate(row.startedAt) ? row.startedAt : isDate(row.createdAt) ? row.createdAt : null;
  if (!startedAt) reasons.push('MISSING_TRUSTED_START_TIME');
  else if (row.startedAt !== startedAt) changes.push('startedAt');

  let version = row.version;
  if (version === undefined || version === null) { version = 1; changes.push('version'); }
  else if (!Number.isSafeInteger(version) || Number(version) < 1) reasons.push('INVALID_VERSION');

  if (row.status === 'CLOSED' && !isDate(row.endedAt)) reasons.push('MISSING_TRUSTED_END_TIME');
  if (row.status === 'ACTIVE' && row.endedAt !== undefined && row.endedAt !== null) reasons.push('ACTIVE_HAS_END_TIME');
  if (row.status === 'ACTIVE' && row.closedBy !== undefined && row.closedBy !== null) reasons.push('ACTIVE_HAS_CLOSER');

  if (reasons.length) return { changes, reasons };
  const createdBy = typeof row.createdBy === 'string' && row.createdBy.trim() && row.createdBy.length <= 128
    ? row.createdBy : 'system:assignment-migration';
  if (createdBy !== row.createdBy) changes.push('createdBy');
  const closedBy = row.status === 'CLOSED'
    ? typeof row.closedBy === 'string' && row.closedBy.trim() && row.closedBy.length <= 128 ? row.closedBy : 'system:assignment-migration'
    : null;
  if (row.status === 'CLOSED' && closedBy !== row.closedBy) changes.push('closedBy');
  const normalized: Record<string, unknown> = { ...row, startedAt, version, createdBy, closedBy };
  if (row.status === 'ACTIVE') { delete normalized.endedAt; delete normalized.closedBy; }
  return { normalized: { ...normalized, _id: row._id }, changes, reasons };
}

/** Read-only preflight. Invalid references and rows with ambiguous timestamps are quarantined, never repaired by guessing. */
export async function inspectAssignmentMigration(connection: Connection, migrationId: string = randomUUID()): Promise<AssignmentMigrationInventory> {
  if (!connection.db) throw new Error('ASSIGNMENT_MIGRATION_STORAGE_UNAVAILABLE');
  const [rows, vehicles, drivers] = await Promise.all([
    collection(connection, 'vehicle_assignments').find({}).sort({ _id: 1 }).toArray(),
    collection(connection, 'vehicles').find({}).toArray(),
    collection(connection, 'drivers').find({}).toArray(),
  ]);
  const vehicleById = new Map(vehicles.map(value => [String(value._id), value]));
  const driverById = new Map(drivers.map(value => [String(value._id), value]));
  const candidates: AssignmentMigrationCandidate[] = [];
  const quarantined = new Map<string, { originalId: unknown; reasons: string[] }>();
  const activePairs = new Map<string, string>();

  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const id = String(row._id);
    const result = normalize(row);
    const reasons = [...result.reasons];
    if (result.normalized) {
      const vehicle = vehicleById.get(String(row.vehicleId));
      const driver = driverById.get(String(row.driverId));
      if (!vehicle || vehicle.thirdPartyId !== row.thirdPartyId) reasons.push('VEHICLE_REFERENCE_MISSING_OR_CROSS_THIRD_PARTY');
      if (!driver || driver.thirdPartyId !== row.thirdPartyId || driver.subject !== row.subject)
        reasons.push('DRIVER_REFERENCE_MISSING_OR_CROSS_THIRD_PARTY');
      if (row.status === 'ACTIVE' && vehicle?.status !== 'ACTIVE') reasons.push('ACTIVE_ASSIGNMENT_VEHICLE_INACTIVE');
      if (row.status === 'ACTIVE' && driver?.status !== 'ACTIVE') reasons.push('ACTIVE_ASSIGNMENT_DRIVER_INACTIVE');
    }
    if (row.status === 'ACTIVE' && result.normalized && !reasons.length) {
      const pair = `${String(row.thirdPartyId)}:${String(row.vehicleId)}:${String(row.driverId)}`;
      const prior = activePairs.get(pair);
      if (prior) {
        const key = 'DUPLICATE_ACTIVE_PAIR';
        const priorItem = quarantined.get(prior);
        if (priorItem) priorItem.reasons.push(key);
        else {
          const priorRow = rows.find(value => String(value._id) === prior);
          quarantined.set(prior, { originalId: priorRow?._id, reasons: [key] });
        }
        reasons.push(key);
      } else {
        activePairs.set(pair, id);
      }
    }
    if (reasons.length || !result.normalized) quarantined.set(id, { originalId: row._id, reasons: [...new Set(reasons.length ? reasons : ['INVALID_DOCUMENT'])] });
    else candidates.push({ id, normalized: result.normalized, changes: result.changes });
  }

  const conflictedIds = new Set(quarantined.keys());
  return {
    migrationId,
    total: rows.length,
    candidates: candidates.filter(candidate => !conflictedIds.has(candidate.id)),
    quarantined: [...quarantined].map(([id, item]) => ({ id, originalId: item.originalId, reasons: [...new Set(item.reasons)] })),
    ready: true,
  };
}

/** Applies a reviewed inventory atomically and preserves every original row for rollback. */
export async function applyAssignmentMigration(connection: Connection, migrationId: string) {
  const inventory = await inspectAssignmentMigration(connection, migrationId);
  if (await collection(connection, migrationCollection).findOne({ _id: migrationId } as never)) throw new Error('ASSIGNMENT_MIGRATION_ALREADY_APPLIED');
  const quarantineById = new Map(inventory.quarantined.map(item => [item.id, item]));
  await connection.transaction(async session => {
    for (const candidate of inventory.candidates) {
      const original = await collection(connection, 'vehicle_assignments').findOne({ _id: new Types.ObjectId(candidate.id) }, { session });
      if (!original) throw new Error('ASSIGNMENT_MIGRATION_SOURCE_CHANGED');
      await collection(connection, backupCollection).insertOne({ _id: `${migrationId}:${candidate.id}`, migrationId, assignmentId: candidate.id,
        sourceId: original._id, action: 'BACKFILLED', original, normalized: candidate.normalized } as never, { session });
      await collection(connection, 'vehicle_assignments').replaceOne({ _id: new Types.ObjectId(candidate.id) }, candidate.normalized as never, { session });
    }
    for (const [id, item] of quarantineById) {
      const original = await collection(connection, 'vehicle_assignments').findOne({ _id: item.originalId } as never, { session });
      if (!original) throw new Error('ASSIGNMENT_MIGRATION_SOURCE_CHANGED');
      await collection(connection, backupCollection).insertOne({ _id: `${migrationId}:${id}`, migrationId, assignmentId: id, sourceId: item.originalId, action: 'QUARANTINED', original } as never, { session });
      await collection(connection, quarantineCollection).insertOne({ _id: `${migrationId}:${id}`, migrationId, assignmentId: id, reasons: item.reasons, original } as never, { session });
      await collection(connection, 'vehicle_assignments').deleteOne({ _id: item.originalId } as never, { session });
    }
    await collection(connection, migrationCollection).insertOne({ _id: migrationId, at: new Date(), total: inventory.total,
      backfilled: inventory.candidates.length, quarantined: inventory.quarantined.length } as never, { session });
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
  return { migrationId, total: inventory.total, backfilled: inventory.candidates.length, quarantined: inventory.quarantined };
}

/** Restores the exact source snapshots and removes the quarantine entries for one migration. */
export async function rollbackAssignmentMigration(connection: Connection, migrationId: string) {
  if (!await collection(connection, migrationCollection).findOne({ _id: migrationId } as never)) throw new Error('ASSIGNMENT_MIGRATION_NOT_FOUND');
  const backups = await collection(connection, backupCollection).find({ migrationId }).sort({ assignmentId: 1 }).toArray();
  await connection.transaction(async session => {
    for (const backup of backups) {
      const id = String(backup.assignmentId);
      const sourceId = backup.sourceId ?? new Types.ObjectId(id);
      const current = await collection(connection, 'vehicle_assignments').findOne({ _id: sourceId }, { session });
      if (backup.action === 'BACKFILLED') {
        if (!current || !isDeepStrictEqual(current, backup.normalized)) throw new Error('ASSIGNMENT_MIGRATION_ROLLBACK_CONFLICT');
        await collection(connection, 'vehicle_assignments').replaceOne({ _id: sourceId }, backup.original, { session });
      } else {
        if (current) throw new Error('ASSIGNMENT_MIGRATION_ROLLBACK_CONFLICT');
        await collection(connection, 'vehicle_assignments').insertOne(backup.original as never, { session });
        await collection(connection, quarantineCollection).deleteOne({ _id: backup._id }, { session });
      }
    }
    await collection(connection, backupCollection).deleteMany({ migrationId }, { session });
    await collection(connection, migrationCollection).deleteOne({ _id: migrationId } as never, { session });
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
  return { migrationId, restored: backups.length };
}
