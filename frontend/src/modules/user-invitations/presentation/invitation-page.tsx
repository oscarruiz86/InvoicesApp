import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Alert, Button, MenuItem, Pagination, Paper, Stack, TextField, Typography } from '@mui/material';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { ApplicationError } from '@/shared/application/application-error';
import { RequestError } from '@/shared/application/request-error';
import { errorMessage } from '@/shared/components/error-messages';
import { getRoleLabel } from '@shared/role-labels';
import type { InvitationApi, InvitationRole, InvitationStatus, OrganizationTarget } from '../application/invitation-api';
const deliveryStatusLabel: Record<'UNKNOWN' | 'LOGGED' | 'FAILED', string> = { UNKNOWN: 'Pendiente', LOGGED: 'Completada', FAILED: 'Fallida' };

function failureMessage(error: unknown) {
  if (error instanceof RequestError) return ({ INVITATION_EXISTS: 'Ya existe una invitación pendiente para este correo.', MEMBERSHIP_EXISTS: 'El usuario ya está vinculado a esta organización.', INVALID_ROLES: 'Los roles no se pueden asignar en este ámbito.', VERSION_CONFLICT: 'La invitación cambió; recarga antes de continuar.', INVITATION_EXPIRED: 'La invitación venció.', LAST_ADMINISTRATOR_REQUIRED: 'La empresa debe conservar un administrador.' } as Record<string, string>)[error.businessCode] ?? 'No fue posible completar la operación.';
  return errorMessage(error instanceof ApplicationError ? error.code : 'UNEXPECTED');
}

export function InvitationPage({ api, context, authorization }: { api: InvitationApi; context: ContextStore; authorization: AuthorizationStore }) {
  const contextState = useStore(context); const auth = useStore(authorization);
  const active = contextState.activeContext;
  const [organizationId, setOrganizationId] = useState('');
  const [organizationType, setOrganizationType] = useState<'COMPANY' | 'THIRD_PARTY'>(active?.kind === 'ORGANIZATION' && active.roles.includes('COMPANY_ADMIN') ? 'THIRD_PARTY' : active?.kind === 'ORGANIZATION' ? active.organizationType : 'COMPANY');
  const [companyId, setCompanyId] = useState('');
  const [status, setStatus] = useState<InvitationStatus | ''>(''); const [page, setPage] = useState(1); const [recipientEmail, setRecipientEmail] = useState(''); const [selectedRole, setSelectedRole] = useState<InvitationRole>('COMPANY_ADMIN');
  const [items, setItems] = useState<Awaited<ReturnType<InvitationApi['list']>> | null>(null); const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null); const [busy, setBusy] = useState(false); const generation = useRef(0);
  const roles = auth.snapshot?.roles ?? [];
  useEffect(() => {
    if (active?.kind === 'ORGANIZATION') {
      const companyAdmin = active.roles.includes('COMPANY_ADMIN');
      setOrganizationType(companyAdmin ? 'THIRD_PARTY' : active.organizationType);
      setOrganizationId(companyAdmin ? '' : active.organizationId);
      setCompanyId(active.organizationType === 'COMPANY' ? active.organizationId : auth.scope.companyId ?? '');
      setPage(1);
    }
  }, [contextState.generation]);
  const target = useMemo<OrganizationTarget | null>(() => organizationId.trim() ? { organizationId: organizationId.trim(), organizationType,
    companyId: organizationType === 'THIRD_PARTY' ? companyId.trim() || auth.scope.companyId : null } : null, [organizationId, organizationType, companyId, auth.scope.companyId]);
  const roleOptions = useMemo<InvitationRole[]>(() => target?.organizationType === 'COMPANY' ? roles.includes('APP_ADMIN') ? ['COMPANY_ADMIN'] : []
    : roles.includes('COMPANY_ADMIN') ? ['THIRD_PARTY_ADMIN'] : roles.includes('THIRD_PARTY_ADMIN') ? ['DRIVER'] : [], [roles, target?.organizationType]);
  const load = useCallback(async () => {
    const request = ++generation.current;
    if (!target || contextState.status !== 'ready' || auth.status !== 'ready') { setItems(null); return; }
    let capture: ReturnType<ContextStore['capture']> | undefined;
    setError(null);
    try { capture = context.capture(); const result = await api.list(capture.scope, target, status, page, capture.signal);
      if (request === generation.current && capture.isCurrent()) setItems(result);
    } catch (failure) { if (request === generation.current) setError(failureMessage(failure)); }
    finally { capture?.release(); }
  }, [api, auth.status, context, contextState.status, target, status, page]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  useEffect(() => { if (roleOptions.length && !roleOptions.includes(selectedRole)) setSelectedRole(roleOptions[0]); }, [roleOptions, selectedRole]);
  const mutate = async (operation: (scope: ReturnType<ContextStore['capture']>['scope'], signal: AbortSignal) => Promise<unknown>) => {
    if (busy || !target) return;
    setBusy(true); setError(null); setNotice(null); let capture: ReturnType<ContextStore['capture']> | undefined;
    try { capture = context.capture(); await operation(capture.scope, capture.signal); if (capture.isCurrent()) { setNotice('Cambio registrado.'); await load(); } }
    catch (failure) { setError(failureMessage(failure)); }
    finally { capture?.release(); setBusy(false); }
  };
  const create = () => {
    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) { setError('Escribe un correo válido.'); return; }
    if (!roleOptions.includes(selectedRole)) { setError('No puedes delegar ese rol en este ámbito.'); return; }
    if (!window.confirm(`¿Crear una invitación para ${recipientEmail.trim()} con el rol ${getRoleLabel(selectedRole)}?`)) return;
    void mutate((scope, signal) => api.create(scope, target, recipientEmail.trim(), [selectedRole], signal).then(value => { setRecipientEmail(''); return value; }));
  };
  const action = (kind: 'cancel' | 'resend', item: NonNullable<typeof items>['items'][number]) => {
    const text = kind === 'cancel' ? 'cancelar' : 'reenviar';
    if (!window.confirm(`¿Deseas ${text} la invitación a ${item.recipientEmail}?`)) return;
    void mutate((scope, signal) => kind === 'cancel' ? api.cancel(scope, item.id, item.version, signal) : api.resend(scope, item.id, item.version, signal));
  };
  return <Stack spacing={2} sx={{ minWidth: 0, '& button': { minHeight: 44 } }}>
    <Typography variant="h4" component="h1">Invitaciones</Typography>
    <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
      <Typography>Selecciona el ámbito antes de consultar o invitar usuarios.</Typography>
      <TextField select label="Tipo de organización" value={organizationType} onChange={event => { setOrganizationType(event.target.value as 'COMPANY' | 'THIRD_PARTY'); setOrganizationId(''); }}>
        <MenuItem value="COMPANY">Empresa</MenuItem><MenuItem value="THIRD_PARTY">Tercero</MenuItem>
      </TextField>
      <TextField label="ID de organización" value={organizationId} onChange={event => setOrganizationId(event.target.value)} slotProps={{ htmlInput: { maxLength: 128 } }} />
      {organizationType === 'THIRD_PARTY' && <TextField label="ID de empresa relacionada (opcional)" value={companyId} onChange={event => setCompanyId(event.target.value)} slotProps={{ htmlInput: { maxLength: 128 } }} />}
    </Stack></Paper>
    {error && <Alert severity="error">{error}</Alert>}{notice && <Alert severity="success">{notice}</Alert>}
    {target && <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
      <Typography variant="h6">Crear invitación</Typography>
      <TextField label="Correo del destinatario" type="email" value={recipientEmail} onChange={event => setRecipientEmail(event.target.value)} slotProps={{ htmlInput: { maxLength: 254 } }} />
      <TextField select label="Rol" value={selectedRole} onChange={event => setSelectedRole(event.target.value as InvitationRole)} disabled={!roleOptions.length}>
        {roleOptions.map(role => <MenuItem key={role} value={role}>{getRoleLabel(role)}</MenuItem>)}
      </TextField>
      {!roleOptions.length && <Alert severity="info">Tu rol actual no puede delegar en esta organización.</Alert>}
      <Button variant="contained" onClick={create} disabled={busy || !roleOptions.length}>Crear</Button>
    </Stack></Paper>}
    {target && <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField select label="Estado" value={status} onChange={event => { setStatus(event.target.value as InvitationStatus | ''); setPage(1); }} sx={{ minWidth: 180 }}>
          <MenuItem value="">Todos los estados</MenuItem><MenuItem value="PENDING">Pendientes</MenuItem><MenuItem value="ACCEPTED">Aceptadas</MenuItem><MenuItem value="REJECTED">Rechazadas</MenuItem><MenuItem value="CANCELLED">Canceladas</MenuItem><MenuItem value="EXPIRED">Vencidas</MenuItem>
        </TextField>
        <Button variant="outlined" onClick={() => void load()} disabled={busy}>Actualizar</Button>
      </Stack>
      {!items?.items.length && <Alert severity="info">No hay invitaciones para este filtro.</Alert>}
      {items?.items.map(item => {
        const current = item.status === 'PENDING' && Date.parse(item.expiresAt) > Date.now();
        return <Paper variant="outlined" key={item.id} sx={{ p: 2 }}><Stack spacing={1}>
          <Typography variant="h6">{item.recipientEmail}</Typography><Typography>Rol: {item.roles.map(role => getRoleLabel(role)).join(', ')}</Typography>
          <Typography>Estado: {item.status} · Entrega: {deliveryStatusLabel[item.deliveryStatus]} · Vence: {new Date(item.expiresAt).toLocaleString('es-CO')}</Typography>
          {current && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button disabled={busy} onClick={() => action('resend', item)}>Reenviar</Button><Button color="error" disabled={busy} onClick={() => action('cancel', item)}>Cancelar</Button>
          </Stack>}
        </Stack></Paper>;
      })}
      {items && items.total > items.pageSize && <Pagination page={page} count={Math.ceil(items.total / items.pageSize)} onChange={(_event, value) => setPage(value)} aria-label="Páginas de invitaciones" />}
    </>}
  </Stack>;
}
