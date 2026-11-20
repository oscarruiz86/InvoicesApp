import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createContextStore, type ContextStore } from '@/modules/organization-context/presentation/context-store';
import { createContextPreference } from '@/modules/organization-context/infrastructure/context-preference';
import { createHttpContexts } from '@/modules/organization-context/infrastructure/http-contexts';
import { createContextUseCases, type ContextApi } from '@/modules/organization-context/application/context-ports';
import { OrganizationSelectionPage, OrganizationContextGuard } from '@/modules/organization-context/presentation/organization-selector';
import { scopeOf, type ContextSelection, type ResolvedContext, type OrganizationDestination } from '@/modules/organization-context/domain/context';
import { createAuthentication } from '@/modules/authentication/application/authentication';
import { createAuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import { createAuthorizationStore, type AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { SessionPort, SessionSnapshot } from '@/modules/authentication/application/session-ports';
import type { PermissionScope, PermissionsSnapshot } from '@/modules/authentication/domain/permissions';
import { ApplicationError } from '@/shared/application/application-error';

const stores: ContextStore[] = []; const authorizations: AuthorizationStore[] = [];
const org = (id: string, type: 'COMPANY' | 'THIRD_PARTY' = 'COMPANY'): OrganizationDestination => ({ organizationId: id, organizationType: type, organizationName: `Organization ${id}`, roles: [type === 'COMPANY' ? 'COMPANY_ADMIN' : 'DRIVER'] });
const selected = (id: string): ContextSelection => ({ kind: 'ORGANIZATION', organizationId: id, organizationType: 'COMPANY' });
const snapshot = (scope: PermissionScope): PermissionsSnapshot => ({ subject: 'u', scope, roles: scope.kind === 'global' ? ['APP_ADMIN'] : ['COMPANY_ADMIN'], permissions: ['companies:read'], contextRevision: scope.kind === 'global' ? null : '1', policyVersion: '1', evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 });
const resolved = (selection: ContextSelection): ResolvedContext => selection.kind === 'GLOBAL' ? { kind: 'GLOBAL', roles: ['APP_ADMIN'], authorization: snapshot(scopeOf(selection)) } : { kind: 'ORGANIZATION', ...org(selection.organizationId, selection.organizationType), authorization: snapshot(scopeOf(selection)) };
function setup(organizations = [org('a'), org('b')], globalAvailable = false) {
  let session: SessionSnapshot = { status: 'authenticated', credentialRevision: 1 };
  const listeners = new Set<(s: SessionSnapshot) => void>();
  const publish = (state: SessionSnapshot) => { session = state; listeners.forEach(listener => listener(state)); };
  const port: SessionPort = { snapshot: () => session, subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, initialize: async () => {}, login: vi.fn(async () => {}), logout: async () => publish({ status: 'anonymous' }), invalidate: () => publish({ status: 'error', error: 'SESSION_EXPIRED' }) };
  const authentication = createAuthenticationStore(createAuthentication(port, { read: async () => ({ id: 'u', name: 'User', username: 'user', email: null, roles: ['COMPANY_ADMIN'] }) }));
  const read = vi.fn(async (scope: PermissionScope) => snapshot(scope));
  const authorization = createAuthorizationStore(read, port, { automatic: false, visible: () => true }); authorizations.push(authorization);
  const api = { available: vi.fn(async () => ({ organizations, globalAvailable })), resolve: vi.fn(async (selection: ContextSelection) => resolved(selection)) };
  const preference = createContextPreference();
  const confirmDiscard = vi.fn(async () => true);
  const channel = { publish: vi.fn(), subscribe: (listener: () => void) => { void listener; return () => {}; }, dispose: vi.fn() };
  const store = createContextStore({ api: createContextUseCases(api), preference, authentication, authorization, channel, confirmDiscard, invalidateSession: () => port.invalidate() }); stores.push(store);
  const start = async () => { await authentication.getState().loadUser(); await vi.waitFor(() => expect(['ready', 'selecting', 'empty', 'error']).toContain(store.getState().status)); };
  return { store, api, preference, authentication, authorization, confirmDiscard, channel, port, read, start };
}
afterEach(() => { cleanup(); stores.splice(0).forEach(store => store.dispose()); authorizations.splice(0).forEach(store => store.dispose()); sessionStorage.clear(); vi.useRealTimers(); });
describe('context lifecycle', () => {
  it.each(['COMPANY', 'THIRD_PARTY'] as const)('automatically selects a sole %s after confirmed identity', async type => {
    const f = setup([org('a', type)]); await f.start();
    expect(f.store.getState().activeContext?.kind).toBe('ORGANIZATION'); expect(f.api.resolve).toHaveBeenCalledTimes(1); expect(f.port.login).not.toHaveBeenCalled();
  });
  it('requires manual choice for multiple destinations and safely handles zero/global', async () => {
    const f = setup(); await f.start(); expect(f.store.getState().status).toBe('selecting'); expect(f.api.resolve).not.toHaveBeenCalled();
    const none = setup([]); await none.start(); expect(none.store.getState().status).toBe('empty');
    const global = setup([], true); await global.start(); expect(global.store.getState().activeContext?.kind).toBe('GLOBAL');
  });
  it('redirects a user without organization contexts directly to received invitations', async () => {
    const f = setup([]); await f.start();
    render(<MemoryRouter initialEntries={['/organizations/select']}><Routes>
      <Route path="/organizations/select" element={<OrganizationSelectionPage store={f.store} authentication={f.authentication} invitationsAvailable />} />
      <Route path="/invitations/received" element={<div>Mis invitaciones recibidas</div>} />
    </Routes></MemoryRouter>);
    expect(await screen.findByText('Mis invitaciones recibidas')).toBeInTheDocument();
  });
  it('confirms before clearing forms and cancels stale requests', async () => {
    const f = setup(); await f.start(); await f.store.getState().select(selected('a'));
    const clear = vi.fn(); f.store.register({ dirty: () => true, clear }); const request = f.store.capture();
    f.confirmDiscard.mockResolvedValue(false); await f.store.getState().select(selected('b'));
    expect(f.store.getState().activeContext).toMatchObject({ organizationId: 'a' }); expect(clear).not.toHaveBeenCalled(); expect(request.isCurrent()).toBe(true);
    f.confirmDiscard.mockResolvedValue(true); await f.store.getState().select(selected('b'));
    expect(clear).toHaveBeenCalled(); expect(request.signal.aborted).toBe(true); expect(request.isCurrent()).toBe(false);
    expect(request.scope.companyId).toBe('a'); expect(f.store.getState().activeContext).toMatchObject({ organizationId: 'b' }); request.release();
  });
  it('keeps the old page and draft if opening the selector is cancelled', async () => {
    const f = setup(); await f.start(); await f.store.getState().select(selected('a'));
    const clear = vi.fn(); f.store.register({ dirty: () => true, clear }); f.confirmDiscard.mockResolvedValue(false);
    expect(await f.store.getState().openSelector()).toBe(false); expect(clear).not.toHaveBeenCalled(); expect(f.store.getState().status).toBe('ready');
  });
  it('discards late A/B resolutions after selecting C and never restores A after failure', async () => {
    const f = setup(); await f.start();
    let finish!: (context: ResolvedContext) => void;
    f.api.resolve.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.store.getState().select(selected('b'));
    await f.store.getState().select(selected('c')); finish(resolved(selected('b'))); await pending;
    expect(f.store.getState().activeContext).toMatchObject({ organizationId: 'c' });
    f.api.resolve.mockRejectedValueOnce(new ApplicationError('FORBIDDEN')); await f.store.getState().select(selected('a'));
    expect(f.store.getState().activeContext).toBeNull(); expect(f.store.getState().status).toBe('error'); expect(f.preference.read('u')).toBeNull();
  });
  it('restores only by resolving again and clears selection without logging out', async () => {
    const f = setup(); f.preference.write('u', selected('b')); await f.start();
    expect(f.api.resolve).toHaveBeenCalledWith(selected('b'), 'RESTORE', expect.any(AbortSignal));
    await f.store.getState().clear(); expect(f.store.getState().status).toBe('selecting'); expect(f.preference.read('u')).toBeNull(); expect(f.port.snapshot().status).toBe('authenticated');
  });
  it('invalidates on permission revocation and logout without exposing old data', async () => {
    const f = setup([org('a')]); await f.start(); const request = f.store.capture();
    f.read.mockRejectedValueOnce(new ApplicationError('FORBIDDEN')); await f.authorization.getState().refresh();
    expect(f.store.getState().activeContext).toBeNull(); expect(request.isCurrent()).toBe(false);
    await f.port.logout(); expect(f.store.getState().status).toBe('idle'); expect(f.channel.publish).toHaveBeenCalled();
  });
});
describe('preference and API boundaries', () => {
  it('stores only minimal preference and rejects other accounts or manipulated shape', () => {
    const preference = createContextPreference(); preference.write('u', resolved(selected('a')));
    const raw = sessionStorage.getItem('invoices.organization-context.v1')!;
    expect(raw).not.toMatch(/permissions|authorization|roles|Organization a/); expect(preference.read('other')).toBeNull();
    sessionStorage.setItem('invoices.organization-context.v1', JSON.stringify({ version: 1, subject: 'u', selection: { ...selected('a'), roles: ['APP_ADMIN'] } }));
    expect(preference.read('u')).toBeNull();
    const unavailable = createContextPreference(() => { throw new Error('blocked'); }); expect(unavailable.write('u', selected('a'))).toBe(false); expect(unavailable.read('u')).toBeNull();
  });
  it('validates response scope, strict fields and effective permissions', async () => {
    const post = vi.fn(async () => resolved(selected('a')));
    const api: ContextApi = createHttpContexts({ get: async () => ({ organizations: [org('a')], globalAvailable: false }), post });
    expect((await api.available()).organizations).toHaveLength(1);
    expect(await api.resolve(selected('a'), 'INITIAL')).toMatchObject({ organizationId: 'a' });
    await expect(api.resolve(selected('b'), 'SWITCH')).rejects.toThrow('INVALID_RESPONSE');
    post.mockResolvedValue({ ...resolved(selected('a')), authorization: { ...snapshot(scopeOf(selected('a'))), permissions: [] } });
    await expect(api.resolve(selected('a'), 'RESTORE')).rejects.toThrow('INVALID_RESPONSE');
  });
});
describe('accessible selection and guards', () => {
  it('shows named choices, keyboard-focusable controls and switches without login', async () => {
    const f = setup(); await f.start();
    render(<MemoryRouter><OrganizationSelectionPage store={f.store} authentication={f.authentication} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Selecciona una organización' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Seleccionar Organization a' })).toBeEnabled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Seleccionar Organization a' })); });
    expect(f.store.getState().activeContext).toMatchObject({ organizationId: 'a' }); expect(f.port.login).not.toHaveBeenCalled();
  });
  it('gates invalid context and preserves protected content during background permission refresh', async () => {
    const f = setup(); await f.start();
    render(<MemoryRouter><OrganizationContextGuard store={f.store} authorization={f.authorization}><p>Private resource</p></OrganizationContextGuard></MemoryRouter>);
    expect(screen.queryByText('Private resource')).not.toBeInTheDocument();
    await act(async () => { await f.store.getState().select(selected('a')); });
    await waitFor(() => expect(screen.getByText('Private resource')).toBeInTheDocument());
    let resolveRefresh!: (value: PermissionsSnapshot) => void;
    f.read.mockImplementationOnce(scope => new Promise(resolve => { resolveRefresh = resolve; void scope; }));
    let pending!: Promise<void>;
    act(() => { pending = f.authorization.getState().refresh(); });
    expect(f.authorization.getState().status).toBe('ready'); expect(screen.getByText('Private resource')).toBeInTheDocument();
    await act(async () => { resolveRefresh(snapshot(scopeOf(selected('a')))); await pending; });
    act(() => f.authorization.getState().invalidate()); expect(screen.queryByText('Private resource')).not.toBeInTheDocument();
  });
});
