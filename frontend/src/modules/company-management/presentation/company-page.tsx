import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useStore } from 'zustand';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import type { CompanyApi } from '../application/company-api';
import { editableFields, type CompanyRecord, type CompanyList, type CompanyField } from '../domain/company';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import { RequestError } from '@/shared/application/request-error';
import { ApplicationError } from '@/shared/application/application-error';
import { errorMessage } from '@/shared/components/error-messages';
import { TableLoadingState } from '@/shared/components/table-loading-state';
import { DataPagination } from '@/shared/components/data-pagination';
import { DataTable, DataTableAction, DataTableSortHeader, DataTableSurface } from '@/shared/components/data-table';
import { SuccessNotice } from '@/shared/components/success-notice';

const labels: Record<CompanyField, string> = { documentType: 'Tipo de documento', documentNumber: 'Número de documento', verificationDigit: 'Dígito de verificación', businessName: 'Razón social', tradeName: 'Nombre comercial', email: 'Correo electrónico', phone: 'Teléfono', address: 'Dirección', country: 'País', department: 'Departamento', city: 'Ciudad' };
const emptyForm = () => Object.fromEntries(editableFields.map(key => [key, key === 'documentType' ? 'NIT' : ''])) as Record<CompanyField, string>;
type CompanySortKey = 'businessName' | 'documentNumber' | 'status' | 'country' | 'department' | 'city';
type CompanyFilterKey = 'q' | 'status' | 'documentType' | 'country' | 'department' | 'city';
type CompanyFilters = Record<CompanyFilterKey, string>;
const emptyCompanyFilters = (): CompanyFilters => ({ q: '', status: '', documentType: '', country: '', department: '', city: '' });
function message(error: unknown) {
  if (error instanceof RequestError) return ({ COMPANY_DOCUMENT_CONFLICT: 'Ya existe una empresa con esa identificación.', COMPANY_VERSION_CONFLICT: 'La empresa cambió. Recarga los datos antes de volver a guardar.', COMPANY_INACTIVE: 'Activa la empresa antes de asociar administradores.', INVALID_ADMINISTRATOR: 'El usuario debe existir, estar habilitado y tener el rol de administrador de empresa.', INVALID_REQUEST: 'Revisa los campos obligatorios y sus formatos.' } as Record<string, string>)[error.businessCode] ?? 'No fue posible guardar.';
  return errorMessage(error instanceof ApplicationError ? error.code : 'UNEXPECTED');
}
export function CompanyPage({ api, context, authorization, mode }: { api: CompanyApi; context: ContextStore; authorization: AuthorizationStore; mode: 'list' | 'create' | 'detail' | 'edit' }) {
  const { id = '' } = useParams(); const navigate = useNavigate(); const location = useLocation(); const auth = useStore(authorization);
  const theme = useTheme(); const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [record, setRecord] = useState<CompanyRecord | null>(null); const [list, setList] = useState<CompanyList | null>(null);
  const [form, setForm] = useState(emptyForm); const [error, setError] = useState<string | null>(null); const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false); const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState({ q: '', status: '', documentType: '', country: '', department: '', city: '', sort: 'businessName', direction: 'asc', page: '1', pageSize: '20' });
  const [filtersOpen, setFiltersOpen] = useState(false); const [draftFilters, setDraftFilters] = useState<CompanyFilters>(emptyCompanyFilters);
  const [confirm, setConfirm] = useState<{ kind: 'status' } | null>(null);
  const dirty = useRef(false); const mounted = useRef(false); const generation = useRef(0); const saving = useRef(false);
  const global = auth.scope.kind === 'global';
  const authorizationAvailable = Boolean(auth.snapshot && (auth.status === 'ready' || auth.status === 'refreshing'));
  useEffect(() => {
    mounted.current = true;
    const unregister = context.register({ dirty: () => dirty.current, clear: () => {
      generation.current++; dirty.current = false; setRecord(null); setList(null); setForm(emptyForm()); setConfirm(null); setError(null); setNotice(null);
    } });
    return () => { mounted.current = false; unregister(); };
  }, [context]);
  const load = useCallback(async () => {
    const current = ++generation.current;
    // A same-scope permission refresh runs in the background. Keep the current
    // screen mounted and avoid clearing its data while that request is pending.
    if (!authorizationAvailable) return;
    if (mode === 'create') { setForm(emptyForm()); setRecord(null); dirty.current = false; }
    else if (mode !== 'list') { setRecord(null); setForm(emptyForm()); dirty.current = false; }
    let capture: ReturnType<ContextStore['capture']> | undefined;
    setLoading(true); setError(null);
    try {
      capture = context.capture();
      const listRequest = mode === 'list' || auth.has('companies:read')
        ? api.list(capture.scope, Object.fromEntries(Object.entries(query).filter(([, value]) => value !== '')), capture.signal)
        : Promise.resolve(null);
      const recordRequest = mode === 'detail' || mode === 'edit' ? api.get(capture.scope, id, capture.signal) : Promise.resolve(null);
      const [listResult, recordResult] = await Promise.allSettled([listRequest, recordRequest]);
      if (mounted.current && capture.isCurrent() && current === generation.current) {
        if (listResult.status === 'fulfilled' && listResult.value) setList(listResult.value);
        else if (listResult.status === 'rejected' && mode === 'list') throw listResult.reason;
        if (recordResult.status === 'rejected') throw recordResult.reason;
        const nextRecord = recordResult.status === 'fulfilled' ? recordResult.value : null;
        if (nextRecord) {
          setRecord(nextRecord);
          setForm(Object.fromEntries(editableFields.map(key => [key, nextRecord.company[key] ?? ''])) as Record<CompanyField, string>); dirty.current = false;
        }
      }
    } catch (failure) { if (mounted.current && current === generation.current && (!capture || capture.isCurrent())) setError(message(failure)); }
    finally { capture?.release(); if (mounted.current && current === generation.current) setLoading(false); }
  }, [api, authorizationAvailable, context, mode, id, query]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const routeState = location.state as { companyNotice?: unknown } | null;
    if (typeof routeState?.companyNotice !== 'string') return;
    setNotice(routeState.companyNotice);
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  const mutate = async (operation: (capture: ReturnType<ContextStore['capture']>) => Promise<unknown>, after: (result: unknown) => void) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(null); setFieldErrors([]); setNotice(null);
    let capture: ReturnType<ContextStore['capture']> | undefined;
    try { capture = context.capture(); const result = await operation(capture); if (mounted.current && capture.isCurrent()) after(result); }
    catch (failure) { if (mounted.current && (!capture || capture.isCurrent())) { setError(message(failure)); if (failure instanceof RequestError) setFieldErrors(failure.fields); } }
    finally { capture?.release(); saving.current = false; if (mounted.current) setBusy(false); }
  };
  const save = () => {
    const invalid = ['documentNumber', 'businessName', 'email'].filter(key => !form[key as CompanyField].trim());
    if (!/^\d{1,20}$/.test(form.documentNumber.trim())) invalid.push('documentNumber');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) invalid.push('email');
    if (form.verificationDigit && !/^\d$/.test(form.verificationDigit)) invalid.push('verificationDigit');
    if (invalid.length) { setFieldErrors(invalid); setError('Revisa los campos indicados.'); return; }
    const input = Object.fromEntries(editableFields.map(key => [key, form[key].trim() || null]));
    void mutate(capture => mode === 'create' ? api.create(capture.scope, input, capture.signal) : api.update(capture.scope, id, record!.version, input, capture.signal), () => {
      dirty.current = false;
      navigate('/companies', { state: { companyNotice: mode === 'create' ? 'Empresa creada correctamente.' : 'Empresa actualizada correctamente.' } });
    });
  };
  const confirmMutation = () => {
    if (!record || !confirm) return;
    const targetId = mode === 'list' ? record.company.id : id;
    setConfirm(null);
    void mutate(capture => api.status(capture.scope, targetId, record.version, record.company.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE', capture.signal), () => { setNotice('Cambio confirmado.'); void load(); });
  };
  const filter = (key: keyof typeof query, value: string) => setQuery(previous => ({ ...previous, [key]: value, ...(key === 'page' ? {} : { page: '1' }) }));
  const openFilters = () => { setDraftFilters({ q: query.q, status: query.status, documentType: query.documentType, country: query.country, department: query.department, city: query.city }); setFiltersOpen(true); };
  const applyFilters = () => { setQuery(previous => ({ ...previous, ...draftFilters, page: '1' })); setFiltersOpen(false); };
  const clearDraftFilters = () => setDraftFilters(emptyCompanyFilters());
  const clearFilter = (key: CompanyFilterKey) => setQuery(previous => ({ ...previous, [key]: '', page: '1' }));
  const activeFilters: { key: CompanyFilterKey; label: string }[] = [
    ...(query.q ? [{ key: 'q' as const, label: `Búsqueda: ${query.q}` }] : []),
    ...(query.status ? [{ key: 'status' as const, label: `Estado: ${query.status === 'ACTIVE' ? 'Activa' : 'Inactiva'}` }] : []),
    ...(query.documentType ? [{ key: 'documentType' as const, label: `Documento: ${query.documentType}` }] : []),
    ...(query.country ? [{ key: 'country' as const, label: `País: ${query.country}` }] : []),
    ...(query.department ? [{ key: 'department' as const, label: `Departamento: ${query.department}` }] : []),
    ...(query.city ? [{ key: 'city' as const, label: `Ciudad: ${query.city}` }] : []),
  ];
  const sortHeader = (key: CompanySortKey, label: string) => <DataTableSortHeader active={query.sort === key}
    direction={query.sort === key ? query.direction as 'asc' | 'desc' : 'asc'} onClick={() => setQuery(previous => ({ ...previous, sort: key, direction: previous.sort === key && previous.direction === 'asc' ? 'desc' : 'asc', page: '1' }))}>{label}</DataTableSortHeader>;
  const closeModal = () => {
    if (busy) return;
    if (dirty.current && !window.confirm('¿Descartar los cambios y cerrar?')) return;
    dirty.current = false;
    navigate('/companies');
  };
  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <Typography variant="h4" component="h1">Empresas</Typography>
    {mode === 'list' && error && <Alert severity="error">{error}</Alert>}{mode === 'list' && notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {mode === 'list' && loading && mobile && <Alert severity="info" role="status">Cargando empresas…</Alert>}
    {mode === 'list' && error && <Button disabled={busy} onClick={() => { if (!dirty.current || window.confirm('¿Descartar los cambios y recargar?')) void load(); }}>Recargar datos</Button>}
    {(mode === 'list' || auth.has('companies:read')) && <>

      {activeFilters.length > 0 && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>{activeFilters.map(item => <Chip key={item.key} label={item.label} onDelete={() => clearFilter(item.key)} />)}</Stack>}
      {(list || loading) && <DataTable loading={loading} toolbar={<>
        <DataTableAction label="Filtro" onClick={openFilters}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 5h18l-7.5 8.2V19l-3 1.7v-7.5L3 5z" /></SvgIcon></DataTableAction>
        {auth.has('companies:create') && global && <DataTableAction label="Crear empresa" primary onClick={() => { navigate('/companies/new'); }}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 7V3H2v18h20V7H12zm-2 12H4v-2h6v2zm0-4H4v-2h6v2zm0-4H4V9h6v2zm10 8h-8V9h8v10zm-5-8h2v2h-2zm0 4h2v2h-2zM19 1v2h2v2h-2v2h-2V5h-2V3h2V1h2z" /></SvgIcon></DataTableAction>}
      </>} pagination={list && <DataPagination page={list.page} pageSize={list.pageSize} total={list.total} label="Páginas de empresas"
        onPageChange={value => filter('page', String(value))} onPageSizeChange={value => filter('pageSize', String(value))}
        onRefresh={() => void load()} refreshLabel="Actualizar empresas" refreshDisabled={busy} /> }>
        {!loading && list?.items.length === 0 && <Alert severity="info">No hay empresas que coincidan con la consulta.</Alert>}
        {!mobile && <DataTableSurface loading={loading}><Table size="medium" aria-label="Empresas"><TableHead><TableRow>
          <TableCell sortDirection={query.sort === 'businessName' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('businessName', 'Razón social')}</TableCell>
          <TableCell sortDirection={query.sort === 'documentNumber' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('documentNumber', 'NIT')}</TableCell>
          <TableCell sortDirection={query.sort === 'status' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('status', 'Estado')}</TableCell>
          <TableCell sortDirection={query.sort === 'country' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('country', 'País')}</TableCell>
          <TableCell sortDirection={query.sort === 'department' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('department', 'Departamento')}</TableCell>
          <TableCell sortDirection={query.sort === 'city' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('city', 'Ciudad')}</TableCell>
          <TableCell>Acciones</TableCell>
        </TableRow></TableHead><TableBody>{loading ? <TableLoadingState columns={7} rows={Math.min(Number(query.pageSize), 5)} label="Cargando empresas" /> : list?.items.map(item => <TableRow key={item.company.id} hover>
          <TableCell>{item.company.businessName}</TableCell><TableCell>{item.company.documentNumber}</TableCell><TableCell><Chip size="small" label={item.company.status === 'ACTIVE' ? 'Activa' : 'Inactiva'} color={item.company.status === 'ACTIVE' ? 'success' : 'default'} /></TableCell>
          <TableCell>{item.company.country || '—'}</TableCell><TableCell>{item.company.department || '—'}</TableCell><TableCell>{item.company.city || '—'}</TableCell>
          <TableCell><Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {auth.has('companies:update') && <Button component={Link} to={`/companies/${item.company.id}/edit`} size="small">Editar</Button>}
            {global && auth.has('companies:deactivate') && <Button size="small" color={item.company.status === 'ACTIVE' ? 'warning' : 'primary'} onClick={() => { setRecord(item); setConfirm({ kind: 'status' }); }}>{item.company.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}</Button>}
          </Stack></TableCell>
        </TableRow>)}</TableBody></Table></DataTableSurface>}
        {list && mobile && <Stack spacing={1.5}>{list.items.map(item => <Card key={item.company.id} variant="outlined"><CardContent><Stack spacing={1}>
          <Typography variant="h6">{item.company.businessName}</Typography><Typography>{item.company.documentType} {item.company.documentNumber}</Typography>
          <Typography color="text.secondary">{[item.company.country, item.company.department, item.company.city].filter(Boolean).join(' · ') || 'Ubicación sin informar'}</Typography>
          <Chip label={item.company.status === 'ACTIVE' ? 'Activa' : 'Inactiva'} color={item.company.status === 'ACTIVE' ? 'success' : 'default'} sx={{ alignSelf: 'start' }} />
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {auth.has('companies:update') && <Button component={Link} to={`/companies/${item.company.id}/edit`}>Editar</Button>}
            {global && auth.has('companies:deactivate') && <Button color={item.company.status === 'ACTIVE' ? 'warning' : 'primary'} onClick={() => { setRecord(item); setConfirm({ kind: 'status' }); }}>{item.company.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}</Button>}
          </Stack></Stack></CardContent></Card>)}</Stack>}
      </DataTable>}
      <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Filtros de empresas</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
          <Typography color="text.secondary">Combina los filtros y aplícalos al listado de empresas.</Typography>
          <TextField autoFocus label="Buscar" placeholder="NIT, razón social o nombre comercial" value={draftFilters.q} onChange={event => setDraftFilters(previous => ({ ...previous, q: event.target.value }))} slotProps={{ htmlInput: { 'aria-label': 'Buscar por nombre o documento' } }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            <TextField select label="Estado" value={draftFilters.status} onChange={event => setDraftFilters(previous => ({ ...previous, status: event.target.value }))}><MenuItem value="">Todos</MenuItem><MenuItem value="ACTIVE">Activa</MenuItem><MenuItem value="INACTIVE">Inactiva</MenuItem></TextField>
            <TextField select label="Tipo de documento" value={draftFilters.documentType} onChange={event => setDraftFilters(previous => ({ ...previous, documentType: event.target.value }))}><MenuItem value="">Todos</MenuItem><MenuItem value="NIT">NIT</MenuItem></TextField>
            <TextField label="País" value={draftFilters.country} onChange={event => setDraftFilters(previous => ({ ...previous, country: event.target.value }))} />
            <TextField label="Departamento" value={draftFilters.department} onChange={event => setDraftFilters(previous => ({ ...previous, department: event.target.value }))} />
            <TextField label="Ciudad" value={draftFilters.city} onChange={event => setDraftFilters(previous => ({ ...previous, city: event.target.value }))} />
          </Box>
        </Stack></DialogContent>
        <DialogActions><Button onClick={clearDraftFilters}>Limpiar filtros</Button><Button onClick={() => setFiltersOpen(false)}>Cancelar</Button><Button variant="contained" onClick={applyFilters}>Aplicar filtros</Button></DialogActions>
      </Dialog>
    </>}
    <Dialog open={mode !== 'list'} onClose={closeModal} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle>{mode === 'create' ? 'Crear empresa' : mode === 'edit' ? 'Editar empresa' : record?.company.businessName ?? 'Detalle de empresa'}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {mode !== 'create' && loading && <Alert severity="info" role="status" sx={{ mb: 2 }}>Cargando empresa…</Alert>}
        {(mode === 'create' || mode === 'edit') && (mode === 'create' || record) && <Stack id="company-editor-form" component="form" noValidate onSubmit={event => { event.preventDefault(); save(); }} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, alignItems: 'start' }}>
          {editableFields.map(key => <TextField key={key} label={labels[key]} required={['documentType', 'documentNumber', 'businessName', 'email'].includes(key)} value={form[key]} disabled={busy || key === 'documentType'} error={fieldErrors.includes(key)} helperText={fieldErrors.includes(key) ? 'Revisa este campo.' : key === 'documentNumber' ? 'Solo dígitos, sin separadores ni dígito de verificación.' : undefined} type={key === 'email' ? 'email' : 'text'} onChange={event => { dirty.current = true; setForm(previous => ({ ...previous, [key]: event.target.value })); }} slotProps={{ htmlInput: { maxLength: key === 'documentNumber' ? 20 : key === 'verificationDigit' ? 1 : key === 'phone' ? 32 : ['country', 'department', 'city'].includes(key) ? 128 : key === 'email' ? 254 : 256 } }} />)}
        </Stack>}
        {mode === 'detail' && record && <Stack spacing={2}>
          <Chip label={record.company.status === 'ACTIVE' ? 'Activa' : 'Inactiva'} sx={{ alignSelf: 'start' }} />
          <Paper variant="outlined" sx={{ p: 2 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            {editableFields.map(key => <Box key={key}><Typography variant="caption" color="text.secondary">{labels[key]}</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{record.company[key] || 'Sin información'}</Typography></Box>)}
            <Box><Typography variant="caption" color="text.secondary">Creada</Typography><Typography>{new Date(record.company.createdAt).toLocaleString()}</Typography></Box><Box><Typography variant="caption" color="text.secondary">Actualizada</Typography><Typography>{new Date(record.company.updatedAt).toLocaleString()}</Typography></Box>
          </Box></Paper>
          <Stack spacing={1}><Typography variant="h5" component="h2">Acceso de usuarios</Typography><Typography>Invita y administra usuarios vinculados mediante pertenencias verificadas.</Typography></Stack>
        </Stack>}
      </DialogContent>
      {(mode === 'create' || mode === 'edit') && <DialogActions>
        {error && mode !== 'create' && <Button disabled={busy} onClick={() => { if (!dirty.current || window.confirm('¿Descartar los cambios y recargar?')) void load(); }}>Recargar datos</Button>}
        <Button onClick={closeModal} disabled={busy}>Cancelar</Button>
        <Button form="company-editor-form" type="submit" variant="contained" disabled={busy || !form.documentNumber.trim() || !form.businessName.trim() || !form.email.trim()}>{busy ? 'Guardando…' : 'Guardar empresa'}</Button>
      </DialogActions>}
      {mode === 'detail' && <DialogActions>
        {auth.has('companies:update') && <Button component={Link} to={`/companies/${id}/edit`}>Editar empresa</Button>}
        {global && auth.has('companies:deactivate') && <Button disabled={busy} color={record?.company.status === 'ACTIVE' ? 'warning' : 'primary'} onClick={() => setConfirm({ kind: 'status' })}>{record?.company.status === 'ACTIVE' ? 'Desactivar empresa' : 'Activar empresa'}</Button>}
        <Button component={Link} to="/invitations">Invitaciones</Button>
        <Button component={Link} to="/organization-memberships">Usuarios vinculados</Button>
        <Button onClick={closeModal}>Cerrar</Button>
      </DialogActions>}
    </Dialog>
    <Dialog open={confirm !== null} onClose={() => setConfirm(null)}><DialogTitle>{record?.company.status === 'ACTIVE' ? 'Desactivar empresa' : 'Activar empresa'}</DialogTitle><DialogContent><Typography>{record?.company.status === 'ACTIVE' ? 'La empresa dejará de estar disponible como contexto operativo. Se conservarán sus datos y asociaciones.' : 'La empresa volverá a estar disponible para asociaciones activas y permisos vigentes. Las asociaciones revocadas seguirán inactivas.'}</Typography></DialogContent><DialogActions><Button onClick={() => setConfirm(null)}>Cancelar</Button><Button color={record?.company.status === 'ACTIVE' ? 'error' : 'primary'} variant="contained" onClick={confirmMutation} disabled={busy}>Confirmar</Button></DialogActions></Dialog>
  </Stack>;
}
