import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { inspectLegacyMemberships, migrateLegacyMemberships } from '@/modules/organizations/infrastructure/mongodb/legacy-membership-migration';
import { createInvitationRepository, InvitationRepositoryError } from '@/modules/organizations/infrastructure/mongodb/invitation-repository';
import type { Invitation } from '@/modules/organizations/domain/invitations';
import { hashInvitationToken, issueInvitationToken, matchesInvitationToken } from '@/modules/organizations/infrastructure/invitation-tokens';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Isolated _test database required');
const database = `legacy_membership_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const invitationRepository = createInvitationRepository(async () => connection);
beforeAll(async () => { await connection.asPromise(); });
beforeEach(async () => {
  await Promise.all(['organizations', 'organization_associations', 'organization_memberships'].map(name => connection.collection(name).deleteMany({})));
});
afterAll(async () => {
  if (connection.readyState === 1 && /^legacy_membership_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close();
});

it('inventories read-only and migrates legacy memberships idempotently without fabricating acceptance', async () => {
  const organizations = connection.collection('organizations');
  const associations = connection.collection('organization_associations');
  await organizations.insertMany([
    { id: 'company-one', type: 'COMPANY', active: true },
    { id: 'third-party-one', type: 'THIRD_PARTY', active: true },
    { id: 'company-no-admin', type: 'COMPANY', active: true },
  ]);
  await associations.insertMany([
    { id: 'assoc-admin', subject: 'subject-one', organizationId: 'company-one', capability: 'COMPANY_ADMIN', active: true, revision: 4 },
    { id: 'assoc-driver', subject: 'subject-one', organizationId: 'third-party-one', capability: 'DRIVER', active: false, revision: 2 },
  ]);
  const before = await associations.find({}).sort({ id: 1 }).toArray();
  const inventory = await inspectLegacyMemberships(connection);
  expect(inventory).toMatchObject({ ready: true, associations: 2, eligibleMemberships: 2, organizationsWithoutActiveCompanyAdministrator: 1 });
  expect(await connection.collection('organization_memberships').countDocuments()).toBe(0);
  expect(await migrateLegacyMemberships(connection, new Date('2026-01-01T00:00:00.000Z'))).toMatchObject({ migrated: 2, alreadyPresent: 0 });
  expect(await migrateLegacyMemberships(connection, new Date('2026-01-02T00:00:00.000Z'))).toMatchObject({ migrated: 0, alreadyPresent: 2 });
  const memberships = await connection.collection('organization_memberships').find({}).sort({ organizationId: 1 }).toArray();
  expect(memberships.map(value => [value.subject, value.organizationId, value.status, value.origin])).toEqual([
    ['subject-one', 'company-one', 'ACTIVE', 'LEGACY'],
    ['subject-one', 'third-party-one', 'INACTIVE', 'LEGACY'],
  ]);
  expect(memberships.every(value => !('acceptedAt' in value) && !('acceptedInvitationId' in value))).toBe(true);
  expect(await associations.find({}).sort({ id: 1 }).toArray()).toEqual(before);
  expect(await connection.collection('authorization_policies').countDocuments()).toBe(0);
});

it('blocks malformed and incompatible legacy associations without writing memberships', async () => {
  await connection.collection('organizations').insertOne({ id: 'company-two', type: 'COMPANY', active: true });
  await connection.collection('organization_associations').insertOne({ id: 'bad-role', subject: 'subject-two', organizationId: 'company-two', capability: 'DRIVER', active: true, revision: 1 });
  const inventory = await inspectLegacyMemberships(connection);
  expect(inventory.ready).toBe(false);
  expect(inventory.conflicts).toContainEqual({ reason: 'ROLE_OR_TYPE_MISMATCH', count: 1 });
  await expect(migrateLegacyMemberships(connection)).rejects.toThrow('LEGACY_MEMBERSHIP_CONFLICT');
  expect(await connection.collection('organization_memberships').countDocuments()).toBe(0);
});

it('serializes concurrent pending invitations, expires stale pending records, and checks membership revisions', async () => {
  const now = new Date('2026-11-12T12:00:00.000Z');
  const pending = (id: string, expiresAt = new Date('2026-11-13T12:00:00.000Z'), organizationId = 'company-race'): Invitation => ({
    id, organizationId, organizationType: 'COMPANY', companyId: organizationId, recipientEmail: `invitee-${organizationId}@example.com`,
    roles: ['COMPANY_ADMIN'], invitedBy: 'admin-one', status: 'PENDING', expiresAt, tokenHash: hashInvitationToken(`secret-${id}`), tokenVersion: 1,
    version: 1, createdAt: now, resolvedAt: null, acceptedSubject: null, deliveryStatus: 'UNKNOWN', attemptId: `attempt-${id}`,
  });
  const concurrent = await Promise.allSettled([
    invitationRepository.createPending(pending('race-one'), now),
    invitationRepository.createPending(pending('race-two'), now),
  ]);
  expect(concurrent.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  const rejected = concurrent.find(result => result.status === 'rejected');
  expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(InvitationRepositoryError);
  expect(rejected?.status === 'rejected' && rejected.reason.code).toBe('DUPLICATE_PENDING_INVITATION');
  expect(await connection.collection('organization_invitations').countDocuments({ status: 'PENDING', organizationId: 'company-race' })).toBe(1);

  await invitationRepository.createPending(pending('stale', new Date(now.getTime() - 1), 'company-expire'), now);
  const replacement = await invitationRepository.createPending(pending('fresh', new Date('2026-11-13T12:00:00.000Z'), 'company-expire'), now);
  expect(await invitationRepository.findInvitation('stale')).toMatchObject({ status: 'EXPIRED', version: 2, resolvedAt: now });
  expect(replacement).toMatchObject({ id: 'fresh', status: 'PENDING', version: 1 });
  const rejectedInvitation = await invitationRepository.resolveInvitation('fresh', 1, 'REJECTED', now);
  expect(rejectedInvitation).toMatchObject({ status: 'REJECTED', version: 2 });
  await expect(invitationRepository.resolveInvitation('fresh', 1, 'CANCELLED', now)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

  const membership = { id: 'membership-one', subject: 'subject-one', organizationId: 'company-race', status: 'ACTIVE' as const,
    origin: 'INVITATION' as const, acceptedInvitationId: 'accepted-invitation', acceptedAt: now, revision: 1 };
  await invitationRepository.insertMembership(membership);
  await expect(invitationRepository.insertMembership({ ...membership, id: 'membership-two' })).rejects.toMatchObject({ code: 'DUPLICATE_MEMBERSHIP' });
  const updated = await invitationRepository.updateMembership({ ...membership, status: 'INACTIVE', revision: 2 }, 1);
  expect(updated).toMatchObject({ status: 'INACTIVE', revision: 2 });
  await expect(invitationRepository.updateMembership({ ...membership, revision: 2 }, 1)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

  const originalToken = issueInvitationToken().token;
  const nextToken = issueInvitationToken().token;
  const resendInvitation = pending('resend', new Date('2026-11-13T12:00:00.000Z'), 'company-resend');
  await invitationRepository.createPending({ ...resendInvitation, tokenHash: hashInvitationToken(originalToken) }, now);
  const failed = await invitationRepository.updateDeliveryStatus({ id: 'resend', tokenVersion: 1, attemptId: 'attempt-resend', status: 'FAILED', now });
  expect(failed).toMatchObject({ status: 'PENDING', deliveryStatus: 'FAILED', version: 2 });
  const resent = await invitationRepository.resendPending({ id: 'resend', expectedVersion: 2, tokenHash: hashInvitationToken(nextToken),
    attemptId: 'attempt-resend-2', expiresAt: new Date('2026-11-14T12:00:00.000Z'), now });
  expect(resent).toMatchObject({ status: 'PENDING', version: 3, tokenVersion: 2, deliveryStatus: 'UNKNOWN', attemptId: 'attempt-resend-2' });
  expect(matchesInvitationToken(originalToken, resent.tokenHash)).toBe(false);
  expect(matchesInvitationToken(nextToken, resent.tokenHash)).toBe(true);
  expect(await invitationRepository.findInvitationByToken(originalToken, now)).toBeNull();
  expect(await invitationRepository.findInvitationByToken(nextToken, now)).toMatchObject({ id: 'resend', status: 'PENDING' });
  const deliveryEvent = await connection.collection('organization_invitation_events').findOne({ invitationId: 'resend', action: 'INVITATION_RESENT' });
  expect(deliveryEvent).toMatchObject({ tokenVersion: 2 });
  expect(deliveryEvent).not.toHaveProperty('tokenHash');
  expect(deliveryEvent).not.toHaveProperty('recipientEmail');
  expect(await connection.collection('organization_invitations').countDocuments({ organizationId: 'company-resend' })).toBe(1);
  expect(await connection.collection('organization_memberships').countDocuments({ organizationId: 'company-resend' })).toBe(0);
});
