import { z } from 'zod';
import { selectionOf } from '../domain/context';
import type { ContextPreference, SessionCleanupChannel } from '../application/context-ports';
const id = z.string().min(1).max(128).refine(value => value.trim().length > 0);
const preference = z.object({ version: z.literal(1), subject: z.string().min(1), selection: z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('GLOBAL') }).strict(), z.object({ kind: z.literal('ORGANIZATION'), organizationId: id, organizationType: z.enum(['COMPANY', 'THIRD_PARTY']) }).strict(),
]) }).strict();
const key = 'invoices.organization-context.v1';
export function createContextPreference(storage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = () => window.sessionStorage): ContextPreference {
  const clear = () => { try { storage().removeItem(key); } catch { /* Memory-only mode. */ } };
  return {
    read(subject) { try { const value = preference.safeParse(JSON.parse(storage().getItem(key) ?? 'null')); if (value.success && value.data.subject === subject) return value.data.selection; } catch { /* Corrupt or unavailable preference is never authority. */ } clear(); return null; },
    write(subject, selection) { try { storage().setItem(key, JSON.stringify({ version: 1, subject, selection: selectionOf(selection) })); return true; } catch { return false; } }, clear,
  };
}
export function createSessionCleanupChannel(): SessionCleanupChannel {
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('invoices.session-cleanup.v1');
  const listeners = new Set<() => void>();
  if (channel) channel.onmessage = event => { if (event.data === 'CLEAR_SESSION') listeners.forEach(listener => listener()); };
  return { publish: () => channel?.postMessage('CLEAR_SESSION'), subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; }, dispose() { channel?.close(); listeners.clear(); } };
}
