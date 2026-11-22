import mongoose, { Types, type ClientSession } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createInvitationRepository } from '@/modules/organizations/infrastructure/mongodb/invitation-repository';
import type { Membership } from '@/modules/organizations/domain/invitations';
import type { DriverProvisioningPort } from '@/modules/organizations/application/driver-provisioning';
import { driverModel, provisionDriverInSession, synchronizeDriverMembershipInSession } from '@/modules/fleet/infrastructure/mongodb/driver-repository';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Isolated _test database required');
const database = `membership_admin_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const repository = createInvitationRepository(async () => connection, {
  revalidateAndCoordinate: async () => true,
  authorizeMembershipChange: async actorSubject => actorSubject === 'app-admin',
});
const now = new Date('2026-11-12T12:00:00.000Z');
beforeAll(async () => {
  await connection.asPromise();
  await driverModel(connection).init();
  await connection.collection('driver_management_events').createIndex({ eventId: 1 }, { unique: true });
});
afterAll(async () => {
  if (connection.readyState === 1 && /^membership_admin_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close();
});

async function addCompany(id: string, members: readonly { subject: string; status: 'ACTIVE' | 'INACTIVE' }[]) {
  const organizationId = `company-${id}`;
  await connection.collection('organizations').insertOne({ id: organizationId, type: 'COMPANY', name: 'Empresa', active: true, revision: 1, updatedAt: now });
  const memberships: Membership[] = members.map((member, index) => ({ id: `${id}-membership-${index}`, subject: member.subject,
    organizationId, status: member.status, origin: 'INVITATION', acceptedInvitationId: `${id}-invitation-${index}`, acceptedAt: now, revision: 1 }));
  await connection.collection('organization_memberships').insertMany(memberships);
  await connection.collection('organization_associations').insertMany(members.map((member, index) => ({ id: `${id}-association-${index}`,
    subject: member.subject, organizationId, capability: 'COMPANY_ADMIN', active: member.status === 'ACTIVE', revision: 1, updatedAt: now,
    membershipId: `${id}-membership-${index}` })));
  return { organizationId, memberships };
}

async function addThirdParty(id: string, members: readonly { subject: string; status: 'ACTIVE' | 'INACTIVE'; roles: readonly string[] }[]) {
  const organizationId = new Types.ObjectId().toHexString();
  await connection.collection('organizations').insertOne({ id: organizationId, type: 'THIRD_PARTY', name: 'Tercero', active: true, revision: 1, updatedAt: now });
  await connection.collection('third_parties').insertOne({ _id: new Types.ObjectId(organizationId), status: 'ACTIVE', revision: 1 });
  const memberships: Membership[] = members.map((member, index) => ({ id: `${id}-membership-${index}`, subject: member.subject,
    organizationId, status: member.status, origin: 'INVITATION', acceptedInvitationId: `${id}-invitation-${index}`, acceptedAt: now, revision: 1 }));
  await connection.collection('organization_memberships').insertMany(memberships);
  await connection.collection('organization_associations').insertMany(members.flatMap((member, index) => member.roles.map(capability => ({
    id: `${id}-association-${index}-${capability}`, subject: member.subject, organizationId, capability, assigned: true,
    active: member.status === 'ACTIVE', revision: 1, updatedAt: now, membershipId: `${id}-membership-${index}`,
  }))));
  return { organizationId, memberships };
}

const driverProvisioning: DriverProvisioningPort = {
  async provision(input, transaction) {
    if (!input.roles.includes('DRIVER')) return;
    await provisionDriverInSession(connection, transaction as ClientSession, { id: new Types.ObjectId().toHexString(),
      subject: input.membership.subject, membershipId: input.membership.id, thirdPartyId: input.membership.organizationId,
      actor: input.actorSubject, now: input.now, source: input.source });
  },
  async synchronizeRoles(input, transaction) {
    await synchronizeDriverMembershipInSession(connection, transaction as ClientSession, { membershipId: input.membership.id,
      subject: input.membership.subject, thirdPartyId: input.membership.organizationId, beforeRoles: input.beforeRoles, afterRoles: input.afterRoles,
      membershipStatus: input.membership.status, actor: input.actorSubject, now: input.now });
  },
};

async function provisionSeedDriver(membership: Membership) {
  await connection.transaction(async session => provisionDriverInSession(connection, session, { id: new Types.ObjectId().toHexString(),
    subject: membership.subject, membershipId: membership.id, thirdPartyId: membership.organizationId, actor: 'app-admin', now, source: 'MEMBERSHIP' }));
}

it('keeps one administrator through atomic replacement and emits no duplicate event for a no-op', async () => {
  const { memberships } = await addCompany('replacement', [{ subject: 'current-admin', status: 'ACTIVE' }, { subject: 'next-admin', status: 'INACTIVE' }]);
  const result = await repository.changeMembership({ membershipId: memberships[0].id, expectedRevision: 1, actorSubject: 'app-admin', now,
    status: 'INACTIVE', replacement: { membershipId: memberships[1].id, expectedRevision: 1, status: 'ACTIVE', roles: ['COMPANY_ADMIN'] } });
  expect(result.membership).toMatchObject({ subject: 'current-admin', status: 'INACTIVE', revision: 2 });
  expect(result.replacement?.membership).toMatchObject({ subject: 'next-admin', status: 'ACTIVE', revision: 2 });
  const events = connection.collection('organization_membership_events');
  const eventCount = await events.countDocuments({ organizationId: 'company-replacement' });
  const auditEvents = connection.collection('audit_events');
  expect(await auditEvents.countDocuments({ source: 'organizations', action: 'MEMBERSHIP_UPDATED', 'scope.companyId': 'company-replacement' })).toBe(2);
  const auditFact = await auditEvents.findOne({ source: 'organizations', action: 'MEMBERSHIP_UPDATED', 'resource.id': memberships[0].id });
  expect(auditFact).toMatchObject({ actor: { kind: 'user', subject: 'app-admin' }, beforeVersion: '1', afterVersion: '2' });
  expect(auditFact).not.toHaveProperty('beforeRoles');
  expect(auditFact).not.toHaveProperty('afterRoles');
  const repeated = await repository.changeMembership({ membershipId: memberships[0].id, expectedRevision: 2, actorSubject: 'app-admin', now,
    status: 'INACTIVE', roles: ['COMPANY_ADMIN'] });
  expect(repeated.membership.revision).toBe(2);
  expect(await events.countDocuments({ organizationId: 'company-replacement' })).toBe(eventCount);
});

it('rejects removing the only administrator and serializes concurrent revocations', async () => {
  const only = await addCompany('only', [{ subject: 'sole-admin', status: 'ACTIVE' }]);
  await expect(repository.changeMembership({ membershipId: only.memberships[0].id, expectedRevision: 1, actorSubject: 'app-admin', now,
    status: 'INACTIVE' })).rejects.toMatchObject({ code: 'LAST_ADMINISTRATOR_REQUIRED' });

  const two = await addCompany('concurrent', [{ subject: 'admin-left', status: 'ACTIVE' }, { subject: 'admin-right', status: 'ACTIVE' }]);
  const outcomes = await Promise.allSettled(two.memberships.map(membership => repository.changeMembership({ membershipId: membership.id,
    expectedRevision: 1, actorSubject: 'app-admin', now, status: 'INACTIVE' })));
  expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
  expect(await connection.collection('organization_associations').countDocuments({ organizationId: two.organizationId, capability: 'COMPANY_ADMIN', active: true })).toBe(1);
  expect(await connection.collection('organization_memberships').countDocuments({ organizationId: two.organizationId, status: 'ACTIVE' })).toBe(1);
});

it('retains assigned roles while suspended and restores them on reactivation', async () => {
  const { organizationId, memberships } = await addCompany('reactivation', [{ subject: 'admin-to-suspend', status: 'ACTIVE' }, { subject: 'other-admin', status: 'ACTIVE' }]);
  const suspended = await repository.changeMembership({ membershipId: memberships[0].id, expectedRevision: 1, actorSubject: 'app-admin', now, status: 'INACTIVE' });
  expect(suspended.roles).toEqual(['COMPANY_ADMIN']);
  expect(await connection.collection('organization_associations').findOne({ membershipId: memberships[0].id })).toMatchObject({ assigned: true, active: false });
  const reactivated = await repository.changeMembership({ membershipId: memberships[0].id, expectedRevision: 2, actorSubject: 'app-admin', now, status: 'ACTIVE' });
  expect(reactivated.roles).toEqual(['COMPANY_ADMIN']);
  expect(await connection.collection('organization_associations').findOne({ membershipId: memberships[0].id })).toMatchObject({ assigned: true, active: true });
  expect(await repository.listMemberships({ organizationId, organizationType: 'COMPANY', page: 1, pageSize: 10 })).toMatchObject({
    items: expect.arrayContaining([expect.objectContaining({ membership: expect.objectContaining({ id: memberships[0].id }), roles: ['COMPANY_ADMIN'] })]),
  });
});

it('creates and deactivates a driver with role changes, while repeated roles produce no duplicate audit', async () => {
  const { organizationId, memberships } = await addThirdParty('driver-role-toggle', [{ subject: 'driver-role-member', status: 'ACTIVE', roles: ['THIRD_PARTY_ADMIN'] }]);
  const membership = memberships[0];

  const added = await repository.changeMembership({ membershipId: membership.id, expectedRevision: 1, actorSubject: 'app-admin', now,
    roles: ['THIRD_PARTY_ADMIN', 'DRIVER', 'DRIVER'], driverProvisioning });
  expect(added.membership).toMatchObject({ status: 'ACTIVE', revision: 2 });
  expect(added.roles).toContain('DRIVER');
  const activeDriver = await connection.collection('drivers').findOne({ membershipId: membership.id });
  expect(activeDriver).toMatchObject({ subject: membership.subject, thirdPartyId: organizationId, status: 'ACTIVE', version: 1 });
  expect(await connection.collection('driver_management_events').countDocuments({ membershipId: membership.id, action: 'DRIVER_PROVISIONED' })).toBe(1);
  const events = connection.collection('organization_membership_events');
  const auditEvents = connection.collection('audit_events');
  expect(await events.countDocuments({ membershipId: membership.id })).toBe(1);
  expect(await auditEvents.countDocuments({ source: 'organizations', action: 'MEMBERSHIP_UPDATED', 'resource.id': membership.id })).toBe(1);

  const repeated = await repository.changeMembership({ membershipId: membership.id, expectedRevision: 2, actorSubject: 'app-admin', now,
    roles: ['DRIVER', 'THIRD_PARTY_ADMIN', 'DRIVER'], driverProvisioning });
  expect(repeated.membership.revision).toBe(2);
  expect(await events.countDocuments({ membershipId: membership.id })).toBe(1);
  expect(await auditEvents.countDocuments({ source: 'organizations', action: 'MEMBERSHIP_UPDATED', 'resource.id': membership.id })).toBe(1);
  expect(await connection.collection('driver_management_events').countDocuments({ membershipId: membership.id })).toBe(1);

  const removed = await repository.changeMembership({ membershipId: membership.id, expectedRevision: 2, actorSubject: 'app-admin', now,
    roles: ['THIRD_PARTY_ADMIN'], driverProvisioning });
  expect(removed.roles).toEqual(['THIRD_PARTY_ADMIN']);
  expect(await connection.collection('drivers').findOne({ membershipId: membership.id })).toMatchObject({ status: 'INACTIVE', version: 2, updatedBy: 'app-admin' });
  expect(await connection.collection('driver_management_events').find({ membershipId: membership.id }).sort({ version: 1 }).toArray()).toMatchObject([
    { action: 'DRIVER_PROVISIONED', version: 1, source: 'MEMBERSHIP' }, { action: 'DRIVER_DEACTIVATED', version: 2, source: 'MEMBERSHIP_ROLE_REMOVED' },
  ]);
  expect(await events.countDocuments({ membershipId: membership.id })).toBe(2);
  expect(await auditEvents.countDocuments({ source: 'organizations', action: 'MEMBERSHIP_UPDATED', 'resource.id': membership.id })).toBe(2);
  expect(await connection.collection('organization_associations').findOne({ membershipId: membership.id, capability: 'DRIVER' })).toMatchObject({ assigned: false, active: false });
});

it('preserves a pre-existing inactive driver when DRIVER is added and rejects removal of the last role', async () => {
  const existing = await addThirdParty('existing-driver', [{ subject: 'existing-driver-member', status: 'ACTIVE', roles: ['THIRD_PARTY_ADMIN'] }]);
  const membership = existing.memberships[0];
  const existingDriverId = new Types.ObjectId();
  await driverModel(connection).create({ _id: existingDriverId, subject: membership.subject, membershipId: membership.id, thirdPartyId: existing.organizationId,
    status: 'INACTIVE', version: 4, createdAt: now, updatedAt: now, createdBy: 'earlier-admin', updatedBy: 'earlier-admin' });

  await repository.changeMembership({ membershipId: membership.id, expectedRevision: 1, actorSubject: 'app-admin', now,
    roles: ['THIRD_PARTY_ADMIN', 'DRIVER'], driverProvisioning });
  expect(await connection.collection('drivers').findOne({ membershipId: membership.id })).toMatchObject({ _id: existingDriverId, status: 'INACTIVE', version: 4, updatedBy: 'earlier-admin' });
  expect(await connection.collection('driver_management_events').countDocuments({ membershipId: membership.id })).toBe(0);

  const onlyDriver = await addThirdParty('only-driver-role', [{ subject: 'only-driver-member', status: 'ACTIVE', roles: ['DRIVER'] }]);
  await expect(repository.changeMembership({ membershipId: onlyDriver.memberships[0].id, expectedRevision: 1, actorSubject: 'app-admin', now,
    roles: [], driverProvisioning })).rejects.toMatchObject({ code: 'LAST_ROLE_REQUIRED' });
  expect(await connection.collection('organization_associations').findOne({ membershipId: onlyDriver.memberships[0].id, capability: 'DRIVER' })).toMatchObject({ assigned: true, active: true });
  expect(await connection.collection('organization_membership_events').countDocuments({ membershipId: onlyDriver.memberships[0].id })).toBe(0);
});

it('suspends driver membership evidence without rewriting the driver or Keycloak identity', async () => {
  const { memberships } = await addThirdParty('driver-suspension', [{ subject: 'suspended-driver', status: 'ACTIVE', roles: ['THIRD_PARTY_ADMIN', 'DRIVER'] }]);
  const membership = memberships[0];
  await provisionSeedDriver(membership);

  const suspended = await repository.changeMembership({ membershipId: membership.id, expectedRevision: 1, actorSubject: 'app-admin', now,
    status: 'INACTIVE', driverProvisioning });

  expect(suspended.membership).toMatchObject({ status: 'INACTIVE', revision: 2 });
  expect(suspended.roles).toContain('DRIVER');
  expect(await connection.collection('organization_associations').findOne({ membershipId: membership.id, capability: 'DRIVER' })).toMatchObject({ assigned: true, active: false });
  expect(await connection.collection('drivers').findOne({ membershipId: membership.id })).toMatchObject({ status: 'ACTIVE', version: 1, updatedBy: null });
  expect(await connection.collection('driver_management_events').countDocuments({ membershipId: membership.id })).toBe(1);
  expect(await connection.collection('organization_membership_events').countDocuments({ membershipId: membership.id, action: 'MEMBERSHIP_UPDATED' })).toBe(1);
});
