import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceApi } from '@/modules/invoices/application/invoice-api';
import type { OfflineInvoiceQueuePort, OfflineInvoiceRecord } from '@/modules/invoices/application/offline-invoice-ports';
import { synchronizeOfflineInvoices } from '@/modules/invoices/application/offline-invoice-sync';
import { RequestError } from '@/shared/application/request-error';

afterEach(() => vi.unstubAllGlobals());

describe('offline invoice synchronization', () => {
  it('keeps the original fields and image when the server asks for a correction', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const image = new Blob(['invoice image'], { type: 'image/jpeg' });
    const record: OfflineInvoiceRecord = {
      id: 'local-1', subject: 'driver-1', thirdPartyId: 'b'.repeat(24), origin: 'MANUAL', assignmentId: 'a'.repeat(24), vehicleId: 'c'.repeat(24),
      payload: { invoiceDate: '2026-11-20', invoiceTime: '11:30', invoiceNumber: 'F-1', issuerNit: '900111222', buyerDocument: '900333444',
        amount: '100', vatAmount: '19', otherTaxesAmount: '0', totalAmount: '119' },
      image, status: 'PENDING', createdAt: '2026-11-23T12:00:00Z', idempotencyKey: 'local-1',
    };
    const updates: OfflineInvoiceRecord[] = [];
    const queue = { recoverInterrupted: vi.fn(async () => [record]), update: vi.fn(async (value: OfflineInvoiceRecord) => { updates.push(value); }), remove: vi.fn(async () => {}) } as unknown as OfflineInvoiceQueuePort;
    const api = { submitOffline: vi.fn(async () => { throw new RequestError('INVALID_REQUEST', ['invoiceTime']); }) } as unknown as InvoiceApi;

    await synchronizeOfflineInvoices({ api, queue, scope: { kind: 'organization', companyId: null, thirdPartyId: record.thirdPartyId },
      subject: record.subject, thirdPartyId: record.thirdPartyId, signal: new AbortController().signal });

    expect(api.submitOffline).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ payload: expect.objectContaining({ invoiceTime: '11:30:00' }) }),
      record.idempotencyKey, expect.any(AbortSignal));
    expect(updates.map(value => value.status)).toEqual(['SENDING', 'REQUIRES_CORRECTION']);
    expect(updates[1]).toMatchObject({ payload: record.payload, image });
    expect(updates[1]?.message).toBe('Corrige la hora de factura (HH:mm:ss) y presenta una factura nueva.');
  });

  it('explains QR and image corrections in plain language without reflecting server details', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const record: OfflineInvoiceRecord = { id: 'local-qr', subject: 'driver-1', thirdPartyId: 'b'.repeat(24), origin: 'QR', assignmentId: 'a'.repeat(24),
      vehicleId: 'c'.repeat(24), payload: { qrContent: 'private raw QR value' }, status: 'PENDING', createdAt: '2026-11-23T12:00:00Z', idempotencyKey: 'local-qr' };
    const updates: OfflineInvoiceRecord[] = [];
    const queue = { recoverInterrupted: vi.fn(async () => [record]), update: vi.fn(async (value: OfflineInvoiceRecord) => { updates.push(value); }), remove: vi.fn(async () => {}) } as unknown as OfflineInvoiceQueuePort;
    const api = { submitOffline: vi.fn(async () => { throw new RequestError('QR_INVALID', ['qrContent']); }) } as unknown as InvoiceApi;
    await synchronizeOfflineInvoices({ api, queue, scope: { kind: 'organization', companyId: null, thirdPartyId: record.thirdPartyId },
      subject: record.subject, thirdPartyId: record.thirdPartyId, signal: new AbortController().signal });
    expect(updates[1]?.message).toBe('No se pudo validar el código QR. Vuelve a escanearlo o presenta la factura con captura manual.');
    expect(updates[1]?.message).not.toContain('private raw QR value');
  });

  it('never displays or synchronizes a record returned for another subject or third party', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const own: OfflineInvoiceRecord = { id: 'own', subject: 'driver-1', thirdPartyId: 'b'.repeat(24), origin: 'QR', assignmentId: 'a'.repeat(24),
      vehicleId: 'c'.repeat(24), payload: { qrContent: 'own invoice' }, status: 'PENDING', createdAt: '2026-11-23T12:00:00Z', idempotencyKey: 'own' };
    const foreign: OfflineInvoiceRecord = { ...own, id: 'foreign', subject: 'driver-2', thirdPartyId: 'd'.repeat(24), payload: { qrContent: 'foreign invoice' }, idempotencyKey: 'foreign' };
    const updates: OfflineInvoiceRecord[] = [];
    const queue = { recoverInterrupted: vi.fn(async () => [own, foreign]), update: vi.fn(async (value: OfflineInvoiceRecord) => { updates.push(value); }), remove: vi.fn(async () => {}) } as unknown as OfflineInvoiceQueuePort;
    const api = { submitOffline: vi.fn(async () => ({ id: 'server-1', status: 'SYNCHRONIZED', resultInvoiceId: 'invoice-1' })) } as unknown as InvoiceApi;

    await synchronizeOfflineInvoices({ api, queue, scope: { kind: 'organization', companyId: null, thirdPartyId: own.thirdPartyId },
      subject: own.subject, thirdPartyId: own.thirdPartyId, signal: new AbortController().signal });

    expect(api.submitOffline).toHaveBeenCalledOnce();
    expect(queue.update).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'foreign' }));
    expect(updates.every(record => record.id !== 'foreign')).toBe(true);
  });

  it('removes rejected and administrator-resolved records from the synchronization queue', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const record: OfflineInvoiceRecord = { id: 'local-rejected', subject: 'driver-1', thirdPartyId: 'b'.repeat(24), origin: 'QR', assignmentId: 'a'.repeat(24),
      vehicleId: 'c'.repeat(24), payload: { qrContent: 'invoice' }, status: 'PENDING', createdAt: '2026-11-23T12:00:00Z', idempotencyKey: 'local-rejected' };
    const queue = { recoverInterrupted: vi.fn(async () => [record]), update: vi.fn(async () => {}), remove: vi.fn(async () => {}) } as unknown as OfflineInvoiceQueuePort;
    const api = { submitOffline: vi.fn(async () => ({ id: 'server-rejected', status: 'REJECTED' })),
      offlineSubmission: vi.fn(async () => ({ id: 'server-conflict', status: 'LINKED' })) } as unknown as InvoiceApi;
    const input = { api, queue, scope: { kind: 'organization' as const, companyId: null, thirdPartyId: record.thirdPartyId }, subject: record.subject,
      thirdPartyId: record.thirdPartyId, signal: new AbortController().signal };

    await synchronizeOfflineInvoices(input);
    expect(queue.remove).toHaveBeenCalledWith(record.id);
    expect(queue.update).toHaveBeenCalledOnce();

    const conflicted = { ...record, id: 'local-conflict', status: 'CONFLICT' as const, serverSubmissionId: 'server-conflict' };
    vi.mocked(queue.recoverInterrupted).mockResolvedValueOnce([conflicted]);
    await synchronizeOfflineInvoices(input);
    expect(queue.remove).toHaveBeenCalledWith(conflicted.id);
  });
});
