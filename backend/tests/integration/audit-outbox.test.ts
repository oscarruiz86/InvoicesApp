import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';
import { createPolicyAuditOutboxWorker } from '@/modules/audit/application/policy-outbox-worker';
import { authorizationAuditEvent } from '@/modules/identity/infrastructure/audit-event';
import { createPolicyRepository } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { grantCeiling } from '@/modules/identity/domain/permissions';
import type { SecurityEvent } from '@/modules/identity/application/authorization-ports';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('MONGODB_TEST_URI must name an isolated _test database');
const database = `invoices_audit_outbox_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 3000 });
const policy = createPolicyRepository(async () => connection);
const audit = createMongoAuditWriter(connection);
const event = (version: string): SecurityEvent => ({ eventId: randomUUID(), at: new Date().toISOString(), subject: 'admin-fixture', action: 'POLICY_CHANGED', result: 'allowed',
  reason: 'POLICY', correlationId: randomUUID(), suppressed: 0, beforeVersion: version });
beforeAll(async () => { await connection.asPromise(); await policy.initialize(); });
afterAll(async () => {
  if (connection.readyState === 1 && connection.name === database && /^invoices_audit_outbox_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close();
});

it('recovers after Audit insert but before outbox acknowledgement without duplicating the fact', async () => {
  const captured = event('1');
  await policy.replace('1', grantCeiling.filter(grant => grant.permission !== 'companies:create'), captured);
  let interrupt = true;
  const worker = createPolicyAuditOutboxWorker({ outbox: { pendingEvents: limit => policy.pendingEvents(limit), async acknowledgeEvent(id) {
      if (interrupt) { interrupt = false; throw new Error('PROCESS_INTERRUPTED'); }
      await policy.acknowledgeEvent(id);
    } }, audit, map: authorizationAuditEvent });
  await expect(worker.deliverBatch(10)).rejects.toThrow('PROCESS_INTERRUPTED');
  expect(await connection.collection('audit_events').countDocuments({ _id: captured.eventId as never })).toBe(1);
  expect(await policy.pendingEvents()).toHaveLength(1);
  expect(await worker.deliverBatch(10)).toBe(1);
  expect(await connection.collection('audit_events').countDocuments({ _id: captured.eventId as never })).toBe(1);
  expect(await policy.pendingEvents()).toHaveLength(0);
});

it('retains the captured policy event when the Audit sink fails', async () => {
  const captured = event('2');
  const current = await policy.read();
  await policy.replace(current.version, current.grants.filter(grant => grant.permission !== 'third-parties:create'), captured);
  const worker = createPolicyAuditOutboxWorker({ outbox: policy, audit: { async record() { throw new Error('AUDIT_UNAVAILABLE'); } }, map: authorizationAuditEvent });
  await expect(worker.deliverBatch()).rejects.toThrow('AUDIT_UNAVAILABLE');
  expect((await policy.pendingEvents()).map(value => value.eventId)).toContain(captured.eventId);
});
