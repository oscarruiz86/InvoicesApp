import { describe, expect, it, vi } from 'vitest';
import { invoiceResponse } from '@/modules/invoices/presentation/invoices';

const actor = { subject: 'driver-1', roles: ['DRIVER'] } as never;
const invoice = { id: 'a'.repeat(24), origin: 'MANUAL', ownerSubject: 'driver-1', thirdPartyId: 'b'.repeat(24),
  assignmentId: 'c'.repeat(24), driverId: 'd'.repeat(24), vehicleId: 'e'.repeat(24), vehiclePlate: 'ABC123', invoiceDate: '2026-11-20',
  invoiceTime: '12:00', invoiceAtUtc: '2026-11-20T17:00:00.000Z', invoiceNumber: 'INV-1', issuerNit: '900123456', buyerDocument: '900654321',
  amounts: { amount: '100.00', vatAmount: '19.00', otherTaxesAmount: '0.00', totalAmount: '119.00' }, imageId: null, version: 1,
  createdAt: new Date(), updatedAt: new Date() };
function request(url: string, method: string, body?: BodyInit, headers?: HeadersInit) {
  return new Request(url, { method, ...(body === undefined ? {} : { body }), headers });
}
function service(overrides: Record<string, unknown> = {}) {
  return { normalizeImage: vi.fn(async () => ({ contentType: 'image/jpeg', data: new Uint8Array([1]), size: 1, width: 1, height: 1, sha256: 'a'.repeat(64) })),
    create: vi.fn(async () => invoice), createQr: vi.fn(async () => ({ ...invoice, origin: 'QR', qrMetadata: { parserVersion: 'invoice-key-value-v1', contentHash: 'a'.repeat(64) } })),
    previewQr: vi.fn(async () => ({ invoiceNumber: 'QR-1', metadata: { parserVersion: 'invoice-key-value-v1', contentHash: 'a'.repeat(64) } })),
    list: vi.fn(), detail: vi.fn(), edit: vi.fn(), image: vi.fn(), ...overrides } as never;
}

describe('invoice presentation contract', () => {
  it('requires an explicit organization scope and strips private owner metadata', async () => {
    const svc = service();
    const form = new FormData(); form.set('payload', JSON.stringify({ assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24), invoiceDate: '2026-11-20',
      invoiceTime: '12:00', invoiceNumber: 'INV-1', issuerNit: '900123456', buyerDocument: '900654321', amount: '100.00', vatAmount: '19.00',
      otherTaxesAmount: '0.00', totalAmount: '119.00' }));
    const response = await invoiceResponse(svc, 'create', actor, request(`http://localhost/api/invoices?scope=organization&thirdPartyId=${'b'.repeat(24)}`,
      'POST', form, { 'Idempotency-Key': 'retry-1' }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ id: invoice.id, imageUrl: null });
    expect(body).not.toHaveProperty('ownerSubject');
    expect((svc as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledWith(actor, expect.objectContaining({ thirdPartyId: 'b'.repeat(24), idempotencyKey: 'retry-1' }));
  });

  it('rejects manipulated metadata and unknown multipart fields', async () => {
    const malformed = new FormData(); malformed.set('payload', JSON.stringify({ assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24), invoiceDate: '2026-11-20',
      invoiceTime: '12:00', invoiceNumber: 'INV-1', issuerNit: '900123456', buyerDocument: '900654321', amount: '100.00', vatAmount: '19.00',
      otherTaxesAmount: '0.00', totalAmount: '119.00', ownerSubject: 'attacker', origin: 'QR' }));
    const svc = service();
    const response = await invoiceResponse(svc, 'create', actor, request(`http://localhost/api/invoices?scope=organization&thirdPartyId=${'b'.repeat(24)}`, 'POST', malformed));
    expect(response.status).toBe(400);
    expect((svc as { create: ReturnType<typeof vi.fn> }).create).not.toHaveBeenCalled();

    const extra = new FormData(); extra.set('payload', '{}'); extra.set('admin', 'true');
    const extraResponse = await invoiceResponse(svc, 'create', actor, request(`http://localhost/api/invoices?scope=organization&thirdPartyId=${'b'.repeat(24)}`, 'POST', extra));
    expect(extraResponse.status).toBe(400);
  });

  it('exposes a read-only QR preview and an autoritative, scoped QR create operation', async () => {
    const query = `scope=organization&thirdPartyId=${'b'.repeat(24)}`, content = 'NumFac=QR-1';
    const svc = service();
    const preview = await invoiceResponse(svc, 'qr-preview', actor, request(`http://localhost/api/invoices/qr/preview?${query}`, 'POST',
      JSON.stringify({ qrContent: content }), { 'content-type': 'application/json' }));
    expect(preview.status).toBe(200); expect(preview.headers.get('Cache-Control')).toBe('no-store');
    expect((svc as { previewQr: ReturnType<typeof vi.fn> }).previewQr).toHaveBeenCalledWith(actor, { thirdPartyId: 'b'.repeat(24), qrContent: content });

    const form = new FormData(); form.set('payload', JSON.stringify({ assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24), qrContent: content }));
    const created = await invoiceResponse(svc, 'qr-create', actor, request(`http://localhost/api/invoices/qr?${query}`, 'POST', form, { 'Idempotency-Key': 'qr-retry' }));
    expect(created.status).toBe(201); expect(created.headers.get('Cache-Control')).toBe('no-store');
    expect((svc as { createQr: ReturnType<typeof vi.fn> }).createQr).toHaveBeenCalledWith(actor, expect.objectContaining({ thirdPartyId: 'b'.repeat(24),
      assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24), qrContent: content, idempotencyKey: 'qr-retry' }));
    expect((await created.json())).not.toHaveProperty('ownerSubject');
  });

  it('limits the actual multipart body even when Content-Length is absent', async () => {
    const bytes = new Uint8Array(6 * 1024 * 1024 + 1);
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } });
    const svc = service();
    const raw = new Request(`http://localhost/api/invoices/qr?scope=organization&thirdPartyId=${'b'.repeat(24)}`, { method: 'POST', body,
      headers: { 'content-type': 'multipart/form-data; boundary=fixture' }, duplex: 'half' } as RequestInit & { duplex: 'half' });
    const response = await invoiceResponse(svc, 'qr-create', actor, raw);
    expect(response.status).toBe(413);
    expect((svc as { createQr: ReturnType<typeof vi.fn> }).createQr).not.toHaveBeenCalled();
    expect((svc as { normalizeImage: ReturnType<typeof vi.fn> }).normalizeImage).not.toHaveBeenCalled();
  });

  it('returns authorized image bytes with private no-sniff headers', async () => {
    const svc = service({ image: vi.fn(async () => ({ contentType: 'image/png', data: new Uint8Array([137, 80]), size: 2, width: 1, height: 1 })) });
    const response = await invoiceResponse(svc, 'image', actor, request(`http://localhost/api/invoices/${'a'.repeat(24)}/image?scope=organization&thirdPartyId=${'b'.repeat(24)}`, 'GET'), 'a'.repeat(24));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([137, 80]);
  });
  it('returns a neutral unavailable response when external image storage fails', async () => {
    const { InvoiceUseCaseError } = await import('@/modules/invoices/application/invoices');
    const svc = service({ image: vi.fn(async () => { throw new InvoiceUseCaseError('INVOICE_STORAGE_UNAVAILABLE'); }) });
    const response = await invoiceResponse(svc, 'image', actor,
      request(`http://localhost/api/invoices/${'a'.repeat(24)}/image?scope=organization&thirdPartyId=${'b'.repeat(24)}`, 'GET'), 'a'.repeat(24));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: 'INVOICE_STORAGE_UNAVAILABLE', message: 'El servicio de facturas no está disponible.' } });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
