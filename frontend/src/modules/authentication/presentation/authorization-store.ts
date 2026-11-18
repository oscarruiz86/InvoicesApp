import { createStore } from 'zustand/vanilla';
import { ApplicationError, type ErrorCode } from '@/shared/application/application-error';
import { selfScope, sameScope, type Permission, type PermissionScope, type PermissionsSnapshot } from '../domain/permissions';
import type { ReadPermissions } from '../application/read-permissions';
import type { SessionPort, SessionSnapshot } from '../application/session-ports';

export interface AuthorizationState {
  status: 'idle' | 'loading' | 'refreshing' | 'ready' | 'denied' | 'error'; scope: PermissionScope;
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
      // Focus and visibility can fire together. Keep the current read instead
      // of aborting it and starting another permissions request.
      if (active && !active.signal.aborted) return;
      const previous = get();
      generation++; active?.abort(); active = undefined; clearTimeout(expiry);
      if (disposed || session.snapshot().status !== 'authenticated' || !visible()) return;
      const epoch = generation; const started = now(); const scope = { ...get().scope };
      const controller = new AbortController(); active = controller;
      const retained = previous.snapshot && sameScope(previous.scope, previous.snapshot.scope) ? previous.snapshot : null;
      set({ status: retained ? 'refreshing' : 'loading', snapshot: retained, expiresAt: retained ? previous.expiresAt : 0, error: undefined });
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
    has(permission) {
      const state = get();
      const current = (state.status === 'ready' && state.expiresAt > now()) || state.status === 'refreshing';
      return current && Boolean(state.snapshot && sameScope(state.scope, state.snapshot.scope) && state.snapshot.permissions.includes(permission));
    },
  }));
  let previous: SessionSnapshot = session.snapshot();
  const unsubscribe = session.subscribe(snapshot => {
    const changed = previous.status !== snapshot.status || previous.credentialRevision !== snapshot.credentialRevision;
    previous = snapshot;
    if (snapshot.status !== 'authenticated' && snapshot.status !== 'refreshing') store.getState().invalidate();
    else if (changed && snapshot.status === 'authenticated') {
      // Credentials renewed for the same live session require fresh permissions,
      // but the last safe screen may remain while the read is in flight.
      queueMicrotask(() => { if (!disposed && session.snapshot().status === 'authenticated') void store.getState().refresh(); });
    }
    if (!['authenticated', 'refreshing'].includes(snapshot.status)) store.setState({ scope: { ...selfScope } });
  });
  const focus = () => {
    const state = store.getState();
    if (state.status === 'idle' || (state.status === 'ready' && state.expiresAt <= now())) void state.refresh();
  };
  const visibility = () => { if (visible()) focus(); };
  if (options.automatic !== false) {
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visibility);
    if (session.snapshot().status === 'authenticated') queueMicrotask(() => { if (!disposed) focus(); });
  }
  return Object.assign(store, { dispose() { disposed = true; store.getState().invalidate(); unsubscribe(); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibility); } });
}
export type AuthorizationStore = ReturnType<typeof createAuthorizationStore>;
