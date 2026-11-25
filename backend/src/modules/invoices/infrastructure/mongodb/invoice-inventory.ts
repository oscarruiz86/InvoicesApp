import { Types, type Connection } from 'mongoose';
import { normalizedInvoiceBusinessKey } from '../../domain/invoice';

export interface InvoiceInventoryReport {
  readonly ready: boolean;
  readonly readOnly: true;
  readonly invoices: number;
  readonly images: number;
  readonly idempotencyKeys: number;
  readonly incompatibleInvoices: number;
  readonly duplicateBusinessKeys: number;
  readonly duplicateCufe: number;
  readonly duplicateIdempotencyKeys: number;
  readonly orphanImageReferences: number;
  readonly unattachedImages: number;
}

function compatible(row: Record<string, unknown>): boolean {
  const amounts = row.amounts as Record<string, unknown> | undefined;
  const qr = row.origin === 'QR' ? row.qrMetadata as Record<string, unknown> | undefined : undefined;
  let validSourceUrl = true;
  if (qr?.sourceUrl !== undefined) {
    try { const url = new URL(String(qr.sourceUrl)); validSourceUrl = url.protocol === 'https:' && !url.username && !url.password && String(qr.sourceUrl).length <= 2048; }
    catch { validSourceUrl = false; }
  }
  return row._id instanceof Types.ObjectId && ['MANUAL', 'QR'].includes(String(row.origin))
    && (row.origin !== 'QR' || (!!qr && qr.parserVersion === 'invoice-key-value-v1' && typeof qr.contentHash === 'string' && /^[a-f0-9]{64}$/.test(qr.contentHash)))
    && (row.origin !== 'QR' || (qr?.cufe === undefined || (typeof qr.cufe === 'string' && /^[a-f0-9]{96}$/.test(qr.cufe)))) && validSourceUrl
    && typeof row.ownerSubject === 'string' && !!row.ownerSubject
    && typeof row.thirdPartyId === 'string' && /^[a-f0-9]{24}$/.test(row.thirdPartyId)
    && typeof row.assignmentId === 'string' && /^[a-f0-9]{24}$/.test(row.assignmentId)
    && typeof row.vehicleId === 'string' && /^[a-f0-9]{24}$/.test(row.vehicleId)
    && typeof row.driverId === 'string' && /^[a-f0-9]{24}$/.test(row.driverId)
    && typeof row.invoiceAtUtc === 'string' && Number.isFinite(Date.parse(row.invoiceAtUtc))
    && typeof row.invoiceNumber === 'string' && typeof row.issuerNit === 'string'
    && Number.isSafeInteger(row.version) && Number(row.version) >= 1 && Boolean(amounts);
}

export function analyzeInvoiceInventory(input: {
  readonly invoices: readonly Record<string, unknown>[];
  readonly images: readonly Record<string, unknown>[];
  readonly idempotencyKeys: readonly Record<string, unknown>[];
}): InvoiceInventoryReport {
  const businessKeys = new Set<string>();
  const duplicateBusinessKeys = new Set<string>();
  const cufeKeys = new Set<string>(); const duplicateCufe = new Set<string>();
  for (const row of input.invoices) {
    if (!compatible(row)) continue;
    try {
      const key = `${row.thirdPartyId}:${normalizedInvoiceBusinessKey(String(row.issuerNit), String(row.invoiceNumber))}`;
      if (businessKeys.has(key)) duplicateBusinessKeys.add(key); else businessKeys.add(key);
    } catch { /* incompatible rows are reported separately */ }
    if (row.origin === 'QR') {
      const metadata = row.qrMetadata as Record<string, unknown> | undefined;
      if (typeof metadata?.cufe === 'string') {
        const key = `${String(row.thirdPartyId)}:${metadata.cufe}`;
        if (cufeKeys.has(key)) duplicateCufe.add(key); else cufeKeys.add(key);
      }
    }
  }
  const idemSet = new Set<string>(); const duplicateIdempotencyKeys = new Set<string>();
  for (const row of input.idempotencyKeys) {
    const key = `${String(row.thirdPartyId)}:${String(row.actorSubject)}:${String(row.key)}`;
    if (idemSet.has(key)) duplicateIdempotencyKeys.add(key); else idemSet.add(key);
  }
  const invoiceIds = new Set(input.invoices.map(row => row._id instanceof Types.ObjectId ? row._id.toString() : ''));
  const imageById = new Map(input.images.map(row => [String(row._id ?? ''), row]));
  const orphanImageReferences = input.invoices.filter(row => {
    if (row.imageId === undefined || row.imageId === null) return false;
    const image = imageById.get(String(row.imageId));
    return !image || image.invoiceId !== String((row._id as Types.ObjectId).toString());
  }).length;
  const attachedImageIds = new Set(input.invoices.flatMap(row => row.imageId ? [String(row.imageId)] : []));
  const unattachedImages = input.images.filter(row => !attachedImageIds.has(String(row._id ?? ''))
    || typeof row.invoiceId !== 'string' || !invoiceIds.has(row.invoiceId)).length;
  const report = { ready: false, readOnly: true as const, invoices: input.invoices.length, images: input.images.length,
    idempotencyKeys: input.idempotencyKeys.length, incompatibleInvoices: input.invoices.filter(row => !compatible(row)).length,
    duplicateBusinessKeys: duplicateBusinessKeys.size, duplicateCufe: duplicateCufe.size, duplicateIdempotencyKeys: duplicateIdempotencyKeys.size,
    orphanImageReferences, unattachedImages };
  return { ...report, ready: report.incompatibleInvoices === 0 && report.duplicateBusinessKeys === 0 && report.duplicateCufe === 0
    && report.duplicateIdempotencyKeys === 0 && report.orphanImageReferences === 0 && report.unattachedImages === 0 };
}

export async function inventoryInvoices(connection: Connection): Promise<InvoiceInventoryReport> {
  const [invoices, images, idempotencyKeys] = await Promise.all([
    connection.collection('invoices').find({}).toArray(), connection.collection('invoice_images').find({}).toArray(),
    connection.collection('invoice_idempotency').find({}).toArray(),
  ]);
  return analyzeInvoiceInventory({ invoices: invoices as Record<string, unknown>[], images: images as Record<string, unknown>[],
    idempotencyKeys: idempotencyKeys as Record<string, unknown>[] });
}
