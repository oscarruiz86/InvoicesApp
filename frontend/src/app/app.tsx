import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { useStore } from 'zustand';
import { Button, CssBaseline, Stack, ThemeProvider, Typography } from '@mui/material';
import { theme } from '@/shared/theme/theme';
import { AppLayout } from '@/shared/components/app-layout';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { HomePage } from '@/modules/home/presentation/home-page';
import type { HealthStore } from '@/modules/home/presentation/health-store';
import type { AuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import { AuthenticationActions, AuthenticationCallback, PrivateRoute, SessionPage } from '@/modules/authentication/presentation/session-page';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { ContextSessionBootstrap, OrganizationContextGuard, OrganizationSelectionPage, OrganizationSelector } from '@/modules/organization-context/presentation/organization-selector';
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

function OrganizationManagementNavigation({ authorization, context, invitationsAvailable }: { authorization: AuthorizationStore; context: ContextStore; invitationsAvailable: boolean }) {
  const state = useStore(context);
  if (state.status !== 'ready' || !state.activeContext) return null;
  return <AuthorizedNavigation store={authorization} items={[{ label: 'Empresas', path: '/companies', permission: 'companies:read' },
    ...(invitationsAvailable ? [{ label: 'Gestionar invitaciones', path: '/invitations', anyPermission: ['users:read', 'drivers:read'] as const },
      { label: 'Usuarios vinculados', path: '/organization-memberships', anyPermission: ['users:read', 'drivers:read'] as const }] : [])]} />;
}

export function App({ store, authentication, authorization, organizationContext, companies, invitations }: { store: HealthStore; authentication: AuthenticationStore; authorization?: AuthorizationStore; organizationContext?: ContextStore; companies?: CompanyApi; invitations?: InvitationApi }) {
  return <ThemeProvider theme={theme}><CssBaseline /><ErrorBoundary><BrowserRouter><AppLayout><AuthenticationActions store={authentication} authorization={authorization} />
    {organizationContext && <><ContextSessionBootstrap authentication={authentication} /><OrganizationSelector store={organizationContext} /></>}
    {companies && authorization && organizationContext && <OrganizationManagementNavigation authorization={authorization} context={organizationContext} invitationsAvailable={Boolean(invitations)} />}
    <Routes>
    <Route path="/" element={<HomePage store={store} />} />
    <Route path="/login" element={<AuthenticationLoginPage authentication={authentication} />} />
    {companies && authorization && organizationContext && (['list', 'create', 'detail', 'edit'] as const).map(mode => <Route key={mode} path={mode === 'list' ? '/companies' : mode === 'create' ? '/companies/new' : mode === 'detail' ? '/companies/:id' : '/companies/:id/edit'} element={<ProtectedRoute authentication={authentication} authorization={authorization} permission={mode === 'create' ? 'companies:create' : mode === 'edit' ? 'companies:update' : 'companies:read'}><OrganizationContextGuard store={organizationContext} authorization={authorization}><CompanyPage key={mode} api={companies} context={organizationContext} authorization={authorization} mode={mode} /></OrganizationContextGuard></ProtectedRoute>} />)}
    {invitations && authorization && organizationContext && <Route path="/invitations" element={<PrivateRoute store={authentication}><OrganizationContextGuard store={organizationContext} authorization={authorization}><InvitationPage api={invitations} context={organizationContext} authorization={authorization} /></OrganizationContextGuard></PrivateRoute>} />}
    {invitations && <Route path="/invitations/received" element={<PrivateRoute store={authentication}><ReceivedInvitationsPage api={invitations} context={organizationContext} /></PrivateRoute>} />}
    {invitations && authorization && organizationContext && <Route path="/organization-memberships" element={<PrivateRoute store={authentication}><OrganizationContextGuard store={organizationContext} authorization={authorization}><MembershipPage api={invitations} context={organizationContext} authorization={authorization} /></OrganizationContextGuard></PrivateRoute>} />}
    {invitations && <Route path="/invitations/accept" element={<InvitationAcceptancePage api={invitations} authentication={authentication} context={organizationContext} />} />}
    <Route path="/auth/callback" element={<AuthenticationCallback store={authentication} />} />
    <Route path="/session" element={<PrivateRoute store={authentication}>{organizationContext && authorization ? <OrganizationContextGuard store={organizationContext} authorization={authorization}><SessionPage store={authentication} /></OrganizationContextGuard> : <SessionPage store={authentication} />}</PrivateRoute>} />
    {organizationContext && <Route path="/organizations/select" element={<PrivateRoute store={authentication}><OrganizationSelectionPage store={organizationContext} authentication={authentication} invitationsAvailable={Boolean(invitations)} /></PrivateRoute>} />}
    <Route path="*" element={<Stack spacing={2}><Typography variant="h4" component="h1">Página no encontrada</Typography><Button component={Link} to="/">Volver al inicio</Button></Stack>} />
  </Routes></AppLayout></BrowserRouter></ErrorBoundary></ThemeProvider>;
}
