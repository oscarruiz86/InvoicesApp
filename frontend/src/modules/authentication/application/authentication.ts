import type { CurrentUserPort, LoginOptions, SessionPort } from './session-ports';

export function createAuthentication(session: SessionPort, users: CurrentUserPort) {
  return {
    initialize: () => session.initialize(),
    login: (returnPath = '/session', options?: LoginOptions) => session.login(
      returnPath === '/invitations/accept' || returnPath === '/invitations/received' ? returnPath : '/session', options),
    logout: () => session.logout(),
    invalidate: () => session.invalidate(),
    snapshot: () => session.snapshot(),
    subscribe: session.subscribe.bind(session),
    readUser: (signal?: AbortSignal) => users.read(signal),
  };
}
export type Authentication = ReturnType<typeof createAuthentication>;
