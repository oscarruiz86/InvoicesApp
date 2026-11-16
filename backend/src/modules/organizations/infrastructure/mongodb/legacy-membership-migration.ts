import { createHash } from 'node:crypto';
import type { Connection } from 'mongoose';

type LegacyAssociation = {
  id: string; subject: string; organizationId: string; capability: string; active: boolean; revision: number;
};
type LegacyOrganization = { id: string; type: string; active: boolean };
type LegacyMembership = {
  id: string; subject: string; organizationId: string; status: 'ACTIVE' | 'INACTIVE'; origin: 'LEGACY';
  revision: number; createdAt: Date; updatedAt: Date;
};

const validRoles: Record<string, readonly string[]> = {
  COMPANY: ['COMPANY_ADMIN'],
  THIRD_PARTY: ['THIRD_PARTY_ADMIN', 'DRIVER'],
};

function hasShape(value: Record<string, unknown>): value is Record<string, unknown> & LegacyAssociation {
  return typeof value.id === 'string' && value.id.length > 0 && typeof value.subject === 'string' && value.subject.length > 0
    && typeof value.organizationId === 'string' && value.organizationId.length > 0 && typeof value.capability === 'string'
    && typeof value.active === 'boolean' && Number.isSafeInteger(value.revision) && Number(value.revision) > 0;
}

export async function inspectLegacyMemberships(connection: Connection) {
  if (!connection.db) throw new Error('MONGODB_UNAVAILABLE');
  const [rawAssociations, rawOrganizations, existing] = await Promise.all([
    connection.collection('organization_associations').find({}).sort({ id: 1 }).toArray(),
    connection.collection('organizations').find({}).sort({ id: 1 }).toArray(),
    connection.collection('organization_memberships').find({}).sort({ id: 1 }).toArray(),
  ]);
  const organizations = new Map(rawOrganizations.map(value => [String(value.id), value as unknown as LegacyOrganization]));
  const reasons = new Map<string, number>();
  const groups = new Map<string, LegacyAssociation[]>();
  const associationIds = new Set<string>();
  for (const value of rawAssociations) {
    if (!hasShape(value)) { reasons.set('MALFORMED_ASSOCIATION', (reasons.get('MALFORMED_ASSOCIATION') ?? 0) + 1); continue; }
    if (associationIds.has(value.id)) reasons.set('DUPLICATE_ASSOCIATION_ID', (reasons.get('DUPLICATE_ASSOCIATION_ID') ?? 0) + 1);
    associationIds.add(value.id);
    const organization = organizations.get(value.organizationId);
    if (!organization) { reasons.set('ORGANIZATION_MISSING', (reasons.get('ORGANIZATION_MISSING') ?? 0) + 1); continue; }
    if (!validRoles[organization.type]?.includes(value.capability)) { reasons.set('ROLE_OR_TYPE_MISMATCH', (reasons.get('ROLE_OR_TYPE_MISMATCH') ?? 0) + 1); continue; }
    const key = `${value.subject}\0${value.organizationId}`;
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  const membershipByKey = new Map(existing.map(value => [`${value.subject}\0${value.organizationId}`, value]));
  for (const [key, group] of groups) {
    const expectedStatus = group.some(value => value.active) ? 'ACTIVE' : 'INACTIVE';
    const prior = membershipByKey.get(key);
    const expectedId = `legacy-${createHash('sha256').update(key).digest('hex')}`;
    if (prior && (prior.origin !== 'LEGACY' || prior.id !== expectedId || prior.subject !== group[0].subject
      || prior.organizationId !== group[0].organizationId || prior.status !== expectedStatus)) {
      reasons.set('EXISTING_MEMBERSHIP_CONFLICT', (reasons.get('EXISTING_MEMBERSHIP_CONFLICT') ?? 0) + 1);
    }
  }
  const admins = new Set(rawAssociations.filter(hasShape).filter(value => value.active && value.capability === 'COMPANY_ADMIN').map(value => value.organizationId));
  const organizationsWithoutAdmin = rawOrganizations.filter(value => value.type === 'COMPANY' && value.active && !admins.has(String(value.id))).length;
  return {
    associations: rawAssociations.length,
    eligibleMemberships: groups.size,
    existingLegacyMemberships: existing.filter(value => value.origin === 'LEGACY').length,
    organizationsWithoutActiveCompanyAdministrator: organizationsWithoutAdmin,
    conflicts: [...reasons].map(([reason, count]) => ({ reason, count })),
    ready: reasons.size === 0,
    groups: [...groups.values()],
    organizations,
  };
}

export async function migrateLegacyMemberships(connection: Connection, now = new Date()) {
  const inventory = await inspectLegacyMemberships(connection);
  if (!inventory.ready) throw new Error('LEGACY_MEMBERSHIP_CONFLICT');
  if (!connection.db) throw new Error('MONGODB_UNAVAILABLE');
  const collection = connection.collection('organization_memberships');
  await collection.createIndex({ id: 1 }, { unique: true });
  await collection.createIndex({ subject: 1, organizationId: 1 }, { unique: true });
  let migrated = 0;
  for (const associations of inventory.groups) {
    const first = associations[0];
    const id = `legacy-${createHash('sha256').update(`${first.subject}\0${first.organizationId}`).digest('hex')}`;
    const value: LegacyMembership = {
      id, subject: first.subject, organizationId: first.organizationId,
      status: associations.some(association => association.active) ? 'ACTIVE' : 'INACTIVE', origin: 'LEGACY',
      revision: Math.max(...associations.map(association => association.revision)), createdAt: now, updatedAt: now,
    };
    const result = await collection.updateOne({ subject: value.subject, organizationId: value.organizationId }, {
      $setOnInsert: value,
    }, { upsert: true });
    migrated += result.upsertedCount;
  }
  return { migrated, alreadyPresent: inventory.groups.length - migrated, inventory: {
    associations: inventory.associations, memberships: inventory.eligibleMemberships,
    organizationsWithoutActiveCompanyAdministrator: inventory.organizationsWithoutActiveCompanyAdministrator,
  } };
}
