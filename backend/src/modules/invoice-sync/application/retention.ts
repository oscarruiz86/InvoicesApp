import { InvoiceSubmissionError } from '../domain/submission';
import type { OfflineSubmissionRepository, SubmissionImagesPort } from './submission-ports';

export function createInvoiceSubmissionRetentionWorker(deps: { readonly repository: OfflineSubmissionRepository; readonly images: SubmissionImagesPort; readonly clock: { now(): Date } }) {
  return {
    async runBatch(limit = 100): Promise<{ readonly expired: number; readonly removedImages: number }> {
      const now = deps.clock.now();
      const expired = await deps.repository.expired({ now, limit });
      let expiredCount = 0;
      for (const current of expired) {
        try {
          await deps.repository.transition({ current, expectedVersion: current.version, status: 'REJECTED', now,
            resolutionReason: 'El plazo de revisión de 30 días venció sin una decisión administrativa.' });
          expiredCount++;
        } catch (error) {
          if (!(error instanceof InvoiceSubmissionError) || error.code !== 'SUBMISSION_VERSION_CONFLICT') throw error;
        }
      }
      const cleanup = await deps.repository.pendingImageCleanup(limit);
      let removedImages = 0;
      for (const item of cleanup) {
        try {
          await deps.images.remove(item.reference);
          await deps.repository.completeImageCleanup(item.submissionId);
          removedImages++;
        } catch { /* Keep the durable cleanup entry and retry on the next batch. */ }
      }
      return { expired: expiredCount, removedImages };
    },
  };
}
