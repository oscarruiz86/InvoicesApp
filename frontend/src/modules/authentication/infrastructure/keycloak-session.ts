import Keycloak from 'keycloak-js';
import { ApplicationError } from '@/shared/application/application-error';
import type { AccessTokenPort, LoginOptions, SessionPort, SessionSnapshot, SessionFailure } from '../application/session-ports';
import type { OidcConfiguration } from './oidc-configuration';

export type OidcClient = Pick<Keycloak, 'init' | 'createLoginUrl' | 'createLogoutUrl' | 'updateToken' | 'isTokenExpired' | 'clearToken' | 'authenticated' | 'token' | 'refreshToken' | 'idToken' | 'onTokenExpired'> & Partial<Pick<Keycloak, 'accountManagement'>>;
const logoutKey = 'invoices.logout';
const loginReturnPathKey = 'invoices.login-return-path';
const defaultLoginReturnPath = '/session';

function safeLoginReturnPath(path: unknown): string {
  if (typeof path !== 'string' || path.length > 2048 || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return defaultLoginReturnPath;
  try {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname === '/auth/callback') return defaultLoginReturnPath;
    return url.pathname + url.search + url.hash;
  } catch { return defaultLoginReturnPath; }
}

function saveLoginReturnPath(path: string) {
  try { sessionStorage.setItem(loginReturnPathKey, JSON.stringify({ path: safeLoginReturnPath(path), expires: Date.now() + 86_400_000 })); } catch { /* A failed storage write falls back to the default callback destination. */ }
}
function takeLoginReturnPath(): SessionSnapshot['returnPath'] {
  try {
    const raw = sessionStorage.getItem(loginReturnPathKey);
    sessionStorage.removeItem(loginReturnPathKey);
    if (!raw) return undefined;
    const value: { path?: unknown; expires?: unknown } = JSON.parse(raw);
    return typeof value.path === 'string' && typeof value.expires === 'number' && value.expires > Date.now()
      ? safeLoginReturnPath(value.path) : undefined;
  } catch { return undefined; }
}


export function createKeycloakSession(configuration: OidcConfiguration | null, options: {
  factory?: () => OidcClient;
  navigate?: (url: string) => void;
  timeoutMs?: number;
} = {}): SessionPort & AccessTokenPort {
  let snapshot: SessionSnapshot = { status: 'initializing' };
  let client: OidcClient | undefined;
  let initialization: Promise<void> | undefined;
  let refresh: Promise<string> | undefined;
  let generation = 0;
  let credentialRevision = 0;
  const listeners = new Set<(value: SessionSnapshot) => void>();
  const publish = (value: SessionSnapshot) => { snapshot = value; listeners.forEach(listener => listener(value)); };
  const navigate = options.navigate ?? (url => window.location.assign(url));
  const bounded = async <T>(operation: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('OIDC_TIMEOUT')), options.timeoutMs ?? 10_000); })]); }
    finally { clearTimeout(timer); }
  };
  const clear = (instance: OidcClient | undefined) => {
    if (!instance) return;
    instance.onTokenExpired = undefined;
    void instance.clearToken().catch(() => {});
    // Prevent access synchronously, including while the SDK clears its own timers.
    instance.token = undefined; instance.refreshToken = undefined; instance.idToken = undefined; instance.authenticated = false;
  };
  const discard = (error?: SessionFailure) => {
    generation++; clear(client); client = undefined; refresh = undefined; initialization = undefined;
    publish({ status: error ? 'error' : 'anonymous', ...(error ? { error } : {}) });
  };
  const cleanCallbackUrl = () => {
    const url = new URL(window.location.href);
    for (const key of ['code', 'state', 'session_state', 'iss', 'error', 'error_description', 'error_uri']) url.searchParams.delete(key);
    if (window.location.pathname === '/auth/callback') url.hash = '';
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  };
  const port: SessionPort & AccessTokenPort = {
    snapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    initialize() {
      if (initialization) return initialization;
      initialization = (async () => {
        const callback = window.location.pathname === '/auth/callback';
        const returnPath = callback ? takeLoginReturnPath() : undefined;

        if (!configuration) {
          if (callback) cleanCallbackUrl();
          publish({ status: 'anonymous', error: 'CONFIGURATION' }); return;
        }
        try {
          const marker = sessionStorage.getItem(logoutKey);
          if (marker) {
            sessionStorage.removeItem(logoutKey);
            const parsed: { state?: string; expires?: number } = JSON.parse(marker);
            const confirmed = typeof parsed.state === 'string' && (parsed.expires ?? 0) > Date.now() && new URL(window.location.href).searchParams.get('state') === parsed.state;
            cleanCallbackUrl();
            publish({ status: confirmed ? 'anonymous' : 'error', ...(confirmed ? {} : { error: 'LOGOUT_UNCONFIRMED' as const }) });
            return;
          }
        } catch { publish({ status: 'error', error: 'LOGOUT_UNCONFIRMED' }); return; }
        const epoch = generation;
        const instance = options.factory?.() ?? new Keycloak(configuration);
        client = instance;
        publish({ status: 'initializing' });
        instance.onTokenExpired = () => { void port.getAccessToken().catch(() => {}); };
        try {
          const operation = instance.init({ flow: 'standard', pkceMethod: 'S256', useNonce: true, responseMode: 'query', scope: 'openid profile email', checkLoginIframe: false, enableLogging: false });
          void operation.then(() => { if (epoch !== generation) clear(instance); }, () => {});
          const authenticated = await bounded(operation);
          if (epoch !== generation) return;
          if (callback && !authenticated) throw new Error('INVALID_CALLBACK');
          if (callback) cleanCallbackUrl();
          publish(authenticated ? { status: 'authenticated', credentialRevision: ++credentialRevision, ...(returnPath ? { returnPath } : {}) } : { status: 'anonymous' });
        } catch {
          if (callback) cleanCallbackUrl();
          if (epoch === generation) discard('AUTHENTICATION');
        }
      })();
      return initialization;
    },
    async login(returnPath = '/session', loginOptions: LoginOptions = {}) {
      // The OIDC callback remains fixed; session/context guards choose the post-login destination.
      if (!configuration) { publish({ status: 'error', error: 'CONFIGURATION' }); return; }
      if (snapshot.status === 'authenticating') return;
      // A failed/invalidated SDK instance cannot be reused after an in-flight response.
      if (!client) { initialization = undefined; await port.initialize(); }
      const instance = client;
      if (!instance) return;
      const epoch = generation;
      const destination = safeLoginReturnPath(returnPath);
      saveLoginReturnPath(destination);
      publish({ status: 'authenticating' });
      try {
        const loginHint = loginOptions.loginHint?.trim();
        if (loginHint && (loginHint.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginHint))) throw new Error('INVALID_LOGIN_HINT');
        const url = await bounded(instance.createLoginUrl({ redirectUri: window.location.origin + '/auth/callback', scope: 'openid profile email', ...(loginHint ? { loginHint } : {}), ...(loginOptions.action === 'register' ? { action: 'register' } : {}), ...(loginOptions.action === 'switch-account' ? { prompt: 'login' } : {}) }));
        if (epoch === generation) navigate(url);
      } catch { try { sessionStorage.removeItem(loginReturnPathKey); } catch { /* Ignore storage cleanup failures. */ } if (epoch === generation) discard('AUTHENTICATION'); }
    },
    async openAccountManagement() {
      const instance = client;
      if (!instance || !['authenticated', 'refreshing'].includes(snapshot.status)) throw new ApplicationError('UNAUTHENTICATED');
      if (!instance.accountManagement) throw new ApplicationError('UNEXPECTED');
      await instance.accountManagement();
    },
    async getAccessToken() {
      const instance = client;
      if (!instance || !['authenticated', 'refreshing'].includes(snapshot.status)) throw new ApplicationError('UNAUTHENTICATED');
      if (refresh) return refresh;
      if (!instance.isTokenExpired(30) && instance.token) return instance.token;
      const epoch = generation;
      publish({ status: 'refreshing' });
      const operation = instance.updateToken(30);
      void operation.then(() => { if (epoch !== generation) clear(instance); }, () => {});
      refresh = (async () => {
        try {
          await bounded(operation);
          if (epoch !== generation || !instance.token) throw new ApplicationError('UNAUTHENTICATED');
          publish({ status: 'authenticated', credentialRevision: ++credentialRevision });
          return instance.token;
        } catch {
          if (epoch === generation) discard('SESSION_EXPIRED');
          throw new ApplicationError('UNAUTHENTICATED');
        } finally { if (epoch === generation) refresh = undefined; }
      })();
      return refresh;
    },
    invalidate() { discard('SESSION_EXPIRED'); },
    async logout() {
      if (!configuration) { discard(); return; }
      try { sessionStorage.removeItem(loginReturnPathKey); } catch { /* Ignore storage cleanup failures. */ }
      let url: URL;
      try {
        // Reinitialization permits retrying remote logout without retaining an old credential.
        if (!client) { initialization = undefined; await port.initialize(); }
        if (!client) throw new Error();
        url = new URL(client.createLogoutUrl({ redirectUri: `${window.location.origin}/` }));
        const state = crypto.randomUUID();
        url.searchParams.set('state', state);
        sessionStorage.setItem(logoutKey, JSON.stringify({ state, expires: Date.now() + 600_000 }));
      } catch { discard('LOGOUT_UNCONFIRMED'); return; }
      discard(); publish({ status: 'signingOut' });
      try { navigate(url.href); } catch {
        sessionStorage.removeItem(logoutKey);
        publish({ status: 'error', error: 'LOGOUT_UNCONFIRMED' });
      }
    },
  };
  return port;
}
