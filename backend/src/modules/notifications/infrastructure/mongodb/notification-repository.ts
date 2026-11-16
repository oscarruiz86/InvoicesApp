import { createHash } from 'node:crypto';
import type { ClientSession, Connection } from 'mongoose';
import type { InvitationNotificationRequest, NotificationRecord } from '../../domain/notification';
import type { PayloadCipher } from '../../application/ports';
import type { NotificationFailure } from '../../domain/notification';
import { NotificationConflict } from '../../application/ports';

const collectionName = 'notifications';
function fingerprint(input: InvitationNotificationRequest) { return createHash('sha256').update(JSON.stringify({ type: input.type, channel: input.channel,
  recipient: input.recipient, language: input.language, functionalReference: input.functionalReference, expiresAt: input.expiresAt.toISOString(), payload: input.payload })).digest('hex'); }
export function createNotificationRepository(connect: () => Promise<Connection>, cipher: PayloadCipher) {
  let initialized: Promise<void> | undefined;
  async function collection() {
    const connection = await connect();
    if (!initialized) initialized = (async () => {
      const records = connection.collection(collectionName);
      await records.createIndex({ status: 1, retentionUntil: 1, projectionPending: 1 });
      await records.updateMany({ status: { $in: ['SENT', 'FAILED', 'SUPPRESSED'] }, retentionUntil: { $exists: false } }, [{
        $set: { retentionUntil: { $dateAdd: { startDate: { $ifNull: ['$updatedAt', '$createdAt'] }, unit: 'day', amount: 90 } } },
      }]);
      await Promise.all([
        records.createIndex({ type: 1, channel: 1, idempotencyKey: 1 }, { unique: true }),
        records.createIndex({ status: 1, nextAttemptAt: 1, leaseUntil: 1 }),
        records.createIndex({ projectionPending: 1, leaseUntil: 1 }),
      ]);
    })().catch(error => { initialized = undefined; throw error; });
    await initialized; return { connection, records: connection.collection(collectionName) };
  }
  return {
    async prepare() { await collection(); },
    async enqueueInvitation(input: InvitationNotificationRequest, session: ClientSession): Promise<NotificationRecord> {
      const { records } = await collection(); const fp = fingerprint(input);
      const existing = await records.findOne({ type: input.type, channel: input.channel, idempotencyKey: input.idempotencyKey }, { session });
      if (existing) { if (existing.fingerprint !== fp) throw new NotificationConflict(); return existing as unknown as NotificationRecord; }
      const payload = await cipher.encrypt(input.payload);
      const value = { id: input.id, type: input.type, channel: input.channel, recipient: input.recipient, language: input.language,
        functionalReference: input.functionalReference, idempotencyKey: input.idempotencyKey, payload, expiresAt: input.expiresAt,
        createdAt: input.createdAt, status: 'PENDING', attempts: 0, attemptHistory: [], nextAttemptAt: input.createdAt,
        leaseUntil: null, owner: null, terminalFailure: null, projectionPending: false, projectionStatus: null,
        projectionData: input.projectionData, fingerprint: fp };
      try { await records.insertOne(value, { session }); return value as unknown as NotificationRecord; }
      catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new NotificationConflict(); throw error; }
    },
    async claimDue({ owner, now, leaseMs }: { owner: string; now: Date; leaseMs: number }): Promise<NotificationRecord | null> {
      const { records } = await collection();
      const value = await records.findOneAndUpdate({ attempts: { $lte: 5 }, $or: [
        { status: 'PENDING', nextAttemptAt: { $lte: now } }, { status: 'PROCESSING', leaseUntil: { $lte: now } },
      ] }, [{ $set: { previousAttempts: '$attempts', attempts: { $min: [5, { $add: ['$attempts', 1] }] },
        status: 'PROCESSING', owner, leaseUntil: new Date(now.getTime() + leaseMs), recoveredLease: { $eq: ['$status', 'PROCESSING'] },
        attemptHistory: { $concatArrays: [{ $ifNull: ['$attemptHistory', []] }, [{ number: { $min: [5, { $add: ['$attempts', 1] }] }, startedAt: now, outcome: 'PROCESSING' }]] } } }],
        { sort: { nextAttemptAt: 1, createdAt: 1 }, returnDocument: 'after' });
      return value as unknown as NotificationRecord | null;
    },
    async claimProjection(owner: string, now: Date, leaseMs: number): Promise<NotificationRecord | null> {
      const { records } = await collection();
      const value = await records.findOneAndUpdate({ projectionPending: true, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }] },
        { $set: { owner, leaseUntil: new Date(now.getTime() + leaseMs) } }, { sort: { createdAt: 1 }, returnDocument: 'after' });
      return value as unknown as NotificationRecord | null;
    },
    async finishAttempt(input: { id: string; owner: string; now: Date; outcome: 'SENT' | 'FAILED' | 'SUPPRESSED' | 'RETRY'; failure: NotificationFailure | null; nextAttemptAt?: Date; serverReference?: string | null; project?: boolean }) {
      const { records } = await collection(); const terminal = input.outcome !== 'RETRY';
      const update = { $set: { status: input.outcome === 'RETRY' ? 'PENDING' : input.outcome,
        nextAttemptAt: input.nextAttemptAt ?? input.now, terminalFailure: input.failure, leaseUntil: null, owner: null,
        ...(terminal ? { retentionUntil: new Date(input.now.getTime() + 90 * 24 * 60 * 60 * 1000), projectionPending: input.project !== false, projectionStatus: input.project === false ? null : input.outcome === 'SENT' ? 'LOGGED' : 'FAILED', payload: null } : {}),
        ...(input.serverReference ? { serverReference: input.serverReference } : {}), updatedAt: input.now,
        attemptHistory: { $map: { input: { $ifNull: ['$attemptHistory', []] }, as: 'attempt', in: { $cond: [
          { $eq: ['$$attempt.number', '$attempts'] }, { $mergeObjects: ['$$attempt', { finishedAt: { $literal: input.now }, outcome: { $literal: input.outcome }, failure: { $literal: input.failure } }] }, '$$attempt' ] } } } } };
      await records.updateOne({ id: input.id, owner: input.owner, status: 'PROCESSING' }, [update]);
    },
    async purgeExpired(now: Date) {
      const { records } = await collection();
      const result = await records.deleteMany({ status: { $in: ['SENT', 'FAILED', 'SUPPRESSED'] }, retentionUntil: { $lte: now },
        projectionPending: false, payload: null });
      return result.deletedCount;
    },
    async operationalStats(now: Date) {
      const { records } = await collection();
      const [pending, processing, retryPending, terminalFailed, projectionPending, oldest] = await Promise.all([
        records.countDocuments({ status: 'PENDING' }), records.countDocuments({ status: 'PROCESSING' }),
        records.countDocuments({ status: 'PENDING', attempts: { $gt: 0 } }), records.countDocuments({ status: 'FAILED' }), records.countDocuments({ projectionPending: true }),
        records.find({ status: { $in: ['PENDING', 'PROCESSING'] } }, { projection: { createdAt: 1 } }).sort({ createdAt: 1 }).limit(1).next(),
      ]);
      return { pending, processing, retryPending, terminalFailed, projectionPending,
        oldestPendingSeconds: oldest?.createdAt instanceof Date ? Math.max(0, Math.floor((now.getTime() - oldest.createdAt.getTime()) / 1000)) : 0 };
    },    async finishProjection(input: { id: string; owner: string; success: boolean; now: Date }) {
      const { records } = await collection();
      await records.updateOne({ id: input.id, owner: input.owner, projectionPending: true }, { $set: {
        projectionPending: !input.success, projectionCompletedAt: input.success ? input.now : null, owner: null, leaseUntil: null, updatedAt: input.now,
      } });
    },
  };
}
