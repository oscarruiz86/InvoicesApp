import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { useStore } from 'zustand';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Box, Button, CssBaseline, Stack, ThemeProvider, Typography } from '@mui/material';
import { theme } from '@/shared/theme/theme';
import { AppLayout } from '@/shared/components/app-layout';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { HomePage } from '@/modules/home/presentation/home-page';
import { LandingPage } from '@/modules/home/presentation/landing-page';
import type { HealthStore } from '@/modules/home/presentation/health-store';
import type { AuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import type { SessionStatus } from '@/modules/authentication/application/session-ports';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import { AccountMenu, AuthenticationActions, AuthenticationCallback, PrivateRoute, SessionPage } from '@/modules/authentication/presentation/session-page';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { ContextSessionBootstrap, OrganizationContextGuard, OrganizationSelectionPage } from '@/modules/organization-context/presentation/organization-selector';
import type { CompanyApi } from '@/modules/company-management/application/company-api';
import { CompanyPage } from '@/modules/company-management/presentation/company-page';
import type { ThirdPartyApi } from '@/modules/third-party-management/application/third-party-api';
import { ThirdPartyPage } from '@/modules/third-party-management/presentation/third-party-page';
import { ProtectedRoute } from '@/modules/authentication/presentation/permission-guard';
import { AuthorizedNavigation } from '@/modules/authentication/presentation/authorized-navigation';
import type { InvitationApi } from '@/modules/user-invitations/application/invitation-api';
import { InvitationPage } from '@/modules/user-invitations/presentation/invitation-page';
import { InvitationAcceptancePage } from '@/modules/user-invitations/presentation/invitation-acceptance-page';
import { MembershipPage } from '@/modules/user-invitations/presentation/membership-page';
import { ReceivedInvitationsPage } from '@/modules/user-invitations/presentation/received-invitations-page';
import { AuthenticationLoginPage } from '@/modules/authentication/presentation/authentication-login-page';
import { markerModules, MarkerModulePage, type MarkerModuleDefinition } from './module-registry';
import { RouteHeadingFocus } from '@/shared/components/route-heading-focus';
import { VehiclesPage } from '@/modules/fleet/presentation/vehicles-page';
import { AssignmentsPage } from '@/modules/fleet/presentation/assignments-page';
import type { AssignmentApi, DriverApi, VehicleApi } from '@/modules/fleet/application/fleet-api';
import { FleetResourcePage } from '@/modules/fleet/presentation/fleet-resource-page';
import type { NotificationDeliveryReadPort } from '@/modules/notifications/application/delivery-api';
import { NotificationDeliveriesPage } from '@/modules/notifications/presentation/notification-deliveries-page';
import type { RolePolicyApi } from '@/modules/role-management/application/role-policy-api';
import { RoleManagementPage } from '@/modules/role-management/presentation/role-management-page';
import { GlobalRolePolicyContextGuard } from '@/modules/role-management/presentation/global-role-policy-context-guard';
import type { InvoiceApi } from '@/modules/invoices/application/invoice-api';
import type { OfflineCredentialPublicJwk, OfflineCredentialVerifier, OfflineInvoiceQueuePort } from '@/modules/invoices/application/offline-invoice-ports';
import { InvoicesPage } from '@/modules/invoices/presentation/invoices-page';
import type { ParameterApi } from '@/modules/parameter-management/application/parameter-api';
import { ParametersPage } from '@/modules/parameter-management/presentation/parameters-page';
import type { CatalogApi } from '@/modules/parameter-management/application/catalog-api';
import { CatalogsPage } from '@/modules/parameter-management/presentation/catalogs-page';
import { prepareOfflineLogout, subscribeOfflineInvoiceLifecycle, subscribeOfflineInvoiceSyncLifecycle } from './offline-invoice-lifecycle';
import { createOfflinePreparation, type OfflinePreparationSnapshot } from '@/modules/invoices/application/offline-preparation';
import { InstallPwaButton } from '@/shared/components/install-pwa-button';

const driverModule = markerModules.find(module => module.key === 'drivers')!;

function OrganizationManagementNavigation({ authorization, context, invitationsAvailable, roleManagementAvailable }: { authorization: AuthorizationStore; context: ContextStore; invitationsAvailable: boolean; roleManagementAvailable: boolean }) {
  useStore(authorization);
  const state = useStore(context);
  if (state.status !== 'ready' || !state.activeContext) return null;
  const moduleGroups: Record<MarkerModuleDefinition['key'], string> = {
    drivers: 'Flota',
    vehicles: 'Flota',
    'notification-deliveries': 'Administración',
    assignments: 'Flota',
    invoices: 'Facturas',
    parameters: 'Configuración',
    audit: 'Auditoría',
  };
  const items = [
    { label: 'Empresas', path: '/companies', group: 'Administración', permission: 'companies:read' as const },
    { label: 'Terceros', path: '/third-parties', group: 'Administración', permission: 'third-parties:read' as const },
    ...(invitationsAvailable ? [
      { label: 'Invitaciones', path: '/invitations', group: 'Administración', anyPermission: ['associations:read', 'drivers:read'] as const },
      { label: 'Usuarios', path: '/organization-memberships', group: 'Administración', permission: 'associations:read' as const },
    ] : []),
    ...markerModules.map(({ label, path, permission, context, key }) => ({ label, path, permission, context, group: moduleGroups[key] })),
    { label: 'Catálogos paramétricos', path: '/catalogs', group: 'Configuración', permission: 'parameters:read' as const, context: 'global' as const },
    ...(roleManagementAvailable && authorization.getState().has('roles:read') && state.activeContext.kind === 'GLOBAL' ? [{ label: 'Roles y permisos', path: '/roles', group: 'Configuración', permission: 'roles:read' as const, context: 'global' as const }] : []),
  ];
  return <AuthorizedNavigation store={authorization} contextKind={state.activeContext.kind} items={items} />;
}


function MarkerModuleContext({ module, context, children }: { module: MarkerModuleDefinition; context: ContextStore; children: ReactNode }) {
  const state = useStore(context);
  if (state.status !== 'ready' || !state.activeContext) return null;
  if (module.context === 'organization' && state.activeContext.kind !== 'ORGANIZATION') {
    return <Alert severity="warning">Selecciona una organización para continuar.</Alert>;
  }
  return children;
}

function ShellNavigation({ authorization, context, invitationsAvailable, roleManagementAvailable }: { authorization?: AuthorizationStore; context?: ContextStore; invitationsAvailable: boolean; roleManagementAvailable: boolean }) {
  const { pathname } = useLocation(); const home = pathname === '/home';
  return <Stack spacing={.5}><Typography variant="overline" sx={{ px: 1.5, fontWeight: 700 }}>Inicio</Typography><Button variant="text" component={Link} to="/home" aria-current={home ? 'page' : undefined} sx={{ justifyContent: 'flex-start', px: 1.5, minHeight: 42, borderColor: 'transparent', bgcolor: home ? '#e8effe' : 'transparent', color: home ? '#153d8e' : 'text.primary', fontWeight: home ? 700 : 400 }}>Inicio</Button>
    {authorization && context && <OrganizationManagementNavigation authorization={authorization} context={context} invitationsAvailable={invitationsAvailable} roleManagementAvailable={roleManagementAvailable} />}
  </Stack>;
}

function ShellAccount({ authentication, context, offlineQueue }: { authentication: AuthenticationStore; context?: ContextStore; offlineQueue?: OfflineInvoiceQueuePort }) {
  const beforeLogout = offlineQueue ? (subject: string | null) => prepareOfflineLogout(subject, offlineQueue) : undefined;
  return context ? <ShellAccountWithContext authentication={authentication} context={context} offlineQueue={offlineQueue} /> : <AccountMenu store={authentication} beforeLogout={beforeLogout} />;
}

function ShellAccountWithContext({ authentication, context, offlineQueue }: { authentication: AuthenticationStore; context: ContextStore; offlineQueue?: OfflineInvoiceQueuePort }) {
  const current = useStore(context);
  const beforeLogout = offlineQueue ? (subject: string | null) => prepareOfflineLogout(subject, offlineQueue) : undefined;
  return <AccountMenu store={authentication} context={{ activeContext: current.activeContext, openSelector: current.openSelector }} beforeLogout={beforeLogout} />;
}

function OfflineInvoiceLifecycle({ authentication, offlineQueue }: { readonly authentication: AuthenticationStore; readonly offlineQueue?: OfflineInvoiceQueuePort }) {
  useEffect(() => {
    if (!offlineQueue) return;
    return subscribeOfflineInvoiceLifecycle(authentication, offlineQueue);
  }, [authentication, offlineQueue]);
  return null;
}

function OfflineInvoiceSyncLifecycle({ authentication, context, invoices, offlineQueue }: { readonly authentication: AuthenticationStore; readonly context?: ContextStore; readonly invoices?: InvoiceApi; readonly offlineQueue?: OfflineInvoiceQueuePort }) {
  useEffect(() => {
    if (!context || !invoices || !offlineQueue) return;
    const unsubscribe = subscribeOfflineInvoiceSyncLifecycle({ authentication, queue: offlineQueue, api: invoices, readContext: () => {
      const state = context.getState();
      const active = state.activeContext;
      if (state.status !== 'ready' || !active || active.kind !== 'ORGANIZATION' || active.organizationType !== 'THIRD_PARTY') return null;
      return { scope: active.authorization.scope, subject: active.authorization.subject, thirdPartyId: active.organizationId };
    } });
    return unsubscribe;
  }, [authentication, context, invoices, offlineQueue]);
  return null;
}

function OfflinePreparationLifecycle({ authentication, authorization, context, invoices, assignments, offlineQueue, publicJwks, verifyCredential }: {
  readonly authentication: AuthenticationStore; readonly authorization?: AuthorizationStore; readonly context?: ContextStore;
  readonly invoices?: InvoiceApi; readonly assignments?: AssignmentApi; readonly offlineQueue?: OfflineInvoiceQueuePort;
  readonly publicJwks?: readonly OfflineCredentialPublicJwk[]; readonly verifyCredential?: OfflineCredentialVerifier;
}) {
  const [snapshot, setSnapshot] = useState<OfflinePreparationSnapshot>({ state: 'idle', assignments: 0, expiresAt: null, persistent: null, reason: null, pending: 0 });
  const retry = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (!authorization || !context || !invoices || !assignments || !offlineQueue || !publicJwks || !verifyCredential) return;
    const coordinator = createOfflinePreparation({ api: invoices, assignments, context, authorization, queue: offlineQueue, publicJwks, verifyCredential,
      loadQrDecoder: () => import('@/modules/invoices/infrastructure/qr-scanner-adapter').then(adapter => adapter.createQrScannerAdapter()) }, setSnapshot);
    const run = () => { if (['authenticated', 'refreshing'].includes(authentication.getState().status)) void coordinator.prepare(); };
    retry.current = run;
    const unsubAuth = authentication.subscribe(run), unsubAuthz = authorization.subscribe(run), unsubContext = context.subscribe(run);
    run();
    return () => { unsubAuth(); unsubAuthz(); unsubContext(); coordinator.dispose(); };
  }, [assignments, authentication, authorization, context, invoices, offlineQueue, publicJwks, verifyCredential]);
  if (snapshot.state === 'idle' || !authorization?.getState().snapshot?.roles.includes('DRIVER')) return null;
  const label = snapshot.state === 'preparing' ? 'Preparando captura offline…' : snapshot.state === 'ready' ? `Captura offline lista · ${snapshot.assignments} asignaciones` : snapshot.state === 'expired' ? 'Credencial offline vencida' : 'Captura offline no disponible';
  return <Alert severity={snapshot.state === 'ready' ? 'success' : snapshot.state === 'preparing' ? 'info' : 'warning'} role="status" sx={{ mb: 1 }} action={snapshot.state !== 'ready' ? <Button color="inherit" size="small" onClick={() => retry.current()}>Reintentar</Button> : undefined}>{label}{snapshot.expiresAt ? ` · válida hasta ${new Date(snapshot.expiresAt).toLocaleString('es-CO')}` : ''} · {snapshot.pending} pendientes{snapshot.persistent === false ? ' · almacenamiento no persistente' : ''}</Alert>;
}

function AuthorizationConnectivityNotice({ authorization }: { readonly authorization: AuthorizationStore }) {
  const state = useStore(authorization);
  if (!state.snapshot || !['NETWORK', 'TIMEOUT'].includes(state.error ?? '')) return null;
  return <Alert severity="info" role="status">No se pudo actualizar la autorización por la conexión. Se conservan temporalmente los permisos verificados para este contexto mientras se reintenta; el servidor seguirá validando cada operación.</Alert>;
}

function ServiceWorkerUpdateNotice() {
  const [available, setAvailable] = useState(false);
  useEffect(() => { const onUpdate = () => setAvailable(true); window.addEventListener('lola:service-worker-update', onUpdate); return () => window.removeEventListener('lola:service-worker-update', onUpdate); }, []);
  if (!available) return null;
  return <Alert severity="info" role="status" action={<Button color="inherit" size="small" onClick={() => { navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' }); window.location.reload(); }}>Actualizar</Button>}>Hay una nueva versión disponible.</Alert>;
}

function RouteAppFrame({ authenticated, sessionStatus, navigation, account, children }: { authenticated: boolean; sessionStatus: SessionStatus; navigation: ReactNode; account: ReactNode; children: ReactNode }) {
  const { pathname } = useLocation();
  // Keep the shell only while a reloaded Home is checking for an existing OIDC session.
  if (authenticated || ((pathname === '/' || pathname === '/home') && sessionStatus === 'initializing')) return <AppLayout navigation={navigation} account={authenticated ? account : undefined}>{children}</AppLayout>;
  return <Box component="main" sx={{ minHeight: '100dvh', px: { xs: 2, sm: 3, md: 6 }, py: { xs: 3, md: 6 } }}>{children}</Box>;
}

export function App({ store, authentication, authorization, organizationContext, companies, thirdParties, invitations, fleet, vehicles, assignmentApi, invoices, notificationDeliveries, rolePolicy, parameters, catalogs, offlineCredentialPublicJwks, offlineQueue, verifyOfflineCredential }: { store: HealthStore; authentication: AuthenticationStore; authorization?: AuthorizationStore; organizationContext?: ContextStore; companies?: CompanyApi; thirdParties?: ThirdPartyApi; invitations?: InvitationApi; fleet?: DriverApi; vehicles?: VehicleApi; assignmentApi?: AssignmentApi; invoices?: InvoiceApi; notificationDeliveries?: NotificationDeliveryReadPort; rolePolicy?: RolePolicyApi; parameters?: ParameterApi; catalogs?: CatalogApi; offlineCredentialPublicJwks?: readonly OfflineCredentialPublicJwk[]; offlineQueue?: OfflineInvoiceQueuePort; verifyOfflineCredential?: OfflineCredentialVerifier }) {
  const session = useStore(authentication);
  const authenticated = ['authenticated', 'refreshing'].includes(session.status);
  const content = <><RouteHeadingFocus />{authenticated && <Stack direction="row" sx={{ justifyContent: 'flex-end' }}><InstallPwaButton /></Stack>}<ServiceWorkerUpdateNotice /><OfflineInvoiceLifecycle authentication={authentication} offlineQueue={offlineQueue} /><OfflineInvoiceSyncLifecycle authentication={authentication} context={organizationContext} invoices={invoices} offlineQueue={offlineQueue} /><OfflinePreparationLifecycle authentication={authentication} authorization={authorization} context={organizationContext} invoices={invoices} assignments={assignmentApi} offlineQueue={offlineQueue} publicJwks={offlineCredentialPublicJwks} verifyCredential={verifyOfflineCredential} /><AuthenticationActions store={authentication} authorization={authorization} />{authorization && <AuthorizationConnectivityNotice authorization={authorization} />}
    {organizationContext && <ContextSessionBootstrap authentication={authentication} />}
    <Routes>
    <Route path="/" element={authenticated ? <Navigate to="/home" replace /> : session.status === 'initializing' ? <HomePage store={store} authorization={authorization} authentication={authentication} /> : <LandingPage authentication={authentication} />} />
    <Route path="/home" element={authenticated || session.status === 'initializing' ? <HomePage store={store} authorization={authorization} authentication={authentication} /> : <Navigate to="/" replace />} />
    <Route path="/login" element={<AuthenticationLoginPage authentication={authentication} />} />
    {companies && authorization && organizationContext && (['list', 'create', 'detail', 'edit'] as const).map(mode => <Route key={mode} path={mode === 'list' ? '/companies' : mode === 'create' ? '/companies/new' : mode === 'detail' ? '/companies/:id' : '/companies/:id/edit'} element={<ProtectedRoute authentication={authentication} authorization={authorization} permission={mode === 'create' ? 'companies:create' : mode === 'edit' ? 'companies:update' : 'companies:read'}><OrganizationContextGuard store={organizationContext} authorization={authorization}><CompanyPage key={mode} api={companies} context={organizationContext} authorization={authorization} catalogs={catalogs} mode={mode} /></OrganizationContextGuard></ProtectedRoute>} />)}
    {thirdParties && authorization && organizationContext && (['list', 'create', 'detail', 'edit'] as const).map(mode => <Route key={`third-party-${mode}`} path={mode === 'list' ? '/third-parties' : mode === 'create' ? '/third-parties/new' : mode === 'detail' ? '/third-parties/:id' : '/third-parties/:id/edit'} element={<ProtectedRoute authentication={authentication} authorization={authorization} permission={mode === 'create' ? 'third-parties:create' : mode === 'edit' ? 'third-parties:update' : 'third-parties:read'}><OrganizationContextGuard store={organizationContext} authorization={authorization}><ThirdPartyPage key={mode} api={thirdParties} context={organizationContext} authorization={authorization} companies={companies} catalogs={catalogs} mode={mode} /></OrganizationContextGuard></ProtectedRoute>} />)}
    {invitations && authorization && organizationContext && <Route path="/invitations" element={<PrivateRoute store={authentication}><OrganizationContextGuard store={organizationContext} authorization={authorization}><InvitationPage api={invitations} context={organizationContext} authorization={authorization} companies={companies} /></OrganizationContextGuard></PrivateRoute>} />}
    {invitations && <Route path="/invitations/received" element={<PrivateRoute store={authentication}><ReceivedInvitationsPage api={invitations} context={organizationContext} /></PrivateRoute>} />}
    {invitations && authorization && organizationContext && <Route path="/organization-memberships" element={<PrivateRoute store={authentication}><OrganizationContextGuard store={organizationContext} authorization={authorization}><MembershipPage api={invitations} context={organizationContext} authorization={authorization} companies={companies} /></OrganizationContextGuard></PrivateRoute>} />}
    {invitations && <Route path="/invitations/accept" element={<InvitationAcceptancePage api={invitations} authentication={authentication} context={organizationContext} />} />}
    {rolePolicy && authorization && organizationContext && <Route path="/roles" element={<ProtectedRoute authentication={authentication} authorization={authorization} permission="roles:read"><OrganizationContextGuard store={organizationContext} authorization={authorization}><GlobalRolePolicyContextGuard context={organizationContext}><RoleManagementPage api={rolePolicy} authorization={authorization} context={organizationContext} /></GlobalRolePolicyContextGuard></OrganizationContextGuard></ProtectedRoute>} />}
    {catalogs && authorization && organizationContext && <Route path="/catalogs" element={<ProtectedRoute authentication={authentication} authorization={authorization} permission="parameters:read"><OrganizationContextGuard store={organizationContext} authorization={authorization}><GlobalRolePolicyContextGuard context={organizationContext}><CatalogsPage api={catalogs} authorization={authorization} context={organizationContext} /></GlobalRolePolicyContextGuard></OrganizationContextGuard></ProtectedRoute>} />}
    {organizationContext && authorization && fleet && <Route path="/drivers/:id"
      element={<ProtectedRoute authentication={authentication} authorization={authorization} permission="drivers:read">
        <OrganizationContextGuard store={organizationContext} authorization={authorization}>
          <MarkerModuleContext module={driverModule} context={organizationContext}>
            <FleetResourcePage resource="drivers" api={fleet} invitationApi={invitations} context={organizationContext} authorization={authorization} />
          </MarkerModuleContext>
        </OrganizationContextGuard>
      </ProtectedRoute>} />}
    {organizationContext && authorization && markerModules.map(module => <Route key={module.key} path={module.path}
      element={<ProtectedRoute authentication={authentication} authorization={authorization} permission={module.permission}>
        <OrganizationContextGuard store={organizationContext} authorization={authorization}>
          <MarkerModuleContext module={module} context={organizationContext}>
            {module.key === 'drivers' && fleet ? <FleetResourcePage resource="drivers" api={fleet} invitationApi={invitations} context={organizationContext} authorization={authorization} />
              : module.key === 'vehicles' && vehicles ? <VehiclesPage api={vehicles} context={organizationContext} authorization={authorization} />
                : module.key === 'assignments' && assignmentApi && fleet && vehicles ? <AssignmentsPage api={assignmentApi} drivers={fleet} vehicles={vehicles} context={organizationContext} authorization={authorization} />
                  : module.key === 'invoices' && invoices && assignmentApi && offlineQueue && verifyOfflineCredential ? <InvoicesPage api={invoices} assignments={assignmentApi} context={organizationContext} authorization={authorization} offlineCredentialPublicJwks={offlineCredentialPublicJwks}
                    offlineQueue={offlineQueue} verifyCredential={verifyOfflineCredential}
                    loadQrDecoder={() => import('@/modules/invoices/infrastructure/qr-scanner-adapter').then(adapter => adapter.createQrScannerAdapter())} />
                : module.key === 'notification-deliveries' && notificationDeliveries ? <NotificationDeliveriesPage api={notificationDeliveries} />
                : module.key === 'parameters' && parameters && authorization ? <ParametersPage api={parameters} authorization={authorization} context={organizationContext} />
                : <MarkerModulePage module={module} />}
          </MarkerModuleContext>
        </OrganizationContextGuard>
      </ProtectedRoute>} />)}
    <Route path="/auth/callback" element={<AuthenticationCallback store={authentication} />} />
    <Route path="/session" element={<PrivateRoute store={authentication}>{organizationContext && authorization ? <OrganizationContextGuard store={organizationContext} authorization={authorization}><SessionPage store={authentication} /></OrganizationContextGuard> : <SessionPage store={authentication} />}</PrivateRoute>} />
    {organizationContext && <Route path="/organizations/select" element={<PrivateRoute store={authentication}><OrganizationSelectionPage store={organizationContext} authentication={authentication} invitationsAvailable={Boolean(invitations)} /></PrivateRoute>} />}
    <Route path="*" element={<Stack spacing={2}><Typography variant="h4" component="h1">Página no encontrada</Typography><Button component={Link} to="/">Volver al inicio</Button></Stack>} />
    </Routes></>;
  return <ThemeProvider theme={theme}><CssBaseline /><ErrorBoundary><BrowserRouter><RouteAppFrame authenticated={authenticated} sessionStatus={session.status}
    navigation={<ShellNavigation authorization={authorization} context={organizationContext} invitationsAvailable={Boolean(invitations)} roleManagementAvailable={Boolean(rolePolicy)} />}
    account={<ShellAccount authentication={authentication} context={organizationContext} offlineQueue={offlineQueue} />}>{content}</RouteAppFrame></BrowserRouter></ErrorBoundary></ThemeProvider>;
}
