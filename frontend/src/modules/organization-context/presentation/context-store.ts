import { createStore } from 'zustand/vanilla';
import { ApplicationError, type ErrorCode } from '@/shared/application/application-error';
import { sameScope } from '@/modules/authentication/domain/permissions';
import type { AuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import { authorizationAvailable, type AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextApi, ContextPreference, ResolutionReason, SessionCleanupChannel } from '../application/context-ports';
import { scopeOf, selectionOf, type AvailableContexts, type ContextSelection, type ResolvedContext } from '../domain/context';

interface ContextState {
  status: 'idle' | 'loading' | 'selecting' | 'switching' | 'ready' | 'empty' | 'error';
  activeContext: ResolvedContext | null; availableContexts: AvailableContexts; generation: number;
  error?: ErrorCode; persistent: boolean;
  initialize(): Promise<void>; openSelector(): Promise<boolean>;
  select(selection: ContextSelection, reason?: ResolutionReason): Promise<void>; clear(): Promise<void>;
}
export interface ContextParticipant { dirty(): boolean; clear(): void }
export function createContextStore(deps: { api: ContextApi; preference: ContextPreference; authentication: AuthenticationStore; authorization: AuthorizationStore;
  channel: SessionCleanupChannel; invalidateSession(): void; confirmDiscard(): Promise<boolean> }) {
  const participants = new Set<ContextParticipant>();
  const requests = new Set<AbortController>();
  let current: AbortController | undefined; let disposed = false; let subject: string | null = null; let remoteCleanup = false;
  let intent = 0;
  const empty: AvailableContexts = { organizations: [], globalAvailable: false };
  const identity = () => deps.authentication.getState().user?.id ?? null;
  function invalidate() {
    current?.abort(); requests.forEach(controller => controller.abort()); requests.clear();
    deps.authorization.getState().invalidate();
    participants.forEach(participant => participant.clear());
    store.setState(state => ({ activeContext: null, generation: state.generation + 1 }));
  }
  function failure(error: unknown) {
    deps.preference.clear();
    store.setState({ status: 'error', activeContext: null, error: error instanceof ApplicationError ? error.code : 'UNEXPECTED' });
  }
  const store = createStore<ContextState>((set, get) => ({
    status: 'idle', activeContext: null, availableContexts: empty, generation: 0, persistent: true,
    async initialize() {
      if (disposed || !identity()) return;
      const saved = deps.preference.read(identity()!);
      if (saved) { await get().select(saved, 'RESTORE'); if (get().status !== 'error' || get().error !== 'FORBIDDEN') return; }
      await load(true);
    },
    async openSelector() {
      const requested = ++intent;
      if ([...participants].some(value => value.dirty()) && !await deps.confirmDiscard()) return false;
      if (requested !== intent) return false;
      invalidate(); deps.preference.clear(); await load(false); return true;
    },
    async select(selection, reason = 'SWITCH') {
      const requested = ++intent;
      if (participants.size && [...participants].some(value => value.dirty()) && !await deps.confirmDiscard()) return;
      if (requested !== intent || disposed || !identity()) return;
      const owner = identity()!;
      invalidate(); deps.preference.clear();
      const generation = get().generation;
      const controller = new AbortController(); current = controller;
      set({ status: reason === 'SWITCH' ? 'switching' : 'loading', error: undefined });
      const valid = () => !disposed && !controller.signal.aborted && generation === get().generation && owner === identity() && requested === intent;
      try {
        const context = await deps.api.resolve(selectionOf(selection), reason, controller.signal);
        if (!valid()) return;
        if (context.authorization.subject !== owner) throw new ApplicationError('INVALID_RESPONSE');
        await deps.authorization.getState().setContext(scopeOf(selection));
        if (!valid()) return;
        const auth = deps.authorization.getState();
        if (auth.status !== 'ready' || !auth.snapshot || auth.snapshot.subject !== owner || !sameScope(auth.scope, scopeOf(selection)) || !auth.snapshot.permissions.length) throw new ApplicationError(auth.error ?? 'FORBIDDEN');
        // Role metadata and permission state must describe the same revisions.
        if (auth.snapshot.policyVersion !== context.authorization.policyVersion || auth.snapshot.contextRevision !== context.authorization.contextRevision) throw new ApplicationError('UNAVAILABLE');
        set({ activeContext: { ...context, roles: auth.snapshot.roles, authorization: auth.snapshot }, status: 'ready', error: undefined,
          persistent: deps.preference.write(owner, selection) });
      } catch (error) { if (valid()) failure(error); }
    },
    async clear() {
      const requested = ++intent;
      if ([...participants].some(value => value.dirty()) && !await deps.confirmDiscard()) return;
      if (requested !== intent) return;
      invalidate(); deps.preference.clear(); await load(false);
    },
  }));
  async function load(automatic: boolean) {
    const owner = identity(); if (!owner || disposed) return;
    current?.abort(); const controller = new AbortController(); current = controller;
    store.setState({ status: 'loading', error: undefined });
    try {
      const availableContexts = await deps.api.available(controller.signal);
      if (disposed || controller.signal.aborted || owner !== identity()) return;
      store.setState({ availableContexts, status: availableContexts.globalAvailable || availableContexts.organizations.length ? 'selecting' : 'empty' });
      if (automatic) {
        if (availableContexts.globalAvailable) await store.getState().select({ kind: 'GLOBAL' }, 'INITIAL');
        else if (availableContexts.organizations.length === 1) await store.getState().select({ kind: 'ORGANIZATION', ...availableContexts.organizations[0] }, 'INITIAL');
      }
    } catch (error) { if (!controller.signal.aborted && !disposed && owner === identity()) failure(error); }
  }
  function cleanup(broadcast: boolean) {
    intent++; invalidate(); deps.preference.clear(); subject = null;
    store.setState({ status: 'idle', availableContexts: empty, error: undefined });
    if (broadcast && !remoteCleanup) deps.channel.publish();
  }
  const unsubscribeAuthentication = deps.authentication.subscribe(state => {
    if (!['authenticated', 'refreshing'].includes(state.status)) { if (subject) cleanup(true); return; }
    if (state.user && state.profileStatus === 'success' && subject !== state.user.id) {
      subject = state.user.id; void store.getState().initialize();
    }
  });
  const unsubscribeAuthorization = deps.authorization.subscribe(state => {
    const context = store.getState().activeContext;
    if (!context || store.getState().status !== 'ready') return;
    if (state.status === 'denied' || state.status === 'error' || (state.status === 'ready' && !state.snapshot?.permissions.length)) {
      // Clear the context first so the nested authorization invalidation is not recursive.
      store.setState({ activeContext: null, status: 'error', error: state.error ?? 'FORBIDDEN' });
      invalidate(); deps.preference.clear(); return;
    }
    if (state.status === 'ready' && state.snapshot) {
      if (state.snapshot.subject !== identity() || !sameScope(state.snapshot.scope, scopeOf(context))) {
        store.setState({ activeContext: null, status: 'error', error: 'FORBIDDEN' });
        invalidate(); deps.preference.clear(); return;
      }
      const sameValues = (left: readonly string[], right: readonly string[]) =>
        left.length === right.length && left.every(value => right.includes(value));
      const sameAuthority = sameValues(state.snapshot.roles, context.roles)
        && sameValues(state.snapshot.permissions, context.authorization.permissions);
      if (!sameAuthority) {
        // A real grant change can narrow row-level access. Clear old data and
        // require an explicit selection, but never resolve/restore automatically
        // in response to a permissions query.
        current?.abort(); requests.forEach(controller => controller.abort()); requests.clear();
        participants.forEach(participant => participant.clear());
        deps.preference.clear();
        store.setState(value => ({ activeContext: null, status: 'selecting', generation: value.generation + 1 }));
        return;
      }
      if (state.snapshot.policyVersion !== context.authorization.policyVersion || state.snapshot.contextRevision !== context.authorization.contextRevision) {
        // Timestamps/revision metadata alone do not change the selected
        // organization. Keep page data and only replace the authorization evidence.
        store.setState({ activeContext: { ...context, roles: state.snapshot.roles, authorization: state.snapshot } });
      }
    }
  });
  const unsubscribeChannel = deps.channel.subscribe(() => { remoteCleanup = true; cleanup(false); deps.invalidateSession(); remoteCleanup = false; });
  if (identity()) { subject = identity(); queueMicrotask(() => { if (!disposed) void store.getState().initialize(); }); }
  return Object.assign(store, {
    register(participant: ContextParticipant) { participants.add(participant); return () => { participants.delete(participant); }; },
    /** Consumers must check isCurrent before publishing even if their transport ignores abort. */
    capture() {
      const state = store.getState(); const auth = deps.authorization.getState();
      const sameAuthorizedContext = Boolean(state.activeContext && auth.snapshot && sameScope(auth.scope, scopeOf(state.activeContext)));
      const available = authorizationAvailable(auth);
      if (state.status !== 'ready' || !state.activeContext || !available || !sameAuthorizedContext) throw new ApplicationError('FORBIDDEN');
      const generation = state.generation; const owner = identity(); const controller = new AbortController(); requests.add(controller);
      return { scope: { ...scopeOf(state.activeContext) }, signal: controller.signal,
        isCurrent: () => !disposed && !controller.signal.aborted && generation === store.getState().generation && owner === identity() && store.getState().status === 'ready',
        release: () => { requests.delete(controller); } };
    },
    dispose() { disposed = true; unsubscribeAuthentication(); unsubscribeAuthorization(); unsubscribeChannel(); invalidate(); deps.channel.dispose(); },
  });
}
export type ContextStore = ReturnType<typeof createContextStore>;
