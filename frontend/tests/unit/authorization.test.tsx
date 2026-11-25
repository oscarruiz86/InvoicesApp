import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createAuthorizationStore, type AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import { PermissionGuard, ProtectedRoute, AuthorizationFeedback } from '@/modules/authentication/presentation/permission-guard';
import { AuthorizedNavigation } from '@/modules/authentication/presentation/authorized-navigation';
import { createAuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import { createAuthentication } from '@/modules/authentication/application/authentication';
import { createReadPermissions } from '@/modules/authentication/application/read-permissions';
import { createHttpPermissions } from '@/modules/authentication/infrastructure/http-permissions';
import { createProtectedHttp } from '@/modules/authentication/infrastructure/protected-http';
import { createKeycloakSession, type OidcClient } from '@/modules/authentication/infrastructure/keycloak-session';
import type { SessionPort, SessionSnapshot } from '@/modules/authentication/application/session-ports';
import { selfScope, type ApplicationRole, type Permission, type PermissionScope, type PermissionsSnapshot } from '@/modules/authentication/domain/permissions';
import { ApplicationError } from '@/shared/application/application-error';

const stores: AuthorizationStore[] = [];
const scopeA: PermissionScope = { kind: 'organization', companyId: 'a', thirdPartyId: 't1' };
const scopeB: PermissionScope = { kind: 'organization', companyId: 'b', thirdPartyId: 't2' };
const snapshot = (scope: PermissionScope = selfScope): PermissionsSnapshot => ({ subject: 'u1', scope, roles: ['DRIVER'], permissions: ['invoices:read', 'invoices:update'], policyVersion: '1', contextRevision: scope.kind === 'global' ? null : '1', evaluatedAt: new Date(0).toISOString(), refreshAfterSeconds: 30 });
function session(initial: SessionSnapshot = { status: 'authenticated', credentialRevision: 1 }) {
  let state = initial; const listeners = new Set<(value: SessionSnapshot) => void>();
  const publish = (value: SessionSnapshot) => { state = value; listeners.forEach(listener => listener(value)); };
  const port: SessionPort = { snapshot: () => state, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    initialize: vi.fn(async () => {}), login: vi.fn(async () => {}), logout: vi.fn(async () => publish({ status: 'anonymous' })), invalidate: vi.fn(() => publish({ status: 'error', error: 'SESSION_EXPIRED' })) };
  return { port, publish };
}
function setup(read = vi.fn(async (scope: PermissionScope) => snapshot(scope)), options: Parameters<typeof createAuthorizationStore>[2] = {}) {
  const identity = session();
  const store = createAuthorizationStore(createReadPermissions({ read }), identity.port, { automatic: false, visible: () => true, ...options }); stores.push(store);
  return { ...identity, store, read };
}
afterEach(() => { cleanup(); stores.splice(0).forEach(store => store.dispose()); vi.useRealTimers(); });

describe('public permissions contract and authenticated transport', () => {
  it('parses a closed DTO for exactly the requested scope', async () => {
    const get = vi.fn(async () => snapshot(scopeA));
    const port = createHttpPermissions({ get });
    expect(await port.read(scopeA)).toEqual(snapshot(scopeA));
    expect(get).toHaveBeenCalledWith('auth/permissions', 'scope=organization&companyId=a&thirdPartyId=t1', undefined);
    await expect(port.read(scopeB)).rejects.toThrow('INVALID_RESPONSE');
    await expect(createHttpPermissions({ get: async () => ({ ...snapshot(), token: 'secret' }) }).read(selfScope)).rejects.toThrow('INVALID_RESPONSE');
    await expect(createHttpPermissions({ get: async () => ({ ...snapshot(), permissions: ['invented:all'] }) }).read(selfScope)).rejects.toThrow('INVALID_RESPONSE');
    await expect(createHttpPermissions({ get: async () => ({ ...snapshot(), permissions: ['invoices:read', 'invoices:read'] }) }).read(selfScope)).rejects.toThrow('INVALID_RESPONSE');
  });
  it.each([[401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [503, 'UNAVAILABLE']] as const)('handles HTTP %i without login loops', async (status, code) => {
    const { port } = session();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => { void _input; void _init; return new Response('not json', { status }); });
    const http = createProtectedHttp('/api', { getAccessToken: async () => 'PRIVATE_TOKEN' }, port, fetcher);
    const denied = vi.fn(); http.subscribeForbidden(denied);
    try {
      await expect(createHttpPermissions(http).read(selfScope)).rejects.toMatchObject({ code });
      expect(port.invalidate).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
      expect(port.login).not.toHaveBeenCalled(); expect(denied).not.toHaveBeenCalled();
      expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', cache: 'no-store', credentials: 'omit' });
    } finally { http.dispose(); }
  });
  it('allows only authenticated recipient inbox actions through the protected transport', async () => {
    const { port } = session();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ ok: true }));
    const http = createProtectedHttp('/api', { getAccessToken: async () => 'VERIFIED_SESSION_TOKEN' }, port, fetcher);
    try {
      await http.organization('GET', 'invitations/received', 'page=1');
      await http.organization('POST', 'invitations/received/invite-1/accept', '', { expectedVersion: 2 });
      const receivedUrl = new URL(String(fetcher.mock.calls[0][0]));
      expect(receivedUrl.pathname).toBe('/api/invitations/received'); expect(receivedUrl.search).toBe('?page=1');
      expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer VERIFIED_SESSION_TOKEN' });
      expect(new URL(String(fetcher.mock.calls[1][0])).pathname).toBe('/api/invitations/received/invite-1/accept');
      await expect(Promise.resolve().then(() => http.organization('POST', 'invitations/received/../accept'))).rejects.toMatchObject({ code: 'CONFIGURATION' });
    } finally { http.dispose(); }
  });
  it('keeps the roles destination inside its protected route and notifies on forbidden access', async () => {
    const { port } = session();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code: 'FORBIDDEN', message: 'denied' } }, { status: 403 }));
    const http = createProtectedHttp('/api', { getAccessToken: async () => 'VERIFIED_SESSION_TOKEN' }, port, fetcher);
    const denied = vi.fn(); http.subscribeForbidden(denied);
    try {
      await expect(http.roles('GET', 'scope=global')).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(denied).toHaveBeenCalledOnce();
      expect(new URL(String(fetcher.mock.calls[0][0])).pathname).toBe('/api/roles');
      await expect(Promise.resolve().then(() => http.organization('GET', 'roles'))).rejects.toMatchObject({ code: 'CONFIGURATION' });
    } finally { http.dispose(); }
  });
  it('cancels before sending and discards an ignored cancellation after response', async () => {
    const { port } = session(); const credentials = { getAccessToken: vi.fn(async () => 'SECRET') };
    let complete!: (value: Response) => void;
    const http = createProtectedHttp('/api', credentials, port, () => new Promise(resolve => { complete = resolve; }));
    const aborted = new AbortController(); aborted.abort();
    await expect(http.get('auth/permissions', '', aborted.signal)).rejects.toThrow('CANCELLED');
    expect(credentials.getAccessToken).not.toHaveBeenCalled();
    const controller = new AbortController(); const pending = http.get('auth/permissions', '', controller.signal);
    await Promise.resolve(); controller.abort(); complete(Response.json(snapshot()));
    await expect(pending).rejects.toThrow('CANCELLED'); http.dispose();
  });
  it('emits a credential revision after real SDK renewal without exposing tokens', async () => {
    const client: OidcClient = { init: async () => true, createLoginUrl: async () => 'https://identity.invalid', createLogoutUrl: () => 'https://identity.invalid', updateToken: async () => true, isTokenExpired: () => true, clearToken: async () => {}, authenticated: true, token: 'SECRET' };
    const port = createKeycloakSession({ url: 'http://localhost:8181', realm: 'invoices', clientId: 'invoices-web' }, { factory: () => client });
    await port.initialize(); const revision = port.snapshot().credentialRevision!;
    await port.getAccessToken(); expect(port.snapshot().credentialRevision).toBeGreaterThan(revision);
    expect(JSON.stringify(port.snapshot())).not.toContain('SECRET'); port.invalidate();
  });
});
describe('authorization state and context generations', () => {
  it('discards an old context response after B and after logout', async () => {
    const resolvers: ((value: PermissionsSnapshot) => void)[] = [];
    const read = vi.fn((_scope: PermissionScope) => { void _scope; return new Promise<PermissionsSnapshot>(resolve => resolvers.push(resolve)); });
    const { store, publish } = setup(read);
    const a = store.getState().setContext(scopeA); const b = store.getState().setContext(scopeB);
    expect(store.getState().snapshot).toBeNull();
    resolvers[1](snapshot(scopeB)); await b; resolvers[0](snapshot(scopeA)); await a;
    expect(store.getState().snapshot?.scope).toEqual(scopeB);
    const pending = store.getState().refresh(); publish({ status: 'anonymous' });
    resolvers[2](snapshot(scopeB)); await pending;
    expect(store.getState()).toMatchObject({ status: 'idle', snapshot: null, scope: selfScope });
  });
  it('revalidates at 30 seconds without changing page readiness and refreshes on credential revision', async () => {
    vi.useFakeTimers();
    const { store, read, publish } = setup();
    await store.getState().refresh(); expect(store.getState().has('invoices:read')).toBe(true);
    read.mockImplementationOnce(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.getState().has('invoices:read')).toBe(true); expect(store.getState().status).toBe('ready'); expect(store.getState().refreshing).toBe(true);
    expect(store.getState().snapshot?.permissions).toContain('invoices:read');
    publish({ status: 'refreshing' }); expect(store.getState().snapshot?.permissions).toContain('invoices:read');
    publish({ status: 'authenticated', credentialRevision: 2 });
    await vi.advanceTimersByTimeAsync(0); expect(store.getState().status).toBe('ready'); expect(store.getState().refreshing).toBe(false);
    expect(read).toHaveBeenCalledTimes(3);
  });
  it('keeps the last verified same-scope permissions during a network interruption and retries them', async () => {
    vi.useFakeTimers();
    const { store, read } = setup();
    await store.getState().refresh();
    const verified = store.getState().snapshot;
    read.mockRejectedValueOnce(new ApplicationError('NETWORK'));
    await store.getState().refresh();
    expect(store.getState()).toMatchObject({ status: 'ready', refreshing: true, snapshot: verified });
    expect(store.getState().has('invoices:read')).toBe(true);

    read.mockResolvedValueOnce({ ...snapshot(), permissions: ['drivers:read'] });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(store.getState()).toMatchObject({ status: 'ready', refreshing: false });
    expect(store.getState().has('invoices:read')).toBe(false);
  });
  it('revalidates focus and background visibility without persisting grants', async () => {
    let visible = true; const { store, read } = setup(undefined, { automatic: true, visible: () => visible });
    await Promise.resolve(); await Promise.resolve(); await store.getState().refresh();
    visible = false; document.dispatchEvent(new Event('visibilitychange'));
    expect(store.getState().snapshot?.permissions).toContain('invoices:read');
    visible = true; window.dispatchEvent(new Event('focus')); await Promise.resolve(); await Promise.resolve();
    expect(read.mock.calls.length).toBeGreaterThan(1);
    expect(JSON.stringify(store.getState())).not.toMatch(/SECRET|keycloak|accessToken/);
  });
  it('does not retry a denied permissions query or treat 503 as logout', async () => {
    vi.useFakeTimers();
    const denied = setup(vi.fn(async () => { throw new ApplicationError('FORBIDDEN'); }));
    await denied.store.getState().refresh(); await vi.advanceTimersByTimeAsync(60_000);
    expect(denied.store.getState().status).toBe('denied'); expect(denied.read).toHaveBeenCalledOnce(); expect(denied.port.login).not.toHaveBeenCalled();
    const unavailable = setup(vi.fn(async () => { throw new ApplicationError('UNAVAILABLE'); }));
    await unavailable.store.getState().refresh(); expect(unavailable.store.getState().has('invoices:read')).toBe(false); expect(unavailable.port.invalidate).not.toHaveBeenCalled();
  });
});
describe('permission routes, actions and navigation', () => {
  it('gates the initial permission load, keeps an authorized page during refresh, and combines permission with instance eligibility', async () => {
    const { store, port, read } = setup();
    const authentication = createAuthenticationStore(createAuthentication(port, { read: async () => ({ id: 'u1', username: null, name: null, email: null, roles: ['DRIVER'] }) }));
    render(<MemoryRouter><ProtectedRoute authentication={authentication} authorization={store} permission="invoices:read"><div>Private invoices</div></ProtectedRoute><PermissionGuard store={store} permission="invoices:update" eligible={false}><button>Edit QR</button></PermissionGuard></MemoryRouter>);
    expect(screen.queryByText('Private invoices')).not.toBeInTheDocument();
    expect(screen.queryByText('Verificando permisos…')).not.toBeInTheDocument();
    await act(() => store.getState().refresh());
    expect(screen.getByText('Private invoices')).toBeInTheDocument(); expect(screen.queryByText('Edit QR')).not.toBeInTheDocument();
    let resolveRefresh!: (value: PermissionsSnapshot) => void;
    read.mockImplementationOnce(scope => new Promise(resolve => { resolveRefresh = resolve; void scope; }));
    let pending!: Promise<void>;
    act(() => { pending = store.getState().refresh(); });
    expect(store.getState().status).toBe('ready'); expect(screen.getByText('Private invoices')).toBeInTheDocument();
    await act(async () => { resolveRefresh(snapshot(selfScope)); await pending; });
    act(() => store.getState().invalidate()); expect(screen.queryByText('Private invoices')).not.toBeInTheDocument();
  });
  it('protects the notification delivery route and menu with its dedicated read permission', async () => {
    const denied = setup();
    const authDenied = createAuthenticationStore(createAuthentication(denied.port, { read: async () => ({ id: 'u1', username: null, name: null, email: null, roles: ['DRIVER'] }) }));
    const items = [{ label: 'Entregas de notificaciones', path: '/notification-deliveries', permission: 'notifications:deliveries:read' as const }];
    const view = render(<MemoryRouter><AuthorizedNavigation store={denied.store} items={items} contextKind="GLOBAL" /><ProtectedRoute authentication={authDenied} authorization={denied.store} permission="notifications:deliveries:read"><div>Private deliveries</div></ProtectedRoute></MemoryRouter>);
    await act(() => denied.store.getState().refresh());
    expect(screen.queryByText('Entregas de notificaciones')).not.toBeInTheDocument();
    expect(screen.queryByText('Private deliveries')).not.toBeInTheDocument();
    expect(screen.getByText('Acceso denegado.')).toBeInTheDocument();
    view.unmount();

    const granted = setup(vi.fn(async scope => ({ ...snapshot(scope), permissions: [...snapshot(scope).permissions, 'notifications:deliveries:read'] as Permission[] })));
    const authGranted = createAuthenticationStore(createAuthentication(granted.port, { read: async () => ({ id: 'u1', username: null, name: null, email: null, roles: ['APP_ADMIN'] }) }));
    render(<MemoryRouter><AuthorizedNavigation store={granted.store} items={items} contextKind="GLOBAL" /><ProtectedRoute authentication={authGranted} authorization={granted.store} permission="notifications:deliveries:read"><div>Private deliveries</div></ProtectedRoute></MemoryRouter>);
    await act(() => granted.store.getState().refresh());
    expect(screen.getByText('Entregas de notificaciones')).toBeInTheDocument();
    expect(screen.getByText('Private deliveries')).toBeInTheDocument();
  });
  it('keeps DRIVER away from administration and only renders permitted THIRD_PARTY_ADMIN modules', async () => {
    const driver = setup(); await driver.store.getState().refresh();
    const third = setup(vi.fn(async scope => ({ ...snapshot(scope), permissions: ['vehicles:read', 'drivers:read'] as const })));
    await third.store.getState().setContext(scopeA);
    const items = [{ label: 'Empresas', path: '/companies', permission: 'companies:read' as const }, { label: 'Facturas', path: '/invoices', permission: 'invoices:read' as const, context: 'organization' as const }, { label: 'Vehículos', path: '/vehicles', permission: 'vehicles:read' as const, context: 'organization' as const },
      { label: 'Gestionar invitaciones', path: '/invitations', anyPermission: ['users:read', 'drivers:read'] as const }];
    const view = render(<MemoryRouter><AuthorizedNavigation store={driver.store} items={items} contextKind="ORGANIZATION" /></MemoryRouter>);
    expect(screen.queryByText('Empresas')).not.toBeInTheDocument(); expect(screen.getByText('Facturas')).toBeInTheDocument();
    expect(screen.queryByText('Gestionar invitaciones')).not.toBeInTheDocument();
    view.rerender(<MemoryRouter><AuthorizedNavigation store={third.store} items={items} contextKind="GLOBAL" /></MemoryRouter>);
    expect(screen.queryByText('Facturas')).not.toBeInTheDocument(); expect(screen.queryByText('Vehículos')).not.toBeInTheDocument();
    view.rerender(<MemoryRouter><AuthorizedNavigation store={third.store} items={items} contextKind="ORGANIZATION" /></MemoryRouter>);
    expect(screen.queryByText('Facturas')).not.toBeInTheDocument(); expect(screen.getByText('Vehículos')).toBeInTheDocument();
    expect(screen.getByText('Gestionar invitaciones')).toBeInTheDocument();
  });
  it('shows Roles y permisos only with a global context and a confirmed read grant', async () => {
    const admin = setup(vi.fn(async scope => ({ ...snapshot(scope), roles: ['APP_ADMIN'], permissions: ['roles:read'] as Permission[] })));
    await act(async () => { await admin.store.getState().setContext({ kind: 'global', companyId: null, thirdPartyId: null }); });
    const items = [{ label: 'Roles y permisos', path: '/roles', group: 'Configuración', permission: 'roles:read' as const, context: 'global' as const }];
    const view = render(<MemoryRouter><AuthorizedNavigation store={admin.store} items={items} contextKind="GLOBAL" /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Roles y permisos' })).toBeInTheDocument();
    await act(async () => { await admin.store.getState().setContext(scopeA); });
    view.rerender(<MemoryRouter><AuthorizedNavigation store={admin.store} items={items} contextKind="ORGANIZATION" /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: 'Roles y permisos' })).not.toBeInTheDocument();
  });
  it('renders only the modules granted to each of the four application roles', async () => {
    const items = [
      { label: 'Empresas', path: '/companies', permission: 'companies:read' as const },
      { label: 'Usuarios', path: '/users', permission: 'associations:read' as const, context: 'organization' as const },
      { label: 'Vehículos', path: '/vehicles', permission: 'vehicles:read' as const, context: 'organization' as const },
      { label: 'Conductores', path: '/drivers', permission: 'drivers:read' as const, context: 'organization' as const },
      { label: 'Facturas', path: '/invoices', permission: 'invoices:read' as const, context: 'organization' as const },
      { label: 'Asignaciones', path: '/assignments', permission: 'assignments:read' as const, context: 'organization' as const },
    ];
    const scenarios: { role: ApplicationRole; scope: PermissionScope; contextKind: 'GLOBAL' | 'ORGANIZATION'; permissions: readonly Permission[]; visible: readonly string[] }[] = [
      { role: 'APP_ADMIN', scope: { kind: 'global', companyId: null, thirdPartyId: null }, contextKind: 'GLOBAL', permissions: ['companies:read', 'associations:read', 'vehicles:read', 'drivers:read', 'invoices:read', 'assignments:read'], visible: ['Empresas'] },
      { role: 'COMPANY_ADMIN', scope: scopeA, contextKind: 'ORGANIZATION', permissions: ['companies:read', 'associations:read', 'vehicles:read', 'invoices:read'], visible: ['Empresas', 'Usuarios', 'Vehículos', 'Facturas'] },
      { role: 'THIRD_PARTY_ADMIN', scope: scopeA, contextKind: 'ORGANIZATION', permissions: ['associations:read', 'drivers:read', 'invoices:read'], visible: ['Usuarios', 'Conductores', 'Facturas'] },
      { role: 'DRIVER', scope: scopeA, contextKind: 'ORGANIZATION', permissions: ['invoices:read', 'assignments:read'], visible: ['Facturas', 'Asignaciones'] },
    ];

    let view: ReturnType<typeof render> | undefined;
    for (const scenario of scenarios) {
      const authorization = setup(vi.fn(async scope => ({ ...snapshot(scope), roles: [scenario.role], permissions: scenario.permissions })));
      await act(async () => { await authorization.store.getState().setContext(scenario.scope); });
      const tree = <MemoryRouter><AuthorizedNavigation store={authorization.store} items={items} contextKind={scenario.contextKind} /></MemoryRouter>;
      if (view) view.rerender(tree);
      else view = render(tree);
      for (const item of items) {
        const visible = scenario.visible.includes(item.label);
        if (visible) expect(screen.getByRole('link', { name: item.label })).toBeInTheDocument();
        else expect(screen.queryByRole('link', { name: item.label })).not.toBeInTheDocument();
      }
    }
  });
  it('shows 403/503 recovery while 401 invalidates identity', async () => {
    const forbidden = setup(vi.fn(async () => { throw new ApplicationError('FORBIDDEN'); }));
    await forbidden.store.getState().refresh();
    const view = render(<AuthorizationFeedback store={forbidden.store} />);
    expect(screen.getByText('Acceso denegado.')).toBeInTheDocument(); expect(forbidden.port.login).not.toHaveBeenCalled();
    const unavailable = setup(vi.fn(async () => { throw new ApplicationError('UNAVAILABLE'); })); await unavailable.store.getState().refresh();
    view.rerender(<AuthorizationFeedback store={unavailable.store} />); expect(screen.getByRole('button', { name: 'Reintentar permisos' })).toBeInTheDocument();
    const expired = setup(vi.fn(async () => { throw new ApplicationError('UNAUTHENTICATED'); })); await expired.store.getState().refresh();
    expect(expired.port.invalidate).toHaveBeenCalledOnce(); expect(expired.store.getState().snapshot).toBeNull();
  });
  it('keeps an in-flight permission read silent and only displays a message after failure', async () => {
    let rejectRead!: (error: unknown) => void;
    const failed = setup(vi.fn(() => new Promise<PermissionsSnapshot>((_resolve, reject) => { rejectRead = reject; })));
    const view = render(<AuthorizationFeedback store={failed.store} />);
    expect(view.container).toBeEmptyDOMElement();
    let pending!: Promise<void>;
    act(() => { pending = failed.store.getState().refresh(); });
    expect(view.container).toBeEmptyDOMElement();
    await act(async () => { rejectRead(new ApplicationError('UNAVAILABLE')); await pending; });
    expect(screen.getByRole('alert')).toHaveTextContent('El servicio no está disponible. Puedes reintentar.');
    expect(screen.getByRole('button', { name: 'Reintentar permisos' })).toBeInTheDocument();
  });
});
