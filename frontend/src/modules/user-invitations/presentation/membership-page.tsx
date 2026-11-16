import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Alert, Button, MenuItem, Pagination, Paper, Stack, TextField, Typography } from '@mui/material';
import { Link } from 'react-router';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { ApplicationError } from '@/shared/application/application-error';
import { RequestError } from '@/shared/application/request-error';
import { errorMessage } from '@/shared/components/error-messages';
import { getRoleLabel } from '@shared/role-labels';
import type { InvitationApi, InvitationRole, MembershipRecord, OrganizationTarget } from '../application/invitation-api';

function failureMessage(error: unknown) {
  if (error instanceof RequestError) return ({ LAST_ROLE_REQUIRED: 'La pertenencia debe conservar al menos un rol.', LAST_ADMINISTRATOR_REQUIRED: 'La empresa debe conservar un administrador.', VERSION_CONFLICT: 'La pertenencia cambió; recarga los datos.', INVALID_ROLES: 'Los roles no se pueden asignar en este ámbito.' } as Record<string, string>)[error.businessCode] ?? 'No fue posible completar el cambio.';
  return errorMessage(error instanceof ApplicationError ? error.code : 'UNEXPECTED');
}

export function MembershipPage({ api, context, authorization }: { api: InvitationApi; context: ContextStore; authorization: AuthorizationStore }) {
  const contextState = useStore(context); const auth = useStore(authorization); const active = contextState.activeContext;
  const [organizationId, setOrganizationId] = useState(active?.kind === 'ORGANIZATION' ? active.organizationId : '');
  const [organizationType, setOrganizationType] = useState<'COMPANY' | 'THIRD_PARTY'>(active?.kind === 'ORGANIZATION' ? active.organizationType : 'COMPANY');
  const [companyId, setCompanyId] = useState(''); const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | ''>(''); const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ items: readonly MembershipRecord[]; page: number; pageSize: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const generation = useRef(0); const mounted = useRef(true); const roles = auth.snapshot?.roles ?? [];
  useEffect(() => {
    generation.current++;
    setResult(null); setError(null); setNotice(null);
    if (active?.kind === 'ORGANIZATION') {
      setOrganizationId(active.organizationId); setOrganizationType(active.organizationType); setCompanyId(auth.scope.companyId ?? ''); setPage(1);
    }
  }, [contextState.generation]);
  const target = useMemo<OrganizationTarget | null>(() => organizationId.trim() ? { organizationId: organizationId.trim(), organizationType,
    companyId: organizationType === 'THIRD_PARTY' ? companyId.trim() || auth.scope.companyId : null } : null, [organizationId, organizationType, companyId, auth.scope.companyId]);
  const mutableRoles = useMemo<InvitationRole[]>(() => target?.organizationType === 'COMPANY' ? roles.includes('APP_ADMIN') ? ['COMPANY_ADMIN'] : []
    : roles.includes('COMPANY_ADMIN') ? ['THIRD_PARTY_ADMIN'] : roles.includes('THIRD_PARTY_ADMIN') ? ['DRIVER'] : [], [roles, target?.organizationType]);
  const load = useCallback(async () => {
    const request = ++generation.current;
    if (!target || contextState.status !== 'ready' || auth.status !== 'ready') { setResult(null); return; }
    let capture: ReturnType<ContextStore['capture']> | undefined;
    setError(null);
    try { capture = context.capture(); const value = await api.memberships(capture.scope, target, status, page, capture.signal);
      if (mounted.current && request === generation.current && capture.isCurrent()) setResult(value);
    } catch (failure) { if (mounted.current && request === generation.current && (!capture || capture.isCurrent())) setError(failureMessage(failure)); }
    finally { capture?.release(); }
  }, [api, auth.status, context, contextState.status, target, status, page]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const mutate = async (operation: (scope: ReturnType<ContextStore['capture']>['scope'], signal: AbortSignal) => Promise<unknown>) => {
    if (busy || !target) return;
    setBusy(true); setError(null); setNotice(null); let capture: ReturnType<ContextStore['capture']> | undefined;
    try { capture = context.capture(); await operation(capture.scope, capture.signal); if (capture.isCurrent()) { setNotice('Cambios guardados.'); await load(); } }
    catch (failure) { setError(failureMessage(failure)); }
    finally { capture?.release(); if (mounted.current) setBusy(false); }
  };
  const updateRole = (member: MembershipRecord, role: InvitationRole, remove: boolean) => {
    if (!mutableRoles.includes(role) || (remove && member.roles.length <= 1)) return;
    const next = remove ? member.roles.filter(value => value !== role) : [...new Set([...member.roles, role])];
    if (!window.confirm(`${remove ? 'Retirar' : 'Asignar'} el rol ${getRoleLabel(role)} a este usuario?`)) return;
    void mutate((scope, signal) => api.changeRoles(scope, target!, member.id, member.revision, next, signal));
  };
  const updateStatus = (member: MembershipRecord) => {
    const next = member.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (!window.confirm(`${next === 'INACTIVE' ? 'Suspender' : 'Reactivar'} esta pertenencia?`)) return;
    void mutate((scope, signal) => api.changeStatus(scope, target!, member.id, member.revision, next, signal));
  };
  return <Stack spacing={2} sx={{ minWidth: 0, '& button': { minHeight: 44 } }}>
    <Typography variant="h4" component="h1">Usuarios vinculados</Typography>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <Button component={Link} to="/invitations">Invitar usuario</Button>
      <TextField select label="Tipo de organización" value={organizationType} onChange={event => setOrganizationType(event.target.value as 'COMPANY' | 'THIRD_PARTY')} sx={{ minWidth: 180 }}>
        <MenuItem value="COMPANY">Empresa</MenuItem><MenuItem value="THIRD_PARTY">Tercero</MenuItem>
      </TextField>
      <TextField label="ID de organización" value={organizationId} onChange={event => setOrganizationId(event.target.value)} slotProps={{ htmlInput: { maxLength: 128 } }} />
      {organizationType === 'THIRD_PARTY' && <TextField label="ID de empresa relacionada (opcional)" value={companyId} onChange={event => setCompanyId(event.target.value)} slotProps={{ htmlInput: { maxLength: 128 } }} />}
    </Stack>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <TextField select label="Estado" value={status} onChange={event => { setStatus(event.target.value as 'ACTIVE' | 'INACTIVE' | ''); setPage(1); }} sx={{ minWidth: 180 }}>
        <MenuItem value="">Todos</MenuItem><MenuItem value="ACTIVE">Activos</MenuItem><MenuItem value="INACTIVE">Suspendidos</MenuItem>
      </TextField>
      <Button variant="outlined" onClick={() => void load()} disabled={busy}>Actualizar</Button>
    </Stack>
    {error && <Alert severity="error">{error}</Alert>}{notice && <Alert severity="success">{notice}</Alert>}
    {!result?.items.length && <Alert severity="info">No hay usuarios vinculados para este filtro.</Alert>}
    {result?.items.map(member => {
      const manageable = mutableRoles.length > 0 && member.roles.every(role => mutableRoles.includes(role));
      return <Paper variant="outlined" key={member.id} sx={{ p: 2, minWidth: 0 }}><Stack spacing={1}>
        <Typography variant="h6">{member.profile?.fullName ?? 'Perfil no disponible'}</Typography>
        {member.profile && <>
          <Typography>Documento: {member.profile.documentType} · {member.profile.documentNumber}</Typography><Typography>Correo: {member.profile.email}</Typography>
        </>}
        <Typography>Estado: {member.status === 'ACTIVE' ? 'Activo' : 'Suspendido'}</Typography><Typography>Roles: {member.roles.map(role => getRoleLabel(role)).join(', ')}</Typography>
        {manageable && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          {mutableRoles.map(role => member.roles.includes(role)
            ? member.roles.length > 1 && <Button key={role} color="warning" disabled={busy} onClick={() => updateRole(member, role, true)}>Quitar {getRoleLabel(role)}</Button>
            : <Button key={role} disabled={busy} onClick={() => updateRole(member, role, false)}>Asignar {getRoleLabel(role)}</Button>)}
          <Button color={member.status === 'ACTIVE' ? 'warning' : 'primary'} disabled={busy} onClick={() => updateStatus(member)}>{member.status === 'ACTIVE' ? 'Suspender' : 'Reactivar'}</Button>
        </Stack>}
      </Stack></Paper>;
    })}
    {result && result.total > result.pageSize && <Pagination page={page} count={Math.ceil(result.total / result.pageSize)} onChange={(_event, value) => setPage(value)} aria-label="Páginas de usuarios vinculados" />}
  </Stack>;
}
