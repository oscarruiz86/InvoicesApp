import { createStore } from 'zustand/vanilla';
import { ApplicationError, type ErrorCode } from '@/shared/application/application-error';
import { selfScope, sameScope, type Permission, type PermissionScope, type PermissionsSnapshot } from '../domain/permissions';
import type { ReadPermissions } from '../application/read-permissions';
import type { SessionPort, SessionSnapshot } from '../application/session-ports';

export interface AuthorizationState {
  status: 'idle' | 'loading' | 'ready' | 'denied' | 'error'; scope: PermissionScope;
  snapshot: PermissionsSnapshot | null; expiresAt: number; error?: ErrorCode;
  refresh(): Promise<void>; setContext(scope: PermissionScope): Promise<void>; invalidate(): void;
  has(permission: Permission): boolean;
}
export function createAuthorizationStore(read: ReadPermissions, session: SessionPort, options: { now?: () => number; visible?: () => boolean; automatic?: boolean } = {}) {
  const now = options.now ?? Date.now;
  const visible = options.visible ?? (() => document.visibilityState !== 'hidden');
  let generation = 0; let active: AbortController | undefined; let disposed = false;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const store = createStore<AuthorizationState>((set, get) => ({
    status: 'idle', scope: { ...selfScope }, snapshot: null, expiresAt: 0,
    invalidate() {
      generation++; active?.abort(); active = undefined; clearTimeout(expiry);
      set({ status: 'idle', snapshot: null, expiresAt: 0, error: undefined });
    },
    async refresh() {
      get().invalidate();
      if (disposed || session.snapshot().status !== 'authenticated' || !visible()) return;
      const epoch = generation; const started = now(); const scope = { ...get().scope };
      const controller = new AbortController(); active = controller;
      set({ status: 'loading' });
      try {
        const snapshot = await read(scope, controller.signal);
        if (disposed || generation !== epoch || controller.signal.aborted) return;
        if (!sameScope(snapshot.scope, scope)) throw new ApplicationError('INVALID_RESPONSE');
        const expiresAt = started + snapshot.refreshAfterSeconds * 1000;
        if (expiresAt <= now()) throw new ApplicationError('TIMEOUT');
        set({ status: 'ready', snapshot, expiresAt });
        expiry = setTimeout(() => { void get().refresh(); }, expiresAt - now());
      } catch (error) {
        if (disposed || generation !== epoch || controller.signal.aborted) return;
        const code = error instanceof ApplicationError ? error.code : 'UNEXPECTED';
        if (code === 'UNAUTHENTICATED') { session.invalidate(); get().invalidate(); }
        else set({ status: code === 'FORBIDDEN' ? 'denied' : 'error', snapshot: null, expiresAt: 0, error: code });
      } finally { if (active === controller) active = undefined; }
    },
    async setContext(scope) { get().invalidate(); set({ scope: { ...scope } }); await get().refresh(); },
    has(permission) { const state = get(); return state.status === 'ready' && state.expiresAt > now() && Boolean(state.snapshot && sameScope(state.scope, state.snapshot.scope) && state.snapshot.permissions.includes(permission)); },
  }));
  let previous: SessionSnapshot = session.snapshot();
  const unsubscribe = session.subscribe(snapshot => {
    const changed = previous.status !== snapshot.status || previous.credentialRevision !== snapshot.credentialRevision;
    previous = snapshot;
    if (snapshot.status !== 'authenticated') store.getState().invalidate();
    else if (changed) { store.getState().invalidate(); queueMicrotask(() => { if (!disposed && session.snapshot().status === 'authenticated') void store.getState().refresh(); }); }
    if (!['authenticated', 'refreshing'].includes(snapshot.status)) store.setState({ scope: { ...selfScope } });
  });
  const focus = () => { void store.getState().refresh(); };
  const visibility = () => { if (visible()) focus(); else store.getState().invalidate(); };
  if (options.automatic !== false) {
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visibility);
    if (session.snapshot().status === 'authenticated') queueMicrotask(() => { if (!disposed) focus(); });
  }
  return Object.assign(store, { dispose() { disposed = true; store.getState().invalidate(); unsubscribe(); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibility); } });
}
export type AuthorizationStore = ReturnType<typeof createAuthorizationStore>;
