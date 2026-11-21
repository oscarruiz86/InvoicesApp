import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router';
import { useStore } from 'zustand';
import type { ReactNode } from 'react';
import { Alert, Box, Button, CssBaseline, Stack, ThemeProvider, Typography } from '@mui/material';
import { theme } from '@/shared/theme/theme';
import { AppLayout } from '@/shared/components/app-layout';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { HomePage } from '@/modules/home/presentation/home-page';
import type { HealthStore } from '@/modules/home/presentation/health-store';
import type { AuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
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
import { InvoicesPage } from '@/modules/invoices/presentation/invoices-page';
import type { ParameterApi } from '@/modules/parameter-management/application/parameter-api';
import { ParametersPage } from '@/modules/parameter-management/presentation/parameters-page';

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
  const { pathname } = useLocation(); const home = pathname === '/';
  return <Stack spacing={.5}><Typography variant="overline" sx={{ px: 1.5, fontWeight: 700 }}>Inicio</Typography><Button variant="text" component={Link} to="/" aria-current={home ? 'page' : undefined} sx={{ justifyContent: 'flex-start', px: 1.5, minHeight: 42, borderColor: 'transparent', bgcolor: home ? '#e8effe' : 'transparent', color: home ? '#153d8e' : 'text.primary', fontWeight: home ? 700 : 400 }}>Inicio</Button>
    {authorization && context && <OrganizationManagementNavigation authorization={authorization} context={context} invitationsAvailable={invitationsAvailable} roleManagementAvailable={roleManagementAvailable} />}
  </Stack>;
}

function ShellAccount({ authentication, context }: { authentication: AuthenticationStore; context?: ContextStore }) {
  return context ? <ShellAccountWithContext authentication={authentication} context={context} /> : <AccountMenu store={authentication} />;
}

function ShellAccountWithContext({ authentication, context }: { authentication: AuthenticationStore; context: ContextStore }) {
  const current = useStore(context);
  return <AccountMenu store={authentication} context={{ activeContext: current.activeContext, openSelector: current.openSelector }} />;
}

export function App({ store, authentication, authorization, organizationContext, companies, thirdParties, invitations, fleet, vehicles, assignmentApi, invoices, notificationDeliveries, rolePolicy, parameters }: { store: HealthStore; authentication: AuthenticationStore; authorization?: AuthorizationStore; organizationContext?: ContextStore; companies?: CompanyApi; thirdParties?: ThirdPartyApi; invitations?: InvitationApi; fleet?: DriverApi; vehicles?: VehicleApi; assignmentApi?: AssignmentApi; invoices?: InvoiceApi; notificationDeliveries?: NotificationDeliveryReadPort; rolePolicy?: RolePolicyApi; parameters?: ParameterApi }) {
  const session = useStore(authentication);
  const authenticated = ['authenticated', 'refreshing'].includes(session.status);
  const content = <><RouteHeadingFocus /><AuthenticationActions store={authentication} authorization={authorization} />
    {organizationContext && <ContextSessionBootstrap authentication={authentication} />}
    <Routes>
    <Route path="/" element={<HomePage store={store} authorization={authorization} />} />
    <Route path="/login" element={<AuthenticationLoginPage authentication={authentication} />} />
    {companies && authorization && organizationContext && (['list', 'create', 'detail', 'edit'] as const).map(mode => <Route key={mode} path={mode === 'list' ? '/companies' : mode === 'create' ? '/companies/new' : mode === 'detail' ? '/companies/:id' : '/companies/:id/edit'} element={<ProtectedRoute authentication={authentication} authorization={authorization} permission={mode === 'create' ? 'companies:create' : mode === 'edit' ? 'companies:update' : 'companies:read'}><OrganizationContextGuard store={organizationContext} authorization={authorization}><CompanyPage key={mode} api={companies} context={organizationContext} authorization={authorization} mode={mode} /></OrganizationContextGuard></ProtectedRoute>} />)}
    {thirdParties && authorization && organizationContext && (['list', 'create', 'detail', 'edit'] as const).map(mode => <Route key={`third-party-${mode}`} path={mode === 'list' ? '/third-parties' : mode === 'create' ? '/third-parties/new' : mode === 'detail' ? '/third-parties/:id' : '/third-parties/:id/edit'} element={<ProtectedRoute authentication={authentication} authorization={authorization} permission={mode === 'create' ? 'third-parties:create' : mode === 'edit' ? 'third-parties:update' : 'third-parties:read'}><OrganizationContextGuard store={organizationContext} authorization={authorization}><ThirdPartyPage key={mode} api={thirdParties} context={organizationContext} authorization={authorization} mode={mode} /></OrganizationContextGuard></ProtectedRoute>} />)}
    {invitations && authorization && organizationContext && <Route path="/invitations" element={<PrivateRoute store={authentication}><OrganizationContextGuard store={organizationContext} authorization={authorization}><InvitationPage api={invitations} context={organizationContext} authorization={authorization} companies={companies} /></OrganizationContextGuard></PrivateRoute>} />}
    {invitations && <Route path="/invitations/received" element={<PrivateRoute store={authentication}><ReceivedInvitationsPage api={invitations} context={organizationContext} /></PrivateRoute>} />}
    {invitations && authorization && organizationContext && <Route path="/organization-memberships" element={<PrivateRoute store={authentication}><OrganizationContextGuard store={organizationContext} authorization={authorization}><MembershipPage api={invitations} context={organizationContext} authorization={authorization} companies={companies} /></OrganizationContextGuard></PrivateRoute>} />}
    {invitations && <Route path="/invitations/accept" element={<InvitationAcceptancePage api={invitations} authentication={authentication} context={organizationContext} />} />}
    {rolePolicy && authorization && organizationContext && <Route path="/roles" element={<ProtectedRoute authentication={authentication} authorization={authorization} permission="roles:read"><OrganizationContextGuard store={organizationContext} authorization={authorization}><GlobalRolePolicyContextGuard context={organizationContext}><RoleManagementPage api={rolePolicy} authorization={authorization} context={organizationContext} /></GlobalRolePolicyContextGuard></OrganizationContextGuard></ProtectedRoute>} />}
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
                  : module.key === 'invoices' && invoices && assignmentApi ? <InvoicesPage api={invoices} assignments={assignmentApi} context={organizationContext} authorization={authorization} />
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
  return <ThemeProvider theme={theme}><CssBaseline /><ErrorBoundary><BrowserRouter>{authenticated
    ? <AppLayout navigation={<ShellNavigation authorization={authorization} context={organizationContext} invitationsAvailable={Boolean(invitations)} roleManagementAvailable={Boolean(rolePolicy)} />} account={<ShellAccount authentication={authentication} context={organizationContext} />}>{content}</AppLayout>
    : <Box component="main" sx={{ minHeight: '100dvh', px: { xs: 2, sm: 3, md: 6 }, py: { xs: 3, md: 6 } }}>{content}</Box>}</BrowserRouter></ErrorBoundary></ThemeProvider>;
}
