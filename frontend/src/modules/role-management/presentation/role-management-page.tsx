import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, Typography } from '@mui/material';
import { RequestError } from '@/shared/application/request-error';
import { ApplicationError } from '@/shared/application/application-error';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { RoleGrant } from '../domain/role-policy';
import { roleGrantKey } from '../domain/role-policy';
import type { RolePolicyApi } from '../application/role-policy-api';

const globalScope = { kind: 'global', companyId: null, thirdPartyId: null } as const;
const roleLabels: Record<RoleGrant['role'], string> = {
  APP_ADMIN: 'Administrador global',
  COMPANY_ADMIN: 'Administrador de empresa',
  THIRD_PARTY_ADMIN: 'Administrador de tercero',
  DRIVER: 'Conductor',
};
const scopeLabels: Record<RoleGrant['scope'], string> = {
  global: 'Global', self: 'Propio', company: 'Empresa', 'third-party': 'Tercero',
};

function errorText(error: unknown): string {
  if (error instanceof RequestError) {
    if (error.businessCode === 'POLICY_CONFLICT') return 'La política cambió desde que la cargaste. Recarga la versión vigente antes de volver a editar.';
    if (error.businessCode === 'POLICY_AUDIT_CAPACITY') return 'No se aplicó el cambio porque la capacidad de auditoría está agotada. Recarga la política antes de volver a intentarlo.';
    if (error.businessCode === 'INVALID_REQUEST') return 'El servidor rechazó la matriz. Recarga la política vigente para continuar.';
  }
  if (error instanceof ApplicationError && error.code === 'FORBIDDEN') return 'Tu permiso para consultar la política cambió. Actualiza tus permisos para continuar.';
  if (error instanceof ApplicationError && error.code === 'UNAVAILABLE') return 'La política no está disponible temporalmente. Puedes volver a cargarla.';
  return 'No se pudo completar la operación. Vuelve a cargar la política antes de continuar.';
}

export function RoleManagementPage({ api, authorization, context }: { api: RolePolicyApi; authorization: AuthorizationStore; context: ContextStore }) {
  const authState = useStore(authorization);
  const contextState = useStore(context);
  const [policy, setPolicy] = useState<Awaited<ReturnType<RolePolicyApi['read']>> | null>(null);
  const [draft, setDraft] = useState<readonly RoleGrant[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleGrant['role']>('APP_ADMIN');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const saveController = useRef<AbortController | null>(null);
  const savePending = useRef(false);
  const isGlobal = contextState.status === 'ready' && contextState.activeContext?.kind === 'GLOBAL';
  const canManage = authState.has('roles:manage');

  const reload = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setStatus('loading');
    setError(null);
    setNotice(null);
    try {
      const response = await api.read(controller.signal);
      if (controller.signal.aborted) return;
      setPolicy(response);
      setDraft(response.policy.grants.map(grant => ({ ...grant })));
      setRefreshRequired(false);
      setConfirming(false);
      setStatus('ready');
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(errorText(cause));
      setRefreshRequired(true);
      setStatus('error');
    } finally {
      if (loadController.current === controller) loadController.current = null;
    }
  }, [api]);

  useEffect(() => {
    if (isGlobal) void reload();
    return () => {
      loadController.current?.abort();
      saveController.current?.abort();
    };
  }, [isGlobal, reload]);

  const draftKeys = useMemo(() => new Set(draft.map(roleGrantKey)), [draft]);
  const originalKeys = useMemo(() => new Set(policy?.policy.grants.map(roleGrantKey) ?? []), [policy]);
  const dirty = draftKeys.size !== originalKeys.size || [...draftKeys].some(key => !originalKeys.has(key));
  const canSave = isGlobal && canManage && status === 'ready' && Boolean(policy) && dirty && !saving && !refreshRequired;
  const visibleRole = policy?.catalog.roles.includes(selectedRole) ? selectedRole : policy?.catalog.roles[0];
  const visibleRoleGrants = policy && visibleRole ? policy.catalog.grantCeiling.filter(grant => grant.role === visibleRole) : [];

  function toggle(grant: RoleGrant) {
    const key = roleGrantKey(grant);
    setDraft(current => current.some(value => roleGrantKey(value) === key)
      ? current.filter(value => roleGrantKey(value) !== key)
      : [...current, { ...grant }]);
    setConfirming(false);
    setNotice(null);
  }

  async function save() {
    if (!policy || !canSave || savePending.current) return;
    savePending.current = true;
    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const grants = policy.catalog.grantCeiling.filter(grant => draftKeys.has(roleGrantKey(grant)));
      const updated = await api.replace(policy.policy.version, grants, controller.signal);
      if (controller.signal.aborted) return;
      const latestContext = context.getState();
      if (latestContext.status !== 'ready' || latestContext.activeContext?.kind !== 'GLOBAL') return;
      await authorization.getState().setContext(globalScope);
      if (!authorization.getState().has('roles:read')) {
        setPolicy(null);
        setDraft([]);
        setStatus('error');
        setRefreshRequired(true);
        setConfirming(false);
        setError('El cambio se aplicó, pero no se pudieron actualizar los permisos. Vuelve a cargar permisos antes de continuar.');
        return;
      }
      setPolicy(updated);
      setDraft(updated.policy.grants.map(grant => ({ ...grant })));
      setStatus('ready');
      setRefreshRequired(false);
      setConfirming(false);
      setNotice(`La política se actualizó correctamente. Versión confirmada: ${updated.policy.version}.`);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(errorText(cause));
      setRefreshRequired(true);
      setConfirming(false);
    } finally {
      if (saveController.current === controller) saveController.current = null;
      savePending.current = false;
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  return <Stack spacing={2} sx={{ width: '100%', minWidth: 0, maxWidth: 1080 }}>
    <Box>
      <Typography component="h1" variant="h4" sx={{ overflowWrap: 'anywhere' }}>Roles y permisos</Typography>
      <Typography color="text.secondary">Consulta la política local y administra solo las combinaciones permitidas por el servidor.</Typography>
    </Box>
    {!isGlobal && <Alert severity="warning">Roles y permisos solo está disponible en el contexto GLOBAL.</Alert>}
    {status === 'loading' && <Alert severity="info" role="status">{policy ? 'Recargando la política…' : 'Cargando la política…'}</Alert>}
    {error && <Alert severity="error" role="alert">{error}</Alert>}
    {notice && <Alert severity="success" role="status">{notice}</Alert>}
    {status === 'error' && !policy && <Button onClick={() => void reload()} disabled={!isGlobal || saving} variant="outlined">Recargar política</Button>}
    {isGlobal && policy && <>
      <Typography variant="body2" color="text.secondary">Versión vigente: {policy.policy.version}</Typography>
      {!canManage && <Alert severity="info">Tienes acceso de lectura. Se requiere `roles:manage` para editar la matriz.</Alert>}
      {policy.catalog.roles.length === 0 && <Alert severity="info">No hay roles disponibles en el catálogo.</Alert>}
      {policy.catalog.roles.length > 0 && visibleRole && <>
        <Typography variant="body2" color="text.secondary">Selecciona un rol para ver y administrar únicamente su matriz de permisos.</Typography>
        <Tabs
          aria-label="Seleccionar rol para administrar"
          value={visibleRole}
          onChange={(_event, value) => setSelectedRole(value as RoleGrant['role'])}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ minHeight: 48, borderBottom: 1, borderColor: 'divider' }}
        >
          {policy.catalog.roles.map(role => <Tab key={role} id={`role-tab-${role}`} aria-controls={`role-panel-${role}`} value={role} label={roleLabels[role]} />)}
        </Tabs>
        <Paper variant="outlined" role="tabpanel" id={`role-panel-${visibleRole}`} aria-labelledby={`role-tab-${visibleRole}`} sx={{ p: { xs: 1, sm: 2 }, minWidth: 0, overflow: 'hidden' }}>
          <Typography component="h2" variant="h6" sx={{ mb: 1, overflowWrap: 'anywhere' }}>{roleLabels[visibleRole]}</Typography>
          <TableContainer sx={{ width: '100%', overflowX: 'hidden' }}>
            <Table size="small" aria-label={`Permisos de ${roleLabels[visibleRole]}`} sx={{ tableLayout: 'fixed', width: '100%' }}>
              <TableHead><TableRow>
                <TableCell sx={{ width: '57%', px: { xs: .5, sm: 1 } }}>Permiso y ámbito</TableCell>
                <TableCell align="center" sx={{ width: '43%', px: { xs: .5, sm: 1 } }}>Concedido</TableCell>
              </TableRow></TableHead>
              <TableBody>{visibleRoleGrants.map(grant => {
                const key = roleGrantKey(grant);
                const mandatory = grant.role === 'APP_ADMIN' && ['roles:read', 'roles:manage'].includes(grant.permission) && grant.scope === 'global';
                const checked = draftKeys.has(key);
                const label = `${grant.permission} · ${scopeLabels[grant.scope]}`;
                return <TableRow key={key}>
                  <TableCell sx={{ px: { xs: .5, sm: 1 }, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{label}</TableCell>
                  <TableCell align="center" sx={{ px: { xs: .5, sm: 1 }, whiteSpace: 'normal' }}>
                    <FormControlLabel sx={{ m: 0, maxWidth: '100%' }} label={checked ? 'Sí' : 'No'} control={<Checkbox checked={checked} disabled={!canManage || mandatory || status !== 'ready' || saving || refreshRequired} onChange={() => toggle(grant)} slotProps={{ input: { 'aria-label': `${grant.permission} en ámbito ${scopeLabels[grant.scope]} para ${roleLabels[visibleRole]}` } }} />} />
                  </TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </>}
      {policy.catalog.roles.length > 0 && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}>
        <Button variant="contained" disabled={!canSave} onClick={() => setConfirming(true)}>Guardar cambios</Button>
        {refreshRequired && <Button variant="outlined" disabled={saving} onClick={() => void reload()}>Recargar política</Button>}
      </Stack>}
      <Dialog
        open={confirming}
        onClose={() => { if (!saving) setConfirming(false); }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="role-policy-confirm-title"
        aria-describedby="role-policy-confirm-description"
      >
        <DialogTitle id="role-policy-confirm-title">Confirmar cambio de permisos</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography id="role-policy-confirm-description">Vas a reemplazar toda la matriz con los cambios revisados. La versión vigente es {policy.policy.version}.</Typography>
            <Alert severity="warning">El servidor validará y registrará este cambio antes de confirmarlo.</Alert>
            {saving && <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }} role="status">
              <CircularProgress size={20} aria-label="Guardando cambios" />
              <Typography>Guardando cambios…</Typography>
            </Stack>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, flexWrap: 'wrap' }}>
          <Button variant="outlined" disabled={saving} onClick={() => setConfirming(false)}>Cancelar</Button>
          <Button variant="contained" disabled={!canSave || saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Confirmar cambio'}</Button>
        </DialogActions>
      </Dialog>
    </>}
  </Stack>;
}
