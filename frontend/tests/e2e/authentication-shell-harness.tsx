import { createRoot } from 'react-dom/client';
import { createHealthStore } from '@/modules/home/presentation/health-store';
import { createAuthentication } from '@/modules/authentication/application/authentication';
import type { SessionPort, SessionSnapshot } from '@/modules/authentication/application/session-ports';
import { createAuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import { App } from '@/app/app';

const requestedStatus = new URLSearchParams(window.location.search).get('session') === 'authenticated' ? 'authenticated' : 'anonymous';
window.history.replaceState(null, '', '/');
const initial: SessionSnapshot = { status: requestedStatus };
const session: SessionPort = {
  snapshot: () => initial,
  subscribe: () => () => {},
  initialize: async () => {},
  login: async () => {},
  logout: async () => {},
  openAccountManagement: async () => {},
  invalidate: () => {},
};
const authentication = createAuthenticationStore(createAuthentication(session, { read: async () => ({ id: 'browser-test', username: 'test', name: 'Test User', email: null, roles: [] }) }));
const health = createHealthStore(async () => ({ status: 'ok' as const }));
createRoot(document.getElementById('root')!).render(<App store={health} authentication={authentication} />);
