import type { AuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import type { OfflineInvoiceQueuePort, OfflineInvoiceRecord } from '@/modules/invoices/application/offline-invoice-ports';

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
