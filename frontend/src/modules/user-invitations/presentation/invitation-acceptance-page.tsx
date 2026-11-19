import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Link, useNavigate } from 'react-router';
import { Alert, Button, Paper, Stack, Typography } from '@mui/material';
import type { AuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import type { LoginOptions } from '@/modules/authentication/application/session-ports';
import { ApplicationError } from '@/shared/application/application-error';
import { RequestError } from '@/shared/application/request-error';
import { errorMessage } from '@/shared/components/error-messages';
import { getRoleLabel } from '@shared/role-labels';
import type { InvitationApi, InvitationPreview } from '../application/invitation-api';
import { clearInvitationContinuation, readInvitationContinuation, type InvitationContinuation } from './invitation-continuation';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { activateInvitationContext } from './activate-invitation-context';

const recovery = 'No encontramos una invitación en este enlace. Inicia sesión en Invoices App y entra a Mis invitaciones. La lista se consulta con el correo verificado de tu cuenta y funciona aunque hayas cambiado de navegador.';
function invitationError(error: unknown) {
  if (error instanceof RequestError) {
    const messages: Record<string, string> = {
      INVITATION_EXPIRED: 'La invitación venció. Pide una nueva a la organización. Tu cuenta sigue disponible.',
      IDENTITY_MISMATCH: 'Usa la cuenta con el correo destinatario de la invitación. Puedes cambiar de cuenta.',
      EMAIL_UNVERIFIED: 'Verifica tu correo en Keycloak y vuelve a intentar aceptar.',
      PROFILE_INCOMPLETE: 'Completa tu nombre y documento en el perfil de Keycloak y vuelve a intentar aceptar.',
      VERSION_CONFLICT: 'La invitación cambió. Vuelve a consultar antes de confirmar.',
      CONFLICT: 'La invitación ya fue resuelta o cambió. Vuelve a consultar su estado.',
    };
    if (messages[error.businessCode]) return messages[error.businessCode];
  }
  if (error instanceof ApplicationError && error.code === 'FORBIDDEN') return 'No se pudo autorizar la operación. Revisa la cuenta o solicita ayuda a la organización.';
  if (error instanceof ApplicationError && error.code === 'NOT_FOUND') return 'El enlace no está disponible. Usa el enlace más reciente o pide una nueva invitación.';
  return errorMessage(error instanceof ApplicationError ? error.code : 'UNEXPECTED');
}
function terminal(error: unknown) {
  return error instanceof ApplicationError && error.code === 'NOT_FOUND'
    || error instanceof RequestError && (error.businessCode === 'INVITATION_EXPIRED' || error.businessCode === 'CONFLICT');
}

export function InvitationAcceptancePage({ api, authentication, context }: { api: InvitationApi; authentication: AuthenticationStore; context?: ContextStore }) {
  const navigate = useNavigate();
  const session = useStore(authentication);
  const [continuation, setContinuation] = useState<InvitationContinuation | null>(null);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null); const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<'accepted' | 'rejected' | null>(null); const sending = useRef(false);
  const [contextSelected, setContextSelected] = useState(false);
  const [driverProvisioned, setDriverProvisioned] = useState(false);
  const authenticated = ['authenticated', 'refreshing'].includes(session.status);
  const profilePending = authenticated && ['idle', 'loading'].includes(session.profileStatus);
  const recipientMatches = Boolean(authenticated && session.profileStatus === 'success' && preview && session.user?.email?.trim().toLowerCase() === preview.recipientEmail.trim().toLowerCase());
  const unavailable = busy || loading || profilePending || ['initializing', 'authenticating', 'signingOut'].includes(session.status);
  const token = continuation?.token ?? '';

  useEffect(() => {
    try { setContinuation(readInvitationContinuation()); }
    catch { setError('No se pudo leer el enlace de invitación. Ábrelo nuevamente e inténtalo otra vez.'); }
  }, []);
  useEffect(() => {
    if (authenticated && session.profileStatus === 'idle') void session.loadUser();
  }, [authenticated, session.profileStatus, session.loadUser]);
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    const controller = new AbortController(); let current = true;
    setLoading(true); setError(null); setPreview(null);
    void api.preview(token, controller.signal).then(value => {
      if (!current || controller.signal.aborted) return;
      setContinuation({ token }); setPreview(value);
    }).catch(failure => {
      if (!current || controller.signal.aborted) return;
      setError(invitationError(failure));
      if (terminal(failure)) { clearInvitationContinuation(); setContinuation(null); }
    }).finally(() => { if (current && !controller.signal.aborted) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [api, token, attempt]);

  const startAuthentication = async (action?: LoginOptions['action']) => {
    if (sending.current || !continuation || !preview) return;
    sending.current = true; setBusy(true); setError(null);
    try {
      await authentication.getState().login('/invitations/received', { ...(action ? { action } : {}), loginHint: preview.recipientEmail });
    } catch { setError(recovery); }
    finally { sending.current = false; setBusy(false); }
  };
  const resolve = async (action: 'accept' | 'reject') => {
    if (sending.current || !continuation || !preview || !recipientMatches) return;
    if (Date.parse(preview.expiresAt) <= Date.now()) { clearInvitationContinuation(); setContinuation(null); setPreview(null); setError('La invitación venció. Pide una nueva a la organización.'); return; }
    sending.current = true; setBusy(true); setError(null);
    try {
      if (action === 'accept') {
        const accepted = await api.accept(token, preview.version);
        setDriverProvisioned(accepted.invitation.organizationType === 'THIRD_PARTY' && accepted.invitation.roles.length === 1 && accepted.invitation.roles[0] === 'DRIVER');
        setContextSelected(await activateInvitationContext(context, accepted.invitation.organizationId, accepted.invitation.organizationType));
      } else {
        await api.reject(token, preview.version);
        setContextSelected(false);
      }
      clearInvitationContinuation(); setContinuation(null); setPreview(null); setResult(action === 'accept' ? 'accepted' : 'rejected');
    } catch (failure) {
      setError(invitationError(failure));
      if (terminal(failure)) { clearInvitationContinuation(); setContinuation(null); setPreview(null); }
    } finally { sending.current = false; setBusy(false); }
  };

  return <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 720, mx: 'auto', overflowWrap: 'anywhere' }}><Stack spacing={2}>
    <Typography variant="h4" component="h1">Aceptar invitación</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    {session.error && token && <Alert severity="warning">No se completó la autenticación. Puedes volver a intentarlo con esta invitación.</Alert>}
    {result === 'accepted' && <>
      <Alert severity="success">{driverProvisioned ? 'Invitación aceptada. Tu registro de conductor ya está disponible en esta organización.' : contextSelected ? 'Invitación aceptada y contexto de la organización seleccionado.' : 'Invitación aceptada. No se pudo activar automáticamente el contexto; puedes elegir la organización.'}</Alert>
      <Button variant="contained" onClick={() => navigate(driverProvisioned && contextSelected ? '/drivers' : contextSelected ? '/session' : context ? '/organizations/select' : '/')}>{driverProvisioned && contextSelected ? 'Ver mis conductores' : contextSelected ? 'Continuar a Invoices App' : 'Elegir organización'}</Button>
    </>}
    {result === 'rejected' && <Alert severity="info">Invitación rechazada.</Alert>}
    {!token && !result && !error && !loading && <><Alert severity="info">{recovery}</Alert><Button component={Link} to="/invitations/received" variant="contained">Ir a mis invitaciones</Button></>}
    {loading && <Alert severity="info" role="status">Consultando invitación…</Alert>}
    {token && error && !result && <Button disabled={busy || loading} onClick={() => setAttempt(value => value + 1)}>Volver a consultar</Button>}
    {preview && !result && <>
      <Typography>{preview.organizationName} te invita a vincularte a su organización.</Typography>
      <Typography>Roles: {preview.roles.map(getRoleLabel).join(', ')}</Typography>
      <Typography>Vence: {new Date(preview.expiresAt).toLocaleString('es-CO')}</Typography>
      <Typography color="text.secondary">Al aceptar compartirás tu nombre completo, tipo y número de documento y correo electrónico. Se comprobará que tu correo esté verificado.</Typography>
      {recipientMatches && <Typography>La sesión iniciada corresponde al correo destinatario. Confirma para aceptar la invitación.</Typography>}
      {profilePending && <Alert severity="info" role="status">Comprobando que la sesión corresponda al correo destinatario…</Alert>}
      {authenticated && session.profileStatus === 'success' && !recipientMatches && <Alert severity="warning">La sesión actual{session.user?.email ? ' (' + session.user.email + ')' : ''} no corresponde al correo destinatario. Inicia sesión con la cuenta correcta o crea una cuenta; después continuarás en Mis invitaciones.</Alert>}
      {authenticated && session.profileStatus === 'error' && <Alert severity="warning">No se pudo comprobar el correo de la sesión. Vuelve a intentarlo o inicia sesión con la cuenta destinataria.</Alert>}
      {!authenticated && <Typography>Inicia sesión o crea una cuenta con el correo destinatario. Después de autenticarte continuarás en Mis invitaciones para confirmar la invitación.</Typography>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        {recipientMatches ? <>
          <Button variant="contained" disabled={unavailable} onClick={() => void resolve('accept')}>Aceptar invitación</Button>
          <Button disabled={unavailable} onClick={() => void resolve('reject')}>Rechazar</Button>
          <Button disabled={unavailable} onClick={() => void startAuthentication('switch-account')}>Cambiar de cuenta</Button>
        </> : !profilePending && <>
          <Button variant="contained" disabled={unavailable} onClick={() => void startAuthentication(authenticated ? 'switch-account' : undefined)}>{authenticated ? 'Iniciar sesión con otra cuenta' : 'Ya tengo cuenta'}</Button>
          <Button variant="outlined" disabled={unavailable} onClick={() => void startAuthentication('register')}>Crear mi cuenta</Button>
        </>}
      </Stack>
    </>}
  </Stack></Paper>;
}