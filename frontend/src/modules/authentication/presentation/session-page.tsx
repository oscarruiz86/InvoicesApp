import { useEffect, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Alert, Avatar, Button, Chip, CircularProgress, Divider, Menu, MenuItem, Paper, Snackbar, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import type { AuthenticationStore } from './authentication-store';
import type { AuthorizationStore } from './authorization-store';
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
    <Typography component="h1" variant="h4">{state.error === 'SESSION_EXPIRED' ? 'Sesión expirada' : state.error === 'LOGOUT_UNCONFIRMED' ? 'No se pudo cerrar la sesión' : 'No se pudo iniciar sesión'}</Typography>
    <Alert severity="error">{authenticationMessages[state.error]}</Alert>
    {state.error !== 'CONFIGURATION' && <Button onClick={() => void (state.error === 'LOGOUT_UNCONFIRMED' ? state.logout() : state.login(state.returnPath))}>{state.error === 'LOGOUT_UNCONFIRMED' ? 'Reintentar cierre remoto' : 'Volver a iniciar sesión'}</Button>}
  </Stack>;
  return <Stack spacing={2}><Typography component="h1" variant="h4">{state.status === 'signingOut' ? 'Cerrando sesión' : 'Verificando sesión'}</Typography><Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}><CircularProgress size={24} aria-label="Verificando sesión" /><Typography>{state.status === 'signingOut' ? 'Cerrando sesión…' : 'Verificando sesión…'}</Typography></Stack></Stack>;
}

export function AuthenticationActions({ store, authorization }: { store: AuthenticationStore; authorization?: AuthorizationStore }) {
  const state = useStore(store);
  const location = useLocation();
  void authorization;
  return state.error && location.pathname === '/' ? <Stack spacing={2} sx={{ mb: 4 }}><SessionFeedback store={store} /></Stack> : null;
}

export function AccountMenu({ store, context }: { store: AuthenticationStore; context?: { activeContext: { kind: 'GLOBAL'; roles: readonly string[] } | { kind: 'ORGANIZATION'; organizationName: string; organizationType: 'COMPANY' | 'THIRD_PARTY'; roles: readonly string[] } | null; openSelector(): Promise<boolean> } }) {
  const state = useStore(store); const [anchor, setAnchor] = useState<HTMLElement | null>(null); const [accountError, setAccountError] = useState(false); const navigate = useNavigate();
  const initials = (state.user?.name ?? state.user?.username ?? 'Usuario').split(/\s+/).map(value => value[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const active = context?.activeContext;
  const contextLabel = !active ? 'Sin contexto seleccionado' : active.kind === 'GLOBAL' ? 'Administración global' : `${active.organizationName} · ${active.organizationType === 'COMPANY' ? 'Empresa' : 'Tercero'}`;
  const roles = active?.roles ?? [];
  const changeContext = async () => { setAnchor(null); if (context && await context.openSelector()) navigate('/organizations/select'); };
  return <><Button variant="text" aria-label="Abrir menú de usuario" onClick={event => setAnchor(event.currentTarget)} sx={{ minWidth: 42, width: 42, height: 42, p: 0, borderRadius: '50%' }}><Avatar sx={{ width: 42, height: 42, bgcolor: 'primary.main' }}>{initials}</Avatar></Button>
    <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { minWidth: 270, p: 1 } } }}>
      <MenuItem disabled>{state.user?.name ?? state.user?.username ?? 'Usuario'}</MenuItem><Divider />
      <MenuItem disabled sx={{ opacity: '1 !important', alignItems: 'flex-start', flexDirection: 'column' }}><Typography variant="caption" color="text.secondary">Contexto actual</Typography><Typography variant="body2">{contextLabel}</Typography></MenuItem>
      <MenuItem disabled sx={{ opacity: '1 !important', alignItems: 'flex-start', flexDirection: 'column' }}><Typography variant="caption" color="text.secondary">Rol actual</Typography><Typography variant="body2">{roles.length ? roles.map(getRoleLabel).join(', ') : 'Sin rol asignado'}</Typography></MenuItem>
      <Divider /><MenuItem onClick={() => void changeContext()}>Cambiar contexto</MenuItem><MenuItem onClick={() => { setAnchor(null); navigate('/session'); }}>Mi perfil</MenuItem><MenuItem onClick={() => { setAnchor(null); void state.openAccountManagement().catch(() => setAccountError(true)); }}>Cambiar contraseña</MenuItem><MenuItem onClick={() => { setAnchor(null); void state.logout(); }}>Cerrar sesión</MenuItem>
    </Menu><Snackbar open={accountError} autoHideDuration={6000} onClose={() => setAccountError(false)}><Alert severity="error" onClose={() => setAccountError(false)}>No fue posible abrir la gestión de cuenta.</Alert></Snackbar></>;
}

export function PrivateRoute({ store, children }: { store: AuthenticationStore; children: ReactNode }) {
  const state = useStore(store);
  const location = useLocation();
  const { status, error, login } = state;
  const returnPath = `${location.pathname}${location.search}${location.hash}`;
  useEffect(() => {
    if (status === 'anonymous' && !error) void login(returnPath);
  }, [status, error, login, returnPath]);
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
  if (state.profileStatus === 'error') return <Stack spacing={2}><Typography component="h1" variant="h4">No se pudo cargar el perfil</Typography><Alert severity="error">{errorMessage(state.profileError)}</Alert><Button onClick={() => void state.loadUser()}>Reintentar sesión</Button></Stack>;
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
