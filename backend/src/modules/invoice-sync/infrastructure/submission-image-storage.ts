import type { InvoiceImageInput, InvoiceImageStoragePort } from '@/modules/invoices/application/invoice-ports';
import type { SubmissionImageReference } from '../domain/submission';

export function createSubmissionImageStorage(input: { readonly storage: InvoiceImageStoragePort; readonly companyId: () => string }) {
  return {
    async stage(value: { readonly submissionId: string; readonly thirdPartyId: string; readonly vehicleId: string; readonly image: InvoiceImageInput }): Promise<SubmissionImageReference> {
      const prepared = await input.storage.prepare({ image: value.image, companyId: input.companyId(), thirdPartyId: value.thirdPartyId,
        vehicleId: value.vehicleId, invoiceId: value.submissionId });
      try {
        await input.storage.commit(prepared);
        await input.storage.finalize(prepared);
        return prepared.reference;
      } catch (error) {
        await input.storage.compensate(prepared).catch(() => undefined);
        throw error;
      }
    },
    async read(reference: SubmissionImageReference) {
      const data = await input.storage.read(reference);
      return { data, contentType: reference.contentType, size: reference.size, width: reference.width, height: reference.height, sha256: reference.sha256 };
    },
    async remove(reference: SubmissionImageReference) { await input.storage.remove(reference); },
  };
}
