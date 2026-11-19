import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useStore } from 'zustand';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import type { ThirdPartyApi } from '../application/third-party-api';
import { editableFields, type ThirdPartyField, type ThirdPartyList, type ThirdPartyRecord, type ThirdPartyRelationship } from '../domain/third-party';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import { RequestError } from '@/shared/application/request-error';
import { ApplicationError } from '@/shared/application/application-error';
import { errorMessage } from '@/shared/components/error-messages';
import { TableLoadingState } from '@/shared/components/table-loading-state';
import { DataPagination } from '@/shared/components/data-pagination';
import { DataTable, DataTableAction, DataTableSortHeader, DataTableSurface } from '@/shared/components/data-table';
import { SuccessNotice } from '@/shared/components/success-notice';

const labels: Record<ThirdPartyField, string> = { documentType: 'Tipo de documento', documentNumber: 'NIT', verificationDigit: 'Dígito de verificación', businessName: 'Razón social', tradeName: 'Nombre comercial', email: 'Correo electrónico', phone: 'Teléfono', address: 'Dirección', country: 'País', department: 'Departamento', city: 'Ciudad' };
const emptyForm = () => Object.fromEntries(editableFields.map(key => [key, key === 'documentType' ? 'NIT' : ''])) as Record<ThirdPartyField, string>;
type ThirdPartySortKey = 'businessName' | 'documentNumber' | 'status' | 'country' | 'department' | 'city';
type ThirdPartyFilterKey = 'q' | 'status' | 'country' | 'department' | 'city';
type ThirdPartyFilters = Record<ThirdPartyFilterKey, string>;
const emptyThirdPartyFilters = (): ThirdPartyFilters => ({ q: '', status: '', country: '', department: '', city: '' });
const emptyThirdPartyQuery = () => ({ ...emptyThirdPartyFilters(), sort: 'businessName', direction: 'asc', page: '1', pageSize: '20' });
type Confirmation = { kind: 'status' | 'relationship'; status: 'ACTIVE' | 'INACTIVE'; companyId?: string; version: string | null } | null;
function message(error: unknown) {
  if (error instanceof RequestError) return ({ THIRD_PARTY_DOCUMENT_CONFLICT: 'Ya existe un tercero con ese NIT.', THIRD_PARTY_VERSION_CONFLICT: 'El tercero o la relación cambió. Recarga los datos antes de volver a guardar.', THIRD_PARTY_INACTIVE: 'Activa el tercero antes de crear una relación.', INVALID_REQUEST: 'Revisa los campos obligatorios y sus formatos.' } as Record<string, string>)[error.businessCode] ?? 'No fue posible completar la operación.';
  return errorMessage(error instanceof ApplicationError ? error.code : 'UNEXPECTED');
}
const date = (value: string) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function ThirdPartyPage({ api, context, authorization, mode }: { api: ThirdPartyApi; context: ContextStore; authorization: AuthorizationStore; mode: 'list' | 'create' | 'detail' | 'edit' }) {
  const { id = '' } = useParams(); const location = useLocation(); const navigate = useNavigate(); const auth = useStore(authorization); const contextState = useStore(context);
  const theme = useTheme(); const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [record, setRecord] = useState<ThirdPartyRecord | null>(null); const [list, setList] = useState<ThirdPartyList | null>(null);
  const [form, setForm] = useState(emptyForm); const [error, setError] = useState<string | null>(null); const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]); const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false); const [requiresReload, setRequiresReload] = useState(false);
  const [query, setQuery] = useState(emptyThirdPartyQuery); const [filtersOpen, setFiltersOpen] = useState(false); const [draftFilters, setDraftFilters] = useState<ThirdPartyFilters>(emptyThirdPartyFilters);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [relationshipView, setRelationshipView] = useState<ThirdPartyRelationship | null>(null); const [relationshipChecked, setRelationshipChecked] = useState(false); const [companyId, setCompanyId] = useState('');
  const generation = useRef(0); const mounted = useRef(false); const saving = useRef(false); const dirtyRef = useRef(false);
  const global = auth.scope.kind === 'global'; const companyScope = auth.scope.kind === 'organization' && Boolean(auth.scope.companyId);
  const authorized = Boolean(auth.snapshot && (auth.status === 'ready' || auth.status === 'refreshing'));
  const setChanged = useCallback((next: boolean) => { dirtyRef.current = next; }, []);

  useEffect(() => {
    mounted.current = true;
    const unregister = context.register({ dirty: () => dirtyRef.current, clear: () => {
      generation.current++; setRecord(null); setList(null); setForm(emptyForm()); setRelationshipView(null); setRelationshipChecked(false); setConfirmation(null); setError(null); setNotice(null); dirtyRef.current = false;
    } });
    return () => { mounted.current = false; unregister(); };
  }, [context, setChanged]);

  const load = useCallback(async () => {
    const current = ++generation.current;
    if (!authorized || contextState.status !== 'ready') return;
    if (mode === 'create') { setRecord(null); setForm(emptyForm()); setChanged(false); }
    else if (mode !== 'list') { setRecord(null); setRelationshipView(null); setForm(emptyForm()); setChanged(false); }
    let capture: ReturnType<ContextStore['capture']> | undefined;
    setLoading(true); setError(null);
    try {
      capture = context.capture();
      const listRequest = mode === 'list' && authorization.getState().has('third-parties:read')
        ? api.list(capture.scope, Object.fromEntries(Object.entries(query).filter(([, value]) => value !== '')), capture.signal)
        : Promise.resolve(null);
      const recordRequest = mode === 'detail' || mode === 'edit' ? api.get(capture.scope, id, capture.signal) : Promise.resolve(null);
      const [listResult, recordResult] = await Promise.allSettled([listRequest, recordRequest]);
      if (mounted.current && current === generation.current && capture.isCurrent()) {
        if (listResult.status === 'fulfilled' && listResult.value) setList(listResult.value);
        else if (listResult.status === 'rejected' && mode === 'list') throw listResult.reason;
        if (recordResult.status === 'rejected') throw recordResult.reason;
        const nextRecord = recordResult.status === 'fulfilled' ? recordResult.value : null;
        if (nextRecord) {
          setRecord(nextRecord); setForm(Object.fromEntries(editableFields.map(key => [key, nextRecord.thirdParty[key] ?? ''])) as Record<ThirdPartyField, string>); setRequiresReload(false);
          setRelationshipView(nextRecord.relationship); setChanged(false);
        }
      }
    } catch (failure) { if (mounted.current && current === generation.current && (!capture || capture.isCurrent())) setError(message(failure)); }
    finally { capture?.release(); if (mounted.current && current === generation.current) setLoading(false); }
  }, [api, authorization, authorized, context, contextState.status, id, mode, query, setChanged]);
  const invalidatePendingLoad = useCallback(() => { generation.current++; }, []);
  useEffect(() => { void load(); return invalidatePendingLoad; }, [invalidatePendingLoad, load]);
  useEffect(() => {
    const routeState = location.state as { thirdPartyNotice?: unknown } | null;
    if (typeof routeState?.thirdPartyNotice !== 'string') return;
    setNotice(routeState.thirdPartyNotice);
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  const mutate = async (operation: (scope: ReturnType<ContextStore['capture']>['scope'], signal: AbortSignal) => Promise<unknown>, complete: (value: unknown) => void) => {
    if (saving.current) return; saving.current = true; setBusy(true); setError(null); setFieldErrors([]);
    let capture: ReturnType<ContextStore['capture']> | undefined;
    try { capture = context.capture(); const result = await operation(capture.scope, capture.signal); if (mounted.current && capture.isCurrent()) complete(result); }
    catch (failure) { if (mounted.current && (!capture || capture.isCurrent())) { setError(message(failure)); if (failure instanceof RequestError) setFieldErrors(failure.fields); if (mode === 'edit' && failure instanceof RequestError && failure.businessCode === 'THIRD_PARTY_VERSION_CONFLICT') setRequiresReload(true); } }
    finally { capture?.release(); saving.current = false; if (mounted.current) setBusy(false); }
  };

  const save = () => {
    const invalid = ['documentNumber', 'businessName', 'email'].filter(key => !form[key as ThirdPartyField].trim());
    if (!/^\d{1,20}$/.test(form.documentNumber.trim())) invalid.push('documentNumber');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) invalid.push('email');
    if (form.verificationDigit && !/^\d$/.test(form.verificationDigit)) invalid.push('verificationDigit');
    if (invalid.length) { setFieldErrors(invalid); setError('Revisa los campos indicados.'); return; }
    const input = Object.fromEntries(editableFields.map(key => [key, form[key].trim() || null]));
    void mutate((scope, signal) => mode === 'create' ? api.create(scope, input, signal) : api.update(scope, id, record!.version, input, signal), () => {
      setChanged(false);
      navigate('/third-parties', { state: { thirdPartyNotice: mode === 'create' ? 'Tercero creado correctamente.' : 'Tercero actualizado correctamente.' } });
    });
  };

  const confirmChange = () => {
    if (!record || !confirmation) return;
    const action = confirmation; setConfirmation(null);
    void mutate((scope, signal) => action.kind === 'status'
      ? api.status(scope, record.thirdParty.id, record.version, action.status, signal)
      : api.relationship(scope, record.thirdParty.id, action.companyId!, action.version, action.status, signal), result => {
      const updated = result as ThirdPartyRecord; setRecord(updated);
      if (action.kind === 'relationship') { setRelationshipView(updated.relationship); setRelationshipChecked(true); }
      setNotice('Cambio confirmado.');
      if (action.kind === 'status') void load();
    });
  };

  const queryRelationship = async () => {
    if (!record || !/^[a-f0-9]{24}$/.test(companyId.trim())) { setError('Ingresa un ID de empresa válido.'); return; }
    let capture: ReturnType<ContextStore['capture']> | undefined;
    try { capture = context.capture(); const value = await api.getRelationship(capture.scope, record.thirdParty.id, companyId.trim(), capture.signal); if (capture.isCurrent()) { setRelationshipView(value); setRelationshipChecked(true); } }
    catch (failure) { setError(message(failure)); }
    finally { capture?.release(); }
  };

  const filter = (key: keyof ReturnType<typeof emptyThirdPartyQuery>, value: string) => setQuery(previous => ({ ...previous, [key]: value, ...(key === 'page' ? {} : { page: '1' }) }));
  const openFilters = () => { setDraftFilters({ q: query.q, status: query.status, country: query.country, department: query.department, city: query.city }); setFiltersOpen(true); };
  const applyFilters = () => { setQuery(previous => ({ ...previous, ...draftFilters, page: '1' })); setFiltersOpen(false); };
  const clearDraftFilters = () => setDraftFilters(emptyThirdPartyFilters());
  const clearFilter = (key: ThirdPartyFilterKey) => filter(key, '');
  const activeFilters: { key: ThirdPartyFilterKey; label: string }[] = [
    ...(query.q ? [{ key: 'q' as const, label: `Búsqueda: ${query.q}` }] : []),
    ...(query.status ? [{ key: 'status' as const, label: `Estado: ${query.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}` }] : []),
    ...(query.country ? [{ key: 'country' as const, label: `País: ${query.country}` }] : []),
    ...(query.department ? [{ key: 'department' as const, label: `Departamento: ${query.department}` }] : []),
    ...(query.city ? [{ key: 'city' as const, label: `Ciudad: ${query.city}` }] : []),
  ];
  const sortHeader = (key: ThirdPartySortKey, label: string) => <DataTableSortHeader active={query.sort === key}
    direction={query.sort === key ? query.direction as 'asc' | 'desc' : 'asc'} onClick={() => setQuery(previous => ({ ...previous,
      sort: key, direction: previous.sort === key && previous.direction === 'asc' ? 'desc' : 'asc', page: '1' }))}>{label}</DataTableSortHeader>;
  const closeModal = () => {
    if (busy) return;
    if (dirtyRef.current && !window.confirm('¿Descartar los cambios y cerrar?')) return;
    setChanged(false); navigate('/third-parties');
  };

  const canUpdate = auth.has('third-parties:update'); const canCreate = auth.has('third-parties:create');
  const canChangeRelationship = global ? auth.has('third-parties:create') || auth.has('third-parties:deactivate') : companyScope && (auth.has('third-parties:create') || auth.has('third-parties:deactivate'));
  const relationshipCompanyId = companyScope ? auth.scope.companyId! : companyId.trim();
  const editFields = editableFields.filter(key => key !== 'documentType');

  if (mode === 'list') return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <Typography component="h1" variant="h4">Terceros</Typography>
    {activeFilters.length > 0 && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>{activeFilters.map(item => <Chip key={item.key} label={item.label} onDelete={() => clearFilter(item.key)} />)}</Stack>}
    {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}{notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {loading && mobile && <Alert severity="info" role="status">Cargando terceros…</Alert>}
    {error && <Button disabled={busy} onClick={() => void load()}>Recargar datos</Button>}
    <DataTable loading={loading} toolbar={<>
      <DataTableAction label="Filtro" onClick={openFilters}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 5h18l-7.5 8.2V19l-3 1.7v-7.5L3 5z" /></SvgIcon></DataTableAction>
      {canCreate && <DataTableAction label="Crear tercero" primary onClick={() => navigate('/third-parties/new')}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 7V3H2v18h20V7H12zm-2 12H4v-2h6v2zm0-4H4v-2h6v2zm0-4H4V9h6v2zm10 8h-8V9h8v10zm-5-8h2v2h-2zm0 4h2v2h-2zM19 1v2h2v2h-2v2h-2V5h-2V3h2V1h2z" /></SvgIcon></DataTableAction>}
    </>} pagination={list && <DataPagination page={Number(query.page)} pageSize={list.pageSize} total={list.total} disabled={loading} label="Páginas de terceros"
      onPageChange={value => filter('page', String(value))} onPageSizeChange={value => filter('pageSize', String(value))} onRefresh={() => void load()} refreshLabel="Actualizar terceros" refreshDisabled={busy} />}>
      {list && !loading && !list.total && <Alert severity="info">No hay terceros que coincidan con la consulta.</Alert>}
      {!mobile && (list || loading) && <DataTableSurface loading={loading}>
        <Table size="medium" aria-label="Terceros" sx={{ minWidth: 1040 }}><TableHead><TableRow>
          <TableCell sortDirection={query.sort === 'businessName' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('businessName', 'Razón social')}</TableCell>
          <TableCell sortDirection={query.sort === 'documentNumber' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('documentNumber', 'NIT')}</TableCell>
          <TableCell>Correo</TableCell>
          <TableCell sortDirection={query.sort === 'status' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('status', 'Estado')}</TableCell>
          <TableCell sortDirection={query.sort === 'country' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('country', 'País')}</TableCell>
          <TableCell sortDirection={query.sort === 'department' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('department', 'Departamento')}</TableCell>
          <TableCell sortDirection={query.sort === 'city' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('city', 'Ciudad')}</TableCell><TableCell>Acciones</TableCell>
        </TableRow></TableHead><TableBody>{loading ? <TableLoadingState columns={8} rows={5} label="Cargando terceros" /> : list?.items.map(item => {
          const relation = item.relationship;
          const displayedStatus = companyScope && relation ? relation.status : item.thirdParty.status;
          const canToggleStatus = displayedStatus === 'ACTIVE' ? auth.has('third-parties:deactivate') : auth.has('third-parties:create');
          const changeStatus = () => {
            setRecord(item);
            setConfirmation(companyScope && relation
              ? { kind: 'relationship', companyId: auth.scope.companyId!, version: relation.version, status: relation.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }
              : { kind: 'status', version: item.version, status: item.thirdParty.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
          };
          return <TableRow key={item.thirdParty.id} hover>
            <TableCell>{item.thirdParty.businessName}</TableCell><TableCell>{item.thirdParty.documentNumber}</TableCell><TableCell sx={{ overflowWrap: 'anywhere' }}>{item.thirdParty.email}</TableCell>
            <TableCell><Chip size="small" label={displayedStatus === 'ACTIVE' ? 'Activo' : 'Inactivo'} color={displayedStatus === 'ACTIVE' ? 'success' : 'default'} /></TableCell>
            <TableCell>{item.thirdParty.country || '—'}</TableCell><TableCell>{item.thirdParty.department || '—'}</TableCell><TableCell>{item.thirdParty.city || '—'}</TableCell>
            <TableCell><Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {canUpdate && <Button component={Link} to={`/third-parties/${item.thirdParty.id}/edit`} size="small">Editar</Button>}
              {canToggleStatus && (global || Boolean(companyScope && relation)) && <Button size="small" color={displayedStatus === 'ACTIVE' ? 'warning' : 'primary'} onClick={changeStatus}>{displayedStatus === 'ACTIVE' ? 'Desactivar' : 'Activar'}</Button>}
            </Stack></TableCell>
          </TableRow>;
        })}</TableBody></Table>
      </DataTableSurface>}
      {list && mobile && <Stack spacing={1.5}>{list.items.map(item => {
        const relation = item.relationship;
        const displayedStatus = companyScope && relation ? relation.status : item.thirdParty.status;
        const canToggleStatus = displayedStatus === 'ACTIVE' ? auth.has('third-parties:deactivate') : auth.has('third-parties:create');
        const changeStatus = () => {
          setRecord(item);
          setConfirmation(companyScope && relation
            ? { kind: 'relationship', companyId: auth.scope.companyId!, version: relation.version, status: relation.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }
            : { kind: 'status', version: item.version, status: item.thirdParty.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
        };
        return <Card key={item.thirdParty.id} variant="outlined"><CardContent><Stack spacing={1}>
          <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>{item.thirdParty.businessName}</Typography><Typography>NIT {item.thirdParty.documentNumber}</Typography>
          <Typography sx={{ overflowWrap: 'anywhere' }}>{item.thirdParty.email}</Typography><Typography color="text.secondary">{[item.thirdParty.country, item.thirdParty.department, item.thirdParty.city].filter(Boolean).join(' · ') || 'Ubicación sin informar'}</Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}><Chip label={displayedStatus === 'ACTIVE' ? 'Activo' : 'Inactivo'} color={displayedStatus === 'ACTIVE' ? 'success' : 'default'} /></Stack>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {canUpdate && <Button component={Link} to={`/third-parties/${item.thirdParty.id}/edit`}>Editar</Button>}
            {canToggleStatus && (global || Boolean(companyScope && relation)) && <Button color={displayedStatus === 'ACTIVE' ? 'warning' : 'primary'} onClick={changeStatus}>{displayedStatus === 'ACTIVE' ? 'Desactivar' : 'Activar'}</Button>}
          </Stack>
        </Stack></CardContent></Card>;
      })}</Stack>}
    </DataTable>
    <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Filtros de terceros</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography color="text.secondary">Combina los filtros y aplícalos al listado de terceros.</Typography>
        <TextField autoFocus label="Buscar" placeholder="NIT, razón social o nombre comercial" value={draftFilters.q} onChange={event => setDraftFilters(previous => ({ ...previous, q: event.target.value }))} slotProps={{ htmlInput: { 'aria-label': 'Buscar por nombre o documento' } }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <TextField select label="Estado" value={draftFilters.status} onChange={event => setDraftFilters(previous => ({ ...previous, status: event.target.value }))}><MenuItem value="">Todos</MenuItem><MenuItem value="ACTIVE">Activo</MenuItem><MenuItem value="INACTIVE">Inactivo</MenuItem></TextField>
          <TextField label="País" value={draftFilters.country} onChange={event => setDraftFilters(previous => ({ ...previous, country: event.target.value }))} />
          <TextField label="Departamento" value={draftFilters.department} onChange={event => setDraftFilters(previous => ({ ...previous, department: event.target.value }))} />
          <TextField label="Ciudad" value={draftFilters.city} onChange={event => setDraftFilters(previous => ({ ...previous, city: event.target.value }))} />
        </Box>
      </Stack></DialogContent>
      <DialogActions><Button onClick={clearDraftFilters}>Limpiar filtros</Button><Button onClick={() => setFiltersOpen(false)}>Cancelar</Button><Button variant="contained" onClick={applyFilters}>Aplicar filtros</Button></DialogActions>
    </Dialog>
    <Dialog open={confirmation !== null} onClose={() => setConfirmation(null)}>
      <DialogTitle>{confirmation?.kind === 'relationship' ? confirmation.status === 'ACTIVE' ? 'Activar relación' : 'Desactivar relación' : confirmation?.status === 'ACTIVE' ? 'Activar tercero' : 'Desactivar tercero'}</DialogTitle>
      <DialogContent><Typography>{confirmation?.kind === 'relationship' ? 'La operación solo cambia la relación con esta empresa. Las membresías y relaciones con otras empresas no se modifican.' : 'El tercero conservará sus datos y su historial. Al desactivarlo dejará de ser elegible para nuevas operaciones.'}</Typography></DialogContent>
      <DialogActions><Button onClick={() => setConfirmation(null)}>Cancelar</Button><Button variant="contained" color={confirmation?.status === 'INACTIVE' ? 'warning' : 'primary'} onClick={confirmChange} disabled={busy}>Confirmar</Button></DialogActions>
    </Dialog>
  </Stack>;

  if (mode === 'create' || mode === 'edit') return <>
    <ThirdPartyPage api={api} context={context} authorization={authorization} mode="list" />
    <Dialog open onClose={closeModal} fullWidth maxWidth="md" scroll="paper" slotProps={{ paper: { sx: { maxHeight: 'calc(100% - 32px)' } } }}>
      <DialogTitle>{mode === 'create' ? 'Crear tercero' : 'Editar tercero'}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {mode === 'edit' && loading && <Alert severity="info" role="status" sx={{ mb: 2 }}>Cargando tercero…</Alert>}
        {(mode === 'create' || record) && <Stack id="third-party-editor-form" component="form" noValidate onSubmit={event => { event.preventDefault(); save(); }} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, alignItems: 'start', pt: 1 }}>
          <TextField label="Tipo de documento" value="NIT" disabled fullWidth />
          {editFields.map(key => <TextField key={key} required={['documentNumber', 'businessName', 'email'].includes(key)} label={labels[key]} type={key === 'email' ? 'email' : 'text'} value={form[key]} error={fieldErrors.includes(key)} helperText={fieldErrors.includes(key) ? 'Revisa este campo.' : undefined} onChange={event => { const value = event.target.value; setForm(previous => ({ ...previous, [key]: value })); setFieldErrors(previous => previous.filter(field => field !== key)); setChanged(true); }} fullWidth slotProps={{ htmlInput: { maxLength: key === 'documentNumber' ? 20 : key === 'verificationDigit' ? 1 : key === 'phone' ? 32 : ['country', 'department', 'city'].includes(key) ? 128 : key === 'email' ? 254 : 256 } }} />)}
          {mode === 'edit' && record && <Typography variant="caption" color="text.secondary" sx={{ gridColumn: { md: '1 / -1' } }}>Versión {record.version}. Actualizado {date(record.thirdParty.updatedAt)}.</Typography>}
        </Stack>}
      </DialogContent>
      <DialogActions>
        {error && mode === 'edit' && <Button disabled={busy} onClick={() => { if (!dirtyRef.current || window.confirm('¿Descartar los cambios y recargar?')) void load(); }}>Recargar datos</Button>}
        <Button onClick={closeModal} disabled={busy}>Cancelar</Button>
        <Button form="third-party-editor-form" type="submit" variant="contained" disabled={busy || requiresReload || !form.documentNumber.trim() || !form.businessName.trim() || !form.email.trim()}>{busy ? 'Guardando…' : mode === 'create' ? 'Crear tercero' : 'Guardar cambios'}</Button>
      </DialogActions>
    </Dialog>
  </>;

  return <>
    <ThirdPartyPage api={api} context={context} authorization={authorization} mode="list" />
    <Dialog open onClose={closeModal} fullWidth maxWidth="lg" scroll="paper" slotProps={{ paper: { sx: { maxHeight: 'calc(100% - 32px)' } } }}>
      <DialogTitle>Detalle del tercero</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ minWidth: 0, maxWidth: 960 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
      <Typography component="h1" variant="h4">{record?.thirdParty.businessName ?? 'Detalle de tercero'}</Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>{canUpdate && <Button component={Link} to={`/third-parties/${id}/edit`}>Editar</Button>}{global && auth.has('third-parties:deactivate') && record && <Button color={record.thirdParty.status === 'ACTIVE' ? 'warning' : 'primary'} onClick={() => setConfirmation({ kind: 'status', version: record.version, status: record.thirdParty.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>{record.thirdParty.status === 'ACTIVE' ? 'Desactivar tercero' : 'Activar tercero'}</Button>}</Stack>
    </Stack>
    {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}{notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {loading && <Alert severity="info" role="status">Cargando tercero…</Alert>}
    {record && <>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}><Stack spacing={2}>
        <Chip label={record.thirdParty.status === 'ACTIVE' ? 'Activo' : 'Inactivo'} color={record.thirdParty.status === 'ACTIVE' ? 'success' : 'default'} sx={{ alignSelf: 'start' }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          {editableFields.map(key => <Box key={key}><Typography variant="caption" color="text.secondary">{labels[key]}</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{record.thirdParty[key] || 'Sin información'}</Typography></Box>)}
          <Box><Typography variant="caption" color="text.secondary">Creado</Typography><Typography>{date(record.thirdParty.createdAt)}</Typography></Box><Box><Typography variant="caption" color="text.secondary">Actualizado</Typography><Typography>{date(record.thirdParty.updatedAt)}</Typography></Box>
        </Box>
      </Stack></Paper>
      {(companyScope || global) && canChangeRelationship && <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}><Stack spacing={1.5}>
        <Typography variant="h6">Relación con empresa</Typography>
        {companyScope ? <>
          <Typography>Empresa: {auth.scope.companyId}</Typography>
          <Chip label={record.relationship?.status === 'ACTIVE' ? 'Relación activa' : 'Relación inactiva'} color={record.relationship?.status === 'ACTIVE' ? 'success' : 'default'} sx={{ alignSelf: 'start' }} />
          {record.relationship && <Button sx={{ alignSelf: 'flex-start' }} color={record.relationship.status === 'ACTIVE' ? 'warning' : 'primary'} disabled={busy} onClick={() => setConfirmation({ kind: 'relationship', companyId: auth.scope.companyId!, version: record.relationship!.version, status: record.relationship!.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>{record.relationship.status === 'ACTIVE' ? 'Desactivar relación' : 'Reactivar relación'}</Button>}
          <Typography variant="body2" color="text.secondary">Este cambio afecta solo la relación de la empresa actual; las relaciones con otras empresas permanecen intactas.</Typography>
        </> : <>
          <TextField label="ID de empresa" value={companyId} onChange={event => { setCompanyId(event.target.value); setRelationshipView(null); setRelationshipChecked(false); }} fullWidth />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button variant="outlined" onClick={() => void queryRelationship()} disabled={busy}>Consultar relación</Button>{companyId && relationshipChecked && <Button variant="contained" onClick={() => setConfirmation({ kind: 'relationship', companyId: relationshipCompanyId, version: relationshipView?.version ?? null, status: relationshipView?.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })} disabled={busy}>{relationshipView?.status === 'ACTIVE' ? 'Desactivar relación' : relationshipView?.status === 'INACTIVE' ? 'Reactivar relación' : 'Crear relación'}</Button>}</Stack>
          {relationshipView && <Chip label={relationshipView.status === 'ACTIVE' ? 'Relación activa' : 'Relación inactiva'} color={relationshipView.status === 'ACTIVE' ? 'success' : 'default'} sx={{ alignSelf: 'start' }} />}
          <Typography variant="body2" color="text.secondary">El ID debe corresponder a una empresa activa. La relación no cambia el estado global del tercero.</Typography>
        </>}
      </Stack></Paper>}
    </>}
    <Dialog open={confirmation !== null} onClose={() => setConfirmation(null)}>
      <DialogTitle>{confirmation?.kind === 'relationship' ? confirmation.status === 'ACTIVE' ? 'Activar relación' : 'Desactivar relación' : confirmation?.status === 'ACTIVE' ? 'Activar tercero' : 'Desactivar tercero'}</DialogTitle>
      <DialogContent><Typography>{confirmation?.kind === 'relationship' ? 'La operación solo cambia la relación con esta empresa. Las membresías y relaciones con otras empresas no se modifican.' : 'El tercero conservará sus datos y su historial. Al desactivarlo dejará de ser elegible para nuevas operaciones.'}</Typography></DialogContent>
      <DialogActions><Button onClick={() => setConfirmation(null)}>Cancelar</Button><Button variant="contained" color={confirmation?.status === 'INACTIVE' ? 'warning' : 'primary'} onClick={confirmChange} disabled={busy}>Confirmar</Button></DialogActions>
    </Dialog>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={closeModal} disabled={busy}>Cerrar</Button></DialogActions>
    </Dialog>
  </>;
}
