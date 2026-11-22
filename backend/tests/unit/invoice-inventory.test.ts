import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { analyzeInvoiceInventory } from '@/modules/invoices/infrastructure/mongodb/invoice-inventory';

const row = (issuerNit: string, invoiceNumber: string, id = new Types.ObjectId()) => ({ _id: id, origin: 'MANUAL', ownerSubject: 'subject',
  thirdPartyId: 'a'.repeat(24), assignmentId: 'b'.repeat(24), driverId: 'c'.repeat(24), vehicleId: 'd'.repeat(24), issuerNit,
  invoiceNumber, invoiceDate: '2026-11-20', invoiceTime: '12:00:00', invoiceAtUtc: '2026-11-20T17:00:00.000Z',
  version: 1, amounts: { amount: '1.00' } });

describe('invoice inventory', () => {
  it('reports a clean read-only inventory without exposing row contents', () => {
    expect(analyzeInvoiceInventory({ invoices: [], images: [], idempotencyKeys: [] })).toEqual({ ready: true, readOnly: true,
      invoices: 0, images: 0, idempotencyKeys: 0, incompatibleInvoices: 0, duplicateBusinessKeys: 0, duplicateCufe: 0,
      duplicateIdempotencyKeys: 0, orphanImageReferences: 0, unattachedImages: 0 });
  });
  it('blocks incompatible and duplicate data while reporting counts only', () => {
    const report = analyzeInvoiceInventory({ invoices: [row('123', 'Fac-1'), row('123', ' fac-1 '), { ownerSubject: 'sensitive' }], images: [], idempotencyKeys: [] });
    expect(report).toMatchObject({ ready: false, incompatibleInvoices: 1, duplicateBusinessKeys: 1 });
    expect(report).not.toHaveProperty('ownerSubject');
    expect(report).not.toHaveProperty('issuerNit');
  });
  it('accepts legacy MANUAL rows without QR metadata and reports cross-origin business/CUFE collisions', () => {
    const legacy = row('123', 'FAC-1');
    const qr = { ...row('456', 'FAC-2'), origin: 'QR', qrMetadata: { parserVersion: 'invoice-key-value-v1', contentHash: 'a'.repeat(64), cufe: 'b'.repeat(96) } };
    const duplicateNumber = { ...row('123', 'FAC-1'), origin: 'QR', qrMetadata: { parserVersion: 'invoice-key-value-v1', contentHash: 'c'.repeat(64) } };
    const duplicateCufe = { ...row('456', 'FAC-3'), origin: 'QR', qrMetadata: qr.qrMetadata };
    const report = analyzeInvoiceInventory({ invoices: [legacy, qr, duplicateNumber, duplicateCufe], images: [], idempotencyKeys: [] });
    expect(report).toMatchObject({ ready: false, incompatibleInvoices: 0, duplicateBusinessKeys: 1, duplicateCufe: 1 });
    expect(analyzeInvoiceInventory({ invoices: [legacy], images: [], idempotencyKeys: [] }).ready).toBe(true);
  });
});
