import { Types, type Connection } from 'mongoose';
import { createInvoiceSubmission, InvoiceSubmissionError, transitionInvoiceSubmission, type InvoiceSubmission, type InvoiceSubmissionStatus } from '../../domain/submission';

const collectionName = 'invoice_sync_submissions';
const imageCleanupCollectionName = 'invoice_sync_image_cleanup';
const resolutionEventCollectionName = 'invoice_sync_resolution_events';
type Row = Record<string, unknown>;

function decode(row: Row): InvoiceSubmission {
  if (!(row._id instanceof Types.ObjectId) || typeof row.payload !== 'object' || !row.payload || !(row.createdAt instanceof Date)
    || !(row.updatedAt instanceof Date) || !Number.isSafeInteger(row.version) || typeof row.requestHash !== 'string'
    || typeof row.idempotencyKey !== 'string' || !Array.isArray(row.causes) || typeof row.status !== 'string') throw new Error('SUBMISSION_STORAGE_UNAVAILABLE');
  try {
    const created = createInvoiceSubmission({ id: row._id.toString(), ownerSubject: String(row.ownerSubject), thirdPartyId: String(row.thirdPartyId),
      origin: row.origin as 'MANUAL' | 'QR', assignmentId: String(row.assignmentId), vehicleId: String(row.vehicleId), idempotencyKey: row.idempotencyKey,
      requestHash: row.requestHash, payload: row.payload as Record<string, string>, imageReference: row.imageReference as InvoiceSubmission['imageReference'], now: row.createdAt });
    if (!['PENDING', 'CONFLICT', 'REQUIRES_CORRECTION', 'SYNCHRONIZED', 'LINKED', 'REJECTED'].includes(row.status)
      || row.candidateInvoiceIds !== undefined && !Array.isArray(row.candidateInvoiceIds)) throw new Error();
    return Object.freeze({ ...created, causes: row.causes as InvoiceSubmission['causes'], candidateInvoiceIds: (row.candidateInvoiceIds ?? []) as string[], status: row.status as InvoiceSubmissionStatus,
      version: Number(row.version), updatedAt: row.updatedAt, expiresAt: row.expiresAt instanceof Date ? row.expiresAt : null,
      resultInvoiceId: typeof row.resultInvoiceId === 'string' ? row.resultInvoiceId : null,
      resolutionReason: typeof row.resolutionReason === 'string' ? row.resolutionReason : null });
  } catch { throw new Error('SUBMISSION_STORAGE_UNAVAILABLE'); }
}

export function createMongoInvoiceSubmissionRepository(connect: () => Promise<Connection>) {
  const ready = new WeakSet<Connection>();
  async function database() {
    const connection = await connect();
    if (!ready.has(connection)) {
      const rows = connection.collection(collectionName);
      await Promise.all([
        rows.createIndex({ thirdPartyId: 1, ownerSubject: 1, idempotencyKey: 1 }, { unique: true, name: 'invoice_sync_owner_idempotency_unique' }),
        rows.createIndex({ thirdPartyId: 1, ownerSubject: 1, createdAt: -1, _id: -1 }, { name: 'invoice_sync_owner_history' }),
        rows.createIndex({ thirdPartyId: 1, createdAt: -1, _id: -1 }, { name: 'invoice_sync_third_party_history' }),
        rows.createIndex({ thirdPartyId: 1, status: 1, createdAt: 1, _id: 1 }, { name: 'invoice_sync_conflict_queue' }),
        rows.createIndex({ status: 1, expiresAt: 1 }, { partialFilterExpression: { expiresAt: { $type: 'date' } }, name: 'invoice_sync_conflict_expiry' }),
        connection.collection(imageCleanupCollectionName).createIndex({ submissionId: 1 }, { unique: true, name: 'invoice_sync_image_cleanup_unique' }),
        connection.collection(resolutionEventCollectionName).createIndex({ eventId: 1 }, { unique: true, name: 'invoice_sync_resolution_event_unique' }),
      ]);
      ready.add(connection);
    }
    return { connection, rows: connection.collection(collectionName), imageCleanup: connection.collection(imageCleanupCollectionName) };
  }
  return {
    async create(input: Parameters<typeof createInvoiceSubmission>[0]): Promise<InvoiceSubmission> {
      const submission = createInvoiceSubmission(input);
      try { await (await database()).rows.insertOne({ _id: new Types.ObjectId(submission.id), ...submission }); return submission; }
      catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
          const existing = await (await database()).rows.findOne({ thirdPartyId: submission.thirdPartyId, ownerSubject: submission.ownerSubject,
            idempotencyKey: submission.idempotencyKey });
          if (existing && existing.requestHash === submission.requestHash) return decode(existing as Row);
          throw new Error('IDEMPOTENCY_CONFLICT');
        }
        throw new Error('SUBMISSION_STORAGE_UNAVAILABLE');
      }
    },
    async find(input: { readonly id: string; readonly thirdPartyId: string; readonly ownerSubject?: string }): Promise<InvoiceSubmission | null> {
      if (!/^[a-f0-9]{24}$/.test(input.id)) return null;
      const row = await (await database()).rows.findOne({ _id: new Types.ObjectId(input.id), thirdPartyId: input.thirdPartyId,
        ...(input.ownerSubject ? { ownerSubject: input.ownerSubject } : {}) });
      return row ? decode(row as Row) : null;
    },
    async findByIdentity(input: { readonly thirdPartyId: string; readonly ownerSubject: string; readonly idempotencyKey: string }): Promise<InvoiceSubmission | null> {
      const row = await (await database()).rows.findOne({ thirdPartyId: input.thirdPartyId, ownerSubject: input.ownerSubject, idempotencyKey: input.idempotencyKey });
      return row ? decode(row as Row) : null;
    },
    async listConflicts(input: { readonly thirdPartyId: string; readonly page: number; readonly pageSize: number }) {
      const { rows } = await database();
      const query = { thirdPartyId: input.thirdPartyId, status: 'CONFLICT' };
      const [items, total] = await Promise.all([rows.find(query).sort({ createdAt: 1, _id: 1 }).skip((input.page - 1) * input.pageSize).limit(input.pageSize).toArray(), rows.countDocuments(query)]);
      return { items: items.map(row => decode(row as Row)), total, page: input.page, pageSize: input.pageSize };
    },
    async listOwned(input: { readonly ownerSubject: string; readonly thirdPartyId: string; readonly page: number; readonly pageSize: number }) {
      if (!input.ownerSubject || input.ownerSubject.length > 128 || !/^[a-f0-9]{24}$/.test(input.thirdPartyId)
        || !Number.isSafeInteger(input.page) || input.page < 1 || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100)
        throw new Error('INVALID_REQUEST');
      const { connection, rows } = await database();
      const query = { ownerSubject: input.ownerSubject, thirdPartyId: input.thirdPartyId };
      const [values, total] = await Promise.all([rows.find(query).sort({ createdAt: -1, _id: -1 })
        .skip((input.page - 1) * input.pageSize).limit(input.pageSize).toArray(), rows.countDocuments(query)]);
      const records = values.map(row => decode(row as Row));
      const ids = records.map(record => record.id);
      const eventRows = ids.length ? await connection.collection(resolutionEventCollectionName)
        .find({ thirdPartyId: input.thirdPartyId, submissionId: { $in: ids } }).sort({ at: -1, eventId: -1 }).toArray() : [];
      const resolutions = new Map<string, { action: 'LINK_DUPLICATE' | 'APPROVE_CLOSED_ASSIGNMENT' | 'REJECT'; at: Date; reason: string; resultInvoiceId?: string }>();
      for (const event of eventRows) {
        if (typeof event.submissionId !== 'string' || resolutions.has(event.submissionId) || !(event.at instanceof Date)
          || typeof event.reason !== 'string' || !['LINK_DUPLICATE', 'APPROVE_CLOSED_ASSIGNMENT', 'REJECT'].includes(String(event.action))) continue;
        resolutions.set(event.submissionId, { action: event.action as 'LINK_DUPLICATE' | 'APPROVE_CLOSED_ASSIGNMENT' | 'REJECT',
          at: event.at, reason: event.reason, ...(typeof event.resultInvoiceId === 'string' ? { resultInvoiceId: event.resultInvoiceId } : {}) });
      }
      return { items: records.map(record => ({ record, resolution: resolutions.get(record.id) ?? null })), total,
        page: input.page, pageSize: input.pageSize };
    },
    async listForThirdParty(input: { readonly thirdPartyId: string; readonly page: number; readonly pageSize: number }) {
      if (!/^[a-f0-9]{24}$/.test(input.thirdPartyId) || !Number.isSafeInteger(input.page) || input.page < 1
        || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) throw new Error('INVALID_REQUEST');
      const { connection, rows } = await database();
      const query = { thirdPartyId: input.thirdPartyId };
      const [values, total] = await Promise.all([rows.find(query).sort({ createdAt: -1, _id: -1 })
        .skip((input.page - 1) * input.pageSize).limit(input.pageSize).toArray(), rows.countDocuments(query)]);
      const records = values.map(row => decode(row as Row));
      const ids = records.map(record => record.id);
      const eventRows = ids.length ? await connection.collection(resolutionEventCollectionName)
        .find({ thirdPartyId: input.thirdPartyId, submissionId: { $in: ids } }).sort({ at: -1, eventId: -1 }).toArray() : [];
      const resolutions = new Map<string, { action: 'LINK_DUPLICATE' | 'APPROVE_CLOSED_ASSIGNMENT' | 'REJECT'; at: Date; reason: string; resultInvoiceId?: string }>();
      for (const event of eventRows) {
        if (typeof event.submissionId !== 'string' || resolutions.has(event.submissionId) || !(event.at instanceof Date)
          || typeof event.reason !== 'string' || !['LINK_DUPLICATE', 'APPROVE_CLOSED_ASSIGNMENT', 'REJECT'].includes(String(event.action))) continue;
        resolutions.set(event.submissionId, { action: event.action as 'LINK_DUPLICATE' | 'APPROVE_CLOSED_ASSIGNMENT' | 'REJECT',
          at: event.at, reason: event.reason, ...(typeof event.resultInvoiceId === 'string' ? { resultInvoiceId: event.resultInvoiceId } : {}) });
      }
      return { items: records.map(record => ({ record, resolution: resolutions.get(record.id) ?? null })), total,
        page: input.page, pageSize: input.pageSize };
    },
    async transition(input: Parameters<typeof transitionInvoiceSubmission>[0]): Promise<InvoiceSubmission> {
      const next = transitionInvoiceSubmission(input);
      const { connection, rows, imageCleanup } = await database();
      await connection.transaction(async session => {
        const result = await rows.replaceOne({ _id: new Types.ObjectId(input.current.id), thirdPartyId: input.current.thirdPartyId,
          ownerSubject: input.current.ownerSubject, status: input.current.status, version: input.expectedVersion }, { _id: new Types.ObjectId(next.id), ...next }, { session });
        if (result.modifiedCount !== 1) throw new InvoiceSubmissionError('SUBMISSION_VERSION_CONFLICT');
        if (['SYNCHRONIZED', 'LINKED', 'REJECTED'].includes(next.status) && next.imageReference) {
          await imageCleanup.updateOne({ submissionId: next.id }, { $setOnInsert: { submissionId: next.id, thirdPartyId: next.thirdPartyId,
            ownerSubject: next.ownerSubject, reference: next.imageReference, createdAt: next.updatedAt } }, { upsert: true, session });
        }
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
      return next;
    },
    async scheduleImageCleanup(input: { readonly submissionId: string; readonly thirdPartyId: string; readonly ownerSubject: string;
      readonly reference: NonNullable<InvoiceSubmission['imageReference']>; readonly now: Date }): Promise<void> {
      if (!/^[a-f0-9]{24}$/.test(input.submissionId) || !/^[a-f0-9]{24}$/.test(input.thirdPartyId) || !input.ownerSubject
        || !Number.isFinite(input.now.getTime())) throw new Error('INVALID_REQUEST');
      try { await (await database()).imageCleanup.updateOne({ submissionId: input.submissionId }, { $setOnInsert: { ...input } }, { upsert: true }); }
      catch { throw new Error('SUBMISSION_STORAGE_UNAVAILABLE'); }
    },
    async resolve(input: { readonly current: InvoiceSubmission; readonly expectedVersion: number; readonly action: 'LINK_DUPLICATE' | 'APPROVE_CLOSED_ASSIGNMENT' | 'REJECT';
      readonly actorSubject: string; readonly reason: string; readonly now: Date; readonly resultInvoiceId?: string }) {
      if (!input.actorSubject || input.actorSubject.length > 128 || !input.reason.trim() || input.reason.length > 500
        || input.action === 'LINK_DUPLICATE' && (!input.resultInvoiceId || !input.current.candidateInvoiceIds.includes(input.resultInvoiceId))
        || input.action === 'APPROVE_CLOSED_ASSIGNMENT' && !input.resultInvoiceId
        || input.action === 'REJECT' && input.resultInvoiceId !== undefined) throw new Error('INVALID_RESOLUTION');
      const status = input.action === 'LINK_DUPLICATE' ? 'LINKED' as const : input.action === 'APPROVE_CLOSED_ASSIGNMENT' ? 'SYNCHRONIZED' as const : 'REJECTED' as const;
      const eventId = `${input.current.id}:${input.expectedVersion + 1}`;
      const { connection, rows, imageCleanup } = await database();
      const events = connection.collection(resolutionEventCollectionName);
      const existingEvent = await events.findOne({ eventId });
      if (existingEvent) {
        if (existingEvent.actorSubject !== input.actorSubject || existingEvent.action !== input.action || existingEvent.reason !== input.reason
          || (existingEvent.resultInvoiceId ?? undefined) !== input.resultInvoiceId)
          throw new InvoiceSubmissionError('SUBMISSION_VERSION_CONFLICT');
        const latest = await rows.findOne({ _id: new Types.ObjectId(input.current.id), thirdPartyId: input.current.thirdPartyId,
          ownerSubject: input.current.ownerSubject });
        if (latest) return decode(latest as Row);
        throw new Error('SUBMISSION_STORAGE_UNAVAILABLE');
      }
      if (input.action === 'APPROVE_CLOSED_ASSIGNMENT') throw new InvoiceSubmissionError('SUBMISSION_VERSION_CONFLICT');
      const next = transitionInvoiceSubmission({ current: input.current, expectedVersion: input.expectedVersion, status, now: input.now,
        resolutionReason: input.reason, ...(input.resultInvoiceId ? { resultInvoiceId: input.resultInvoiceId } : {}) });
      await connection.transaction(async session => {
        await events.insertOne({ eventId, actorSubject: input.actorSubject, thirdPartyId: input.current.thirdPartyId,
          submissionId: input.current.id, action: input.action, reason: input.reason, at: input.now, fromVersion: input.expectedVersion,
          toVersion: next.version, ...(input.resultInvoiceId ? { resultInvoiceId: input.resultInvoiceId } : {}) }, { session });
        const result = await rows.replaceOne({ _id: new Types.ObjectId(input.current.id), thirdPartyId: input.current.thirdPartyId,
          ownerSubject: input.current.ownerSubject, status: 'CONFLICT', version: input.expectedVersion }, { _id: new Types.ObjectId(next.id), ...next }, { session });
        if (result.modifiedCount !== 1) throw new InvoiceSubmissionError('SUBMISSION_VERSION_CONFLICT');
        if (next.imageReference) await imageCleanup.updateOne({ submissionId: next.id }, { $setOnInsert: { submissionId: next.id,
          thirdPartyId: next.thirdPartyId, ownerSubject: next.ownerSubject, reference: next.imageReference, createdAt: next.updatedAt } }, { upsert: true, session });
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
      return next;
    },
    async expired(input: { readonly now: Date; readonly limit: number }): Promise<InvoiceSubmission[]> {
      if (!Number.isFinite(input.now.getTime()) || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 500) throw new Error('INVALID_REQUEST');
      const { rows } = await database();
      const result = await rows.find({ status: { $in: ['CONFLICT', 'REQUIRES_CORRECTION'] }, expiresAt: { $lte: input.now } })
        .sort({ expiresAt: 1, _id: 1 }).limit(input.limit).toArray();
      return result.map(row => decode(row as Row));
    },
    async pendingImageCleanup(limit: number): Promise<readonly { readonly submissionId: string; readonly reference: NonNullable<InvoiceSubmission['imageReference']> }[]> {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('INVALID_REQUEST');
      const { imageCleanup } = await database();
      const result = await imageCleanup.find({}).sort({ createdAt: 1, submissionId: 1 }).limit(limit).toArray();
      return result.map(row => {
        if (typeof row.submissionId !== 'string' || !row.reference || typeof row.reference !== 'object') throw new Error('SUBMISSION_STORAGE_UNAVAILABLE');
        return { submissionId: row.submissionId, reference: row.reference as NonNullable<InvoiceSubmission['imageReference']> };
      });
    },
    async completeImageCleanup(submissionId: string): Promise<void> {
      if (!/^[a-f0-9]{24}$/.test(submissionId)) throw new Error('INVALID_REQUEST');
      const { connection, rows, imageCleanup } = await database();
      await connection.transaction(async session => {
        const cleanup = await imageCleanup.findOne({ submissionId }, { session });
        if (!cleanup) return;
        await rows.updateOne({ _id: new Types.ObjectId(submissionId), thirdPartyId: cleanup.thirdPartyId, ownerSubject: cleanup.ownerSubject,
          'imageReference.key': (cleanup.reference as Record<string, unknown>).key, status: { $in: ['SYNCHRONIZED', 'LINKED', 'REJECTED'] } },
          { $unset: { imageReference: '' } }, { session });
        await imageCleanup.deleteOne({ submissionId }, { session });
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
    },
  };
}
