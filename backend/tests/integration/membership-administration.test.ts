import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createInvitationRepository } from '@/modules/organizations/infrastructure/mongodb/invitation-repository';
import type { Membership } from '@/modules/organizations/domain/invitations';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Isolated _test database required');
const database = `membership_admin_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const repository = createInvitationRepository(async () => connection, {
  revalidateAndCoordinate: async () => true,
  authorizeMembershipChange: async actorSubject => actorSubject === 'app-admin',
});
const now = new Date('2026-11-12T12:00:00.000Z');
beforeAll(async () => { await connection.asPromise(); });
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

it('keeps one administrator through atomic replacement and emits no duplicate event for a no-op', async () => {
  const { memberships } = await addCompany('replacement', [{ subject: 'current-admin', status: 'ACTIVE' }, { subject: 'next-admin', status: 'INACTIVE' }]);
  const result = await repository.changeMembership({ membershipId: memberships[0].id, expectedRevision: 1, actorSubject: 'app-admin', now,
    status: 'INACTIVE', replacement: { membershipId: memberships[1].id, expectedRevision: 1, status: 'ACTIVE', roles: ['COMPANY_ADMIN'] } });
  expect(result.membership).toMatchObject({ subject: 'current-admin', status: 'INACTIVE', revision: 2 });
  expect(result.replacement?.membership).toMatchObject({ subject: 'next-admin', status: 'ACTIVE', revision: 2 });
  const events = connection.collection('organization_membership_events');
  const eventCount = await events.countDocuments({ organizationId: 'company-replacement' });
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
