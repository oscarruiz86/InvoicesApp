import type { OfflineCredentialRecord, OfflineInvoiceQueuePort, OfflineInvoiceRecord } from '../application/offline-invoice-ports';
export type { CachedOfflineAssignment, OfflineCredentialRecord, OfflineInvoiceRecord, OfflineInvoiceStatus } from '../application/offline-invoice-ports';

const databaseName = 'lola-offline-invoices';
const storeName = 'submissions';
const credentialStoreName = 'credentials';
const changedEvent = 'lola:offline-invoices-changed';
function notifyChanged() { if (typeof window !== 'undefined') window.dispatchEvent(new Event(changedEvent)); }

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('OFFLINE_STORAGE_UNAVAILABLE'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(credentialStoreName)) db.createObjectStore(credentialStoreName, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('OFFLINE_STORAGE_UNAVAILABLE'));
  });
}

async function transact<T>(name: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(name, mode);
      const request = operation(transaction.objectStore(name));
      transaction.oncomplete = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('OFFLINE_STORAGE_UNAVAILABLE'));
      transaction.onerror = () => reject(transaction.error ?? new Error('OFFLINE_STORAGE_UNAVAILABLE'));
      transaction.onabort = () => reject(transaction.error ?? new Error('OFFLINE_STORAGE_UNAVAILABLE'));
    });
  } finally { db.close(); }
}

async function deleteRecords<T extends { readonly id: string }>(name: string, records: readonly T[], predicate: (record: T) => boolean): Promise<void> {
  const db = await openDatabase();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(name, 'readwrite'), store = tx.objectStore(name);
    records.filter(predicate).forEach(record => store.delete(record.id));
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error ?? new Error('OFFLINE_STORAGE_UNAVAILABLE')); tx.onabort = () => reject(tx.error ?? new Error('OFFLINE_STORAGE_UNAVAILABLE')); }); }
  finally { db.close(); }
}

export const offlineInvoiceQueue: OfflineInvoiceQueuePort = {
  async save(record: Omit<OfflineInvoiceRecord, 'id' | 'status' | 'createdAt' | 'idempotencyKey'> & { readonly id?: string; readonly idempotencyKey?: string }): Promise<OfflineInvoiceRecord> {
    const id = record.id ?? crypto.randomUUID();
    const idempotencyKey = record.idempotencyKey ?? id;
    if (!idempotencyKey || idempotencyKey.length > 128) throw new Error('INVALID_IDEMPOTENCY_KEY');
    const saved: OfflineInvoiceRecord = { ...record, id, idempotencyKey, status: 'PENDING', createdAt: new Date().toISOString() };
    await transact(storeName, 'readwrite', store => store.add(saved));
    notifyChanged();
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      const sync = (registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } } | undefined)?.sync;
      await sync?.register('invoice-app-sync');
    } catch { /* Background Sync is progressive; focus/online events remain the fallback. */ }
    return saved;
  },
  async list(subject: string, thirdPartyId: string): Promise<OfflineInvoiceRecord[]> {
    const records = await transact<OfflineInvoiceRecord[]>(storeName, 'readonly', store => store.getAll());
    return records.filter(record => record.subject === subject && record.thirdPartyId === thirdPartyId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async listSubject(subject: string): Promise<OfflineInvoiceRecord[]> {
    const records = await transact<OfflineInvoiceRecord[]>(storeName, 'readonly', store => store.getAll());
    return records.filter(record => record.subject === subject).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async recoverInterrupted(subject: string, thirdPartyId: string): Promise<OfflineInvoiceRecord[]> {
    const records = await this.list(subject, thirdPartyId);
    const interrupted = records.filter(record => record.status === 'SENDING');
    for (const record of interrupted) await this.update({ ...record, status: 'RETRYABLE_FAILURE', message: 'El envío se interrumpió; se reintentará.' });
    return records.map(record => record.status === 'SENDING' ? { ...record, status: 'RETRYABLE_FAILURE' as const } : record);
  },
  async update(record: OfflineInvoiceRecord): Promise<void> {
    await transact(storeName, 'readwrite', store => store.put(record));
    notifyChanged();
  },
  async clear(): Promise<void> {
    await transact(storeName, 'readwrite', store => store.clear());
    await transact(credentialStoreName, 'readwrite', store => store.clear());
    notifyChanged();
  },
  async removeSubject(subject: string): Promise<void> {
    const [records, credentials] = await Promise.all([
      transact<OfflineInvoiceRecord[]>(storeName, 'readonly', store => store.getAll()),
      transact<OfflineCredentialRecord[]>(credentialStoreName, 'readonly', store => store.getAll()),
    ]);
    await Promise.all([
      deleteRecords(storeName, records, record => record.subject === subject),
      deleteRecords(credentialStoreName, credentials, record => record.subject === subject),
    ]);
    notifyChanged();
  },
  async removeContext(subject: string, thirdPartyId: string): Promise<void> {
    const [records, credentials] = await Promise.all([
      transact<OfflineInvoiceRecord[]>(storeName, 'readonly', store => store.getAll()),
      transact<OfflineCredentialRecord[]>(credentialStoreName, 'readonly', store => store.getAll()),
    ]);
    await Promise.all([
      deleteRecords(storeName, records, record => record.subject === subject && record.thirdPartyId === thirdPartyId),
      deleteRecords(credentialStoreName, credentials, record => record.subject === subject && record.thirdPartyId === thirdPartyId),
    ]);
    notifyChanged();
  },
  async remove(id: string): Promise<void> {
    await transact(storeName, 'readwrite', store => store.delete(id));
    notifyChanged();
  },
  async saveCredential(record: OfflineCredentialRecord): Promise<void> {
    if (!record.subject || !record.thirdPartyId || !record.credential || !record.assignmentIds.length || record.id !== `${record.subject}:${record.thirdPartyId}`) throw new Error('INVALID_OFFLINE_CREDENTIAL');
    await transact(credentialStoreName, 'readwrite', store => store.put(record));
    notifyChanged();
  },
  async listCredentials(): Promise<OfflineCredentialRecord[]> {
    return transact<OfflineCredentialRecord[]>(credentialStoreName, 'readonly', store => store.getAll());
  },
  async getCredential(subject: string, thirdPartyId: string): Promise<OfflineCredentialRecord | null> {
    return transact<OfflineCredentialRecord | undefined>(credentialStoreName, 'readonly', store => store.get(`${subject}:${thirdPartyId}`)).then(value => value ?? null);
  },
  async removeCredential(subject: string, thirdPartyId: string): Promise<void> {
    await transact(credentialStoreName, 'readwrite', store => store.delete(`${subject}:${thirdPartyId}`));
    notifyChanged();
  },
  subscribe(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener(changedEvent, listener);
    return () => window.removeEventListener(changedEvent, listener);
  },
};
