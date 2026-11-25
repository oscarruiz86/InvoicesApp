import { describe, expect, it, vi } from 'vitest';
import { createSubmissionImageStorage } from '@/modules/invoice-sync/infrastructure/submission-image-storage';
import type { InvoiceImageStoragePort, PreparedInvoiceImage } from '@/modules/invoices/application/invoice-ports';

const reference = { provider: 'local' as const, key: `${'a'.repeat(24)}/${'b'.repeat(24)}/${'c'.repeat(24)}/${'d'.repeat(24)}/imagen.jpg`,
  contentType: 'image/jpeg' as const, size: 12, width: 2, height: 2, sha256: 'e'.repeat(64) };
const prepared: PreparedInvoiceImage = { reference, operationId: 'operation-1' };

function fakeStorage(): InvoiceImageStoragePort {
  return { prepare: vi.fn(async () => prepared), commit: vi.fn(async () => {}), finalize: vi.fn(async () => {}), compensate: vi.fn(async () => {}),
    read: vi.fn(async () => Buffer.from('image bytes')), remove: vi.fn(async () => {}) };
}
const image = { data: Buffer.from('image bytes'), contentType: 'image/jpeg' as const, size: 12, width: 2, height: 2, sha256: 'e'.repeat(64) };

describe('offline submission image storage', () => {
  it('stages normalized bytes under the stable submission key and stores only a reference', async () => {
    const storage = fakeStorage(), service = createSubmissionImageStorage({ storage, companyId: () => 'f'.repeat(24) });
    await expect(service.stage({ submissionId: 'd'.repeat(24), thirdPartyId: 'b'.repeat(24), vehicleId: 'c'.repeat(24), image })).resolves.toEqual(reference);
    expect(storage.prepare).toHaveBeenCalledWith({ image, companyId: 'f'.repeat(24), thirdPartyId: 'b'.repeat(24), vehicleId: 'c'.repeat(24), invoiceId: 'd'.repeat(24) });
    expect(storage.commit).toHaveBeenCalledWith(prepared); expect(storage.finalize).toHaveBeenCalledWith(prepared);
    expect(await service.read(reference)).toMatchObject({ data: Buffer.from('image bytes'), sha256: 'e'.repeat(64) });
    await service.remove(reference); expect(storage.remove).toHaveBeenCalledWith(reference);
  });
  it('compensates a failed stage and never returns a reference', async () => {
    const storage = fakeStorage(); vi.mocked(storage.commit).mockRejectedValueOnce(new Error('disk unavailable'));
    const service = createSubmissionImageStorage({ storage, companyId: () => 'f'.repeat(24) });
    await expect(service.stage({ submissionId: 'd'.repeat(24), thirdPartyId: 'b'.repeat(24), vehicleId: 'c'.repeat(24), image })).rejects.toThrow();
    expect(storage.compensate).toHaveBeenCalledWith(prepared);
    expect(storage.finalize).not.toHaveBeenCalled();
  });
});
