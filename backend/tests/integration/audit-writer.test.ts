import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('MONGODB_TEST_URI must name an isolated _test database');
const database = `invoices_audit_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 3000 });
const audit = createMongoAuditWriter(connection);
const event = (eventId: string) => ({ eventId, occurredAt: '2026-01-31T12:00:00.000Z', source: 'authorization' as const,
  actor: { kind: 'user' as const, subject: 'admin-fixture' }, action: 'POLICY_CHANGED', result: 'allowed' as const, reason: 'POLICY', correlationId: 'correlation-1',
  scope: { companyId: null, thirdPartyId: null }, resource: { type: 'authorization-policy', id: 'active' }, beforeVersion: '1', afterVersion: '2' });

beforeAll(async () => { await connection.asPromise(); });
afterAll(async () => {
  if (connection.readyState === 1 && connection.name === database && /^invoices_audit_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close();
});

it('stores one immutable event on retry, detects conflicting reuse, and creates a two-year TTL index', async () => {
  const input = event(randomUUID());
  await audit.record(input);
  await audit.record(input);
  expect(await connection.collection('audit_events').countDocuments({ _id: input.eventId as never })).toBe(1);
  const stored = await connection.collection('audit_events').findOne({ _id: input.eventId as never });
  expect(stored?.expiresAt.toISOString()).toBe('2028-01-31T12:00:00.000Z');
  expect(stored).not.toHaveProperty('token');
  expect(stored).not.toHaveProperty('payload');
  await expect(audit.record({ ...input, action: 'OTHER_ACTION' })).rejects.toThrow('AUDIT_EVENT_CONFLICT');
  expect((await connection.collection('audit_events').findOne({ _id: input.eventId as never }))?.action).toBe('POLICY_CHANGED');
  const index = (await connection.collection('audit_events').indexes()).find(item => item.name === 'audit_retention_two_years');
  expect(index).toMatchObject({ key: { expiresAt: 1 }, expireAfterSeconds: 0 });
});
