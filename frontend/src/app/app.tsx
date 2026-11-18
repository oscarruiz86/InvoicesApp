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

function OrganizationManagementNavigation({ authorization, context, invitationsAvailable }: { authorization: AuthorizationStore; context: ContextStore; invitationsAvailable: boolean }) {
  const state = useStore(context);
  if (state.status !== 'ready' || !state.activeContext) return null;
  return <AuthorizedNavigation store={authorization} contextKind={state.activeContext.kind} items={[{ label: 'Empresas', path: '/companies', permission: 'companies:read' },
    ...(invitationsAvailable ? [
      { label: 'Invitaciones', path: '/invitations', permission: 'associations:read' as const },
      { label: 'Usuarios', path: '/organization-memberships', permission: 'associations:read' as const },
    ] : []), ...markerModules.map(({ label, path, permission, context }) => ({ label, path, permission, context }))]} />;
}


function MarkerModuleContext({ module, context, children }: { module: MarkerModuleDefinition; context: ContextStore; children: ReactNode }) {
  const state = useStore(context);
  if (state.status !== 'ready' || !state.activeContext) return null;
  if (module.context === 'organization' && state.activeContext.kind !== 'ORGANIZATION') {
    return <Alert severity="warning">Selecciona una organización para continuar.</Alert>;
  }
  return children;
}

function ShellNavigation({ authorization, context, invitationsAvailable }: { authorization?: AuthorizationStore; context?: ContextStore; invitationsAvailable: boolean }) {
  const { pathname } = useLocation(); const home = pathname === '/';
  return <Stack spacing={.5}><Typography variant="overline" sx={{ px: 1.5, fontWeight: 700 }}>Inicio</Typography><Button variant="text" component={Link} to="/" aria-current={home ? 'page' : undefined} sx={{ justifyContent: 'flex-start', px: 1.5, minHeight: 42, borderColor: 'transparent', bgcolor: home ? '#e8effe' : 'transparent', color: home ? '#153d8e' : 'text.primary', fontWeight: home ? 700 : 400 }}>Inicio</Button>
    {authorization && context && <><Typography variant="overline" sx={{ px: 1.5, pt: 1, fontWeight: 700 }}>Administración</Typography><OrganizationManagementNavigation authorization={authorization} context={context} invitationsAvailable={invitationsAvailable} /></>}
  </Stack>;
}

function ShellAccount({ authentication, context }: { authentication: AuthenticationStore; context?: ContextStore }) {
  return context ? <ShellAccountWithContext authentication={authentication} context={context} /> : <AccountMenu store={authentication} />;
}

function ShellAccountWithContext({ authentication, context }: { authentication: AuthenticationStore; context: ContextStore }) {
  const current = useStore(context);
  return <AccountMenu store={authentication} context={{ activeContext: current.activeContext, openSelector: current.openSelector }} />;
}

export function App({ store, authentication, authorization, organizationContext, companies, invitations }: { store: HealthStore; authentication: AuthenticationStore; authorization?: AuthorizationStore; organizationContext?: ContextStore; companies?: CompanyApi; invitations?: InvitationApi }) {
  const session = useStore(authentication);
  const authenticated = ['authenticated', 'refreshing'].includes(session.status);
  const content = <><RouteHeadingFocus /><AuthenticationActions store={authentication} authorization={authorization} />
    {organizationContext && <ContextSessionBootstrap authentication={authentication} />}
    <Routes>
    <Route path="/" element={<HomePage store={store} authorization={authorization} />} />
    <Route path="/login" element={<AuthenticationLoginPage authentication={authentication} />} />
    {companies && authorization && organizationContext && (['list', 'create', 'detail', 'edit'] as const).map(mode => <Route key={mode} path={mode === 'list' ? '/companies' : mode === 'create' ? '/companies/new' : mode === 'detail' ? '/companies/:id' : '/companies/:id/edit'} element={<ProtectedRoute authentication={authentication} authorization={authorization} permission={mode === 'create' ? 'companies:create' : mode === 'edit' ? 'companies:update' : 'companies:read'}><OrganizationContextGuard store={organizationContext} authorization={authorization}><CompanyPage key={mode} api={companies} context={organizationContext} authorization={authorization} mode={mode} /></OrganizationContextGuard></ProtectedRoute>} />)}
    {invitations && authorization && organizationContext && <Route path="/invitations" element={<PrivateRoute store={authentication}><OrganizationContextGuard store={organizationContext} authorization={authorization}><InvitationPage api={invitations} context={organizationContext} authorization={authorization} companies={companies} /></OrganizationContextGuard></PrivateRoute>} />}
    {invitations && <Route path="/invitations/received" element={<PrivateRoute store={authentication}><ReceivedInvitationsPage api={invitations} context={organizationContext} /></PrivateRoute>} />}
    {invitations && authorization && organizationContext && <Route path="/organization-memberships" element={<PrivateRoute store={authentication}><OrganizationContextGuard store={organizationContext} authorization={authorization}><MembershipPage api={invitations} context={organizationContext} authorization={authorization} companies={companies} /></OrganizationContextGuard></PrivateRoute>} />}
    {invitations && <Route path="/invitations/accept" element={<InvitationAcceptancePage api={invitations} authentication={authentication} context={organizationContext} />} />}
    {organizationContext && authorization && markerModules.map(module => <Route key={module.key} path={module.path} element={<ProtectedRoute authentication={authentication} authorization={authorization} permission={module.permission}><OrganizationContextGuard store={organizationContext} authorization={authorization}><MarkerModuleContext module={module} context={organizationContext}><MarkerModulePage module={module} /></MarkerModuleContext></OrganizationContextGuard></ProtectedRoute>} />)}
    <Route path="/auth/callback" element={<AuthenticationCallback store={authentication} />} />
    <Route path="/session" element={<PrivateRoute store={authentication}>{organizationContext && authorization ? <OrganizationContextGuard store={organizationContext} authorization={authorization}><SessionPage store={authentication} /></OrganizationContextGuard> : <SessionPage store={authentication} />}</PrivateRoute>} />
    {organizationContext && <Route path="/organizations/select" element={<PrivateRoute store={authentication}><OrganizationSelectionPage store={organizationContext} authentication={authentication} invitationsAvailable={Boolean(invitations)} /></PrivateRoute>} />}
    <Route path="*" element={<Stack spacing={2}><Typography variant="h4" component="h1">Página no encontrada</Typography><Button component={Link} to="/">Volver al inicio</Button></Stack>} />
    </Routes></>;
  return <ThemeProvider theme={theme}><CssBaseline /><ErrorBoundary><BrowserRouter>{authenticated
    ? <AppLayout navigation={<ShellNavigation authorization={authorization} context={organizationContext} invitationsAvailable={Boolean(invitations)} />} account={<ShellAccount authentication={authentication} context={organizationContext} />}>{content}</AppLayout>
    : <Box component="main" sx={{ minHeight: '100dvh', px: { xs: 2, sm: 3, md: 6 }, py: { xs: 3, md: 6 } }}>{content}</Box>}</BrowserRouter></ErrorBoundary></ThemeProvider>;
}
