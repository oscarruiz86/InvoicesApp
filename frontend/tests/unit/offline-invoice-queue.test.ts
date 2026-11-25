import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OfflineCredentialRecord, OfflineInvoiceRecord } from '@/modules/invoices/application/offline-invoice-ports';
import { offlineInvoiceQueue } from '@/modules/invoices/infrastructure/offline-invoice-queue';

type FakeRequest<T> = { result: T; error: DOMException | null; onsuccess: ((event: Event) => unknown) | null; onerror: ((event: Event) => unknown) | null };
type FakeTransaction = { error: DOMException | null; oncomplete: ((event: Event) => unknown) | null; onerror: ((event: Event) => unknown) | null;
  onabort: ((event: Event) => unknown) | null; objectStore: (name: string) => Record<string, (...args: never[]) => FakeRequest<unknown>> };

class MemoryIndexedDb {
  readonly data = new Map<string, Map<string, unknown>>([
    ['submissions', new Map()], ['credentials', new Map()],
  ]);
  quotaExceededOnNextAdd = false;
  private readonly database = {
    objectStoreNames: { contains: (name: string) => this.data.has(name) },
    createObjectStore: (name: string) => { if (!this.data.has(name)) this.data.set(name, new Map()); },
    close: () => {},
    transaction: (name: string): FakeTransaction => {
      const rows = this.data.get(name)!;
      const tx: FakeTransaction = { error: null, oncomplete: null, onerror: null, onabort: null, objectStore: () => ({
        add: (value: unknown) => {
          const req = this.request(undefined);
          if (this.quotaExceededOnNextAdd) {
            this.quotaExceededOnNextAdd = false;
            const error = new DOMException('Storage quota exceeded', 'QuotaExceededError');
            queueMicrotask(() => { req.error = error; tx.error = error; req.onerror?.(new Event('error')); tx.onabort?.(new Event('abort')); });
          } else {
            rows.set((value as { readonly id: string }).id, value);
            this.complete(tx);
          }
          return req;
        },
        getAll: () => { const req = this.request([...rows.values()]); this.complete(tx); return req; },
        get: (id: string) => { const req = this.request(rows.get(id)); this.complete(tx); return req; },
        put: (value: unknown) => { rows.set((value as { readonly id: string }).id, value); const req = this.request(undefined); this.complete(tx); return req; },
        delete: (id: string) => { rows.delete(id); const req = this.request(undefined); this.complete(tx); return req; },
        clear: () => { rows.clear(); const req = this.request(undefined); this.complete(tx); return req; },
      }) };
      return tx;
    },
  };

  open() {
    const request = this.request(this.database) as FakeRequest<typeof this.database> & { onupgradeneeded: ((event: Event) => unknown) | null };
    request.onupgradeneeded = null;
    queueMicrotask(() => { request.onupgradeneeded?.(new Event('upgradeneeded')); request.onsuccess?.(new Event('success')); });
    return request;
  }
  private request<T>(result: T): FakeRequest<T> { return { result, error: null, onsuccess: null, onerror: null }; }
  private complete(tx: FakeTransaction) { queueMicrotask(() => tx.oncomplete?.(new Event('complete'))); }
}

const makeRecord = (id: string, subject: string, thirdPartyId: string, image?: Blob, origin: 'MANUAL' | 'QR' = 'QR'): Omit<OfflineInvoiceRecord, 'createdAt' | 'status'> => ({
  id, subject, thirdPartyId, origin, assignmentId: `assignment-${id}`, vehicleId: `vehicle-${id}`,
  payload: origin === 'QR' ? { qrContent: `raw QR ${id}` } : { invoiceNumber: `FAC-${id}` },
  idempotencyKey: `key-${id}`, ...(image ? { image } : {}),
});
const makeCredential = (subject: string, thirdPartyId: string): OfflineCredentialRecord => ({ id: `${subject}:${thirdPartyId}`, subject, thirdPartyId,
  credential: `signed-${subject}`, expiresAt: '2026-11-20T20:00:00.000Z', assignmentIds: ['assignment-1'], assignments: [], updatedAt: '2026-11-20T12:00:00.000Z' });

afterEach(() => vi.unstubAllGlobals());

describe('IndexedDB offline invoice queue', () => {
  it('persists raw QR content and optional image, scoped by subject and third party', async () => {
    const database = new MemoryIndexedDb();
    vi.stubGlobal('indexedDB', { open: () => database.open() });
    const image = new Blob(['invoice image'], { type: 'image/jpeg' });
    await offlineInvoiceQueue.save({ ...makeRecord('one', 'driver-1', 'third-party-1', image) });
    await offlineInvoiceQueue.save({ ...makeRecord('manual', 'driver-1', 'third-party-1', new Blob(['manual image']), 'MANUAL') });
    await offlineInvoiceQueue.save({ ...makeRecord('two', 'driver-1', 'third-party-2') });
    await offlineInvoiceQueue.save({ ...makeRecord('three', 'driver-2', 'third-party-1') });

    const scoped = await offlineInvoiceQueue.list('driver-1', 'third-party-1');
    expect(scoped).toHaveLength(2);
    expect(scoped).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'one', subject: 'driver-1', thirdPartyId: 'third-party-1', origin: 'QR', payload: { qrContent: 'raw QR one' }, image, status: 'PENDING', idempotencyKey: 'key-one' }),
      expect.objectContaining({ id: 'manual', origin: 'MANUAL', payload: { invoiceNumber: 'FAC-manual' }, status: 'PENDING' }),
    ]));
    expect(await offlineInvoiceQueue.list('driver-2', 'third-party-1')).toMatchObject([{ id: 'three' }]);
  });

  it('removes one subject’s queue, images, and credential while preserving other users’ records', async () => {
    const database = new MemoryIndexedDb();
    vi.stubGlobal('indexedDB', { open: () => database.open() });
    const otherImage = new Blob(['other image']);
    await offlineInvoiceQueue.save({ ...makeRecord('one', 'driver-1', 'third-party-1', new Blob(['private image'])) });
    await offlineInvoiceQueue.save({ ...makeRecord('two', 'driver-2', 'third-party-1', otherImage) });
    await offlineInvoiceQueue.saveCredential(makeCredential('driver-1', 'third-party-1'));
    await offlineInvoiceQueue.saveCredential(makeCredential('driver-2', 'third-party-1'));

    await offlineInvoiceQueue.removeSubject('driver-1');

    expect(await offlineInvoiceQueue.listSubject('driver-1')).toEqual([]);
    expect(await offlineInvoiceQueue.getCredential('driver-1', 'third-party-1')).toBeNull();
    expect(await offlineInvoiceQueue.listSubject('driver-2')).toMatchObject([{ id: 'two', image: otherImage }]);
    expect(await offlineInvoiceQueue.getCredential('driver-2', 'third-party-1')).toMatchObject({ subject: 'driver-2' });
  });

  it('surfaces a storage quota error without pretending the capture was saved', async () => {
    const database = new MemoryIndexedDb(); database.quotaExceededOnNextAdd = true;
    vi.stubGlobal('indexedDB', { open: () => database.open() });
    await expect(offlineInvoiceQueue.save({ ...makeRecord('full', 'driver-1', 'third-party-1') }))
      .rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(await offlineInvoiceQueue.listSubject('driver-1')).toEqual([]);
  });
});
