import { expect, it, vi } from 'vitest';
import type { Connection } from 'mongoose';
import { createNotificationRepository } from '@/modules/notifications/infrastructure/mongodb/notification-repository';

it('backfills terminal records and deletes only expired records with completed projections', async () => {
  const records = {
    updateMany: vi.fn(async () => ({})), createIndex: vi.fn(async () => 'index'),
    deleteMany: vi.fn(async () => ({ deletedCount: 2 })),
  };
  const repository = createNotificationRepository(async () => ({ collection: () => records } as unknown as Connection),
    { encrypt: async value => value as never, decrypt: async <T,>() => ({} as T) });
  await repository.prepare();
  expect(records.updateMany).toHaveBeenCalledWith({ status: { $in: ['SENT', 'FAILED', 'SUPPRESSED'] }, retentionUntil: { $exists: false } }, [
    { $set: { retentionUntil: { $dateAdd: { startDate: { $ifNull: ['$updatedAt', '$createdAt'] }, unit: 'day', amount: 90 } } } },
  ]);
  const now = new Date('2026-11-15T00:00:00Z');
  await expect(repository.purgeExpired(now)).resolves.toBe(2);
  expect(records.deleteMany).toHaveBeenCalledWith({ status: { $in: ['SENT', 'FAILED', 'SUPPRESSED'] },
    retentionUntil: { $lte: now }, projectionPending: false, payload: null });
});

it('sets retention from terminal time and clears encrypted payload', async () => {
  const records = { updateMany: vi.fn(async () => ({})), createIndex: vi.fn(async () => 'index'), updateOne: vi.fn(async (filter: unknown, update: unknown) => { void filter; void update; return { modifiedCount: 1 }; }) };
  const repository = createNotificationRepository(async () => ({ collection: () => records } as unknown as Connection),
    { encrypt: async value => value as never, decrypt: async <T,>() => ({} as T) });
  await repository.prepare();
  const terminalAt = new Date('2026-11-15T00:00:00Z');
  await repository.finishAttempt({ id: 'n1', owner: 'worker', now: terminalAt, outcome: 'SENT', failure: null });
  const pipeline = records.updateOne.mock.calls[0]?.[1] as [{ $set: Record<string, unknown> }];
  expect(pipeline[0].$set.retentionUntil).toEqual(new Date(terminalAt.getTime() + 90 * 24 * 60 * 60 * 1000));
  expect(pipeline[0].$set.payload).toBeNull();
});
