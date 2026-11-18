import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKeycloakSession, type OidcClient } from '@/modules/authentication/infrastructure/keycloak-session';
import { readOidcConfiguration } from '@/modules/authentication/infrastructure/oidc-configuration';
import { createHttpCurrentUser } from '@/modules/authentication/infrastructure/http-current-user';
import type { SessionPort, SessionSnapshot } from '@/modules/authentication/application/session-ports';

const configuration = { url: 'http://localhost:8080', realm: 'invoices', clientId: 'invoices-web' };
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
function sdk(): OidcClient {
  return { init: vi.fn(async () => true), createLoginUrl: vi.fn(async () => 'https://identity.invalid/auth'), createLogoutUrl: vi.fn(() => 'https://identity.invalid/logout'), accountManagement: vi.fn(async () => {}), updateToken: vi.fn(async () => true), isTokenExpired: vi.fn(() => false), clearToken: vi.fn(async () => {}), authenticated: true, token: 'access-in-memory', refreshToken: 'refresh-in-memory', idToken: 'identity-in-memory' };
}
afterEach(() => { vi.useRealTimers(); window.history.replaceState(null, '', '/'); localStorage.clear(); sessionStorage.clear(); });

describe('public OIDC configuration', () => {
  it('allows an absent group and excludes private fields', () => {
    expect(readOidcConfiguration({})).toBeNull();
    expect(readOidcConfiguration({ VITE_KEYCLOAK_URL: configuration.url, VITE_KEYCLOAK_REALM: 'invoices', VITE_KEYCLOAK_CLIENT_ID: 'invoices-web', PASSWORD: 'not-public' })).toEqual(configuration);
  });
  it.each([
    { VITE_KEYCLOAK_URL: 'http://localhost:8080' },
    { VITE_KEYCLOAK_URL: 'http://keycloak:8080', VITE_KEYCLOAK_REALM: 'invoices', VITE_KEYCLOAK_CLIENT_ID: 'invoices-web' },
    { VITE_KEYCLOAK_URL: 'https://user:password@example.invalid', VITE_KEYCLOAK_REALM: 'invoices', VITE_KEYCLOAK_CLIENT_ID: 'invoices-web' },
  ])('rejects partial or private browser configuration', source => expect(() => readOidcConfiguration(source)).toThrow('CONFIGURATION'));
});

describe('OIDC session lifecycle', () => {
  it('opens the identity provider account management only for an authenticated session', async () => {
    const client = sdk(); const session = createKeycloakSession(configuration, { factory: () => client });
    await session.initialize();
    await session.openAccountManagement?.();
    expect(client.accountManagement).toHaveBeenCalledOnce();

    const anonymous = createKeycloakSession(configuration, { factory: () => ({ ...sdk(), init: vi.fn(async () => false) }) });
    await anonymous.initialize();
    await expect(anonymous.openAccountManagement?.()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
  it('cleans callback credentials even when OIDC configuration is absent', async () => {
    window.history.replaceState(null, '', '/auth/callback?code=invalid&state=invalid#callback');
    const factory = vi.fn(sdk);
    const session = createKeycloakSession(null, { factory });
    await session.initialize();
    expect(session.snapshot()).toEqual({ status: 'anonymous', error: 'CONFIGURATION' });
    expect(window.location.search).toBe(''); expect(window.location.hash).toBe('');
    expect(factory).not.toHaveBeenCalled();
  });
  it('initializes only once with Code, PKCE and nonce and restricts callback destination', async () => {
    const client = sdk(); const navigate = vi.fn();
    const session = createKeycloakSession(configuration, { factory: () => client, navigate });
    await Promise.all([session.initialize(), session.initialize()]);
    expect(client.init).toHaveBeenCalledOnce();
    expect(client.init).toHaveBeenCalledWith(expect.objectContaining({ flow: 'standard', pkceMethod: 'S256', useNonce: true, checkLoginIframe: false }));
    await session.login('https://untrusted.invalid');
    expect(client.createLoginUrl).toHaveBeenCalledWith(expect.objectContaining({ redirectUri: `${window.location.origin}/auth/callback` }));
    expect(navigate).toHaveBeenCalledWith('https://identity.invalid/auth');
    expect(JSON.stringify(session.snapshot())).not.toContain('in-memory');
    expect(localStorage.length).toBe(0);
    const callbackState = JSON.parse(sessionStorage.getItem('invoices.login-return-path')!);
    expect(callbackState).toMatchObject({ path: '/session' });
    const storedValues = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.getItem(sessionStorage.key(index)!)).join(' ');
    expect(storedValues).not.toMatch(/access-in-memory|refresh-in-memory|identity-in-memory/);
  });
  it('keeps the exact Keycloak callback and pre-fills the invited email during registration', async () => {
    const navigate = vi.fn();
    const client = sdk();
    const initial = createKeycloakSession(configuration, { factory: () => client, navigate });
    await initial.initialize();
    await initial.login('/session', { action: 'register', loginHint: 'person@example.invalid' });
    expect(client.createLoginUrl).toHaveBeenCalledWith(expect.objectContaining({
      redirectUri: window.location.origin + '/auth/callback',
      action: 'register',
      loginHint: 'person@example.invalid',
    }));
    window.history.replaceState(null, '', '/auth/callback?code=provider-code&state=provider-state');
    const callback = createKeycloakSession(configuration, { factory: sdk });
    await callback.initialize();
    expect(callback.snapshot()).toMatchObject({ status: 'authenticated' });
    expect(window.location.search).toBe('');
  });
  it('rejects an unmatched callback and cleans its URL without redirect loops', async () => {
    window.history.replaceState(null, '', '/auth/callback?code=invalid&state=invalid');
    const client = sdk(); client.init = vi.fn(async () => false);
    const navigate = vi.fn(); const session = createKeycloakSession(configuration, { factory: () => client, navigate });
    await session.initialize();
    expect(session.snapshot()).toEqual({ status: 'error', error: 'AUTHENTICATION' });
    expect(window.location.search).toBe(''); expect(navigate).not.toHaveBeenCalled();
    expect(client.token).toBeUndefined();
  });
  it('treats SDK nonce or callback rejection as an authentication error', async () => {
    const client = sdk(); client.init = vi.fn(async () => { throw new Error('invalid nonce'); });
    const session = createKeycloakSession(configuration, { factory: () => client });
    await session.initialize(); expect(session.snapshot().error).toBe('AUTHENTICATION');
  });
  it('shares renewal, returns the new token and never serializes credentials', async () => {
    const client = sdk(); client.isTokenExpired = () => true;
    let complete!: () => void;
    client.updateToken = vi.fn(() => new Promise<boolean>(resolve => { complete = () => { client.token = 'renewed-in-memory'; resolve(true); }; }));
    const session = createKeycloakSession(configuration, { factory: () => client });
    const states: SessionSnapshot[] = []; session.subscribe(state => states.push(state));
    await session.initialize();
    const first = session.getAccessToken(); const second = session.getAccessToken();
    expect(client.updateToken).toHaveBeenCalledOnce(); expect(session.snapshot().status).toBe('refreshing');
    complete(); expect(await first).toBe('renewed-in-memory'); expect(await second).toBe('renewed-in-memory');
    expect(session.snapshot().status).toBe('authenticated'); expect(JSON.stringify(states)).not.toContain('in-memory');
  });
  it('clears rejected refresh and refuses further protected calls', async () => {
    const client = sdk(); client.isTokenExpired = () => true; client.updateToken = async () => { throw new Error('provider private error'); };
    const session = createKeycloakSession(configuration, { factory: () => client }); await session.initialize();
    await expect(session.getAccessToken()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(session.snapshot()).toEqual({ status: 'error', error: 'SESSION_EXPIRED' });
    expect(client.token).toBeUndefined(); await expect(session.getAccessToken()).rejects.toThrow('UNAUTHENTICATED');
  });
  it('checks freshness after a suspended tab returns and handles the SDK expiry event', async () => {
    vi.useFakeTimers();
    const client = sdk(); const expires = Date.now() + 60_000;
    client.isTokenExpired = validity => Date.now() + (validity ?? 0) * 1000 >= expires;
    client.updateToken = vi.fn(async () => { client.token = 'fresh-after-suspension'; return true; });
    const session = createKeycloakSession(configuration, { factory: () => client }); await session.initialize();
    expect(await session.getAccessToken()).toBe('access-in-memory');
    vi.setSystemTime(expires + 10_000);
    expect(await session.getAccessToken()).toBe('fresh-after-suspension');
    expect(client.updateToken).toHaveBeenCalledOnce();
    client.onTokenExpired?.(); await vi.advanceTimersByTimeAsync(0);
    expect(client.updateToken).toHaveBeenCalledTimes(2);
    expect(session.snapshot().status).toBe('authenticated');
  });
  it('times out refresh and discards late results', async () => {
    vi.useFakeTimers();
    const client = sdk(); client.isTokenExpired = () => true;
    let complete!: () => void;
    client.updateToken = () => new Promise(resolve => { complete = () => { client.token = 'late-token'; resolve(true); }; });
    const session = createKeycloakSession(configuration, { factory: () => client, timeoutMs: 50 }); await session.initialize();
    const result = expect(session.getAccessToken()).rejects.toThrow('UNAUTHENTICATED');
    await vi.advanceTimersByTimeAsync(51); await result; complete(); await Promise.resolve();
    expect(client.token).toBeUndefined(); expect(session.snapshot().error).toBe('SESSION_EXPIRED');
  });
  it('logs out during renewal, ignores late tokens and handles remote navigation failure', async () => {
    const client = sdk(); client.isTokenExpired = () => true;
    let complete!: () => void;
    client.updateToken = () => new Promise(resolve => { complete = () => { client.token = 'late-token'; resolve(true); }; });
    const session = createKeycloakSession(configuration, { factory: () => client, navigate: () => { throw new Error('navigation failed'); } }); await session.initialize();
    const refresh = expect(session.getAccessToken()).rejects.toThrow('UNAUTHENTICATED');
    await session.logout(); expect(client.token).toBeUndefined();
    complete(); await refresh; expect(client.token).toBeUndefined();
    expect(session.snapshot().error).toBe('LOGOUT_UNCONFIRMED');
    expect(sessionStorage.getItem('invoices.logout')).toBeNull();
  });
  it('allows a single explicit retry after failed logout navigation', async () => {
    const navigate = vi.fn().mockImplementationOnce(() => { throw new Error('navigation failed'); });
    const session = createKeycloakSession(configuration, { factory: sdk, navigate });
    await session.initialize(); await session.logout();
    expect(session.snapshot().error).toBe('LOGOUT_UNCONFIRMED');
    await session.logout();
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(session.snapshot().status).toBe('signingOut');
  });
  it('recognizes the logout state returned by the provider and removes the marker', async () => {
    sessionStorage.setItem('invoices.logout', JSON.stringify({ state: 'logout-state', expires: Date.now() + 10_000 }));
    window.history.replaceState(null, '', '/?state=logout-state');
    const client = sdk(); const session = createKeycloakSession(configuration, { factory: () => client });
    await session.initialize(); expect(session.snapshot()).toEqual({ status: 'anonymous' });
    expect(client.init).not.toHaveBeenCalled(); expect(sessionStorage.length).toBe(0); expect(window.location.search).toBe('');
  });
});

function sessionDouble() {
  const listeners = new Set<(value: SessionSnapshot) => void>();
  const session: SessionPort = { snapshot: () => ({ status: 'authenticated' }), initialize: async () => {}, login: async () => {}, logout: async () => {}, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, invalidate: vi.fn(() => listeners.forEach(listener => listener({ status: 'error', error: 'SESSION_EXPIRED' }))) };
  return session;
}
const body = { user: { id: 'subject-1', username: null, name: null, email: null, roles: ['DRIVER'] } };
describe('protected HTTP adapter', () => {
  it('uses only the fixed API destination and rejects redirects without cookies', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    const port = createHttpCurrentUser('/api', { getAccessToken: async () => 'memory-token' }, sessionDouble(), fetcher);
    expect(await port.read()).toEqual(body.user);
    expect(fetcher).toHaveBeenCalledWith(`${window.location.origin}/api/auth/me`, expect.objectContaining({ redirect: 'error', credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json', Authorization: 'Bearer memory-token' } }));
  });
  it('invalidates on 401 while preserving network/503 as retryable errors', async () => {
    const session = sessionDouble();
    await expect(createHttpCurrentUser('/api', { getAccessToken: async () => 'token' }, session, vi.fn().mockResolvedValue(new Response('', { status: 401 }))).read()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(session.invalidate).toHaveBeenCalledOnce();
    const other = sessionDouble();
    await expect(createHttpCurrentUser('/api', { getAccessToken: async () => 'token' }, other, vi.fn().mockResolvedValue(new Response('<h1>Error</h1>', { status: 503 }))).read()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(other.invalidate).not.toHaveBeenCalled();
  });
  it('rejects additional claims and malformed profiles', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ...body, token: 'never-expose' }));
    await expect(createHttpCurrentUser('/api', { getAccessToken: async () => 'token' }, sessionDouble(), fetcher).read()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('cancels pending HTTP on session invalidation', async () => {
    const session = sessionDouble();
    const fetcher: typeof fetch = (_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))); });
    const result = expect(createHttpCurrentUser('/api', { getAccessToken: async () => 'token' }, session, fetcher).read()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await Promise.resolve(); session.invalidate(); await result;
  });
  it('times out an HTTP call and respects caller cancellation', async () => {
    vi.useFakeTimers();
    const fetcher: typeof fetch = (_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))); });
    const port = createHttpCurrentUser('/api', { getAccessToken: async () => 'token' }, sessionDouble(), fetcher, 50);
    const result = expect(port.read()).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(51); await result;
    const controller = new AbortController(); controller.abort(); await expect(port.read(controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});
