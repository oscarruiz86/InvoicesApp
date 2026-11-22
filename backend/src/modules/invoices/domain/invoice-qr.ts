export type InvoiceQrErrorCode = 'QR_INVALID' | 'QR_INCOMPLETE' | 'QR_UNSUPPORTED';
export class InvoiceQrError extends Error {
  constructor(readonly code: InvoiceQrErrorCode, readonly fields: readonly string[] = []) { super(code); }
}

export interface ParsedInvoiceQr {
  readonly invoiceDate: string; readonly invoiceTime: string; readonly invoiceAtUtc: string;
  readonly invoiceNumber: string; readonly issuerNit: string; readonly buyerDocument: string;
  readonly amount: string; readonly vatAmount: string; readonly otherTaxesAmount: string; readonly totalAmount: string;
  readonly canonicalContent: string;
  readonly metadata: { readonly parserVersion: 'invoice-key-value-v1';
    readonly cufe?: string; readonly sourceUrl?: string };
}

const required = ['NumFac', 'FecFac', 'HorFac', 'NitFac', 'DocAdq', 'ValFac', 'ValIva', 'ValOtroIm', 'ValTolFac'] as const;
const keys = new Set<string>([...required, 'CUFE', 'QRCode']);
const decimal = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/;
const dateValid = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number); const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};
const minor = (value: string) => { const [whole, fraction = ''] = value.split('.'); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')); };
function instant(date: string, time: string, offset?: string): string {
  const [y, m, d] = date.split('-').map(Number); const [h, min, s] = time.split(':').map(Number);
  if (offset && offset !== '-05:00') throw new InvoiceQrError('QR_UNSUPPORTED', ['HorFac']);
  return new Date(Date.UTC(y, m - 1, d, h + 5, min, s)).toISOString();
}
function canonical(value: string) { const n = minor(value); return `${n / 100n}.${(n % 100n).toString().padStart(2, '0')}`; }

/** Parses the strict invoice-key-value-v1 QR text format. */
export function parseInvoiceQr(content: unknown): ParsedInvoiceQr {
  if (typeof content !== 'string' || !content.trim() || new TextEncoder().encode(content).byteLength > 16 * 1024) throw new InvoiceQrError('QR_INVALID');
  const normalized = content.replace(/\r\n/g, '\n');
  if (/^https?:\/\/\S+$/i.test(normalized.trim())) throw new InvoiceQrError('QR_UNSUPPORTED');
  const values = new Map<string, string>();
  for (const raw of normalized.split('\n')) {
    const line = raw.trim(); if (!line) continue;
    const at = line.indexOf('='); if (at < 1) throw new InvoiceQrError('QR_INVALID');
    const key = line.slice(0, at).trim(), value = line.slice(at + 1).trim();
    if (!keys.has(key)) throw new InvoiceQrError('QR_UNSUPPORTED', [key]);
    if (values.has(key)) throw new InvoiceQrError('QR_INVALID', [key]);
    values.set(key, value);
  }
  if (values.size === 1 && /^https?:\/\//i.test([...values.values()][0]!)) throw new InvoiceQrError('QR_UNSUPPORTED');
  const missing = required.filter(key => !values.get(key)); if (missing.length) throw new InvoiceQrError('QR_INCOMPLETE', missing);
  const get = (key: typeof required[number]) => values.get(key)!;
  const date = get('FecFac'), rawTime = get('HorFac');
  const timeMatch = /^(\d{2}:\d{2}:\d{2})(-\d{2}:\d{2})?$/.exec(rawTime);
  if (!dateValid(date) || !timeMatch || !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(timeMatch[1]!)
    || !/^\d{1,20}$/.test(get('NitFac')) || !get('NumFac') || get('NumFac').length > 64 || !get('DocAdq') || get('DocAdq').length > 40)
    throw new InvoiceQrError('QR_INVALID');
  const amounts = (['ValFac', 'ValIva', 'ValOtroIm', 'ValTolFac'] as const).map(get);
  if (amounts.some(value => !decimal.test(value)) || minor(amounts[0]!) + minor(amounts[1]!) + minor(amounts[2]!) !== minor(amounts[3]!))
    throw new InvoiceQrError('QR_INVALID');
  const cufe = values.get('CUFE'); if (cufe !== undefined && !/^[a-f\d]{96}$/i.test(cufe)) throw new InvoiceQrError('QR_INVALID', ['CUFE']);
  const sourceUrl = values.get('QRCode');
  if (sourceUrl !== undefined) { try { const url = new URL(sourceUrl); if (url.protocol !== 'https:' || url.username || url.password || sourceUrl.length > 2048) throw new Error(); } catch { throw new InvoiceQrError('QR_INVALID', ['QRCode']); } }
  const invoiceTime = timeMatch[1]!;
  const canonicalContent = normalized.split('\n').map(line => line.trim()).filter(Boolean).join('\n');
  return { invoiceDate: date, invoiceTime, invoiceAtUtc: instant(date, invoiceTime, timeMatch[2]), invoiceNumber: get('NumFac'), issuerNit: get('NitFac'),
    buyerDocument: get('DocAdq'), amount: canonical(amounts[0]!), vatAmount: canonical(amounts[1]!), otherTaxesAmount: canonical(amounts[2]!), totalAmount: canonical(amounts[3]!),
    canonicalContent, metadata: { parserVersion: 'invoice-key-value-v1',
      ...(cufe ? { cufe: cufe.toLowerCase() } : {}), ...(sourceUrl ? { sourceUrl } : {}) } };
}
