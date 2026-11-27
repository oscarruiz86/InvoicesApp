import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createThirdPartyRepository } from '@/modules/organizations/infrastructure/mongodb/third-party-repository';
import { createThirdParties } from '@/modules/organizations/application/third-parties';
import type { ThirdPartyAccess, ThirdPartyRepository } from '@/modules/organizations/application/third-party-ports';
import { createPolicyRepository, policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { createOrganizationRepository } from '@/modules/organizations/infrastructure/mongodb/organization-repository';
import { validOrganization } from '@/modules/identity/domain/authorization-policy';
import { thirdPartyModel } from '@/modules/organizations/infrastructure/mongodb/third-party-repository';
import { inventoryLegacyThirdParties } from '@/modules/organizations/infrastructure/mongodb/third-party-readiness';
import { grantCeiling } from '@/modules/identity/domain/permissions';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';
import { createManagementAuditOutboxWorker } from '@/modules/organizations/application/management-audit-outbox-worker';
import { createMongoManagementAuditOutbox } from '@/modules/organizations/infrastructure/mongodb/management-audit-outbox';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Isolated _test database required');
const database = `third_party_management_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const repository = createThirdPartyRepository(async () => connection, policyConfirmation);
const serviceFor = (repo = repository) => createThirdParties({ repository: repo, now: () => new Date('2026-01-01T00:00:00.000Z'), nextEventId: randomUUID });
const service = serviceFor();
const global: ThirdPartyAccess = { actor: { subject: 'app-admin', roles: ['APP_ADMIN'], permissions: [], username: null, name: null, email: null }, scope: { kind: 'global', companyId: null, thirdPartyId: null } };
const company = (id: string): ThirdPartyAccess => ({ actor: { subject: `admin-${id}`, roles: [], permissions: [], username: null, name: null, email: null }, scope: { kind: 'organization', companyId: id, thirdPartyId: null } });
const profile = (documentNumber: string) => ({ documentNumber, verificationDigit: '1', businessName: `Tercero ${documentNumber}`, email: ' CONTACT@Example.COM ' });
const query = { page: 1, pageSize: 20, sort: 'businessName', direction: 'asc' } as const;
const companyIds = [new mongoose.Types.ObjectId().toString(), new mongoose.Types.ObjectId().toString()];

async function addCompany(id: string) {
  const subject = `admin-${id}`; const membershipId = `membership-${id}`; const now = new Date();
  await connection.collection('organizations').insertOne({ id, type: 'COMPANY', name: `Empresa ${id}`, active: true, revision: 1, updatedAt: now });
  await connection.collection('organization_memberships').insertOne({ id: membershipId, subject, organizationId: id, status: 'ACTIVE', revision: 1 });
  await connection.collection('organization_associations').insertOne({ id: new mongoose.Types.ObjectId().toString(), subject, organizationId: id, capability: 'COMPANY_ADMIN',
    membershipId, assigned: true, active: true, revision: 1, updatedAt: now });
}
beforeAll(async () => {
  await connection.asPromise();
  await createPolicyRepository(async () => connection).initialize();
  await Promise.all(companyIds.map(addCompany));
});
afterAll(async () => {
  if (connection.readyState === 1 && connection.name === database && /^third_party_management_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close();
});

it('creates the canonical profile and projection atomically, then isolates list and detail by company', async () => {
  const first = await service.create(company(companyIds[0]), profile('001'));
  const second = await service.create(company(companyIds[1]), profile('002'));
  expect(first.thirdParty.email).toBe('contact@example.com');
  expect(first.thirdParty.createdBy).toBe(`admin-${companyIds[0]}`);
  expect(first.relationship).toMatchObject({ companyId: companyIds[0], thirdPartyId: first.thirdParty.id, status: 'ACTIVE', version: '1' });
  expect(await connection.collection('organizations').findOne({ id: first.thirdParty.id, type: 'THIRD_PARTY', name: first.thirdParty.businessName, active: true })).toBeTruthy();
  expect(await connection.collection('organization_associations').countDocuments({ organizationId: first.thirdParty.id })).toBe(0);
  const relationshipCollection = connection.collection('company_third_party_relations');
  expect(await relationshipCollection.indexes()).toEqual(expect.arrayContaining([expect.objectContaining({ key: { companyId: 1, thirdPartyId: 1 }, unique: true })]));
  const relationDocument = await relationshipCollection.findOne({ companyId: companyIds[0], thirdPartyId: first.thirdParty.id });
  if (!relationDocument) throw new Error('Initial company-third-party relationship was not persisted');
  await expect(relationshipCollection.insertOne({ ...relationDocument, _id: new mongoose.Types.ObjectId() })).rejects.toMatchObject({ code: 11000 });

  expect((await service.list(company(companyIds[0]), { ...query, page: 88 })).items).toEqual([]);
  expect((await service.list(company(companyIds[0]), { ...query, q: 'Tercero 00' })).total).toBe(1);
  expect((await service.list(company(companyIds[0]), { ...query, q: second.thirdParty.id })).total).toBe(0);
  await expect(service.get(company(companyIds[0]), second.thirdParty.id)).rejects.toThrow('RESOURCE_NOT_FOUND');

  const changed = await service.update(company(companyIds[0]), first.thirdParty.id, first.version, { city: 'Bogotá', businessName: 'Tercero Andino' });
  expect(changed.version).toBe('2'); expect(changed.relationship?.status).toBe('ACTIVE');
  await expect(service.update(company(companyIds[0]), first.thirdParty.id, first.version, { city: 'Cali' })).rejects.toThrow('THIRD_PARTY_VERSION_CONFLICT');
  await expect(service.update(company(companyIds[0]), first.thirdParty.id, changed.version, { businessName: 'Tercero Andino' })).resolves.toMatchObject({ version: '2' });
  await expect(service.create(global, profile('001'))).rejects.toThrow('THIRD_PARTY_DOCUMENT_CONFLICT');
});

it('delivers transactional third-party captures once without personal profile data', async () => {
  const worker = createManagementAuditOutboxWorker({ outbox: createMongoManagementAuditOutbox(async () => connection),
    audit: { async record(event) { await createMongoAuditWriter(connection).record(event); } } });
  while (await worker.deliverBatch()) { /* drain captures created by preceding test cases */ }
  const created = await service.create(company(companyIds[0]), profile('301'));
  await service.update(company(companyIds[0]), created.thirdParty.id, created.version, { businessName: 'Audit third party' });
  const captures = await connection.collection('third_party_management_events').find({ thirdPartyId: created.thirdParty.id }).toArray();
  expect(await worker.deliverBatch()).toBe(captures.length);
  const journal = await connection.collection('audit_events').find({ _id: { $in: captures.map(event => event.eventId) } }).toArray();
  expect(journal.map(event => event._id)).toEqual(expect.arrayContaining(captures.map(event => event.eventId)));
  expect(journal.every(event => !('documentNumber' in event) && !('email' in event) && !('before' in event) && !('after' in event))).toBe(true);
  expect(await worker.deliverBatch()).toBe(0);
});

it('keeps many-to-many relationship transitions isolated and direct third-party context valid', async () => {
  const companyA = company(companyIds[0]); const companyB = company(companyIds[1]);
  const [firstPage, secondPage] = await Promise.all([service.list(companyA, query), service.list(companyB, query)]);
  const first = await service.get(global, firstPage.items[0]!.thirdParty.id);
  const second = await service.get(global, secondPage.items[0]!.thirdParty.id);
  const appId = first.thirdParty.id; const secondId = second.thirdParty.id;
  await expect(service.setRelationship(companyA, appId, companyIds[1], null, 'ACTIVE')).rejects.toThrow('FORBIDDEN');
  expect(() => service.getRelationship(companyA, appId, companyIds[1])).toThrow('FORBIDDEN');
  expect(() => service.setStatus(companyA, appId, '1', 'INACTIVE')).toThrow('FORBIDDEN');
  const relationA = await service.setRelationship(companyA, appId, companyIds[0], first.relationship?.version ?? '1', 'INACTIVE');
  expect(relationA.relationship?.status).toBe('INACTIVE');
  const relationB = await service.setRelationship(companyB, appId, companyIds[1], null, 'ACTIVE');
  expect(relationB.relationship?.status).toBe('ACTIVE');
  expect((await service.get(company(companyIds[1]), appId)).relationship?.status).toBe('ACTIVE');
  await expect(service.setRelationship(companyA, appId, companyIds[0], '1', 'ACTIVE')).rejects.toThrow('THIRD_PARTY_VERSION_CONFLICT');
  const reactivated = await service.setRelationship(companyA, appId, companyIds[0], relationA.relationship!.version, 'ACTIVE');
  expect(reactivated.relationship?.status).toBe('ACTIVE');

  const membershipId = 'third-party-admin-membership'; const subject = 'third-party-admin'; const now = new Date();
  await connection.collection('organization_memberships').insertOne({ id: membershipId, subject, organizationId: appId, status: 'ACTIVE', revision: 1 });
  await connection.collection('organization_associations').insertOne({ id: new mongoose.Types.ObjectId().toString(), subject, organizationId: appId, capability: 'THIRD_PARTY_ADMIN',
    membershipId, assigned: true, active: true, revision: 1, updatedAt: now });
  const scope = { kind: 'organization', companyId: null, thirdPartyId: appId } as const;
  const organizationReader = createOrganizationRepository(async () => connection);
  const before = await organizationReader.read(subject, scope);
  expect(validOrganization({ subject, roles: [], permissions: [], username: null, name: null, email: null }, scope, before ?? undefined)).toBe(true);
  const relation = await service.get(company(companyIds[0]), appId);
  await service.setRelationship(company(companyIds[0]), appId, companyIds[0], relation.relationship!.version, 'INACTIVE');
  const after = await organizationReader.read(subject, scope);
  expect(validOrganization({ subject, roles: [], permissions: [], username: null, name: null, email: null }, scope, after ?? undefined)).toBe(true);

  const deactivated = await service.setStatus(global, appId, (await service.get(global, appId)).version, 'INACTIVE');
  const projection = await connection.collection('organizations').findOne({ id: appId, type: 'THIRD_PARTY' });
  expect(projection?.active).toBe(false);
  const inactiveEvidence = await organizationReader.read(subject, scope);
  expect(validOrganization({ subject, roles: [], permissions: [], username: null, name: null, email: null }, scope, inactiveEvidence ?? undefined)).toBe(false);
  await expect(service.create(global, profile('001'))).rejects.toThrow('THIRD_PARTY_DOCUMENT_CONFLICT');
  await service.setStatus(global, appId, deactivated.version, 'ACTIVE');
  expect((await service.get(global, appId)).thirdParty.status).toBe('ACTIVE');
  expect(await connection.collection('organization_associations').countDocuments({ organizationId: appId, active: true })).toBe(1);
  expect(secondId).not.toBe(appId);
});

it('enforces unique tax identity under concurrency, records minimal events and rolls back a failed audit', async () => {
  const results = await Promise.allSettled([service.create(global, profile('100')), service.create(global, profile('100'))]);
  expect(results.filter(value => value.status === 'fulfilled')).toHaveLength(1);
  expect(await thirdPartyModel(connection).countDocuments({ documentNumber: '100' })).toBe(1);
  const created = results.find(value => value.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof service.create>>>;
  const id = created.value.thirdParty.id;
  const stored = await connection.collection('third_party_management_events').find({ thirdPartyId: id }).toArray();
  expect(stored).toHaveLength(1); expect(stored[0].changedFields).toContain('documentNumber'); expect('email' in stored[0]).toBe(false);

  const broken: ThirdPartyRepository = { ...repository, run: (write, action) => repository.run(write, transaction => {
    let eventsRecorded = 0;
    return action({ ...transaction, record: async event => {
      if (++eventsRecorded === 2) throw new Error('audit failed after relation write');
      await transaction.record(event);
    } });
  }) };
  const profilesBefore = await thirdPartyModel(connection).countDocuments();
  const organizationsBefore = await connection.collection('organizations').countDocuments();
  const relationsBefore = await connection.collection('company_third_party_relations').countDocuments();
  const eventsBefore = await connection.collection('third_party_management_events').countDocuments();
  await expect(serviceFor(broken).create(company(companyIds[0]), profile('101'))).rejects.toThrow('THIRD_PARTY_STORAGE_UNAVAILABLE');
  expect(await thirdPartyModel(connection).countDocuments()).toBe(profilesBefore);
  expect(await connection.collection('organizations').countDocuments()).toBe(organizationsBefore);
  expect(await connection.collection('company_third_party_relations').countDocuments()).toBe(relationsBefore);
  expect(await connection.collection('third_party_management_events').countDocuments()).toBe(eventsBefore);
});

it('rolls profile, projection, relation and audit writes back when each participant fails', async () => {
  const existing = await service.create(global, profile('201'));
  const beforeEvents = await connection.collection('third_party_management_events').countDocuments();
  const beforeProfiles = await thirdPartyModel(connection).countDocuments();
  const beforeOrganizations = await connection.collection('organizations').countDocuments({ type: 'THIRD_PARTY' });
  const profileCollision = serviceFor({ ...repository, nextId: () => existing.thirdParty.id });
  await expect(profileCollision.create(global, profile('202'))).rejects.toThrow();
  expect(await thirdPartyModel(connection).countDocuments()).toBe(beforeProfiles);
  expect(await connection.collection('organizations').countDocuments({ type: 'THIRD_PARTY' })).toBe(beforeOrganizations);
  expect(await connection.collection('third_party_management_events').countDocuments()).toBe(beforeEvents);

  const projectionId = new mongoose.Types.ObjectId().toString();
  await connection.collection('organizations').insertOne({ id: projectionId, type: 'THIRD_PARTY', name: 'Proyección existente', active: true, revision: 1, updatedAt: new Date() });
  const projectionCollision = serviceFor({ ...repository, nextId: () => projectionId });
  await expect(projectionCollision.create(global, profile('203'))).rejects.toThrow();
  expect(await thirdPartyModel(connection).findById(projectionId)).toBeNull();
  expect(await connection.collection('organizations').countDocuments({ id: projectionId, type: 'THIRD_PARTY' })).toBe(1);
  expect(await connection.collection('third_party_management_events').countDocuments()).toBe(beforeEvents);

  const relationId = new mongoose.Types.ObjectId().toString();
  await connection.collection('company_third_party_relations').insertOne({ companyId: companyIds[0], thirdPartyId: relationId, active: true, revision: 1,
    createdAt: new Date(), updatedAt: new Date(), createdBy: 'seed', updatedBy: null, mutationFence: 0 });
  const relationCollision = serviceFor({ ...repository, nextId: () => relationId });
  await expect(relationCollision.create(company(companyIds[0]), profile('204'))).rejects.toThrow();
  expect(await thirdPartyModel(connection).findById(relationId)).toBeNull();
  expect(await connection.collection('organizations').countDocuments({ id: relationId, type: 'THIRD_PARTY' })).toBe(0);
  expect(await connection.collection('third_party_management_events').countDocuments()).toBe(beforeEvents);
});

it('rolls the canonical profile back when the organizations projection fails during update', async () => {
  const created = await service.create(global, profile('205'));
  const eventsBefore = await connection.collection('third_party_management_events').countDocuments({ thirdPartyId: created.thirdParty.id });
  await connection.collection('organizations').deleteOne({ id: created.thirdParty.id, type: 'THIRD_PARTY' });
  await expect(service.update(global, created.thirdParty.id, created.version, { city: 'Medellín' })).rejects.toThrow('THIRD_PARTY_STORAGE_UNAVAILABLE');
  const persisted = await thirdPartyModel(connection).findById(created.thirdParty.id).lean().exec();
  expect(persisted?.city).toBeNull(); expect(persisted?.revision).toBe(1);
  expect(await connection.collection('third_party_management_events').countDocuments({ thirdPartyId: created.thirdParty.id })).toBe(eventsBefore);
});

it('revalidates a global policy after the transaction snapshot before writing', async () => {
  const created = await service.create(global, profile('206'));
  let reached!: () => void; let release!: () => void;
  const atPolicyRead = new Promise<void>(resolve => { reached = resolve; });
  const policyChanged = new Promise<void>(resolve => { release = resolve; });
  let paused = false;
  const gated: ThirdPartyRepository = { ...repository, run: (write, action) => repository.run(write, tx => action({ ...tx, policy: async () => {
    const policy = await tx.policy(); if (!paused) { paused = true; reached(); await policyChanged; } return policy;
  } })) };
  const pending = serviceFor(gated).update(global, created.thirdParty.id, created.version, { city: 'No debe persistir' });
  await atPolicyRead;
  await connection.collection('authorization_policies').updateOne({ _id: 'active' as never }, ({
    $pull: { grants: { role: 'APP_ADMIN', permission: 'third-parties:update', scope: 'global' } }, $inc: { version: 1 },
  }) as never);
  release();
  await expect(pending).rejects.toThrow();
  const persisted = await thirdPartyModel(connection).findById(created.thirdParty.id).lean().exec();
  expect(persisted?.city).toBeNull(); expect(persisted?.revision).toBe(1);
  expect(await connection.collection('third_party_management_events').countDocuments({ thirdPartyId: created.thirdParty.id, action: 'THIRD_PARTY_UPDATED' })).toBe(0);
  await connection.collection('authorization_policies').updateOne({ _id: 'active' as never }, { $set: { grants: grantCeiling }, $inc: { version: 1 } });
});

it('revalidates organization evidence and the relationship after stale reads', async () => {
  const access = company(companyIds[0]);
  const created = await service.create(access, profile('207'));
  const associationFilter = { subject: access.actor.subject, organizationId: companyIds[0], capability: 'COMPANY_ADMIN' };
  const association = await connection.collection('organization_associations').findOne(associationFilter);
  if (!association) throw new Error('Company administrator association missing');
  const eventsBefore = await connection.collection('third_party_management_events').countDocuments({ thirdPartyId: created.thirdParty.id });

  const evidenceGate = async () => {
    let reached!: () => void; let release!: () => void; const seen = new Promise<void>(resolve => { reached = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; }); let paused = false;
    const repo: ThirdPartyRepository = { ...repository, run: (write, action) => repository.run(write, tx => action({ ...tx, evidence: async (subject, scope) => {
      const evidence = await tx.evidence(subject, scope); if (!paused) { paused = true; reached(); await gate; } return evidence;
    } })) };
    return { repo, seen, release: () => release() };
  };

  const evidenceBarrier = await evidenceGate();
  const evidenceWrite = serviceFor(evidenceBarrier.repo).update(access, created.thirdParty.id, created.version, { city: 'No debe persistir' });
  await evidenceBarrier.seen;
  await connection.collection('organization_associations').updateOne({ id: association.id }, { $set: { active: false }, $inc: { revision: 1 } });
  evidenceBarrier.release();
  await expect(evidenceWrite).rejects.toThrow();
  expect((await thirdPartyModel(connection).findById(created.thirdParty.id).lean().exec())?.city).toBeNull();
  expect(await connection.collection('third_party_management_events').countDocuments({ thirdPartyId: created.thirdParty.id })).toBe(eventsBefore);
  await connection.collection('organization_associations').updateOne({ id: association.id }, { $set: { active: true }, $inc: { revision: 1 } });

  const relationBarrier = await evidenceGate();
  const relationWrite = serviceFor(relationBarrier.repo).update(access, created.thirdParty.id, created.version, { city: 'Tampoco debe persistir' });
  await relationBarrier.seen;
  await connection.collection('company_third_party_relations').updateOne({ companyId: companyIds[0], thirdPartyId: created.thirdParty.id, active: true }, { $set: { active: false }, $inc: { revision: 1 } });
  relationBarrier.release();
  await expect(relationWrite).rejects.toThrow();
  expect((await thirdPartyModel(connection).findById(created.thirdParty.id).lean().exec())?.city).toBeNull();
  expect(await connection.collection('third_party_management_events').countDocuments({ thirdPartyId: created.thirdParty.id })).toBe(eventsBefore);
});

it('records minimal append-only events for profile and relationship transitions and ignores no-op retries', async () => {
  const created = await service.create(global, profile('208'));
  const edited = await service.update(global, created.thirdParty.id, created.version, { city: 'Cali' });
  const inactive = await service.setStatus(global, created.thirdParty.id, edited.version, 'INACTIVE');
  await service.setStatus(global, created.thirdParty.id, inactive.version, 'ACTIVE');
  const linked = await service.setRelationship(global, created.thirdParty.id, companyIds[0], null, 'ACTIVE');
  const unlinked = await service.setRelationship(global, created.thirdParty.id, companyIds[0], linked.relationship!.version, 'INACTIVE');
  await service.setRelationship(global, created.thirdParty.id, companyIds[0], unlinked.relationship!.version, 'INACTIVE');
  const beforeRetry = await connection.collection('third_party_management_events').countDocuments({ thirdPartyId: created.thirdParty.id });
  await expect(service.create(global, profile('208'))).rejects.toThrow('THIRD_PARTY_DOCUMENT_CONFLICT');
  const rows = await connection.collection('third_party_management_events').find({ thirdPartyId: created.thirdParty.id }).sort({ at: 1, eventId: 1 }).toArray();
  expect(rows).toHaveLength(6); expect(await connection.collection('third_party_management_events').countDocuments({ thirdPartyId: created.thirdParty.id })).toBe(beforeRetry);
  expect(new Set(rows.map(row => row.eventId)).size).toBe(rows.length);
  expect(rows.every(row => row.subject === 'app-admin' && row.correlationId && row.scope && row.result === 'allowed')).toBe(true);
  expect(rows.map(row => row.action).sort()).toEqual(['RELATIONSHIP_ACTIVATED', 'RELATIONSHIP_DEACTIVATED', 'THIRD_PARTY_ACTIVATED', 'THIRD_PARTY_CREATED', 'THIRD_PARTY_DEACTIVATED', 'THIRD_PARTY_UPDATED'].sort());
  expect(rows.find(row => row.action === 'THIRD_PARTY_UPDATED')?.changedFields).toEqual(['city']);
  expect(rows.filter(row => String(row.action).startsWith('RELATIONSHIP_')).every(row => row.companyId === companyIds[0] && row.changedFields?.includes('relationship.status'))).toBe(true);
  expect(JSON.stringify(rows)).not.toMatch(/contact@example|token|password|credential|payload/i);
});

it('inventories legacy third-party organizations idempotently without fabricating a profile or relation', async () => {
  const legacyId = new mongoose.Types.ObjectId().toString();
  await connection.collection('organizations').insertOne({ id: legacyId, type: 'THIRD_PARTY', name: 'Tercero legado', active: true, revision: 1, updatedAt: new Date() });
  const first = await inventoryLegacyThirdParties(connection, new Date('2026-01-01T00:00:00.000Z'));
  const second = await inventoryLegacyThirdParties(connection, new Date('2026-01-02T00:00:00.000Z'));
  expect(first.awaitingReconciliation).toBeGreaterThanOrEqual(1);
  expect(second.awaitingReconciliation).toBe(first.awaitingReconciliation);
  expect(await connection.collection('third_party_legacy_inventory').countDocuments({ thirdPartyId: legacyId, status: 'PROFILE_RECONCILIATION_REQUIRED' })).toBe(1);
  expect(await thirdPartyModel(connection).countDocuments({ _id: new mongoose.Types.ObjectId(legacyId) })).toBe(0);
  expect(await connection.collection('company_third_party_relations').countDocuments({ thirdPartyId: legacyId })).toBe(0);
});
