import mongoose, { Types, type ClientSession } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createInvitationRepository, InvitationRepositoryError } from '@/modules/organizations/infrastructure/mongodb/invitation-repository';
import type { Invitation } from '@/modules/organizations/domain/invitations';
import type { DriverProvisioningPort } from '@/modules/organizations/application/driver-provisioning';
import { issueInvitationToken } from '@/modules/organizations/infrastructure/invitation-tokens';
import { driverModel, provisionDriverInSession } from '@/modules/fleet/infrastructure/mongodb/driver-repository';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Isolated _test database required');
const database = `invitation_acceptance_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const repository = createInvitationRepository(async () => connection, {
  async revalidateAndCoordinate(invitation, session) {
    const organization = await connection.collection('organizations').findOne({ id: invitation.organizationId, type: invitation.organizationType, active: true }, { session });
    if (!organization) return false;
    const role = invitation.organizationType === 'COMPANY' ? 'COMPANY_ADMIN' : 'THIRD_PARTY_ADMIN';
    const inviter = await connection.collection('organization_associations').findOne({ subject: invitation.invitedBy, organizationId: invitation.organizationId, capability: role, active: true }, { session });
    if (!inviter) return false;
    const organizationFence = await connection.collection('organizations').updateOne({ id: invitation.organizationId, active: true }, { $inc: { mutationFence: 1 } }, { session });
    const inviterFence = await connection.collection('organization_associations').updateOne({ id: inviter.id, active: true, revision: inviter.revision }, { $inc: { mutationFence: 1 } }, { session });
    return organizationFence.modifiedCount === 1 && inviterFence.modifiedCount === 1;
  },
});
const now = new Date('2026-11-12T12:00:00.000Z');
const fixtureTokens = new Map<string, string>();
beforeAll(async () => {
  await connection.asPromise();
  await driverModel(connection).init();
  await connection.collection('driver_management_events').createIndex({ eventId: 1 }, { unique: true });
});
afterAll(async () => {
  if (connection.readyState === 1 && /^invitation_acceptance_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close();
});

async function fixture(id: string, driver = false) {
  const organizationId = driver ? new Types.ObjectId().toHexString() : `company-${id}`;
  const organizationType = driver ? 'THIRD_PARTY' : 'COMPANY';
  await connection.collection('organizations').insertOne({ id: organizationId, type: organizationType, name: 'Empresa', active: true, revision: 1, updatedAt: now });
  if (driver) await connection.collection('third_parties').insertOne({ _id: new Types.ObjectId(organizationId), status: 'ACTIVE', revision: 1 });
  await connection.collection('organization_associations').insertOne({ id: `association-${id}`, subject: `sender-${id}`, organizationId,
    capability: driver ? 'THIRD_PARTY_ADMIN' : 'COMPANY_ADMIN', active: true, revision: 1, updatedAt: now });
  const credential = issueInvitationToken();
  const invitation: Invitation = { id: `invitation-${id}`, organizationId, organizationType, companyId: driver ? null : organizationId,
    recipientEmail: `recipient-${id}@example.com`, roles: driver ? ['DRIVER'] : ['COMPANY_ADMIN'], invitedBy: `sender-${id}`, status: 'PENDING',
    expiresAt: new Date(now.getTime() + 3600000), tokenHash: credential.tokenHash, tokenVersion: 1, version: 1, createdAt: now,
    resolvedAt: null, acceptedSubject: null, deliveryStatus: 'UNKNOWN', attemptId: `attempt-${id}` };
  await repository.createPending(invitation, now);
  fixtureTokens.set(invitation.id, credential.token);
  return invitation;
}

const tokenFor = (invitationId: string) => fixtureTokens.get(invitationId)!;

function driverProvisioning(failAfterWrite = false): DriverProvisioningPort {
  return {
    async provision(input, transaction) {
      if (!input.roles.includes('DRIVER')) return;
      await provisionDriverInSession(connection, transaction as ClientSession, { id: new Types.ObjectId().toHexString(),
        subject: input.membership.subject, membershipId: input.membership.id, thirdPartyId: input.membership.organizationId,
        actor: input.actorSubject, now: input.now, source: input.source }, createMongoAuditWriter(connection, transaction as ClientSession));
      if (failAfterWrite) throw new Error('forced driver provisioning failure');
    },
    async synchronizeRoles() { throw new Error('not used by invitation acceptance'); },
  };
}

it('requires matching verified identity and current inviter evidence', async () => {
  const invitation = await fixture('authority');
  await expect(repository.accept({ invitationId: invitation.id, token: tokenFor(invitation.id), expectedVersion: 1, subject: 'recipient-authority', email: 'wrong@example.com',
    emailVerified: true, profileComplete: true, now, membershipId: 'membership-wrong' })).rejects.toMatchObject({ code: 'IDENTITY_MISMATCH' });
  await expect(repository.accept({ invitationId: invitation.id, token: tokenFor(invitation.id), expectedVersion: 1, subject: 'recipient-authority', email: invitation.recipientEmail,
    emailVerified: false, profileComplete: true, now, membershipId: 'membership-unverified' })).rejects.toMatchObject({ code: 'IDENTITY_MISMATCH' });
  await connection.collection('organization_associations').updateOne({ id: 'association-authority' }, { $set: { active: false } });
  await expect(repository.accept({ invitationId: invitation.id, token: tokenFor(invitation.id), expectedVersion: 1, subject: 'recipient-authority', email: invitation.recipientEmail,
    emailVerified: true, profileComplete: true, now, membershipId: 'membership-authority' })).rejects.toMatchObject({ code: 'AUTHORITY_REVOKED' });
  expect(await connection.collection('organization_invitations').findOne({ id: invitation.id })).toMatchObject({ status: 'PENDING', version: 1 });
  expect(await connection.collection('organization_memberships').countDocuments({ organizationId: invitation.organizationId })).toBe(0);

  const inactiveOrganization = await fixture('inactive');
  await connection.collection('organizations').updateOne({ id: inactiveOrganization.organizationId }, { $set: { active: false } });
  await expect(repository.accept({ invitationId: inactiveOrganization.id, token: tokenFor(inactiveOrganization.id), expectedVersion: 1, subject: 'recipient-inactive', email: inactiveOrganization.recipientEmail,
    emailVerified: true, profileComplete: true, now, membershipId: 'membership-inactive' })).rejects.toMatchObject({ code: 'AUTHORITY_REVOKED' });

  const expiredInvitation = await fixture('expired-acceptance');
  await connection.collection('organization_invitations').updateOne({ id: expiredInvitation.id }, { $set: { expiresAt: now } });
  await expect(repository.accept({ invitationId: expiredInvitation.id, token: tokenFor(expiredInvitation.id), expectedVersion: 1, subject: 'recipient-expired-acceptance', email: expiredInvitation.recipientEmail,
    emailVerified: true, profileComplete: true, now, membershipId: 'membership-expired-acceptance' })).rejects.toMatchObject({ code: 'INVITATION_EXPIRED' });
  expect(await connection.collection('organization_invitation_events').findOne({ invitationId: expiredInvitation.id, action: 'INVITATION_EXPIRED' })).toBeTruthy();
});

it('rolls back partial access when audit fails, then accepts atomically with one membership and role', async () => {
  const invitation = await fixture('atomic');
  await connection.db!.command({ collMod: 'organization_invitation_events', validator: { $jsonSchema: { bsonType: 'object', required: ['forcedFailure'] } } });
  const input = { invitationId: invitation.id, token: tokenFor(invitation.id), expectedVersion: 1, subject: 'recipient-atomic', email: invitation.recipientEmail,
    emailVerified: true, profileComplete: true, now, membershipId: 'membership-atomic' };
  await expect(repository.accept(input)).rejects.toBeInstanceOf(InvitationRepositoryError);
  expect(await connection.collection('organization_invitations').findOne({ id: invitation.id })).toMatchObject({ status: 'PENDING', version: 1 });
  expect(await connection.collection('organization_memberships').countDocuments({ id: input.membershipId })).toBe(0);
  expect(await connection.collection('organization_associations').countDocuments({ subject: input.subject })).toBe(0);
  await connection.db!.command({ collMod: 'organization_invitation_events', validator: {} });

  const result = await repository.accept(input);
  expect(result.invitation).toMatchObject({ status: 'ACCEPTED', acceptedSubject: input.subject, version: 2 });
  expect(result.membership).toMatchObject({ origin: 'INVITATION', acceptedInvitationId: invitation.id, status: 'ACTIVE' });
  expect(await connection.collection('organization_associations').find({ subject: input.subject }).toArray()).toMatchObject([
    { capability: 'COMPANY_ADMIN', active: true, membershipId: input.membershipId },
  ]);
  expect(await connection.collection('organization_invitation_events').findOne({ invitationId: invitation.id, action: 'INVITATION_ACCEPTED' })).toMatchObject({ subject: input.subject });
  const invitationEvents = await connection.collection('organization_invitation_events').find({ invitationId: invitation.id }).toArray();
  expect(invitationEvents.map(event => event.action).sort()).toEqual(['INVITATION_ACCEPTED', 'INVITATION_CREATED']);
  expect(invitationEvents.every(event => !('tokenHash' in event) && !('token' in event) && !('recipientEmail' in event) && !('documentNumber' in event))).toBe(true);
  await expect(repository.accept(input)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
});

it('allows only one transition when acceptance races cancellation', async () => {
  const invitation = await fixture('race');
  const results = await Promise.allSettled([
    repository.accept({ invitationId: invitation.id, token: tokenFor(invitation.id), expectedVersion: 1, subject: 'recipient-race', email: invitation.recipientEmail,
      emailVerified: true, profileComplete: true, now, membershipId: 'membership-race' }),
    repository.resolveInvitation(invitation.id, 1, 'CANCELLED', now),
  ]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  const current = await connection.collection('organization_invitations').findOne({ id: invitation.id });
  expect(['ACCEPTED', 'CANCELLED']).toContain(current?.status);
  expect(await connection.collection('organization_memberships').countDocuments({ acceptedInvitationId: invitation.id })).toBe(current?.status === 'ACCEPTED' ? 1 : 0);
  expect(await connection.collection('organization_associations').countDocuments({ membershipId: 'membership-race' })).toBe(current?.status === 'ACCEPTED' ? 1 : 0);
});

it('provisions a driver and its history atomically with invitation acceptance', async () => {
  const invitation = await fixture('driver-atomic', true);
  const input = { invitationId: invitation.id, token: tokenFor(invitation.id), expectedVersion: 1, subject: 'recipient-driver-atomic', email: invitation.recipientEmail,
    emailVerified: true, profileComplete: true, now, membershipId: 'membership-driver-atomic', driverProvisioning: driverProvisioning() };

  const result = await repository.accept(input);

  expect(result.invitation).toMatchObject({ status: 'ACCEPTED', version: 2 });
  expect(result.membership).toMatchObject({ id: input.membershipId, status: 'ACTIVE', acceptedInvitationId: invitation.id });
  expect(await connection.collection('organization_associations').countDocuments({ membershipId: input.membershipId, capability: 'DRIVER', active: true })).toBe(1);
  expect(await connection.collection('drivers').findOne({ membershipId: input.membershipId })).toMatchObject({ subject: input.subject, thirdPartyId: invitation.organizationId, status: 'ACTIVE', version: 1 });
  expect(await connection.collection('driver_management_events').countDocuments({ membershipId: input.membershipId, action: 'DRIVER_PROVISIONED', source: 'INVITATION' })).toBe(1);
  expect(await connection.collection('organization_invitation_events').countDocuments({ invitationId: invitation.id, action: 'INVITATION_ACCEPTED' })).toBe(1);

  await expect(repository.accept(input)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  expect(await connection.collection('organization_memberships').countDocuments({ acceptedInvitationId: invitation.id })).toBe(1);
  expect(await connection.collection('drivers').countDocuments({ membershipId: input.membershipId })).toBe(1);
  expect(await connection.collection('driver_management_events').countDocuments({ membershipId: input.membershipId })).toBe(1);
});

it('rolls back invitation, membership, role, driver, and both histories when driver provisioning fails', async () => {
  const invitation = await fixture('driver-failure', true);
  const input = { invitationId: invitation.id, token: tokenFor(invitation.id), expectedVersion: 1, subject: 'recipient-driver-failure', email: invitation.recipientEmail,
    emailVerified: true, profileComplete: true, now, membershipId: 'membership-driver-failure', driverProvisioning: driverProvisioning(true) };

  await expect(repository.accept(input)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });

  expect(await connection.collection('organization_invitations').findOne({ id: invitation.id })).toMatchObject({ status: 'PENDING', version: 1, acceptedSubject: null });
  expect(await connection.collection('organization_memberships').countDocuments({ id: input.membershipId })).toBe(0);
  expect(await connection.collection('organization_associations').countDocuments({ membershipId: input.membershipId })).toBe(0);
  expect(await connection.collection('drivers').countDocuments({ membershipId: input.membershipId })).toBe(0);
  expect(await connection.collection('organization_invitation_events').countDocuments({ invitationId: invitation.id, action: 'INVITATION_ACCEPTED' })).toBe(0);
  expect(await connection.collection('driver_management_events').countDocuments({ membershipId: input.membershipId })).toBe(0);
});

it('allows one driver provisioning when two acceptances race', async () => {
  const invitation = await fixture('driver-double', true);
  const accept = (membershipId: string) => repository.accept({ invitationId: invitation.id, token: tokenFor(invitation.id), expectedVersion: 1,
    subject: 'recipient-driver-double', email: invitation.recipientEmail, emailVerified: true, profileComplete: true, now, membershipId, driverProvisioning: driverProvisioning() });

  const results = await Promise.allSettled([accept('membership-driver-double-a'), accept('membership-driver-double-b')]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  const current = await connection.collection('organization_invitations').findOne({ id: invitation.id });
  expect(current).toMatchObject({ status: 'ACCEPTED', acceptedSubject: 'recipient-driver-double', version: 2 });
  expect(await connection.collection('organization_memberships').countDocuments({ acceptedInvitationId: invitation.id })).toBe(1);
  expect(await connection.collection('organization_associations').countDocuments({ organizationId: invitation.organizationId, capability: 'DRIVER', active: true })).toBe(1);
  expect(await connection.collection('drivers').countDocuments({ thirdPartyId: invitation.organizationId })).toBe(1);
  expect(await connection.collection('driver_management_events').countDocuments({ thirdPartyId: invitation.organizationId, action: 'DRIVER_PROVISIONED' })).toBe(1);
  expect(await connection.collection('organization_invitation_events').countDocuments({ invitationId: invitation.id, action: 'INVITATION_ACCEPTED' })).toBe(1);
});

it('rolls back driver provisioning when acceptance races cancellation', async () => {
  const invitation = await fixture('driver-cancel-race', true);
  const results = await Promise.allSettled([
    repository.accept({ invitationId: invitation.id, token: tokenFor(invitation.id), expectedVersion: 1, subject: 'recipient-driver-cancel-race', email: invitation.recipientEmail,
      emailVerified: true, profileComplete: true, now, membershipId: 'membership-driver-cancel-race', driverProvisioning: driverProvisioning() }),
    repository.resolveInvitation(invitation.id, 1, 'CANCELLED', now),
  ]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  const current = await connection.collection('organization_invitations').findOne({ id: invitation.id });
  expect(['ACCEPTED', 'CANCELLED']).toContain(current?.status);
  const accepted = current?.status === 'ACCEPTED';
  expect(await connection.collection('organization_memberships').countDocuments({ acceptedInvitationId: invitation.id })).toBe(accepted ? 1 : 0);
  expect(await connection.collection('organization_associations').countDocuments({ membershipId: 'membership-driver-cancel-race' })).toBe(accepted ? 1 : 0);
  expect(await connection.collection('drivers').countDocuments({ membershipId: 'membership-driver-cancel-race' })).toBe(accepted ? 1 : 0);
  expect(await connection.collection('driver_management_events').countDocuments({ membershipId: 'membership-driver-cancel-race' })).toBe(accepted ? 1 : 0);
  expect(await connection.collection('organization_invitation_events').countDocuments({ invitationId: invitation.id, action: 'INVITATION_ACCEPTED' })).toBe(accepted ? 1 : 0);
});
