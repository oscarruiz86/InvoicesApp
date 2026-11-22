import { describe, expect, it } from 'vitest';
import { InvoiceQrError, parseInvoiceQr } from '@/modules/invoices/domain/invoice-qr';

const fixture = 'NumFac=F-1\nFecFac=2026-11-20\nHorFac=12:30:00\nNitFac=000123\nDocAdq=001234\nValFac=100.00\nValIva=19\nValOtroIm=0\nValTolFac=119.00';
describe('invoice QR v1 parser', () => {
  it('maps complete CRLF content and normalizes exact amounts', () => {
    expect(parseInvoiceQr(fixture.replace(/\n/g, '\r\n'))).toMatchObject({ invoiceNumber: 'F-1', invoiceAtUtc: '2026-11-20T17:30:00.000Z',
      amount: '100.00', vatAmount: '19.00', otherTaxesAmount: '0.00', totalAmount: '119.00', metadata: { parserVersion: 'invoice-key-value-v1' } });
  });
  it('rejects incomplete, duplicate, unknown, URL only, oversized and invalid values', () => {
    for (const [value, code] of [[fixture.replace('DocAdq=001234\n', ''), 'QR_INCOMPLETE'],
      [fixture + '\nNumFac=F-1', 'QR_INVALID'], [fixture + '\nUnexpected=x', 'QR_UNSUPPORTED'], ['https://example.test', 'QR_UNSUPPORTED'],
      [fixture.replace('ValIva=19', 'ValIva='), 'QR_INCOMPLETE'], [fixture.replace('NumFac=F-1', 'NumFac=F-\n1'), 'QR_INVALID'],
      ['x'.repeat(16_385), 'QR_INVALID'], [fixture.replace('HorFac=12:30:00', 'HorFac=12:30:00-04:00'), 'QR_UNSUPPORTED'],
      [fixture.replace('ValTolFac=119.00', 'ValTolFac=118.00'), 'QR_INVALID']] as const) {
      try { parseInvoiceQr(value); throw new Error('expected parser failure'); } catch (error) { expect(error).toBeInstanceOf(InvoiceQrError); expect((error as InvoiceQrError).code).toBe(code); }
    }
  });
  it('preserves optional CUFE and HTTPS URL as metadata only', () => {
    expect(parseInvoiceQr(`${fixture}\nCUFE=${'A'.repeat(96)}\nQRCode=https://dian.example/qr`).metadata).toMatchObject({ cufe: 'a'.repeat(96), sourceUrl: 'https://dian.example/qr' });
  });
  it('accepts DIAN colon-delimited fields and its standalone HTTPS QRCode URL', () => {
    const dian = `NumFac: F-2\nFecFac: 2026-11-20\nHorFac: 12:30:00-05:00\nNitFac: 000123\nDocAdq: 001234\nValFac: 100.00\nValIva: 19.00\nValOtroIm: 0.00\nValTolFac: 119.00\nCUFE: ${'a'.repeat(96)}\nhttps://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=fixture`;
    expect(parseInvoiceQr(dian)).toMatchObject({ invoiceNumber: 'F-2', invoiceAtUtc: '2026-11-20T17:30:00.000Z',
      metadata: { cufe: 'a'.repeat(96), sourceUrl: 'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=fixture' } });
  });
  it('normalizes only a supported explicit Colombia offset and does not follow encoded URLs', () => {
    expect(parseInvoiceQr(fixture.replace('HorFac=12:30:00', 'HorFac=12:30:00-05:00')).invoiceAtUtc).toBe('2026-11-20T17:30:00.000Z');
    expect(() => parseInvoiceQr(`${fixture}\nQRCode=https://user:secret@dian.example/qr`)).toThrow('QR_INVALID');
  });
});
