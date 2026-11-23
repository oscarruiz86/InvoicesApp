export type InvoiceOrigin = 'MANUAL' | 'QR';
export interface InvoiceQrMetadata { readonly parserVersion: 'invoice-key-value-v1'; readonly contentHash: string; readonly cufe?: string; readonly sourceUrl?: string }

export interface InvoiceAmounts {
  readonly amount: string;
  readonly vatAmount: string;
  readonly otherTaxesAmount: string;
  readonly totalAmount: string;
}

export interface Invoice {
  readonly id: string;
  readonly origin: InvoiceOrigin;
  readonly qrMetadata?: InvoiceQrMetadata;
  readonly ownerSubject: string;
  readonly thirdPartyId: string;
  readonly assignmentId: string;
  readonly driverId: string;
  readonly vehicleId: string;
  readonly vehiclePlate: string | null;
  readonly invoiceDate: string;
  readonly invoiceTime: string;
  readonly invoiceAtUtc: string;
  readonly invoiceNumber: string;
  readonly issuerNit: string;
  readonly buyerDocument: string;
  readonly amounts: InvoiceAmounts;
  readonly imageId: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function createQrInvoice(input: CreateInvoiceInput, metadata: InvoiceQrMetadata, invoiceAtUtc: string): Invoice {
  validateQrMetadata(metadata);
  if (!Number.isFinite(Date.parse(invoiceAtUtc))) throw new InvoiceDomainError('INVALID_INVOICE');
  const invoice = createInvoiceRecord(input, false);
  return { ...invoice, origin: 'QR', qrMetadata: Object.freeze({ ...metadata }), invoiceAtUtc: new Date(invoiceAtUtc).toISOString() };
}

export function reviseQrInvoice(input: CreateInvoiceInput, metadata: InvoiceQrMetadata): Invoice {
  validateQrMetadata(metadata);
  const invoice = createInvoiceRecord(input, false);
  return { ...invoice, origin: 'QR', qrMetadata: Object.freeze({ ...metadata }) };
}

function validateQrMetadata(metadata: InvoiceQrMetadata): void {
  let validSourceUrl = true;
  if (metadata?.sourceUrl !== undefined) {
    try { const url = new URL(metadata.sourceUrl); validSourceUrl = url.protocol === 'https:' && !url.username && !url.password && metadata.sourceUrl.length <= 2048; }
    catch { validSourceUrl = false; }
  }
  if (!metadata || metadata.parserVersion !== 'invoice-key-value-v1' || !/^[a-f0-9]{64}$/.test(metadata.contentHash)
    || (metadata.cufe !== undefined && !/^[a-f0-9]{96}$/.test(metadata.cufe))
    || !validSourceUrl) {
    throw new InvoiceDomainError('INVALID_INVOICE');
  }
}

export interface CreateInvoiceInput {
  readonly id: string;
  readonly ownerSubject: string;
  readonly thirdPartyId: string;
  readonly assignmentId: string;
  readonly driverId: string;
  readonly vehicleId: string;
  readonly vehiclePlate?: string | null;
  readonly invoiceDate: string;
  readonly invoiceTime: string;
  readonly invoiceNumber: string;
  readonly issuerNit: string;
  readonly buyerDocument: string;
  readonly amount: string;
  readonly vatAmount: string;
  readonly otherTaxesAmount: string;
  readonly totalAmount: string;
  readonly imageId?: string | null;
  readonly now: Date;
}

export class InvoiceDomainError extends Error {
  constructor(readonly code: 'INVALID_INVOICE' | 'INVOICE_TOTAL_MISMATCH') { super(code); }
}

const idPattern = /^[a-f\d]{24}$/i;
const validId = (value: unknown): value is string => typeof value === 'string' && idPattern.test(value);
const validDate = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime());

function cleanText(value: unknown, max: number, code: 'INVALID_INVOICE' = 'INVALID_INVOICE'): string {
  if (typeof value !== 'string') throw new InvoiceDomainError(code);
  const result = value.normalize('NFC').trim();
  if (!result || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) throw new InvoiceDomainError(code);
  return result;
}

function normalizedInvoiceNumber(value: unknown): string {
  return cleanText(value, 64).toLocaleUpperCase('es-CO');
}

function decimalToMinor(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/.test(value)) {
    throw new InvoiceDomainError('INVALID_INVOICE');
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function canonicalDecimal(value: string): string {
  const minor = decimalToMinor(value);
  const whole = minor / 100n;
  const fraction = (minor % 100n).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}

function validCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validInvoiceTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value);
}

function bogotaInstant(invoiceDate: string, invoiceTime: string): string {
  const [year, month, day] = invoiceDate.split('-').map(Number);
  const [hour, minute, second] = invoiceTime.split(':').map(Number);
  const commercialAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(commercialAsUtc));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const localAsUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
  return new Date(commercialAsUtc - (localAsUtc - commercialAsUtc)).toISOString();
}

function createInvoiceRecord(input: CreateInvoiceInput, enforceTotalMatch: boolean): Invoice {
  const allowed = ['id', 'ownerSubject', 'thirdPartyId', 'assignmentId', 'driverId', 'vehicleId', 'vehiclePlate',
    'invoiceDate', 'invoiceTime', 'invoiceNumber', 'issuerNit', 'buyerDocument', 'amount', 'vatAmount',
    'otherTaxesAmount', 'totalAmount', 'imageId', 'now'];
  if (!input || typeof input !== 'object' || Object.keys(input).some(key => !allowed.includes(key))
    || !validId(input.id) || !validId(input.thirdPartyId) || !validId(input.assignmentId)
    || !validId(input.driverId) || !validId(input.vehicleId)
    || typeof input.ownerSubject !== 'string' || input.ownerSubject.length < 1 || input.ownerSubject.length > 128
    || !validDate(input.now) || !validCalendarDate(input.invoiceDate) || !validInvoiceTime(input.invoiceTime)
    || (input.vehiclePlate !== undefined && input.vehiclePlate !== null && (typeof input.vehiclePlate !== 'string' || input.vehiclePlate.length > 32))
    || (input.imageId !== undefined && input.imageId !== null && !validId(input.imageId))) {
    throw new InvoiceDomainError('INVALID_INVOICE');
  }

  const invoiceNumber = normalizedInvoiceNumber(input.invoiceNumber);
  if (!/^\d{1,20}$/.test(input.issuerNit)) throw new InvoiceDomainError('INVALID_INVOICE');
  const issuerNit = input.issuerNit;
  const buyerDocument = cleanText(input.buyerDocument, 40);
  const amountMinor = decimalToMinor(input.amount);
  const vatMinor = decimalToMinor(input.vatAmount);
  const otherTaxesMinor = decimalToMinor(input.otherTaxesAmount);
  const totalMinor = decimalToMinor(input.totalAmount);
  if (enforceTotalMatch && amountMinor + vatMinor + otherTaxesMinor !== totalMinor) throw new InvoiceDomainError('INVOICE_TOTAL_MISMATCH');

  return {
    id: input.id.toLowerCase(), origin: 'MANUAL', ownerSubject: input.ownerSubject,
    thirdPartyId: input.thirdPartyId.toLowerCase(), assignmentId: input.assignmentId.toLowerCase(),
    driverId: input.driverId.toLowerCase(), vehicleId: input.vehicleId.toLowerCase(),
    vehiclePlate: input.vehiclePlate?.normalize('NFC').trim() || null,
    invoiceDate: input.invoiceDate, invoiceTime: input.invoiceTime, invoiceAtUtc: bogotaInstant(input.invoiceDate, input.invoiceTime), invoiceNumber, issuerNit,
    buyerDocument,
    amounts: Object.freeze({ amount: canonicalDecimal(input.amount), vatAmount: canonicalDecimal(input.vatAmount),
      otherTaxesAmount: canonicalDecimal(input.otherTaxesAmount), totalAmount: canonicalDecimal(input.totalAmount) }),
    imageId: input.imageId?.toLowerCase() ?? null, version: 1,
    createdAt: new Date(input.now), updatedAt: new Date(input.now),
  };
}

export function createInvoice(input: CreateInvoiceInput): Invoice {
  return createInvoiceRecord(input, true);
}

export function normalizedInvoiceBusinessKey(issuerNit: string, invoiceNumber: string): string {
  if (!/^\d{1,20}$/.test(issuerNit)) throw new InvoiceDomainError('INVALID_INVOICE');
  return `${issuerNit}:${normalizedInvoiceNumber(invoiceNumber)}`;
}
