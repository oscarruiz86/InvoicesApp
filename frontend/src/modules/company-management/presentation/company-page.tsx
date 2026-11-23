import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useStore } from 'zustand';
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
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
import { PageHeader } from '@/shared/components/page-header';
import { SuccessNotice } from '@/shared/components/success-notice';
import { AppliedFilters } from '@/shared/components/applied-filters';
import { ListFilterDialog } from '@/shared/components/list-filter-dialog';
import { MobileSortControl } from '@/shared/components/mobile-sort-control';
import { StatusChip } from '@/shared/components/status-chip';
import { RecordMetadata } from '@/shared/components/record-metadata';
import { ListFeedback } from '@/shared/components/list-feedback';
import { FormDialog } from '@/shared/components/form-dialog';

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
  const routeState = location.state as { companyNotice?: unknown; listSnapshot?: CompanyList; listQuery?: { q: string; status: string; documentType: string; country: string; department: string; city: string; sort: string; direction: string; page: string; pageSize: string } } | null;
  const theme = useTheme(); const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [record, setRecord] = useState<CompanyRecord | null>(null); const [list, setList] = useState<CompanyList | null>(() => routeState?.listSnapshot ?? null);
  const [form, setForm] = useState(emptyForm); const [error, setError] = useState<string | null>(null); const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false); const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState(() => routeState?.listQuery ?? ({ q: '', status: '', documentType: '', country: '', department: '', city: '', sort: 'businessName', direction: 'asc', page: '1', pageSize: '20' }));
  const [filtersOpen, setFiltersOpen] = useState(false); const [draftFilters, setDraftFilters] = useState<CompanyFilters>(emptyCompanyFilters);
  const [confirm, setConfirm] = useState<{ kind: 'status' } | null>(null);
  const dirty = useRef(false); const mounted = useRef(false); const generation = useRef(0); const saving = useRef(false);
  const restoreListOnReturn = useRef(Boolean(routeState?.listSnapshot));
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
      const listRequest = mode === 'list' && !routeState?.listSnapshot
        ? api.list(capture.scope, Object.fromEntries(Object.entries(query).filter(([, value]) => value !== '')), capture.signal)
        : Promise.resolve(routeState?.listSnapshot ?? null);
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
  }, [api, authorizationAvailable, context, mode, id, query, routeState?.listSnapshot]);
  useEffect(() => {
    if (mode !== 'list' && routeState?.listSnapshot) restoreListOnReturn.current = true;
    if (mode === 'list' && restoreListOnReturn.current && routeState?.listSnapshot) {
      restoreListOnReturn.current = false;
      setList(routeState.listSnapshot);
      setLoading(false);
      return;
    }
    void load();
  }, [load, mode, routeState?.listSnapshot]);
  useEffect(() => {
    if (typeof routeState?.companyNotice !== 'string') return;
    setNotice(routeState.companyNotice);
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [location.hash, location.pathname, location.search, location.state, navigate, routeState?.companyNotice]);

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
  const applyFilters = () => { const changed = Object.entries(draftFilters).some(([key, value]) => query[key as keyof typeof query] !== value); if (changed) setQuery(previous => ({ ...previous, ...draftFilters, page: '1' })); setFiltersOpen(false); };
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
    navigate('/companies', { state: routeState?.listSnapshot ? { listSnapshot: routeState.listSnapshot, listQuery: routeState.listQuery } : null });
  };
  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <PageHeader title="Empresas" />
    {mode === 'list' && error && <Alert severity="error">{error}</Alert>}{mode === 'list' && notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {mode === 'list' && loading && mobile && <ListFeedback kind="loading" title="Cargando empresas…">Estamos consultando los registros.</ListFeedback>}
    {mode === 'list' && error && <Button disabled={busy} onClick={() => { if (!dirty.current || window.confirm('¿Descartar los cambios y recargar?')) void load(); }}>Recargar datos</Button>}
    {(mode === 'list' || auth.has('companies:read')) && <>

      <AppliedFilters filters={activeFilters} onRemove={key => clearFilter(key as CompanyFilterKey)} onClear={() => setQuery(previous => ({ ...previous, ...emptyCompanyFilters(), page: '1' }))} />
      {(list || loading) && <DataTable loading={loading} mobileSortAction={<MobileSortControl fields={[
        { key: 'businessName', label: 'Razón social' }, { key: 'documentNumber', label: 'NIT' }, { key: 'status', label: 'Estado' },
        { key: 'country', label: 'País' }, { key: 'department', label: 'Departamento' }, { key: 'city', label: 'Ciudad' },
      ]} sortBy={query.sort} direction={query.direction as 'asc' | 'desc'} onChange={(sort, direction) => setQuery(previous => ({ ...previous, sort, direction, page: '1' }))} />} toolbar={<>
        {auth.has('companies:create') && global && <DataTableAction label="Crear empresa" primary onClick={() => { navigate('/companies/new', { state: { listSnapshot: list, listQuery: query } }); }}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 7V3H2v18h20V7H12zm-2 12H4v-2h6v2zm0-4H4v-2h6v2zm0-4H4V9h6v2zm10 8h-8V9h8v10zm-5-8h2v2h-2zm0 4h2v2h-2zM19 1v2h2v2h-2v2h-2V5h-2V3h2V1h2z" /></SvgIcon></DataTableAction>}
        <DataTableAction label="Filtro" onClick={openFilters}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 5h18l-7.5 8.2V19l-3 1.7v-7.5L3 5z" /></SvgIcon></DataTableAction>
      </>} pagination={list && <DataPagination page={list.page} pageSize={list.pageSize} total={list.total} label="Páginas de empresas"
        onPageChange={value => filter('page', String(value))} onPageSizeChange={value => filter('pageSize', String(value))}
        onRefresh={() => void load()} refreshLabel="Actualizar empresas" refreshDisabled={busy} /> }>
        {!loading && list?.items.length === 0 && <ListFeedback kind="empty" title="No hay empresas que coincidan con la consulta.">Ajusta la búsqueda o limpia los filtros.</ListFeedback>}
        {!mobile && <DataTableSurface loading={loading}><Table size="medium" aria-label="Empresas" sx={{ width: '100%', tableLayout: 'fixed', '& .MuiTableCell-root': { minWidth: 0, overflowWrap: 'anywhere' } }}><TableHead><TableRow>
          <TableCell sortDirection={query.sort === 'businessName' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('businessName', 'Razón social')}</TableCell>
          <TableCell sortDirection={query.sort === 'documentNumber' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('documentNumber', 'NIT')}</TableCell>
          <TableCell sortDirection={query.sort === 'status' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('status', 'Estado')}</TableCell>
          <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }} sortDirection={query.sort === 'country' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('country', 'País')}</TableCell>
          <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }} sortDirection={query.sort === 'department' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('department', 'Departamento')}</TableCell>
          <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }} sortDirection={query.sort === 'city' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('city', 'Ciudad')}</TableCell>
          <TableCell>Acciones</TableCell>
        </TableRow></TableHead><TableBody>{loading ? <TableLoadingState columns={7} rows={Math.min(Number(query.pageSize), 5)} label="Cargando empresas" /> : list?.items.map(item => <TableRow key={item.company.id} hover>
          <TableCell sx={{ overflowWrap: 'anywhere' }}>{item.company.businessName}</TableCell><TableCell>{item.company.documentNumber}</TableCell><TableCell><StatusChip label={item.company.status === 'ACTIVE' ? 'Activa' : 'Inactiva'} tone={item.company.status === 'ACTIVE' ? 'success' : 'danger'} /></TableCell>
          <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>{item.company.country || '—'}</TableCell><TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>{item.company.department || '—'}</TableCell><TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>{item.company.city || '—'}</TableCell>
          <TableCell><Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'flex-start', alignItems: 'center' }}>
            <DataTableAction label="Consultar empresa" onClick={() => navigate(`/companies/${item.company.id}`, { state: { listSnapshot: list, listQuery: query } })}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 5c-5 0-9.27 3.11-11 7 1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></SvgIcon></DataTableAction>
            {auth.has('companies:update') && <DataTableAction label="Editar empresa" onClick={() => navigate(`/companies/${item.company.id}/edit`, { state: { listSnapshot: list, listQuery: query } })}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75-11.06 11.06Zm17.71-10.04a1 1 0 0 0 0-1.41l-2.51-2.51a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 2-1.66Z" /></SvgIcon></DataTableAction>}
            {global && auth.has('companies:deactivate') && <DataTableAction label={item.company.status === 'ACTIVE' ? 'Desactivar empresa' : 'Activar empresa'} onClick={() => { setRecord(item); setConfirm({ kind: 'status' }); }}><SvgIcon fontSize="small" aria-hidden="true"><path d={item.company.status === 'ACTIVE' ? 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 11H7v-2h10v2Z' : 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5v4h4v2h-4v4h-2v-4H7v-2h4V7h2Z'} /></SvgIcon></DataTableAction>}
          </Stack></TableCell>
        </TableRow>)}</TableBody></Table></DataTableSurface>}
        {list && mobile && <Stack spacing={1.5}>{list.items.map(item => <Card key={item.company.id} variant="outlined"><CardContent><Stack spacing={1}>
          <Typography variant="h6">{item.company.businessName}</Typography><Typography>{item.company.documentType} {item.company.documentNumber}</Typography>
          <Typography color="text.secondary">{[item.company.country, item.company.department, item.company.city].filter(Boolean).join(' · ') || 'Ubicación sin informar'}</Typography>
          <StatusChip label={item.company.status === 'ACTIVE' ? 'Activa' : 'Inactiva'} tone={item.company.status === 'ACTIVE' ? 'success' : 'danger'} />
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Button component={Link} to={`/companies/${item.company.id}`} state={{ listSnapshot: list, listQuery: query }}>Consultar</Button>
            {auth.has('companies:update') && <Button component={Link} to={`/companies/${item.company.id}/edit`} state={{ listSnapshot: list, listQuery: query }}>Editar</Button>}
            {global && auth.has('companies:deactivate') && <Button color={item.company.status === 'ACTIVE' ? 'warning' : 'primary'} onClick={() => { setRecord(item); setConfirm({ kind: 'status' }); }}>{item.company.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}</Button>}
          </Stack></Stack></CardContent></Card>)}</Stack>}
      </DataTable>}
      <ListFilterDialog open={filtersOpen} onClose={() => setFiltersOpen(false)} onApply={applyFilters} title="Filtros de empresas" leadingAction={<Button onClick={clearDraftFilters}>Limpiar filtros</Button>}>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography color="text.secondary">Combina los filtros y aplícalos al listado de empresas.</Typography>
          <TextField autoFocus label="Buscar" placeholder="NIT, razón social o nombre comercial" value={draftFilters.q} onChange={event => setDraftFilters(previous => ({ ...previous, q: event.target.value }))} slotProps={{ htmlInput: { 'aria-label': 'Buscar por nombre o documento' } }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            <TextField select label="Estado" value={draftFilters.status} onChange={event => setDraftFilters(previous => ({ ...previous, status: event.target.value }))}><MenuItem value="">Todos</MenuItem><MenuItem value="ACTIVE">Activa</MenuItem><MenuItem value="INACTIVE">Inactiva</MenuItem></TextField>
            <TextField select label="Tipo de documento" value={draftFilters.documentType} onChange={event => setDraftFilters(previous => ({ ...previous, documentType: event.target.value }))}><MenuItem value="">Todos</MenuItem><MenuItem value="NIT">NIT</MenuItem></TextField>
            <TextField label="País" value={draftFilters.country} onChange={event => setDraftFilters(previous => ({ ...previous, country: event.target.value }))} />
            <TextField label="Departamento" value={draftFilters.department} onChange={event => setDraftFilters(previous => ({ ...previous, department: event.target.value }))} />
            <TextField label="Ciudad" value={draftFilters.city} onChange={event => setDraftFilters(previous => ({ ...previous, city: event.target.value }))} />
          </Box>
        </Stack>
      </ListFilterDialog>
    </>}
    <FormDialog open={mode !== 'list'} onClose={closeModal} busy={busy} maxWidth="md" title={mode === 'create' ? 'Crear empresa' : mode === 'edit' ? 'Editar empresa' : record?.company.businessName ?? 'Detalle de empresa'} actions={<>
      {(mode === 'create' || mode === 'edit') && <>
        {error && mode !== 'create' && <Button disabled={busy} onClick={() => { if (!dirty.current || window.confirm('¿Descartar los cambios y recargar?')) void load(); }}>Recargar datos</Button>}
        <Button onClick={closeModal} disabled={busy}>Cancelar</Button>
        <Button form="company-editor-form" type="submit" variant="contained" disabled={busy || !form.documentNumber.trim() || !form.businessName.trim() || !form.email.trim()}>{busy ? 'Guardando…' : 'Guardar empresa'}</Button>
      </>}
      {mode === 'detail' && <Button onClick={closeModal}>Cerrar</Button>}
    </>}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {mode !== 'create' && loading && <Alert severity="info" role="status" sx={{ mb: 2 }}>Cargando empresa…</Alert>}
        {(mode === 'create' || mode === 'edit') && (mode === 'create' || record) && <Stack id="company-editor-form" component="form" noValidate onSubmit={event => { event.preventDefault(); save(); }} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, alignItems: 'start' }}>
          {editableFields.map(key => <TextField key={key} label={labels[key]} required={['documentType', 'documentNumber', 'businessName', 'email'].includes(key)} value={form[key]} disabled={busy || key === 'documentType'} error={fieldErrors.includes(key)} helperText={fieldErrors.includes(key) ? 'Revisa este campo.' : key === 'documentNumber' ? 'Solo dígitos, sin separadores ni dígito de verificación.' : undefined} type={key === 'email' ? 'email' : 'text'} onChange={event => { dirty.current = true; setForm(previous => ({ ...previous, [key]: event.target.value })); }} slotProps={{ htmlInput: { maxLength: key === 'documentNumber' ? 20 : key === 'verificationDigit' ? 1 : key === 'phone' ? 32 : ['country', 'department', 'city'].includes(key) ? 128 : key === 'email' ? 254 : 256 } }} />)}
        </Stack>}
        {mode === 'detail' && record && <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            {editableFields.map(key => <Box key={key}><Typography variant="caption" color="text.secondary">{labels[key]}</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{record.company[key] || 'Sin información'}</Typography></Box>)}
            <Box><Typography variant="caption" color="text.secondary">Estado</Typography><Box sx={{ mt: .5 }}><StatusChip label={record.company.status === 'ACTIVE' ? 'Activa' : 'Inactiva'} tone={record.company.status === 'ACTIVE' ? 'success' : 'danger'} /></Box></Box>
            <RecordMetadata createdAt={record.company.createdAt} updatedAt={record.company.updatedAt} formatDate={value => new Date(value).toLocaleString('es-CO')} />
          </Box></Paper>
        </Stack>}
    </FormDialog>
    <Dialog open={confirm !== null} onClose={() => setConfirm(null)}><DialogTitle>{record?.company.status === 'ACTIVE' ? 'Desactivar empresa' : 'Activar empresa'}</DialogTitle><DialogContent><Typography>{record?.company.status === 'ACTIVE' ? 'La empresa dejará de estar disponible como contexto operativo. Se conservarán sus datos y asociaciones.' : 'La empresa volverá a estar disponible para asociaciones activas y permisos vigentes. Las asociaciones revocadas seguirán inactivas.'}</Typography></DialogContent><DialogActions><Button onClick={() => setConfirm(null)}>Cancelar</Button><Button color={record?.company.status === 'ACTIVE' ? 'error' : 'primary'} variant="contained" onClick={confirmMutation} disabled={busy}>Confirmar</Button></DialogActions></Dialog>
  </Stack>;
}
