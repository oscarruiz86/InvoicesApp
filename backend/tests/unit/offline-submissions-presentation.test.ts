import { describe, expect, it, vi } from 'vitest';
import { submissionResponse } from '@/modules/invoice-sync/presentation/submissions';

const actor = { subject: 'driver-1', roles: ['DRIVER'] } as never;
const query = `scope=organization&thirdPartyId=${'b'.repeat(24)}`;
const image = { contentType: 'image/jpeg', data: new Uint8Array([1]), size: 1, width: 1, height: 1, sha256: 'a'.repeat(64) };

function post(payload: unknown, withImage = false) {
  const form = new FormData();
  form.set('payload', JSON.stringify(payload));
  if (withImage) form.set('image', new Blob(['image'], { type: 'image/jpeg' }), 'invoice.jpg');
  return new Request(`http://localhost/api/invoice-sync/submissions?${query}`, { method: 'POST', body: form, headers: { 'Idempotency-Key': 'offline-test' } });
}

describe('offline submission presentation validation', () => {
  it('returns the precise safe field error for an invalid manual invoice time', async () => {
    const submissions = { submit: vi.fn() } as never;
    const invoices = { normalizeImage: vi.fn(async () => image) } as never;
    const response = await submissionResponse(submissions, invoices, actor, post({ origin: 'MANUAL', assignmentId: 'c'.repeat(24), vehicleId: 'd'.repeat(24),
      invoiceDate: '2026-11-20', invoiceTime: '15:51', invoiceNumber: 'FAC-1', issuerNit: '900111222', buyerDocument: '123456789',
      amount: '100', vatAmount: '19', otherTaxesAmount: '0', totalAmount: '119' }, true));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: 'La hora de factura debe tener el formato HH:mm:ss.', fields: ['invoiceTime'] } });
    expect((submissions as { submit: ReturnType<typeof vi.fn> }).submit).not.toHaveBeenCalled();
  });

  it('identifies malformed QR input as QR content rather than a manual invoice error', async () => {
    const submissions = { submit: vi.fn() } as never, invoices = {} as never;
    const response = await submissionResponse(submissions, invoices, actor,
      post({ origin: 'QR', assignmentId: 'c'.repeat(24), vehicleId: 'd'.repeat(24), qrContent: '' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: 'Revisa el contenido del código QR.', fields: ['qrContent'] } });
    expect((submissions as { submit: ReturnType<typeof vi.fn> }).submit).not.toHaveBeenCalled();
  });
});
