import { useEffect, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { Link, Navigate, useLocation } from 'react-router';
import { Alert, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import type { AuthenticationStore } from './authentication-store';
import type { AuthorizationStore } from './authorization-store';
import { AuthorizedNavigation } from './authorized-navigation';
import { errorMessage } from '@/shared/components/error-messages';
import { getRoleLabel } from '@shared/role-labels';

const authenticationMessages = {
  CONFIGURATION: 'La autenticación no está configurada. Revisa las variables OIDC públicas.',
  AUTHENTICATION: 'No se pudo iniciar sesión. Puedes intentarlo nuevamente.',
  SESSION_EXPIRED: 'La sesión terminó. Vuelve a iniciar sesión.',
  LOGOUT_UNCONFIRMED: 'La sesión local está cerrada. No se pudo confirmar el cierre en Keycloak.',
};

export function SessionFeedback({ store }: { store: AuthenticationStore }) {
  const state = useStore(store);
  if (state.error) return <Stack spacing={2}>
    <Alert severity="error">{authenticationMessages[state.error]}</Alert>
    {state.error !== 'CONFIGURATION' && <Button onClick={() => void (state.error === 'LOGOUT_UNCONFIRMED' ? state.logout() : state.login(state.returnPath))}>{state.error === 'LOGOUT_UNCONFIRMED' ? 'Reintentar cierre remoto' : 'Volver a iniciar sesión'}</Button>}
  </Stack>;
  return <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}><CircularProgress size={24} aria-label="Verificando sesión" /><Typography>{state.status === 'signingOut' ? 'Cerrando sesión…' : 'Verificando sesión…'}</Typography></Stack>;
}

export function AuthenticationActions({ store, authorization }: { store: AuthenticationStore; authorization?: AuthorizationStore }) {
  const state = useStore(store);
  const location = useLocation();
  const authenticated = ['authenticated', 'refreshing'].includes(state.status);
  const busy = ['initializing', 'authenticating', 'signingOut'].includes(state.status);
  return <Stack spacing={2} sx={{ mb: 4 }}>
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {authorization ? <AuthorizedNavigation store={authorization} items={[{ label: 'Inicio', path: '/' }, { label: 'Mi perfil', path: '/session' }]} /> : <><Button component={Link} to="/">Inicio</Button><Button component={Link} to="/session">Mi perfil</Button></>}
      {authenticated && <Button component={Link} to="/invitations/received">Mis invitaciones</Button>}
      {location.pathname !== '/login' && <Button variant="outlined" disabled={busy} onClick={() => void (authenticated ? state.logout() : state.login(state.returnPath))}>{authenticated ? 'Cerrar sesión' : 'Iniciar sesión'}</Button>}
    </Stack>
    {state.error && location.pathname === '/' && <SessionFeedback store={store} />}
  </Stack>;
}

export function PrivateRoute({ store, children }: { store: AuthenticationStore; children: ReactNode }) {
  const state = useStore(store);
  const { status, error, login } = state;
  useEffect(() => {
    if (status === 'anonymous' && !error) void login();
  }, [status, error, login]);
  return ['authenticated', 'refreshing'].includes(state.status) ? children : <SessionFeedback store={store} />;
}

export function AuthenticationCallback({ store }: { store: AuthenticationStore }) {
  const status = useStore(store, state => state.status);
  const returnPath = useStore(store, state => state.returnPath);
  const destination = returnPath ?? '/session';
  return status === 'authenticated' ? <Navigate to={destination} replace /> : <SessionFeedback store={store} />;
}

export function SessionPage({ store }: { store: AuthenticationStore }) {
  const state = useStore(store);
  const { profileStatus, loadUser } = state;
  useEffect(() => { if (profileStatus === 'idle') void loadUser(); }, [profileStatus, loadUser]);
  if (state.profileStatus === 'error') return <Stack spacing={2}><Alert severity="error">{errorMessage(state.profileError)}</Alert><Button onClick={() => void state.loadUser()}>Reintentar sesión</Button></Stack>;
  if (!state.user || state.profileStatus !== 'success') return <SessionFeedback store={store} />;
  return <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 }, overflowWrap: 'anywhere' }}><Stack spacing={2}>
    <Typography variant="h4" component="h1">Mi perfil</Typography>
    <Typography>Identidad confirmada por Keycloak. Los datos personales pertenecen a tu cuenta y son independientes de tus organizaciones y roles.</Typography>
    <Typography>Usuario: {state.user.username ?? 'No disponible'}</Typography>
    <Typography>Nombre: {state.user.name ?? 'No disponible'}</Typography>
    <Typography>Correo: {state.user.email ?? 'No disponible'}</Typography>
    <Typography variant="body2" color="text.secondary">Identificador: {state.user.id}</Typography>
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>{state.user.roles.length ? state.user.roles.map(role => <Chip key={role} label={getRoleLabel(role)} />) : <Typography>Sin roles de aplicación asignados.</Typography>}</Stack>
    {state.status === 'refreshing' && <Typography role="status">Renovando sesión…</Typography>}
  </Stack></Paper>;
}
