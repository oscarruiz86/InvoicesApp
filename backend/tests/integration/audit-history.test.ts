import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createAuditHistoryQueries } from '@/modules/audit/application/audit-history';
import { createMongoAuditHistoryReader } from '@/modules/audit/infrastructure/mongodb/audit-history-reader';
import { createMongoAuditWriter, prepareMongoAudit } from '@/modules/audit/infrastructure/mongodb/audit-writer';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Isolated _test database required');
const database = `audit_history_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
let queries: ReturnType<typeof createAuditHistoryQueries>;
const writer = createMongoAuditWriter(connection);
beforeAll(async () => {
  await connection.asPromise(); await prepareMongoAudit(connection);
  queries = createAuditHistoryQueries({ reader: createMongoAuditHistoryReader(connection), writer, now: () => new Date(), nextId: randomUUID });
});
beforeEach(async () => { await connection.collection('audit_events').deleteMany({}); });
afterAll(async () => { if (connection.readyState === 1 && /^audit_history_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase(); await connection.close(); });

it('persists each access durably, paginates a stable snapshot, and shows earlier reads on a new query', async () => {
  const at = new Date(Date.now() - 10_000).toISOString();
  const base = (eventId: string) => ({ eventId, occurredAt: at, source: 'authorization' as const, actor: { kind: 'user' as const, subject: 'admin_1' },
    action: 'ACCESS_DENIED', result: 'denied' as const, reason: 'PERMISSION', correlationId: `corr_${eventId}` });
  await writer.record(base('event_a'));
  await writer.record(base('event_b'));
  const first = await queries.list({ pageSize: 1, actorSubject: 'admin_1', correlationId: 'request_a' });
  expect(first.items.map(event => event.eventId)).toEqual(['event_b']);
  expect(first.nextCursor).toBeTruthy();
  const second = await queries.list({ pageSize: 1, cursor: first.nextCursor!, actorSubject: 'admin_1', correlationId: 'request_b' });
  expect(second.items.map(event => event.eventId)).toEqual(['event_a']);
  const accessRows = await connection.collection('audit_events').find({ source: 'audit', action: 'AUDIT_HISTORY_READ' }).toArray();
  expect(accessRows).toHaveLength(2);
  expect(accessRows.every(row => row.actor.subject === 'admin_1' && !('filters' in row))).toBe(true);
  const later = await queries.list({ pageSize: 10, actorSubject: 'admin_1', correlationId: 'request_c' });
  expect(later.items.filter(event => event.source === 'audit').length).toBeGreaterThanOrEqual(2);
});
