import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createInvitationRepository, InvitationRepositoryError } from '@/modules/organizations/infrastructure/mongodb/invitation-repository';
import type { Invitation } from '@/modules/organizations/domain/invitations';
import { issueInvitationToken } from '@/modules/organizations/infrastructure/invitation-tokens';

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
beforeAll(async () => { await connection.asPromise(); });
afterAll(async () => {
  if (connection.readyState === 1 && /^invitation_acceptance_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close();
});

async function fixture(id: string) {
  const organizationId = `company-${id}`;
  await connection.collection('organizations').insertOne({ id: organizationId, type: 'COMPANY', name: 'Empresa', active: true, revision: 1, updatedAt: now });
  await connection.collection('organization_associations').insertOne({ id: `association-${id}`, subject: `sender-${id}`, organizationId,
    capability: 'COMPANY_ADMIN', active: true, revision: 1, updatedAt: now });
  const credential = issueInvitationToken();
  const invitation: Invitation = { id: `invitation-${id}`, organizationId, organizationType: 'COMPANY', companyId: organizationId,
    recipientEmail: `recipient-${id}@example.com`, roles: ['COMPANY_ADMIN'], invitedBy: `sender-${id}`, status: 'PENDING',
    expiresAt: new Date(now.getTime() + 3600000), tokenHash: credential.tokenHash, tokenVersion: 1, version: 1, createdAt: now,
    resolvedAt: null, acceptedSubject: null, deliveryStatus: 'UNKNOWN', attemptId: `attempt-${id}` };
  await repository.createPending(invitation, now);
  fixtureTokens.set(invitation.id, credential.token);
  return invitation;
}

const tokenFor = (invitationId: string) => fixtureTokens.get(invitationId)!;

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
