import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createStore } from 'zustand/vanilla';
import { App } from '@/app/app';
import { AuthorizedNavigation } from '@/modules/authentication/presentation/authorized-navigation';
import { createAuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { Permission, PermissionScope, PermissionsSnapshot } from '@/modules/authentication/domain/permissions';
import type { SessionPort, SessionSnapshot } from '@/modules/authentication/application/session-ports';
import type { AuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { HealthStore } from '@/modules/home/presentation/health-store';
import type { ThirdPartyApi } from '@/modules/third-party-management/application/third-party-api';
import type { ThirdPartyRecord } from '@/modules/third-party-management/domain/third-party';
import { ApplicationError } from '@/shared/application/application-error';

const globalScope: PermissionScope = { kind: 'global', companyId: null, thirdPartyId: null };
const companyScope: PermissionScope = { kind: 'organization', companyId: 'a'.repeat(24), thirdPartyId: null };
const allowed = ['third-parties:read', 'third-parties:create', 'third-parties:update', 'third-parties:deactivate'] as const;
const record = (id: string, businessName: string): ThirdPartyRecord => ({ version: '1', relationship: null, thirdParty: {
  id, documentType: 'NIT', documentNumber: '001', verificationDigit: null, businessName, tradeName: null, email: 'test@example.com', phone: null, address: null,
  country: 'Colombia', department: null, city: null, status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'actor', updatedBy: null,
} });
const stores: ReturnType<typeof createAuthorizationStore>[] = [];

function setup(options: { permissions?: readonly Permission[]; list?: ThirdPartyApi['list']; read?: (target: PermissionScope) => Promise<PermissionsSnapshot> } = {}) {
  let scope: PermissionScope = globalScope; let generation = 0;
  const sessionState: SessionSnapshot = { status: 'authenticated', credentialRevision: 1 };
  const session: SessionPort = { snapshot: () => sessionState, subscribe: () => () => {}, initialize: async () => {}, login: async () => {}, logout: async () => {}, invalidate: () => {} };
  const read = vi.fn(options.read ?? (async (target: PermissionScope): Promise<PermissionsSnapshot> => ({ subject: 'actor', scope: target, roles: ['APP_ADMIN'], permissions: options.permissions ?? allowed,
    policyVersion: '1', contextRevision: target.kind === 'global' ? null : '1', evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 })));
  const authorization = createAuthorizationStore(read, session,
  { automatic: false, visible: () => true }); stores.push(authorization);
  const authentication = createStore(() => ({ status: 'authenticated' as const, credentialRevision: 1, returnPath: null, user: { id: 'actor', username: 'admin', name: 'Admin', email: null, roles: ['APP_ADMIN'] },
    profileStatus: 'success' as const, initialize: async () => {}, login: async () => {}, openAccountManagement: async () => {}, logout: async () => {}, loadUser: async () => {} })) as unknown as AuthenticationStore;
  type TestActiveContext = { kind: 'GLOBAL'; roles: string[] } | { kind: 'ORGANIZATION'; organizationName: string; organizationType: 'COMPANY'; roles: string[] };
  const contextState = createStore(() => ({ status: 'ready' as const, activeContext: { kind: 'GLOBAL', roles: ['APP_ADMIN'] } as TestActiveContext, availableContexts: { organizations: [], globalAvailable: true }, generation: 0, persistent: false,
    initialize: async () => {}, openSelector: async () => false, select: async () => {}, clear: async () => {} }));
  const context = Object.assign(contextState, {
    register: vi.fn(() => () => {}), capture: vi.fn(() => { const ownGeneration = generation; const controller = new AbortController(); return { scope: { ...scope }, signal: controller.signal, isCurrent: () => ownGeneration === generation, release: vi.fn() }; }),
  }) as unknown as ContextStore;
  const defaultList: ThirdPartyApi['list'] = async () => ({ items: [{ thirdParty: record('b'.repeat(24), 'Tercero autorizado').thirdParty, version: '1', relationship: null }], page: 1, pageSize: 20, total: 1 });
  const thirdParties: ThirdPartyApi = { list: options.list ?? defaultList, get: async () => record('b'.repeat(24), 'Tercero autorizado'), create: async () => record('b'.repeat(24), 'Tercero autorizado'),
    update: async () => record('b'.repeat(24), 'Tercero autorizado'), status: async () => record('b'.repeat(24), 'Tercero autorizado'), getRelationship: async () => null, relationship: async () => record('b'.repeat(24), 'Tercero autorizado') };
  const health = createStore(() => ({ status: 'ok' as const, error: null, check: async () => {} })) as unknown as HealthStore;
  return { authorization, authentication, context, thirdParties, health, read, changeContext: async () => {
    scope = companyScope; generation++;
    await authorization.getState().setContext(companyScope);
    contextState.setState({ generation, activeContext: { kind: 'ORGANIZATION', organizationName: 'Empresa A', organizationType: 'COMPANY' as const, roles: ['COMPANY_ADMIN'] } });
  } };
}

async function mountApp(f: ReturnType<typeof setup>) {
  window.history.replaceState({}, '', '/third-parties');
  render(<App store={f.health} authentication={f.authentication} authorization={f.authorization} organizationContext={f.context} thirdParties={f.thirdParties} />);
}

afterEach(() => { cleanup(); stores.splice(0).forEach(store => store.dispose()); });

it('shows Terceros under Administración when the confirmed scope grants access', async () => {
  const f = setup(); await act(() => f.authorization.getState().setContext(globalScope));
  render(<MemoryRouter><AuthorizedNavigation store={f.authorization} contextKind="GLOBAL" items={[{ label: 'Terceros', path: '/third-parties', group: 'Administración', permission: 'third-parties:read' }]} /></MemoryRouter>);
  expect(screen.getByText('Administración')).toBeTruthy(); expect(screen.getByRole('link', { name: 'Terceros' })).toBeTruthy();
});

it('registers the protected third-party route in App', async () => {
  const f = setup(); await act(() => f.authorization.getState().setContext(globalScope)); await mountApp(f);
  expect(await screen.findByRole('heading', { name: 'Terceros' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Crear tercero' })).toBeTruthy();
});

it('keeps the authorized application shell and explains a temporary permissions network failure', async () => {
  const f = setup(); await act(() => f.authorization.getState().setContext(globalScope)); await mountApp(f);
  expect(await screen.findByRole('heading', { name: 'Terceros' })).toBeTruthy();
  f.read.mockRejectedValueOnce(new ApplicationError('NETWORK'));
  await act(() => f.authorization.getState().refresh());
  expect(screen.getByRole('heading', { name: 'Terceros' })).toBeTruthy();
  expect(screen.getByRole('status')).toHaveTextContent('Se conservan temporalmente los permisos verificados');
});

it('denies a direct route and hides navigation when the scope lacks third-party read permission', async () => {
  const f = setup({ permissions: [] }); await act(() => f.authorization.getState().setContext(globalScope)); await mountApp(f);
  expect(await screen.findByRole('heading', { name: 'Acceso denegado' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Terceros' })).toBeNull();
});
