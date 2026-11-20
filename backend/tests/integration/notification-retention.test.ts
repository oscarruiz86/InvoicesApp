import mongoose, { type Connection } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createNotificationRepository } from '@/modules/notifications/infrastructure/mongodb/notification-repository';

const sourceUri = process.env.NOTIFICATIONS_RETENTION_TEST_URI;
const enabled = Boolean(sourceUri);
let connection: Connection | undefined;

beforeAll(async () => {
  if (!sourceUri) return;
  const uri = new URL(sourceUri);
  uri.pathname = `/notifications_retention_${process.pid}_${Date.now()}_test`;
  connection = await mongoose.createConnection(uri.toString(), { serverSelectionTimeoutMS: 5000 }).asPromise();
});
afterAll(async () => {
  if (connection) { await connection.dropDatabase(); await connection.close(); }
});

it.skipIf(!enabled)('purges only expired terminal rows after a real Mongo migration', async () => {
  if (!connection) throw new Error('TEST_DATABASE_NOT_CONNECTED');
  const now = new Date();
  const expired = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000);
  const records = connection.collection('notifications');
  await records.insertMany([
    { id: 'expired-terminal', type: 'INVITATION_CREATED', channel: 'email', idempotencyKey: 'expired', status: 'SENT', createdAt: expired, updatedAt: expired, projectionPending: false, payload: null },
    { id: 'expired-projection', type: 'INVITATION_CREATED', channel: 'email', idempotencyKey: 'projection', status: 'FAILED', createdAt: expired, updatedAt: expired, projectionPending: true, payload: null },
    { id: 'pending-active', type: 'INVITATION_CREATED', channel: 'email', idempotencyKey: 'pending', status: 'PENDING', createdAt: expired, projectionPending: false, payload: { ciphertext: 'retained' } },
    { id: 'recent-terminal', type: 'INVITATION_CREATED', channel: 'email', idempotencyKey: 'recent', status: 'SUPPRESSED', createdAt: now, updatedAt: now, projectionPending: false, payload: null },
  ]);
  const repository = createNotificationRepository(async () => connection!, {
    encrypt: async value => value as never, decrypt: async <T,>() => ({} as T),
  });
  await repository.prepare();
  expect(await repository.purgeExpired(now)).toBe(1);
  expect(await records.findOne({ id: 'expired-terminal' })).toBeNull();
  expect(await records.findOne({ id: 'expired-projection' })).not.toBeNull();
  expect(await records.findOne({ id: 'pending-active' })).not.toBeNull();
  expect(await records.findOne({ id: 'recent-terminal' })).not.toBeNull();
});
