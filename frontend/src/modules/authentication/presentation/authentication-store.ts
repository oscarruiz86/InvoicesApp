import { createStore } from 'zustand/vanilla';
import type { Authentication } from '../application/authentication';
import type { LoginOptions, SessionSnapshot } from '../application/session-ports';
import type { SessionUser } from '../domain/user';
import { ApplicationError, type ErrorCode } from '@/shared/application/application-error';

export interface AuthenticationState extends SessionSnapshot {
  user: SessionUser | null;
  profileStatus: 'idle' | 'loading' | 'success' | 'error';
  profileError?: ErrorCode;
  initialize(): Promise<void>;
  login(returnPath?: string, options?: LoginOptions): Promise<void>;
  openAccountManagement(): Promise<void>;
  logout(): Promise<void>;
  loadUser(): Promise<void>;
}
export function createAuthenticationStore(authentication: Authentication) {
  let active: AbortController | undefined;
  const store = createStore<AuthenticationState>((set, get) => ({
    ...authentication.snapshot(), user: null, profileStatus: 'idle',
    initialize: () => authentication.initialize(),
    login: (returnPath = '/session', options?: LoginOptions) => authentication.login(returnPath, options),
    openAccountManagement: () => authentication.openAccountManagement(),
    logout: () => authentication.logout(),
    async loadUser() {
      if (!['authenticated', 'refreshing'].includes(get().status)) return;
      active?.abort();
      const current = new AbortController(); active = current;
      set({ user: null, profileStatus: 'loading', profileError: undefined });
      try {
        const user = await authentication.readUser(current.signal);
        if (active === current && !current.signal.aborted) set({ user, profileStatus: 'success' });
      } catch (error) {
        if (active !== current) return;
        const code = error instanceof ApplicationError ? error.code : 'UNEXPECTED';
        if (code === 'UNAUTHENTICATED') authentication.invalidate();
        else set({ user: null, profileStatus: 'error', profileError: code });
      }
    },
  }));
  authentication.subscribe(value => {
    if (['authenticated', 'refreshing'].includes(value.status)) store.setState({ ...value, error: value.error, returnPath: value.returnPath });
    else {
      active?.abort(); active = undefined;
      store.setState({ ...value, error: value.error, returnPath: value.returnPath, user: null, profileStatus: 'idle', profileError: undefined });
    }
  });
  return store;
}
export type AuthenticationStore = ReturnType<typeof createAuthenticationStore>;
