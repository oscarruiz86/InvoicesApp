import { createStore } from 'zustand/vanilla';
import { ApplicationError, type ErrorCode } from '@/shared/application/application-error';
import { selfScope, sameScope, type Permission, type PermissionScope, type PermissionsSnapshot } from '../domain/permissions';
import type { ReadPermissions } from '../application/read-permissions';
import type { SessionPort, SessionSnapshot } from '../application/session-ports';

export interface AuthorizationState {
  status: 'idle' | 'loading' | 'refreshing' | 'ready' | 'denied' | 'error'; scope: PermissionScope;
  snapshot: PermissionsSnapshot | null; expiresAt: number; error?: ErrorCode;
  refreshing: boolean;
  refresh(): Promise<void>; setContext(scope: PermissionScope): Promise<void>; invalidate(): void;
  has(permission: Permission): boolean;
}
export function createAuthorizationStore(read: ReadPermissions, session: SessionPort, options: { now?: () => number; visible?: () => boolean; automatic?: boolean } = {}) {
  const now = options.now ?? Date.now;
  const visible = options.visible ?? (() => document.visibilityState !== 'hidden');
  let generation = 0; let active: AbortController | undefined; let disposed = false;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const store = createStore<AuthorizationState>((set, get) => ({
    status: 'idle', scope: { ...selfScope }, snapshot: null, expiresAt: 0, refreshing: false,
    invalidate() {
      generation++; active?.abort(); active = undefined; clearTimeout(expiry);
      set({ status: 'idle', snapshot: null, expiresAt: 0, refreshing: false, error: undefined });
    },
    async refresh() {
      // Focus and visibility can fire together. Keep the current read instead
      // of aborting it and starting another permissions request.
      if (active && !active.signal.aborted) return;
      const previous = get();
      generation++; active?.abort(); active = undefined; clearTimeout(expiry);
      if (disposed || session.snapshot().status !== 'authenticated' || !visible()) {
        if (previous.refreshing) set({ refreshing: false });
        return;
      }
      const epoch = generation; const started = now(); const scope = { ...get().scope };
      const controller = new AbortController(); active = controller;
      const retained = previous.snapshot && sameScope(previous.scope, previous.snapshot.scope) ? previous.snapshot : null;
      // Refresh transport activity must not become a page lifecycle transition.
      set({ status: retained ? 'ready' : 'loading', refreshing: Boolean(retained), snapshot: retained, expiresAt: retained ? previous.expiresAt : 0, error: undefined });
      try {
        const snapshot = await read(scope, controller.signal);
        if (disposed || generation !== epoch || controller.signal.aborted) return;
        if (!sameScope(snapshot.scope, scope)) throw new ApplicationError('INVALID_RESPONSE');
        if (retained && snapshot.subject !== retained.subject) throw new ApplicationError('INVALID_RESPONSE');
        const expiresAt = started + snapshot.refreshAfterSeconds * 1000;
        if (expiresAt <= now()) throw new ApplicationError('TIMEOUT');
        // Preserve semantic collection identity: fresh timestamps or ordering do not change grants.
        const stable = <T extends string>(previous: readonly T[] | undefined, next: readonly T[]): readonly T[] => previous && previous.length === next.length && next.every(value => previous.includes(value)) ? previous : next;
        const decision = retained ? { ...snapshot, scope: retained.scope, roles: stable(retained.roles, snapshot.roles), permissions: stable(retained.permissions, snapshot.permissions) } : snapshot;
        set({ status: 'ready', refreshing: false, snapshot: decision, expiresAt });
        if (disposed || generation !== epoch || controller.signal.aborted) return;
        expiry = setTimeout(() => { void get().refresh(); }, expiresAt - now());
      } catch (error) {
        if (disposed || generation !== epoch || controller.signal.aborted) return;
        const code = error instanceof ApplicationError ? error.code : 'UNEXPECTED';
        if (code === 'UNAUTHENTICATED') { session.invalidate(); get().invalidate(); }
        else set({ status: code === 'FORBIDDEN' ? 'denied' : 'error', refreshing: false, snapshot: null, expiresAt: 0, error: code });
      } finally { if (active === controller) active = undefined; }
    },
    async setContext(scope) { get().invalidate(); set({ scope: { ...scope } }); await get().refresh(); },
    has(permission) {
      const state = get();
      const current = authorizationAvailable(state, now());
      return current && Boolean(state.snapshot && sameScope(state.scope, state.snapshot.scope) && state.snapshot.permissions.includes(permission));
    },
  }));
  let previous: SessionSnapshot = session.snapshot();
  const unsubscribe = session.subscribe(snapshot => {
    const changed = previous.status !== snapshot.status || previous.credentialRevision !== snapshot.credentialRevision;
    previous = snapshot;
    if (snapshot.status !== 'authenticated' && snapshot.status !== 'refreshing') store.getState().invalidate();
    else if (changed && snapshot.status === 'authenticated') {
      // A fresh credential revision must supersede any permission request sent
      // with the previous token while the authorized same-scope screen remains visible.
      active?.abort(); active = undefined;
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

/** A confirmed decision stays usable during its bounded same-scope background check. */
export function authorizationAvailable(state: Pick<AuthorizationState, 'status' | 'snapshot' | 'expiresAt'> & { readonly refreshing?: boolean }, at = Date.now()): boolean {
  return Boolean(state.snapshot && (state.status === 'refreshing' || (state.status === 'ready' && (state.refreshing || state.expiresAt > at))));
}
