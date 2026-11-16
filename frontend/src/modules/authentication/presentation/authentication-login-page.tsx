import { useStore } from 'zustand';
import { Navigate } from 'react-router';
import { Alert, Button, Paper, Stack, Typography } from '@mui/material';
import type { AuthenticationStore } from './authentication-store';

const messages = {
  CONFIGURATION: 'La autenticación no está configurada. Revisa la configuración de Keycloak.',
  AUTHENTICATION: 'No se pudo iniciar sesión. Reinténtalo.',
  SESSION_EXPIRED: 'La sesión terminó. Inicia sesión para continuar.',
  LOGOUT_UNCONFIRMED: 'No se pudo confirmar el cierre remoto. Puedes volver a iniciar sesión.',
};

export function AuthenticationLoginPage({ authentication }: { authentication: AuthenticationStore }) {
  const state = useStore(authentication);
  const authenticated = ['authenticated', 'refreshing'].includes(state.status);
  const busy = ['initializing', 'authenticating', 'refreshing', 'signingOut'].includes(state.status);
  if (authenticated) return <Navigate to="/session" replace />;
  return <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 560, mx: 'auto' }}><Stack spacing={2}>
    <Typography variant="h4" component="h1">Iniciar sesión</Typography>
    <Alert severity="info">Tu contraseña se actualizó. Para continuar a Invoices App y revisar tus invitaciones, inicia sesión con el correo y la contraseña de tu cuenta.</Alert>
    {state.error && <Alert severity="error">{messages[state.error]}</Alert>}
    <Button variant="contained" disabled={busy} onClick={() => void state.login('/session')}>
      {busy ? 'Conectando…' : state.error ? 'Reintentar inicio de sesión' : 'Iniciar sesión'}
    </Button>
  </Stack></Paper>;
}
