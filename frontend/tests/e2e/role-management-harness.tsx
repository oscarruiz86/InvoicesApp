import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { Avatar, Button, CssBaseline, Stack, ThemeProvider } from '@mui/material';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AppLayout } from '@/shared/components/app-layout';
import { theme } from '@/shared/theme/theme';
import { AuthorizedNavigation } from '@/modules/authentication/presentation/authorized-navigation';
import { PermissionGuard } from '@/modules/authentication/presentation/permission-guard';
import type { AuthorizationState, AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { PermissionScope, PermissionsSnapshot, Permission } from '@/modules/authentication/domain/permissions';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { RoleGrant, RolePolicyResponse } from '@/modules/role-management/domain/role-policy';
import { RoleManagementPage } from '@/modules/role-management/presentation/role-management-page';
import { GlobalRolePolicyContextGuard } from '@/modules/role-management/presentation/global-role-policy-context-guard';

const globalScope: PermissionScope = { kind: 'global', companyId: null, thirdPartyId: null };
const organizationScope: PermissionScope = { kind: 'organization', companyId: '0123456789abcdef01234567', thirdPartyId: null };
const ceiling: RoleGrant[] = [
  { role: 'APP_ADMIN', permission: 'roles:read', scope: 'global' },
  { role: 'APP_ADMIN', permission: 'roles:manage', scope: 'global' },
  { role: 'APP_ADMIN', permission: 'companies:read', scope: 'global' },
  { role: 'COMPANY_ADMIN', permission: 'companies:read', scope: 'company' },
  { role: 'THIRD_PARTY_ADMIN', permission: 'third-parties:read', scope: 'third-party' },
  { role: 'DRIVER', permission: 'users:read', scope: 'self' },
];
let currentGrants = ceiling.filter(grant => grant.role === 'APP_ADMIN');
let forceConflict = false;
let delayNextSave = false;
let releasePendingSave: (() => void) | null = null;
let replaceCalls = 0;
let version = '1';
const permissionsFor = (scope: PermissionScope) => scope.kind === 'global'
  ? currentGrants.filter(grant => grant.role === 'APP_ADMIN' && grant.scope === 'global').map(grant => grant.permission)
  : [];
const snapshotFor = (scope: PermissionScope): PermissionsSnapshot => ({ subject: 'browser-test', scope, roles: scope.kind === 'global' ? ['APP_ADMIN'] : [], permissions: permissionsFor(scope), policyVersion: version, contextRevision: null, evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 });
const authorization = Object.assign(createStore<AuthorizationState>((set, get) => ({
  status: 'ready', refreshing: false, scope: globalScope, snapshot: snapshotFor(globalScope), expiresAt: Date.now() + 30_000,
  refresh: async () => {},
  setContext: async scope => set({ status: 'ready', scope, snapshot: snapshotFor(scope), expiresAt: Date.now() + 30_000, error: undefined }),
  invalidate: () => set({ status: 'idle', snapshot: null, expiresAt: 0 }),
  has: (permission: Permission) => Boolean(get().snapshot?.permissions.includes(permission)),
})), { dispose: () => {} }) as AuthorizationStore;
const globalContext = { kind: 'GLOBAL' as const, roles: ['APP_ADMIN'] as const, authorization: snapshotFor(globalScope) };
const organizationContext = { kind: 'ORGANIZATION' as const, organizationId: organizationScope.companyId!, organizationType: 'COMPANY' as const, organizationName: 'Empresa de prueba', roles: ['COMPANY_ADMIN'] as const, authorization: snapshotFor(organizationScope) };
const context = createStore(() => ({
  status: 'ready' as const, activeContext: globalContext, availableContexts: { organizations: [], globalAvailable: true }, generation: 1, persistent: true,
  initialize: async () => {}, openSelector: async () => true, select: async () => {}, clear: async () => {},
})) as unknown as ContextStore;

const response = (policyVersion = version): RolePolicyResponse => ({
  policy: { version: policyVersion, grants: currentGrants.map(grant => ({ ...grant })) },
  catalog: { roles: ['APP_ADMIN', 'COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER'], permissions: ['roles:read', 'roles:manage', 'companies:read', 'third-parties:read', 'users:read'], grantCeiling: ceiling },
});
const api = {
  read: async () => response(),
  replace: async (expectedVersion: string, grants: readonly RoleGrant[]) => {
    replaceCalls++;
    if (delayNextSave) {
      delayNextSave = false;
      await new Promise<void>(resolve => { releasePendingSave = resolve; });
    }
    if (forceConflict) { forceConflict = false; const { RequestError } = await import('@/shared/application/request-error'); throw new RequestError('POLICY_CONFLICT'); }
    if (expectedVersion !== version) { const { RequestError } = await import('@/shared/application/request-error'); throw new RequestError('POLICY_CONFLICT'); }
    currentGrants = grants.map(grant => ({ ...grant }));
    version = String(Number(version) + 1);
    return response(version);
  },
};
const items = [
  { label: 'Empresas', path: '/companies', group: 'Administración', permission: 'companies:read' as const, context: 'global' as const },
  { label: 'Roles y permisos', path: '/roles', group: 'Configuración', permission: 'roles:read' as const, context: 'global' as const },
];
function Navigation() {
  const state = useStore(context);
  return <AuthorizedNavigation store={authorization} items={items} contextKind={state.activeContext?.kind === 'GLOBAL' ? 'GLOBAL' : 'ORGANIZATION'} />;
}
function HarnessControls() {
  return <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', p: 1 }}>
    <Button onClick={() => context.setState({ status: 'ready', activeContext: organizationContext, generation: context.getState().generation + 1 })}>Cambiar a contexto organizacional</Button>
    <Button onClick={() => { forceConflict = true; }}>Simular conflicto de versión</Button>
    <Button onClick={() => { delayNextSave = true; }}>Demorar próxima respuesta del servicio</Button>
  </Stack>;
}
Object.assign(window, { rolePolicyHarness: {
  revokeRead: () => authorization.setState({ status: 'denied', snapshot: null, expiresAt: 0 }),
  releasePendingSave: () => { releasePendingSave?.(); releasePendingSave = null; },
  replaceCalls: () => replaceCalls,
  restoreGlobal: () => { currentGrants = ceiling.filter(grant => grant.role === 'APP_ADMIN'); version = '1'; context.setState({ status: 'ready', activeContext: globalContext, generation: context.getState().generation + 1 }); void authorization.getState().setContext(globalScope); },
} });

createRoot(document.getElementById('root')!).render(<ThemeProvider theme={theme}><CssBaseline /><MemoryRouter initialEntries={['/roles']}>
  <AppLayout navigation={<Navigation />} account={<Avatar>LR</Avatar>}>
    <HarnessControls />
    <Routes><Route path="/roles" element={<PermissionGuard store={authorization} permission="roles:read"><GlobalRolePolicyContextGuard context={context}><RoleManagementPage api={api} authorization={authorization} context={context} /></GlobalRolePolicyContextGuard></PermissionGuard>} />
      <Route path="/companies" element={<h1>Empresas</h1>} /></Routes>
  </AppLayout>
</MemoryRouter></ThemeProvider>);
