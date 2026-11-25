import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { createMongoInvoiceSubmissionRepository } from '@/modules/invoice-sync/infrastructure/mongodb/submission-repository';

const id = (digit: string) => digit.repeat(24);
function repository() {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  let rowNumber = 0;
  const valueAt = (row: Record<string, unknown>, path: string) => path.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, row);
  const matches = (row: Record<string, unknown>, query: Record<string, unknown>) => Object.entries(query).every(([key, expected]) => {
    const actual = valueAt(row, key);
    if (expected && typeof expected === 'object' && !(expected instanceof Date) && !(expected instanceof Types.ObjectId)) {
      const operators = expected as Record<string, unknown>;
      if ('$in' in operators) return Array.isArray(operators.$in) && operators.$in.includes(actual);
      if ('$lte' in operators) return actual instanceof Date && operators.$lte instanceof Date && actual <= operators.$lte;
      return false;
    }
    return actual instanceof Types.ObjectId || expected instanceof Types.ObjectId ? String(actual) === String(expected) : actual === expected;
  });
  const connection = {
    collection(name: string) {
      let rows = collections.get(name); if (!rows) collections.set(name, rows = new Map());
      return {
        async createIndex() { return 'index'; },
        async insertOne(row: Record<string, unknown>) {
          if (name === 'invoice_sync_submissions' && [...rows!.values()].some(existing => existing.thirdPartyId === row.thirdPartyId
            && existing.ownerSubject === row.ownerSubject && existing.idempotencyKey === row.idempotencyKey)) throw Object.assign(new Error('duplicate'), { code: 11000 });
          const key = String(row._id ?? row.submissionId ?? ++rowNumber); rows!.set(key, row); return { insertedId: row._id };
        },
        async findOne(query: Record<string, unknown>) { return [...rows!.values()].find(row => matches(row, query)) ?? null; },
        async replaceOne(query: Record<string, unknown>, replacement: Record<string, unknown>) {
          const found = [...rows!.entries()].find(([, row]) => matches(row, query));
          if (!found) return { modifiedCount: 0 };
          rows!.delete(found[0]); rows!.set(String(replacement._id), replacement); return { modifiedCount: 1 };
        },
        async updateOne(query: Record<string, unknown>, update: Record<string, unknown>, options?: { upsert?: boolean }) {
          const found = [...rows!.entries()].find(([, row]) => matches(row, query));
          if (!found && options?.upsert) {
            const insertion = (update.$setOnInsert ?? {}) as Record<string, unknown>;
            rows!.set(String(insertion.submissionId ?? ++rowNumber), { ...insertion }); return { modifiedCount: 0, upsertedCount: 1 };
          }
          if (!found) return { modifiedCount: 0 };
          const next = { ...found[1], ...((update.$set ?? {}) as Record<string, unknown>) };
          for (const key of Object.keys((update.$unset ?? {}) as Record<string, unknown>)) {
            if (key === 'imageReference') delete next.imageReference;
          }
          rows!.set(found[0], next); return { modifiedCount: 1 };
        },
        async deleteOne(query: Record<string, unknown>) {
          const found = [...rows!.entries()].find(([, row]) => matches(row, query));
          if (!found) return { deletedCount: 0 };
          rows!.delete(found[0]); return { deletedCount: 1 };
        },
        find(query: Record<string, unknown>) {
          let result = [...rows!.values()].filter(row => matches(row, query));
          const cursor = { sort(fields: Record<string, number> = {}) { result = result.sort((a, b) => {
            for (const [field, direction] of Object.entries(fields)) {
              const left = valueAt(a, field), right = valueAt(b, field);
              const leftValue = left instanceof Date ? left.getTime() : String(left ?? ''), rightValue = right instanceof Date ? right.getTime() : String(right ?? '');
              const order = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
              if (order) return order * direction;
            }
            return 0;
          }); return cursor; }, skip(n: number) { result = result.slice(n); return cursor; },
            limit(n: number) { result = result.slice(0, n); return cursor; }, async toArray() { return result; } };
          return cursor;
        },
        async countDocuments(query: Record<string, unknown>) { return [...rows!.values()].filter(row => matches(row, query)).length; },
      };
    },
    async transaction<T>(operation: (session: object) => Promise<T>) { return operation({}); },
  };
  return Object.assign(createMongoInvoiceSubmissionRepository(async () => connection as never), {
    eventRows: () => [...(collections.get('invoice_sync_resolution_events')?.values() ?? [])],
  });
}
const reference = { provider: 'local' as const, key: `${id('f')}/${id('b')}/${id('d')}/${id('a')}/imagen.jpg`, contentType: 'image/jpeg' as const,
  size: 12, width: 2, height: 2, sha256: '9'.repeat(64) };
const input = { id: id('a'), ownerSubject: 'driver-subject', thirdPartyId: id('b'), origin: 'MANUAL' as const,
  assignmentId: id('c'), vehicleId: id('d'), idempotencyKey: 'same-key', requestHash: 'e'.repeat(64), payload: { invoiceNumber: 'INV-1' }, now: new Date('2026-11-23T12:00:00Z') };

describe('Mongo invoice submission repository', () => {
  it('returns the original row for identical idempotent submissions', async () => {
    const repo = repository();
    await expect(repo.create(input)).resolves.toMatchObject({ id: input.id, status: 'PENDING' });
    await expect(repo.create({ ...input, id: id('f') })).resolves.toMatchObject({ id: input.id, version: 1 });
  });

  it('persists versioned conflict causes and scopes conflict queue to the third party', async () => {
    const repo = repository();
    const created = await repo.create(input);
    const conflict = await repo.transition({ current: created, expectedVersion: 1, status: 'CONFLICT',
      causes: ['BUSINESS_DUPLICATE', 'ASSIGNMENT_CLOSED'], now: input.now });
    expect(await repo.listConflicts({ thirdPartyId: input.thirdPartyId, page: 1, pageSize: 20 })).toMatchObject({ total: 1, items: [{ id: input.id, version: 2 }] });
    await expect(repo.find({ id: conflict.id, thirdPartyId: id('f') })).resolves.toBeNull();
  });

  it('rejects stale concurrent transitions and persists terminal image cleanup work', async () => {
    const repo = repository();
    const created = await repo.create({ ...input, imageReference: reference });
    const conflict = await repo.transition({ current: created, expectedVersion: 1, status: 'CONFLICT', causes: ['BUSINESS_DUPLICATE'], now: input.now });
    const linked = await repo.transition({ current: conflict, expectedVersion: 2, status: 'LINKED', resultInvoiceId: id('9'), resolutionReason: 'Factura existente', now: input.now });
    await expect(repo.transition({ current: conflict, expectedVersion: 2, status: 'REJECTED', resolutionReason: 'Obsoleta', now: input.now })).rejects.toThrow('SUBMISSION_VERSION_CONFLICT');
    expect(linked.imageReference).toEqual(reference);
    await expect(repo.pendingImageCleanup(10)).resolves.toEqual([{ submissionId: input.id, reference }]);
    await repo.completeImageCleanup(input.id);
    await expect(repo.pendingImageCleanup(10)).resolves.toEqual([]);
    await expect(repo.find({ id: input.id, thirdPartyId: input.thirdPartyId })).resolves.toMatchObject({ imageReference: null, status: 'LINKED' });
  });

  it('rejects reuse of an idempotency key with different contents', async () => {
    const repo = repository();
    await repo.create(input);
    await expect(repo.create({ ...input, id: new Types.ObjectId().toString(), requestHash: 'f'.repeat(64) })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });

  it('writes a minimal durable resolution event and returns it on an identical retry', async () => {
    const repo = repository();
    const created = await repo.create({ ...input, imageReference: reference });
    const conflict = await repo.transition({ current: created, expectedVersion: 1, status: 'CONFLICT', causes: ['BUSINESS_DUPLICATE'],
      candidateInvoiceIds: [id('9')], now: input.now });
    const decision = { current: conflict, expectedVersion: 2, action: 'LINK_DUPLICATE' as const, actorSubject: 'third-party-admin',
      reason: 'La factura ya estaba registrada.', now: input.now, resultInvoiceId: id('9') };
    await expect(repo.resolve(decision)).resolves.toMatchObject({ status: 'LINKED', resultInvoiceId: id('9'), version: 3 });
    expect(repo.eventRows()).toHaveLength(1);
    expect(repo.eventRows()[0]).toMatchObject({ actorSubject: 'third-party-admin', thirdPartyId: input.thirdPartyId, submissionId: input.id,
      action: 'LINK_DUPLICATE', reason: 'La factura ya estaba registrada.', fromVersion: 2, toVersion: 3, resultInvoiceId: id('9') });
    expect(JSON.stringify(repo.eventRows()[0])).not.toContain('invoiceNumber');
    await expect(repo.resolve(decision)).resolves.toMatchObject({ status: 'LINKED', version: 3 });
    await expect(repo.resolve({ ...decision, reason: 'Motivo distinto' })).rejects.toThrow('SUBMISSION_VERSION_CONFLICT');
  });

  it('paginates the owner history newest first and joins its audited resolution', async () => {
    const repo = repository();
    await repo.create({ ...input, now: new Date('2026-11-20T12:00:00Z') });
    const newer = await repo.create({ ...input, id: id('d'), idempotencyKey: 'newer-key', now: new Date('2026-11-23T12:00:00Z') });
    await repo.create({ ...input, id: id('e'), ownerSubject: 'another-driver', idempotencyKey: 'other-key', now: new Date('2026-11-24T12:00:00Z') });
    const conflict = await repo.transition({ current: newer, expectedVersion: 1, status: 'CONFLICT', causes: ['BUSINESS_DUPLICATE'],
      candidateInvoiceIds: [id('9')], now: input.now });
    await repo.resolve({ current: conflict, expectedVersion: 2, action: 'LINK_DUPLICATE', actorSubject: 'third-party-admin', reason: 'Duplicado confirmado.',
      now: input.now, resultInvoiceId: id('9') });

    const first = await repo.listOwned({ ownerSubject: input.ownerSubject, thirdPartyId: input.thirdPartyId, page: 1, pageSize: 1 });
    const second = await repo.listOwned({ ownerSubject: input.ownerSubject, thirdPartyId: input.thirdPartyId, page: 2, pageSize: 1 });

    expect(first).toMatchObject({ total: 2, page: 1, pageSize: 1, items: [{ record: { id: id('d'), status: 'LINKED' },
      resolution: { action: 'LINK_DUPLICATE', reason: 'Duplicado confirmado.', resultInvoiceId: id('9') } }] });
    expect(second).toMatchObject({ total: 2, page: 2, pageSize: 1, items: [{ record: { id: input.id }, resolution: null }] });
  });

  it('paginates the active third-party history across drivers without mixing third parties', async () => {
    const repo = repository();
    const older = await repo.create({ ...input, now: new Date('2026-11-20T12:00:00Z') });
    const newer = await repo.create({ ...input, id: id('d'), idempotencyKey: 'newer-key', now: new Date('2026-11-23T12:00:00Z') });
    const anotherDriver = await repo.create({ ...input, id: id('e'), ownerSubject: 'another-driver', idempotencyKey: 'other-driver-key',
      now: new Date('2026-11-24T12:00:00Z') });
    await repo.create({ ...input, id: id('f'), thirdPartyId: id('c'), ownerSubject: 'external-driver', idempotencyKey: 'external-key' });
    const conflict = await repo.transition({ current: newer, expectedVersion: 1, status: 'CONFLICT', causes: ['BUSINESS_DUPLICATE'],
      candidateInvoiceIds: [id('9')], now: input.now });
    await repo.resolve({ current: conflict, expectedVersion: 2, action: 'LINK_DUPLICATE', actorSubject: 'third-party-admin', reason: 'Duplicado confirmado.',
      now: input.now, resultInvoiceId: id('9') });

    const first = await repo.listForThirdParty({ thirdPartyId: input.thirdPartyId, page: 1, pageSize: 1 });
    const second = await repo.listForThirdParty({ thirdPartyId: input.thirdPartyId, page: 2, pageSize: 1 });
    const third = await repo.listForThirdParty({ thirdPartyId: input.thirdPartyId, page: 3, pageSize: 1 });

    expect(first).toMatchObject({ total: 3, page: 1, pageSize: 1, items: [{ record: { id: anotherDriver.id }, resolution: null }] });
    expect(second).toMatchObject({ total: 3, page: 2, pageSize: 1, items: [{ record: { id: newer.id, status: 'LINKED' },
      resolution: { action: 'LINK_DUPLICATE', reason: 'Duplicado confirmado.', resultInvoiceId: id('9') } }] });
    expect(third).toMatchObject({ total: 3, page: 3, pageSize: 1, items: [{ record: { id: older.id }, resolution: null }] });
  });
});
