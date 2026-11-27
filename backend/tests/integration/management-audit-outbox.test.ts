import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';
import { createManagementAuditOutboxWorker } from '@/modules/organizations/application/management-audit-outbox-worker';
import { createMongoManagementAuditOutbox } from '@/modules/organizations/infrastructure/mongodb/management-audit-outbox';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('MONGODB_TEST_URI must name an isolated _test database');
const database = `invoices_org_audit_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 3000 });

beforeAll(async () => {
  await connection.asPromise();
  await connection.collection('company_management_events').createIndex({ eventId: 1 }, { unique: true });
  await connection.collection('third_party_management_events').createIndex({ eventId: 1 }, { unique: true });
});
afterAll(async () => {
  if (connection.readyState === 1 && connection.name === database && /^invoices_org_audit_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close();
});

const fixture = (eventId: string) => ({ eventId, correlationId: 'corr-1', at: '2026-01-01T00:00:00.000Z', subject: 'admin-1',
  companyId: 'company-1', scope: { kind: 'global', companyId: null, thirdPartyId: null }, action: 'COMPANY_UPDATED',
  beforeVersion: '1', afterVersion: '2', changedFields: ['businessName'], before: { documentNumber: 'must-not-be-copied' }, after: { documentNumber: 'must-not-be-copied' }, delivered: false });

it('retries captures idempotently and acknowledges only after the central write succeeds', async () => {
  const eventId = randomUUID(); const row = fixture(eventId);
  await connection.collection('company_management_events').insertOne(row);
  const outbox = createMongoManagementAuditOutbox(async () => connection);
  let failBeforeWrite = true;
  const retryWorker = createManagementAuditOutboxWorker({ outbox, audit: { async record(event) {
    if (failBeforeWrite) { failBeforeWrite = false; throw new Error('INTERRUPTED_BEFORE_WRITE'); }
    await createMongoAuditWriter(connection).record(event);
  } } });
  await expect(retryWorker.deliverBatch()).rejects.toThrow('INTERRUPTED_BEFORE_WRITE');
  expect((await connection.collection('company_management_events').findOne({ eventId }))?.delivered).toBe(false);

  let failBeforeAck = true;
  const originalAcknowledge = outbox.acknowledge.bind(outbox);
  const acknowledgeAfterCrash = { ...outbox, async acknowledge(source: 'company_management_events' | 'third_party_management_events', id: string) {
    if (failBeforeAck) { failBeforeAck = false; throw new Error('INTERRUPTED_AFTER_WRITE'); }
    await originalAcknowledge(source, id);
  } };
  const ackWorker = createManagementAuditOutboxWorker({ outbox: acknowledgeAfterCrash, audit: { async record(event) { await createMongoAuditWriter(connection).record(event); } } });
  await expect(ackWorker.deliverBatch()).rejects.toThrow('INTERRUPTED_AFTER_WRITE');
  expect(await connection.collection('audit_events').countDocuments({ _id: eventId as never })).toBe(1);
  expect((await connection.collection('company_management_events').findOne({ eventId: eventId as never }))?.delivered).toBe(false);
  await ackWorker.deliverBatch();
  expect(await connection.collection('audit_events').countDocuments({ _id: eventId as never })).toBe(1);
  expect((await connection.collection('company_management_events').findOne({ eventId: eventId as never }))?.delivered).toBe(true);
  const audit = await connection.collection('audit_events').findOne({ _id: eventId as never });
  expect(audit).not.toHaveProperty('before'); expect(audit).not.toHaveProperty('after'); expect(audit).not.toHaveProperty('changedFields');
});

it('delivers invitation lifecycle evidence with organization scope and without invitation material', async () => {
  const eventId = randomUUID();
  await connection.collection('organizations').insertOne({ id: 'third-party-1', type: 'THIRD_PARTY', name: 'not copied', active: true });
  await connection.collection('organization_invitation_events').insertOne({ eventId, invitationId: 'invitation-1', organizationId: 'third-party-1',
    actorSubject: null, subject: 'accepting-user', action: 'INVITATION_ACCEPTED', at: new Date('2026-01-01T00:00:00.000Z'), version: 2,
    roles: ['THIRD_PARTY_ADMIN'], tokenVersion: 9, tokenHash: 'must-not-copy', delivered: false });
  const worker = createManagementAuditOutboxWorker({ outbox: createMongoManagementAuditOutbox(async () => connection),
    audit: { async record(event) { await createMongoAuditWriter(connection).record(event); } } });
  expect(await worker.deliverBatch()).toBe(1);
  const stored = await connection.collection('audit_events').findOne({ _id: eventId as never });
  expect(stored).toMatchObject({ source: 'organizations', action: 'INVITATION_ACCEPTED', actor: { kind: 'user', subject: 'accepting-user' },
    scope: { companyId: null, thirdPartyId: 'third-party-1' }, resource: { type: 'invitation', id: 'invitation-1' }, afterVersion: '2' });
  expect(stored).not.toHaveProperty('token'); expect(stored).not.toHaveProperty('tokenHash'); expect(stored).not.toHaveProperty('roles');
  expect((await connection.collection('organization_invitation_events').findOne({ eventId: eventId as never }))?.delivered).toBe(true);
});
