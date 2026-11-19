import { Types, type Connection } from 'mongoose';
import { DriverRepositoryError, driverModel, provisionDriverInSession } from './driver-repository';

export class DriverMigrationError extends Error {
  constructor(readonly code: 'MIGRATION_CONFLICT' | 'STORAGE_UNAVAILABLE') { super(code); }
}

export interface DriverMigrationCandidate {
  readonly membershipId: string;
  readonly subject: string;
  readonly thirdPartyId: string;
}

function addConflict(conflicts: Map<string, number>, reason: string) {
  conflicts.set(reason, (conflicts.get(reason) ?? 0) + 1);
}

export async function inspectDriverMigration(connection: Connection) {
  if (!connection.db) throw new DriverMigrationError('STORAGE_UNAVAILABLE');
  const [roles, memberships, organizations, thirdParties, drivers] = await Promise.all([
    connection.collection('organization_associations').find({ capability: 'DRIVER', active: true, assigned: { $ne: false } }).sort({ id: 1 }).toArray(),
    connection.collection('organization_memberships').find({}).sort({ id: 1 }).toArray(),
    connection.collection('organizations').find({}).sort({ id: 1 }).toArray(),
    connection.collection('third_parties').find({}).sort({ _id: 1 }).toArray(),
    connection.collection('drivers').find({}).sort({ membershipId: 1, _id: 1 }).toArray(),
  ]);
  const conflicts = new Map<string, number>();
  const membershipCounts = new Map<string, number>();
  const membershipsById = new Map<string, Record<string, unknown>>();
  for (const membership of memberships) {
    const id = typeof membership.id === 'string' ? membership.id : '';
    if (!id) continue;
    membershipCounts.set(id, (membershipCounts.get(id) ?? 0) + 1);
    membershipsById.set(id, membership);
  }
  const organizationsById = new Map(organizations.filter(value => typeof value.id === 'string').map(value => [String(value.id), value]));
  const thirdPartiesById = new Map(thirdParties.map(value => [String(value._id), value]));
  const driversByMembership = new Map<string, Record<string, unknown>[]>();
  for (const driver of drivers) {
    if (typeof driver.membershipId !== 'string' || !driver.membershipId) continue;
    driversByMembership.set(driver.membershipId, [...(driversByMembership.get(driver.membershipId) ?? []), driver]);
  }

  const candidates: DriverMigrationCandidate[] = [];
  let alreadyProvisioned = 0;
  let ineligibleThirdParties = 0;
  for (const role of roles) {
    const subject = typeof role.subject === 'string' ? role.subject : '';
    const thirdPartyId = typeof role.organizationId === 'string' ? role.organizationId : '';
    const membershipId = typeof role.membershipId === 'string' ? role.membershipId : '';
    if (!subject || !/^[a-f0-9]{24}$/.test(thirdPartyId)) {
      addConflict(conflicts, 'MALFORMED_DRIVER_ROLE');
      continue;
    }
    if (!membershipId) {
      addConflict(conflicts, 'DRIVER_ROLE_MISSING_MEMBERSHIP_ID');
      continue;
    }
    if (membershipCounts.get(membershipId) !== 1) {
      addConflict(conflicts, membershipCounts.has(membershipId) ? 'DUPLICATE_MEMBERSHIP_ID' : 'DRIVER_MEMBERSHIP_MISSING');
      continue;
    }
    const membership = membershipsById.get(membershipId)!;
    if (membership.subject !== subject || membership.organizationId !== thirdPartyId) {
      addConflict(conflicts, 'DRIVER_MEMBERSHIP_MISMATCH');
      continue;
    }
    if (membership.status !== 'ACTIVE') {
      addConflict(conflicts, 'DRIVER_MEMBERSHIP_INACTIVE');
      continue;
    }
    const organization = organizationsById.get(thirdPartyId);
    if (!organization || organization.type !== 'THIRD_PARTY') {
      addConflict(conflicts, 'DRIVER_THIRD_PARTY_ORGANIZATION_MISSING');
      continue;
    }
    if (organization.active !== true) {
      ineligibleThirdParties++;
      continue;
    }
    const thirdParty = thirdPartiesById.get(thirdPartyId);
    if (!thirdParty) {
      addConflict(conflicts, 'DRIVER_THIRD_PARTY_PROFILE_MISSING');
      continue;
    }
    if (thirdParty.status !== 'ACTIVE') {
      ineligibleThirdParties++;
      continue;
    }
    const existing = driversByMembership.get(membershipId) ?? [];
    if (existing.length > 1) {
      addConflict(conflicts, 'DUPLICATE_DRIVER_MEMBERSHIP');
      continue;
    }
    if (existing.length === 1) {
      const driver = existing[0];
      if (driver.subject !== subject || driver.thirdPartyId !== thirdPartyId) {
        addConflict(conflicts, 'DRIVER_MEMBERSHIP_CONFLICT');
        continue;
      }
      alreadyProvisioned++;
      continue;
    }
    candidates.push({ membershipId, subject, thirdPartyId });
  }

  return {
    consideredDriverRoles: roles.length,
    eligibleMemberships: candidates.length,
    alreadyProvisioned,
    ineligibleThirdParties,
    conflicts: [...conflicts].map(([reason, count]) => ({ reason, count })),
    ready: conflicts.size === 0,
    candidates,
  };
}

export async function migrateDriverMemberships(connection: Connection, now = new Date()) {
  const inventory = await inspectDriverMigration(connection);
  if (!inventory.ready) throw new DriverMigrationError('MIGRATION_CONFLICT');
  try {
    await driverModel(connection).init();
    await connection.collection('driver_management_events').createIndex({ eventId: 1 }, { unique: true });
    await connection.collection('driver_management_events').createIndex({ thirdPartyId: 1, at: 1, eventId: 1 });
    let migrated = 0;
    for (const candidate of inventory.candidates) {
      await connection.transaction(async session => {
        await provisionDriverInSession(connection, session, {
          id: new Types.ObjectId().toString(), ...candidate, actor: 'system:driver-migration', now, source: 'MIGRATION',
        });
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
      migrated++;
    }
    return {
      migrated,
      alreadyPresent: inventory.alreadyProvisioned,
      ineligibleThirdParties: inventory.ineligibleThirdParties,
      inventory: { consideredDriverRoles: inventory.consideredDriverRoles, eligibleMemberships: inventory.eligibleMemberships },
    };
  } catch (error) {
    if (error instanceof DriverRepositoryError && error.code === 'MEMBERSHIP_NOT_ELIGIBLE') throw new DriverMigrationError('MIGRATION_CONFLICT');
    throw new DriverMigrationError('STORAGE_UNAVAILABLE');
  }
}
