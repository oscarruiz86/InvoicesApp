import { createStore } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import type { SessionUser } from '@/modules/authentication/domain/user';
import type { OfflineInvoiceQueuePort, OfflineInvoiceRecord } from '@/modules/invoices/application/offline-invoice-ports';
import { prepareOfflineLogout, subscribeOfflineInvoiceLifecycle } from '@/app/offline-invoice-lifecycle';

const driver = (id: string): SessionUser => ({ id, username: id, name: id, email: null, roles: ['DRIVER'] });
const pending: OfflineInvoiceRecord = { id: 'invoice-1', subject: 'driver-1', thirdPartyId: 'third-party-1', origin: 'MANUAL',
  assignmentId: 'assignment-1', vehicleId: 'vehicle-1', payload: { invoiceNumber: 'FAC-1' }, image: new Blob(['invoice']), status: 'PENDING',
  createdAt: '2026-11-20T12:00:00.000Z', idempotencyKey: 'invoice-1' };

function setupAuthentication() {
  const store = createStore<{ status: 'authenticated' | 'error'; error?: 'SESSION_EXPIRED'; user: SessionUser | null }>(() => ({
    status: 'authenticated', user: driver('driver-1'),
  }));
  return store as unknown as AuthenticationStore;
}

function setupQueue() {
  return { listSubject: vi.fn(async () => [pending]), removeSubject: vi.fn(async () => {}) } as unknown as OfflineInvoiceQueuePort & {
    listSubject: ReturnType<typeof vi.fn>; removeSubject: ReturnType<typeof vi.fn>;
  };
}

describe('offline invoice lifecycle', () => {
  it('requires confirmation before logout deletes pending local captures', async () => {
    const queue = setupQueue(), confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await expect(prepareOfflineLogout('driver-1', queue)).resolves.toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('se eliminarán del dispositivo'));
    expect(queue.removeSubject).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await expect(prepareOfflineLogout('driver-1', queue)).resolves.toBe(true);
    expect(queue.removeSubject).toHaveBeenCalledWith('driver-1');
  });

  it('removes the previous subject queue when the signed-in account changes', async () => {
    const authentication = setupAuthentication(), queue = setupQueue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const unsubscribe = subscribeOfflineInvoiceLifecycle(authentication, queue);
    authentication.setState({ user: driver('driver-2') });
    await vi.waitFor(() => expect(queue.removeSubject).toHaveBeenCalledWith('driver-1'));
    unsubscribe();
  });

  it('warns and removes the pending subject queue when the session expires', async () => {
    const authentication = setupAuthentication(), queue = setupQueue();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const unsubscribe = subscribeOfflineInvoiceLifecycle(authentication, queue);
    authentication.setState({ status: 'error', error: 'SESSION_EXPIRED', user: null });
    await vi.waitFor(() => expect(queue.removeSubject).toHaveBeenCalledWith('driver-1'));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('La sesión expiró'));
    unsubscribe();
  });
});
