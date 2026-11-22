import { describe, expect, it } from 'vitest';
import { createInvoice, createQrInvoice, normalizedInvoiceBusinessKey } from '@/modules/invoices/domain/invoice';

const now = new Date('2026-11-20T12:00:00.000Z');
const input = { id: 'a'.repeat(24), ownerSubject: 'driver-subject', thirdPartyId: 'b'.repeat(24), assignmentId: 'c'.repeat(24),
  driverId: 'd'.repeat(24), vehicleId: 'e'.repeat(24), vehiclePlate: 'ABC123', invoiceDate: '2026-11-20', invoiceTime: '12:30:00',
  invoiceNumber: ' fac-01 ', issuerNit: '000123', buyerDocument: '  001234  ', amount: '12345678901234.50', vatAmount: '0.00',
  otherTaxesAmount: '0', totalAmount: '12345678901234.50', now };

describe('invoice domain', () => {
  it('creates manual invoices with exact decimal arithmetic and immutable relationship references', () => {
    const invoice = createInvoice(input);
    expect(invoice).toMatchObject({ origin: 'MANUAL', invoiceNumber: 'FAC-01', issuerNit: '000123', buyerDocument: '001234',
      amounts: { amount: '12345678901234.50', vatAmount: '0.00', otherTaxesAmount: '0.00', totalAmount: '12345678901234.50' },
      assignmentId: input.assignmentId, driverId: input.driverId, vehicleId: input.vehicleId, invoiceAtUtc: '2026-11-20T17:30:00.000Z', version: 1 });
    expect(invoice.createdAt).toEqual(now);
    expect(invoice.createdAt).not.toBe(now);
    expect(Object.isFrozen(invoice.amounts)).toBe(true);
  });

  it('rejects inexact sums, invalid date/time, excess precision and injected ownership or QR metadata', () => {
    expect(() => createInvoice({ ...input, totalAmount: '12345678901234.49' })).toThrow('INVOICE_TOTAL_MISMATCH');
    expect(() => createInvoice({ ...input, amount: '0.001' })).toThrow('INVALID_INVOICE');
    expect(() => createInvoice({ ...input, invoiceDate: '2026-02-30' })).toThrow('INVALID_INVOICE');
    expect(() => createInvoice({ ...input, invoiceTime: '24:00:00' })).toThrow('INVALID_INVOICE');
    expect(() => createInvoice({ ...input, origin: 'QR' } as never)).toThrow('INVALID_INVOICE');
    expect(() => createInvoice({ ...input, ownerSubject: 'attacker', thirdPartyId: 'f'.repeat(24), cufe: 'forged' } as never)).toThrow('INVALID_INVOICE');
  });

  it('validates monetary boundaries and creates a normalized business key', () => {
    expect(createInvoice({ ...input, amount: '0', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '0' }).amounts.totalAmount).toBe('0.00');
    expect(() => createInvoice({ ...input, amount: '100000000000000', totalAmount: '100000000000000' })).toThrow('INVALID_INVOICE');
    expect(normalizedInvoiceBusinessKey('000123', ' fac-01 ')).toBe('000123:FAC-01');
  });

  it('creates a QR invoice with immutable origin and validated minimal provenance', () => {
    const metadata = { parserVersion: 'invoice-key-value-v1' as const, contentHash: 'a'.repeat(64), cufe: 'b'.repeat(96), sourceUrl: 'https://dian.example/qr' };
    const invoice = createQrInvoice(input, metadata, '2026-11-20T17:30:00.000Z');
    expect(invoice).toMatchObject({ origin: 'QR', invoiceAtUtc: '2026-11-20T17:30:00.000Z', qrMetadata: metadata });
    expect(Object.isFrozen(invoice.qrMetadata)).toBe(true);
    for (const invalid of [{ ...metadata, contentHash: 'raw-payload' }, { ...metadata, cufe: 'x' }, { ...metadata, sourceUrl: 'https://user:secret@dian.example/qr' },
      { ...metadata, sourceUrl: 'https://' }]) expect(() => createQrInvoice(input, invalid, '2026-11-20T17:30:00.000Z')).toThrow('INVALID_INVOICE');
  });
});
