import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert, Button, Pagination, Paper, Stack, Typography } from '@mui/material';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { ApplicationError } from '@/shared/application/application-error';
import { RequestError } from '@/shared/application/request-error';
import { errorMessage } from '@/shared/components/error-messages';
import { getRoleLabel } from '@shared/role-labels';
import type { InvitationApi, InvitationRole, InvitationStatus, ReceivedInvitation } from '../application/invitation-api';
import { activateInvitationContext } from './activate-invitation-context';

const statusLabel: Record<InvitationStatus, string> = { PENDING: 'Pendiente', ACCEPTED: 'Aceptada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada', EXPIRED: 'Vencida' };
function failureMessage(error: unknown) {
  if (error instanceof RequestError) return ({ IDENTITY_MISMATCH: 'Inicia sesión con el correo destinatario de la invitación.', EMAIL_UNVERIFIED: 'Verifica el correo de tu cuenta Keycloak e inténtalo de nuevo.',
    PROFILE_INCOMPLETE: 'Completa tu nombre y documento en el perfil de Keycloak antes de aceptar.', VERSION_CONFLICT: 'La invitación cambió o ya fue resuelta. Actualiza la lista.',
    INVITATION_EXPIRED: 'La invitación venció. Solicita una nueva a la organización.' } as Record<string, string>)[error.businessCode] ?? 'No fue posible completar la operación.';
  return errorMessage(error instanceof ApplicationError ? error.code : 'UNEXPECTED');
}

export function ReceivedInvitationsPage({ api, context }: { api: InvitationApi; context?: ContextStore }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ items: readonly ReceivedInvitation[]; page: number; pageSize: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true); const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [contextSelected, setContextSelected] = useState(false);
  const generation = useRef(0); const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort();
    const active = new AbortController(); controller.current = active;
    const request = ++generation.current;
    setLoading(true); setError(null);
    try {
      const value = await api.received(page, active.signal);
      if (request === generation.current && !active.signal.aborted) setResult(value);
    } catch (failure) {
      if (request === generation.current && !active.signal.aborted) setError(failureMessage(failure));
    } finally {
      if (request === generation.current && !active.signal.aborted) setLoading(false);
    }
  }, [api, page]);
  useEffect(() => { void load(); return () => { generation.current++; controller.current?.abort(); }; }, [load]);

  const resolve = async (item: ReceivedInvitation, action: 'accept' | 'reject') => {
    if (busyId || item.status !== 'PENDING' || Date.parse(item.expiresAt) <= Date.now()) return;
    setBusyId(item.id); setError(null); setNotice(null);
    try {
      if (action === 'accept') {
        const accepted = await api.acceptReceived(item.id, item.version);
        const selected = await activateInvitationContext(context, accepted.invitation.organizationId, accepted.invitation.organizationType);
        setContextSelected(selected);
        setNotice(selected
          ? 'Aceptaste la invitación de ' + item.organizationName + ' y se seleccionó su contexto.'
          : 'Aceptaste la invitación de ' + item.organizationName + '. Puedes elegir la organización para continuar.');
      } else {
        await api.rejectReceived(item.id, item.version);
        setContextSelected(false);
        setNotice('Rechazaste la invitación de ' + item.organizationName + '.');
      }
      await load();
    } catch (failure) { setError(failureMessage(failure)); }
    finally { setBusyId(null); }
  };

  const openOrganizations = async () => {
    if (context) await context.getState().openSelector();
    navigate(context ? '/organizations/select' : '/', { replace: true });
  };
  const continueAfterAcceptance = async () => {
    if (contextSelected) { navigate('/session', { replace: true }); return; }
    await openOrganizations();
  };

  return <Stack spacing={2} sx={{ minWidth: 0, '& button': { minHeight: 44 } }}>
    <Typography variant="h4" component="h1">Mis invitaciones</Typography>
    <Typography>Las invitaciones se buscan con el correo verificado de tu cuenta. Puedes volver aquí después de crear la cuenta o cambiar de navegador.</Typography>
    <Typography color="text.secondary">Al aceptar, compartirás con la organización tu nombre completo, tipo y número de documento y correo electrónico. Crear tu cuenta no acepta una invitación automáticamente.</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    {notice && <Alert severity="success">{notice}</Alert>}
    {notice?.startsWith('Aceptaste') && <Button variant="contained" onClick={() => void continueAfterAcceptance()}>{contextSelected ? 'Continuar a Invoices App' : 'Elegir organización y entrar'}</Button>}
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <Button variant="outlined" onClick={() => void load()} disabled={loading || Boolean(busyId)}>Actualizar lista</Button>
    </Stack>
    {loading && <Alert severity="info" role="status">Buscando invitaciones de tu cuenta…</Alert>}
    {!loading && !error && result?.total === 0 && <Alert severity="info">No hay invitaciones asociadas al correo verificado de esta cuenta. Si acabas de registrarte, vuelve a iniciar sesión con el mismo correo y actualiza esta lista.</Alert>}
    {result?.items.map(item => {
      const active = item.status === 'PENDING' && Date.parse(item.expiresAt) > Date.now();
      return <Paper variant="outlined" key={item.id} sx={{ p: 2 }}><Stack spacing={1}>
        <Typography variant="h6">{item.organizationName}</Typography>
        <Typography>{item.organizationType === 'COMPANY' ? 'Empresa' : 'Tercero'} · Estado: {statusLabel[item.status]}</Typography>
        <Typography>Roles: {item.roles.map(role => getRoleLabel(role)).join(', ')}</Typography>
        <Typography>Recibida: {new Date(item.createdAt).toLocaleString('es-CO')} · Vence: {new Date(item.expiresAt).toLocaleString('es-CO')}</Typography>
        {active && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="contained" disabled={Boolean(busyId)} onClick={() => void resolve(item, 'accept')}>Aceptar invitación</Button>
          <Button color="inherit" disabled={Boolean(busyId)} onClick={() => void resolve(item, 'reject')}>Rechazar</Button>
        </Stack>}
      </Stack></Paper>;
    })}
    {result && result.total > result.pageSize && <Pagination page={page} count={Math.ceil(result.total / result.pageSize)} onChange={(_event, value) => setPage(value)} aria-label="Páginas de mis invitaciones" />}
  </Stack>;
}
