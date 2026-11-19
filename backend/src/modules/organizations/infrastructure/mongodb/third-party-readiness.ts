import type { Connection } from 'mongoose';
import { Types } from 'mongoose';

export class ThirdPartyStorageUnavailable extends Error { constructor() { super('THIRD_PARTY_STORAGE_UNAVAILABLE'); } }

/** Transactions are mandatory for profile, projection, relationship, and audit writes. */
export async function requireThirdPartyStorage(connection: Connection) {
  try {
    if (!connection.db) throw new ThirdPartyStorageUnavailable();
    const hello = await connection.db.admin().command({ hello: 1 });
    if (!hello.setName || !hello.isWritablePrimary) throw new ThirdPartyStorageUnavailable();
  } catch { throw new ThirdPartyStorageUnavailable(); }
}

/** Upgrades only technical relation fields; it never fabricates a profile or relationship. */
export async function prepareThirdPartyRelationships(connection: Connection) {
  const relations = connection.collection('company_third_party_relations');
  await relations.updateMany({ revision: { $exists: false } }, { $set: { revision: 1 } });
  await relations.updateMany({ updatedAt: { $exists: false } }, { $currentDate: { updatedAt: true } });
  await relations.updateMany({ mutationFence: { $exists: false } }, { $set: { mutationFence: 0 } });
}

export async function inventoryLegacyThirdParties(connection: Connection, now = new Date()) {
  if (!connection.db) throw new ThirdPartyStorageUnavailable();
  const organizations = await connection.collection('organizations').find({ type: 'THIRD_PARTY' }, { projection: { _id: 0, id: 1 } }).toArray();
  const ids = organizations.map(value => value.id).filter((value): value is string => typeof value === 'string');
  const objectIds = ids.filter(id => /^[a-f0-9]{24}$/.test(id)).map(id => new Types.ObjectId(id));
  const profiles = await connection.collection('third_parties').find({ _id: { $in: objectIds } }, { projection: { _id: 1 } }).toArray();
  const managed = new Set(profiles.map(value => String(value._id)));
  const legacyIds = ids.filter(id => !managed.has(id));
  const inventory = connection.collection('third_party_legacy_inventory');
  await inventory.createIndex({ thirdPartyId: 1 }, { unique: true });
  if (legacyIds.length) await inventory.bulkWrite(legacyIds.map(thirdPartyId => ({ updateOne: {
    filter: { thirdPartyId }, update: { $setOnInsert: { firstSeenAt: now }, $set: { thirdPartyId, lastSeenAt: now, status: 'PROFILE_RECONCILIATION_REQUIRED' } }, upsert: true,
  } })), { ordered: false });
  const resolved = ids.filter(id => managed.has(id));
  if (resolved.length) await inventory.updateMany({ thirdPartyId: { $in: resolved }, status: 'PROFILE_RECONCILIATION_REQUIRED' }, { $set: { status: 'RESOLVED', resolvedAt: now } });
  return { scanned: ids.length, awaitingReconciliation: legacyIds.length, resolved: resolved.length };
}
