import { describe, expect, it, vi } from 'vitest';
import { createInvoiceSubmission, transitionInvoiceSubmission } from '@/modules/invoice-sync/domain/submission';
import { createInvoiceSubmissionRetentionWorker } from '@/modules/invoice-sync/application/retention';
import type { createMongoInvoiceSubmissionRepository } from '@/modules/invoice-sync/infrastructure/mongodb/submission-repository';
import type { createSubmissionImageStorage } from '@/modules/invoice-sync/infrastructure/submission-image-storage';

const id = (digit: string) => digit.repeat(24);
const now = new Date('2026-11-23T12:00:00Z');
const reference = { provider: 'local' as const, key: `${id('a')}/${id('b')}/${id('c')}/${id('d')}/imagen.jpg`, contentType: 'image/jpeg' as const,
  size: 12, width: 2, height: 2, sha256: 'e'.repeat(64) };
function expired(status: 'CONFLICT' | 'REQUIRES_CORRECTION') {
  const created = createInvoiceSubmission({ id: id(status === 'CONFLICT' ? '1' : '2'), ownerSubject: 'driver', thirdPartyId: id('b'), origin: 'MANUAL',
    assignmentId: id('c'), vehicleId: id('d'), idempotencyKey: status, requestHash: 'f'.repeat(64), payload: { invoiceNumber: '1' }, imageReference: reference, now: new Date(now.getTime() - 31 * 86_400_000) });
  return transitionInvoiceSubmission({ current: created, expectedVersion: 1, status, now: new Date(now.getTime() - 31 * 86_400_000),
    ...(status === 'CONFLICT' ? { causes: ['ASSIGNMENT_CLOSED' as const] } : { resolutionReason: 'Corregir' }) });
}

describe('offline invoice retention', () => {
  it('expires 30-day conflicts and corrections, then retries durable attachment cleanup', async () => {
    const records = [expired('CONFLICT'), expired('REQUIRES_CORRECTION')];
    let removed = false;
    const transition = vi.fn(async (input: { current: (typeof records)[number]; expectedVersion: number; status: 'REJECTED'; now: Date; resolutionReason: string }) =>
      transitionInvoiceSubmission(input as Parameters<typeof transitionInvoiceSubmission>[0]));
    const repository = { expired: vi.fn(async () => records), transition,
      pendingImageCleanup: vi.fn(async () => removed ? [] : [{ submissionId: records[0]!.id, reference }]),
      completeImageCleanup: vi.fn(async () => { removed = true; }) } as unknown as ReturnType<typeof createMongoInvoiceSubmissionRepository>;
    let failRemoval = true;
    const remove = vi.fn(async () => { if (failRemoval) { failRemoval = false; throw new Error('disk unavailable'); } });
    const images = { remove } as unknown as ReturnType<typeof createSubmissionImageStorage>;
    const worker = createInvoiceSubmissionRetentionWorker({ repository, images, clock: { now: () => now } });
    await expect(worker.runBatch()).resolves.toEqual({ expired: 2, removedImages: 0 });
    expect(transition).toHaveBeenCalledTimes(2);
    expect(transition).toHaveBeenCalledWith(expect.objectContaining({ status: 'REJECTED', resolutionReason: expect.stringContaining('30 días') }));
    await expect(worker.runBatch()).resolves.toEqual({ expired: 2, removedImages: 1 });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(repository.completeImageCleanup).toHaveBeenCalledWith(records[0]!.id);
  });
});
