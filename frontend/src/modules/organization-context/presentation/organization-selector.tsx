import { useEffect, useRef, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { Link, Navigate, useNavigate } from 'react-router';
import { Alert, Button, Card, CardActions, CardContent, Chip, Paper, Stack, Typography } from '@mui/material';
import type { AuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import { errorMessage } from '@/shared/components/error-messages';
import { getRoleLabel } from '@shared/role-labels';
import type { OrganizationDestination } from '../domain/context';
import type { ContextStore } from './context-store';

export function OrganizationCard({ organization, select }: { organization: OrganizationDestination; select(): void }) {
  return <Card variant="outlined" sx={{ width: '100%', overflowWrap: 'anywhere' }}><CardContent>
    <Typography component="h2" variant="h6">{organization.organizationName}</Typography>
    <Typography>{organization.organizationType === 'COMPANY' ? 'Empresa' : 'Tercero'}</Typography>
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>{organization.roles.map(role => <Chip key={role} label={getRoleLabel(role)} />)}</Stack>
  </CardContent><CardActions><Button  onClick={select} aria-label={`Seleccionar ${organization.organizationName}`}>Seleccionar</Button></CardActions></Card>;
}
export function OrganizationSelectionPage({ store, authentication, invitationsAvailable = false }: { store: ContextStore; authentication: AuthenticationStore; invitationsAvailable?: boolean }) {
  const state = useStore(store); const auth = useStore(authentication);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  if (state.status === 'ready') return <Navigate to="/session" replace />;
  if (state.status === 'empty' && invitationsAvailable) return <Navigate to="/invitations/received" replace />;
  return <Paper variant="outlined" sx={{ maxWidth: 960, mx: 'auto', p: { xs: 2, md: 3 } }}><Stack spacing={2}>
    <Typography component="h1" variant="h4" tabIndex={-1} ref={heading}>Selecciona una organización</Typography>
    <Typography>Invoices App · {auth.user?.name ?? auth.user?.username ?? 'Usuario autenticado'}</Typography>
    {['idle', 'loading', 'switching'].includes(state.status) && <Alert severity="info" role="status">Validando contexto…</Alert>}
    {state.status === 'empty' && <>
      <Alert severity="info">No tienes organizaciones ni contextos autorizados disponibles.</Alert>
      {invitationsAvailable && <>
        <Typography>Si te registraste desde una invitación, ya puedes buscarla aquí con el correo verificado de tu cuenta y confirmarla.</Typography>
        <Button component={Link} to="/invitations/received" variant="contained">Revisar mis invitaciones</Button>
      </>}
    </>}
    {state.status === 'error' && <Alert severity="error">{errorMessage(state.error)}</Alert>}
    {state.status === 'selecting' && <Stack spacing={2}>
      {state.availableContexts.globalAvailable && <Button variant="outlined"  onClick={() => void state.select({ kind: 'GLOBAL' })}>Administración GLOBAL</Button>}
      {state.availableContexts.organizations.map(org => <OrganizationCard key={org.organizationId} organization={org} select={() => void state.select({ kind: 'ORGANIZATION', ...org })} />)}
    </Stack>}
    {['error', 'empty'].includes(state.status) && <Button  onClick={() => void state.openSelector()}>Reintentar</Button>}
    <Button sx={{ alignSelf: 'flex-start' }} onClick={() => void auth.logout()}>Cerrar sesión</Button>
  </Stack></Paper>;
}
export function ActiveOrganizationIndicator({ store }: { store: ContextStore }) {
  const state = useStore(store);
  if (state.status !== 'ready' || !state.activeContext) return null;
  return <Stack spacing={1}><Typography role="status">Contexto: {state.activeContext.kind === 'GLOBAL' ? 'GLOBAL' : `${state.activeContext.organizationName} (${state.activeContext.organizationType === 'COMPANY' ? 'Empresa' : 'Tercero'})`}</Typography>
    {!state.persistent && <Alert severity="info">La selección se conserva solo en memoria. Al recargar tendrás que seleccionarla de nuevo.</Alert>}
  </Stack>;
}
export function OrganizationSelector({ store }: { store: ContextStore }) {
  const navigate = useNavigate();
  const state = useStore(store);
  if (state.status !== 'ready') return null;
  return <Stack spacing={1} sx={{ mb: 2 }}><ActiveOrganizationIndicator store={store} /><Button  onClick={() => { void store.getState().openSelector().then(opened => { if (opened) navigate('/organizations/select'); }); }}>Cambiar organización</Button></Stack>;
}
export function OrganizationContextGuard({ store, authorization, children, organizationRequired = false }: { store: ContextStore; authorization: AuthorizationStore; children: ReactNode; organizationRequired?: boolean }) {
  const state = useStore(store); const permissions = useStore(authorization);
  if (['idle', 'loading', 'switching'].includes(state.status)) return <Alert severity="info" role="status">Validando contexto…</Alert>;
  if (state.status !== 'ready' || !state.activeContext) return <Navigate to="/organizations/select" replace />;
  // Keep a previously authorized page mounted during a refresh for its same
  // context. Initial permission loads still gate protected content.
  if (permissions.status === 'refreshing' && permissions.snapshot) return <section key={state.generation}>{children}</section>;
  if (permissions.status === 'idle' || permissions.status === 'loading' || permissions.status === 'refreshing') return null;
  if (permissions.status === 'error') return <Stack spacing={2}><Alert severity="error">{errorMessage(permissions.error)}</Alert><Button onClick={() => void authorization.getState().refresh()}>Reintentar permisos</Button></Stack>;
  if (permissions.status === 'denied') return <Alert severity="warning">Acceso denegado.</Alert>;
  if (permissions.status !== 'ready' || permissions.expiresAt <= Date.now()) return <Stack spacing={2}><Alert severity="error">No fue posible actualizar los permisos.</Alert><Button onClick={() => void authorization.getState().refresh()}>Reintentar permisos</Button></Stack>;
  if (organizationRequired && state.activeContext.kind === 'GLOBAL') return <Alert severity="warning">Selecciona una organización para continuar.</Alert>;
  return <section key={state.generation}>{children}</section>;
}
export function ContextSessionBootstrap({ authentication }: { authentication: AuthenticationStore }) {
  const state = useStore(authentication);
  const { status, profileStatus, loadUser } = state;
  useEffect(() => { if (status === 'authenticated' && profileStatus === 'idle') void loadUser(); }, [status, profileStatus, loadUser]);
  if (profileStatus === 'error') return <Stack><Alert severity="error">{errorMessage(state.profileError)}</Alert><Button onClick={() => void loadUser()}>Reintentar sesión</Button></Stack>;
  return null;
}
