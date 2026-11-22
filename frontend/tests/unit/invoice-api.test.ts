import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/shared/application/application-error';
import { createInvoiceApi } from '@/modules/invoices/infrastructure/http-invoices';
import type { InvoiceTransport } from '@/modules/invoices/infrastructure/http-invoices';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';

const scope: PermissionScope = { kind: 'organization', companyId: null, thirdPartyId: 'a'.repeat(24) };
const invoice = { id: 'b'.repeat(24), origin: 'MANUAL', thirdPartyId: scope.thirdPartyId, assignmentId: 'c'.repeat(24), driverId: 'd'.repeat(24),
  vehicleId: 'e'.repeat(24), vehiclePlate: 'ABC123', invoiceDate: '2026-11-20', invoiceTime: '12:30:00', invoiceAtUtc: '2026-11-20T17:30:00.000Z', invoiceNumber: 'FAC-1', issuerNit: '0001',
  buyerDocument: '0123', amounts: { amount: '10.00', vatAmount: '0.00', otherTaxesAmount: '0.00', totalAmount: '10.00' }, version: 1,
  createdAt: '2026-11-20T12:00:00.000Z', updatedAt: '2026-11-20T12:00:00.000Z', imageUrl: null };

describe('invoice HTTP adapter', () => {
  it('sends context filters and rejects a response from another third party', async () => {
    const http: InvoiceTransport = { invoice: vi.fn(async () => ({ items: [{ ...invoice, thirdPartyId: 'f'.repeat(24) }], total: 1, page: 1, pageSize: 20 })) };
    const api = createInvoiceApi(http);
    await expect(api.list(scope, { page: 1, pageSize: 20, sort: 'invoiceDate', direction: 'desc' }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(http.invoice).toHaveBeenCalledWith('GET', 'invoices', expect.stringContaining(`thirdPartyId=${scope.thirdPartyId}`), undefined, expect.any(Object));
  });
  it('uses multipart fields and reuses the supplied idempotency key', async () => {
    const http: InvoiceTransport = { invoice: vi.fn(async () => invoice) };
    const api = createInvoiceApi(http), controller = new AbortController();
    const file = new File(['image'], 'receipt.png', { type: 'image/png' });
    await api.create(scope, { assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24), invoiceDate: invoice.invoiceDate, invoiceTime: invoice.invoiceTime,
      invoiceNumber: 'FAC-1', issuerNit: '0001', buyerDocument: '0123', amount: '10', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '10', image: file }, 'stable-key', controller.signal);
    const [, , , body, options] = (http.invoice as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(body).toBeInstanceOf(FormData);
    expect(JSON.parse((body as FormData).get('payload') as string)).toMatchObject({ assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24) });
    expect((body as FormData).get('image')).toBeInstanceOf(File);
    expect(options).toMatchObject({ idempotencyKey: 'stable-key', signal: controller.signal });
  });
  it('accepts MANUAL and QR DTOs and sends only QR source content plus selected assignment data', async () => {
    const qr = { ...invoice, origin: 'QR', qrMetadata: { parserVersion: 'invoice-key-value-v1', contentHash: 'a'.repeat(64), cufe: 'b'.repeat(96) } };
    const http: InvoiceTransport = { invoice: vi.fn().mockResolvedValueOnce({ items: [invoice], total: 1, page: 1, pageSize: 20 }).mockResolvedValueOnce({ ...qr, imageUrl: null }) };
    const api = createInvoiceApi(http), signal = new AbortController().signal, file = new File(['attachment'], 'attachment.png', { type: 'image/png' });
    await expect(api.list(scope, { page: 1, pageSize: 20, sort: 'invoiceDate', direction: 'desc' }, signal)).resolves.toMatchObject({ items: [invoice] });
    await expect(api.createQr(scope, { qrContent: 'untrusted source text', assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24), image: file }, 'qr-key', signal))
      .resolves.toMatchObject({ origin: 'QR', qrMetadata: { cufe: 'b'.repeat(96) } });
    const [method, path, query, body, options] = (http.invoice as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect([method, path]).toEqual(['POST', 'invoices/qr']);
    expect(query).toContain(`thirdPartyId=${scope.thirdPartyId}`);
    expect(JSON.parse((body as FormData).get('payload') as string)).toEqual({ qrContent: 'untrusted source text', assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24) });
    expect((body as FormData).get('image')).toMatchObject({ name: file.name, type: file.type, size: file.size });
    expect(options).toMatchObject({ idempotencyKey: 'qr-key', signal });
  });
  it('validates image responses and refuses a non-organization scope', async () => {
    const http: InvoiceTransport = { invoice: vi.fn(async () => new Blob(['data'], { type: 'text/html' })) };
    const api = createInvoiceApi(http);
    await expect(api.image(scope, invoice.id, new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(api.list({ kind: 'global', companyId: null, thirdPartyId: null }, { page: 1, pageSize: 20, sort: 'invoiceDate', direction: 'desc' }, new AbortController().signal))
      .rejects.toBeInstanceOf(ApplicationError);
  });
});
