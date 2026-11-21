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
    create: vi.fn(async () => invoice), list: vi.fn(), detail: vi.fn(), edit: vi.fn(), image: vi.fn(), ...overrides } as never;
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

  it('returns authorized image bytes with private no-sniff headers', async () => {
    const svc = service({ image: vi.fn(async () => ({ contentType: 'image/png', data: new Uint8Array([137, 80]), size: 2, width: 1, height: 1 })) });
    const response = await invoiceResponse(svc, 'image', actor, request(`http://localhost/api/invoices/${'a'.repeat(24)}/image?scope=organization&thirdPartyId=${'b'.repeat(24)}`, 'GET'), 'a'.repeat(24));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([137, 80]);
  });
});
