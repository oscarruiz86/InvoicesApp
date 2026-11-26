import type { AuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import type { OfflineInvoiceQueuePort, OfflineInvoiceRecord } from '@/modules/invoices/application/offline-invoice-ports';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { InvoiceApi } from '@/modules/invoices/application/invoice-api';
import { synchronizeOfflineInvoices } from '@/modules/invoices/application/offline-invoice-sync';

const terminalStatuses: readonly OfflineInvoiceRecord['status'][] = ['SYNCHRONIZED', 'LINKED', 'REJECTED'];

export async function prepareOfflineLogout(subject: string | null, offlineQueue: OfflineInvoiceQueuePort): Promise<boolean> {
  if (!subject) return true;
  try {
    const records = await offlineQueue.listSubject(subject);
    const pending = records.filter(record => !terminalStatuses.includes(record.status));
    if (pending.length && !window.confirm(`Hay ${pending.length} factura(s) offline sin resultado definitivo del servidor. Al cerrar sesión se eliminarán del dispositivo, incluidas sus imágenes. ¿Continuar?`)) return false;
    await offlineQueue.removeSubject(subject);
    return true;
  } catch {
    return window.confirm('No se pudo verificar la cola offline. Cerrar sesión puede dejar datos locales en este dispositivo. ¿Cerrar sesión de todos modos?');
  }
}

async function discardOfflineSubject(subject: string, warning: string, offlineQueue: OfflineInvoiceQueuePort): Promise<void> {
  const records = await offlineQueue.listSubject(subject);
  const pending = records.filter(record => !terminalStatuses.includes(record.status));
  if (!pending.length || window.confirm(`${warning} Hay ${pending.length} factura(s) offline sin resultado definitivo. ¿Eliminar sus datos e imágenes del dispositivo?`))
    await offlineQueue.removeSubject(subject);
}

export function subscribeOfflineInvoiceLifecycle(authentication: AuthenticationStore, offlineQueue: OfflineInvoiceQueuePort): () => void {
  let previous = authentication.getState();
  let subject = previous.user?.id ?? null;
  return authentication.subscribe(state => {
    if (state.user?.id) {
      const nextSubject = state.user.id;
      if (subject && subject !== nextSubject)
        void discardOfflineSubject(subject, 'Cambió la cuenta activa.', offlineQueue).catch(() => undefined);
      subject = nextSubject;
    }
    const wasAuthenticated = ['authenticated', 'refreshing'].includes(previous.status);
    const expired = wasAuthenticated && state.status === 'error' && state.error === 'SESSION_EXPIRED';
    if (expired && subject) {
      const expiredSubject = subject;
      subject = null;
      void discardOfflineSubject(expiredSubject, 'La sesión expiró.', offlineQueue).catch(() => undefined);
    }
    previous = state;
  });
}

/** Re-attempts the authenticated queue whenever the PWA becomes active. */
export function subscribeOfflineInvoiceSyncLifecycle(options: {
  readonly authentication: AuthenticationStore;
  readonly queue: OfflineInvoiceQueuePort;
  readonly api: InvoiceApi;
  readonly readContext: () => { scope: PermissionScope; subject: string; thirdPartyId: string } | null;
}): () => void {
  let running = false;
  const sync = async () => {
    if (running || !navigator.onLine || !['authenticated', 'refreshing'].includes(options.authentication.getState().status)) return;
    const context = options.readContext();
    if (!context) return;
    running = true;
    try { await synchronizeOfflineInvoices({ api: options.api, queue: options.queue, scope: context.scope, subject: context.subject, thirdPartyId: context.thirdPartyId, signal: new AbortController().signal }); }
    catch { /* records retain their retryable state */ }
    finally { running = false; }
  };
  const onOnline = () => { void sync(); };
  const onFocus = () => { void sync(); };
  const onVisibility = () => { if (document.visibilityState === 'visible') void sync(); };
  window.addEventListener('online', onOnline); window.addEventListener('focus', onFocus); window.addEventListener('visibilitychange', onVisibility);
  void sync();
  return () => { window.removeEventListener('online', onOnline); window.removeEventListener('focus', onFocus); window.removeEventListener('visibilitychange', onVisibility); };
}
