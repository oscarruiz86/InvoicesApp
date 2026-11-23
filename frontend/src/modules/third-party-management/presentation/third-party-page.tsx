import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useStore } from 'zustand';
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import type { ThirdPartyApi } from '../application/third-party-api';
import { editableFields, type ThirdPartyField, type ThirdPartyList, type ThirdPartyRecord } from '../domain/third-party';
import type { CompanyApi } from '@/modules/company-management/application/company-api';
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
import { CompanySelectionField } from '@/shared/components/company-selection-field';
import { CompanyPickerDialog } from '@/shared/components/company-picker-dialog';
import type { CompanyRecord } from '@/modules/company-management/domain/company';

const labels: Record<ThirdPartyField, string> = { documentType: 'Tipo de documento', documentNumber: 'NIT', verificationDigit: 'Dígito de verificación', businessName: 'Razón social', tradeName: 'Nombre comercial', email: 'Correo electrónico', phone: 'Teléfono', address: 'Dirección', country: 'País', department: 'Departamento', city: 'Ciudad' };
const emptyForm = () => Object.fromEntries(editableFields.map(key => [key, key === 'documentType' ? 'NIT' : ''])) as Record<ThirdPartyField, string>;
type ThirdPartySortKey = 'businessName' | 'documentNumber' | 'status' | 'country' | 'department' | 'city';
type ThirdPartyFilterKey = 'q' | 'status' | 'country' | 'department' | 'city' | 'relatedCompanyId';
type ThirdPartyFilters = Record<ThirdPartyFilterKey, string>;
const emptyThirdPartyFilters = (): ThirdPartyFilters => ({ q: '', status: '', country: '', department: '', city: '', relatedCompanyId: '' });
const emptyThirdPartyQuery = () => ({ ...emptyThirdPartyFilters(), sort: 'businessName', direction: 'asc', page: '1', pageSize: '20' });
type Confirmation = { kind: 'status' | 'relationship'; status: 'ACTIVE' | 'INACTIVE'; companyId?: string; version: string | null } | null;
function message(error: unknown) {
  if (error instanceof RequestError) return ({ THIRD_PARTY_DOCUMENT_CONFLICT: 'Ya existe un tercero con ese NIT.', THIRD_PARTY_VERSION_CONFLICT: 'El tercero o la relación cambió. Recarga los datos antes de volver a guardar.', THIRD_PARTY_INACTIVE: 'Activa el tercero antes de crear una relación.', INVALID_REQUEST: 'Revisa los campos obligatorios y sus formatos.' } as Record<string, string>)[error.businessCode] ?? 'No fue posible completar la operación.';
  return errorMessage(error instanceof ApplicationError ? error.code : 'UNEXPECTED');
}
const date = (value: string) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function ThirdPartyPage({ api, context, authorization, companies, mode }: { api: ThirdPartyApi; context: ContextStore; authorization: AuthorizationStore; companies?: CompanyApi; mode: 'list' | 'create' | 'detail' | 'edit' }) {
  const { id = '' } = useParams(); const location = useLocation(); const navigate = useNavigate(); const auth = useStore(authorization); const contextState = useStore(context);
  const routeState = location.state as { thirdPartyNotice?: unknown; listSnapshot?: ThirdPartyList; listQuery?: ReturnType<typeof emptyThirdPartyQuery> } | null;
  const theme = useTheme(); const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [record, setRecord] = useState<ThirdPartyRecord | null>(null); const [list, setList] = useState<ThirdPartyList | null>(() => routeState?.listSnapshot ?? null);
  const [form, setForm] = useState(emptyForm); const [error, setError] = useState<string | null>(null); const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]); const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false); const [requiresReload, setRequiresReload] = useState(false);
  const [query, setQuery] = useState(() => routeState?.listQuery ?? emptyThirdPartyQuery()); const [filtersOpen, setFiltersOpen] = useState(false); const [draftFilters, setDraftFilters] = useState<ThirdPartyFilters>(emptyThirdPartyFilters);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false); const [companyPickerForFilters, setCompanyPickerForFilters] = useState(false); const [draftCompanyName, setDraftCompanyName] = useState(''); const [createCompanyId, setCreateCompanyId] = useState(''); const [createCompanyName, setCreateCompanyName] = useState('');
  const [companyOptions, setCompanyOptions] = useState<readonly { id: string; name: string }[]>([]);
  const generation = useRef(0); const mounted = useRef(false); const saving = useRef(false); const dirtyRef = useRef(false);
  const restoreListOnReturn = useRef(Boolean(routeState?.listSnapshot));
  const global = auth.scope.kind === 'global'; const companyScope = auth.scope.kind === 'organization' && Boolean(auth.scope.companyId);
  const authorized = Boolean(auth.snapshot && (auth.status === 'ready' || auth.status === 'refreshing'));
  const setChanged = useCallback((next: boolean) => { dirtyRef.current = next; }, []);

  useEffect(() => {
    mounted.current = true;
    const unregister = context.register({ dirty: () => dirtyRef.current, clear: () => {
      generation.current++; setRecord(null); setList(null); setForm(emptyForm()); setConfirmation(null); setError(null); setNotice(null); dirtyRef.current = false;
    } });
    return () => { mounted.current = false; unregister(); };
  }, [context, setChanged]);

  const load = useCallback(async () => {
    const current = ++generation.current;
    if (!authorized || contextState.status !== 'ready') return;
    if (mode === 'create') { setRecord(null); setForm(emptyForm()); setChanged(false); }
    else if (mode !== 'list') { setRecord(null); setForm(emptyForm()); setChanged(false); }
    let capture: ReturnType<ContextStore['capture']> | undefined;
    setLoading(true); setError(null);
    try {
      capture = context.capture();
      const listRequest = mode === 'list' && !routeState?.listSnapshot && authorization.getState().has('third-parties:read')
        ? api.list(capture.scope, Object.fromEntries(Object.entries(query).filter(([, value]) => value !== '')), capture.signal)
        : Promise.resolve(routeState?.listSnapshot ?? null);
      const recordRequest = mode === 'detail' || mode === 'edit' ? api.get(capture.scope, id, capture.signal) : Promise.resolve(null);
      const [listResult, recordResult] = await Promise.allSettled([listRequest, recordRequest]);
      if (mounted.current && current === generation.current && capture.isCurrent()) {
        if (listResult.status === 'fulfilled' && listResult.value) setList(listResult.value);
        else if (listResult.status === 'rejected' && mode === 'list') throw listResult.reason;
        if (recordResult.status === 'rejected') throw recordResult.reason;
        const nextRecord = recordResult.status === 'fulfilled' ? recordResult.value : null;
        if (nextRecord) {
          setRecord(nextRecord); setForm(Object.fromEntries(editableFields.map(key => [key, nextRecord.thirdParty[key] ?? ''])) as Record<ThirdPartyField, string>); setRequiresReload(false);
          setChanged(false);
        }
      }
    } catch (failure) { if (mounted.current && current === generation.current && (!capture || capture.isCurrent())) setError(message(failure)); }
    finally { capture?.release(); if (mounted.current && current === generation.current) setLoading(false); }
  }, [api, authorization, authorized, context, contextState.status, id, mode, query, routeState?.listSnapshot, setChanged]);
  const invalidatePendingLoad = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    if (mode !== 'list' && routeState?.listSnapshot) restoreListOnReturn.current = true;
    if (mode === 'list' && restoreListOnReturn.current && routeState?.listSnapshot) { restoreListOnReturn.current = false; setList(routeState.listSnapshot); setLoading(false); return; }
    void load(); return invalidatePendingLoad;
  }, [invalidatePendingLoad, load, mode, routeState?.listSnapshot]);
  useEffect(() => {
    if (typeof routeState?.thirdPartyNotice !== 'string') return;
    setNotice(routeState.thirdPartyNotice);
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [location.hash, location.pathname, location.search, location.state, navigate, routeState?.thirdPartyNotice]);
  useEffect(() => {
    if (!filtersOpen || !global || !companies || !authorized) return;
    const controller = new AbortController();
    void companies.list(auth.scope, { page: '1', pageSize: '100', sort: 'businessName', direction: 'asc' }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setCompanyOptions(result.items.map(item => ({ id: item.company.id, name: item.company.businessName ?? item.company.tradeName ?? item.company.id }))); })
      .catch(() => { if (!controller.signal.aborted) setCompanyOptions([]); });
    return () => controller.abort();
  }, [auth.scope, authorized, companies, filtersOpen, global]);

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
    const requiresRelatedCompany = mode === 'create' && global && Boolean(auth.snapshot?.roles.includes('APP_ADMIN'));
    if (requiresRelatedCompany && !createCompanyId) invalid.push('relatedCompanyId');
    if (invalid.length) { setFieldErrors(invalid); setError(requiresRelatedCompany && !createCompanyId ? 'Selecciona la empresa a la que se asociará el tercero.' : 'Revisa los campos indicados.'); return; }
    const input = Object.fromEntries(editableFields.map(key => [key, form[key].trim() || null]));
    void mutate((scope, signal) => mode === 'create' ? api.create(scope, input, signal, requiresRelatedCompany ? createCompanyId : undefined) : api.update(scope, id, record!.version, input, signal), () => {
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
      setNotice('Cambio confirmado.');
      if (action.kind === 'status') void load();
    });
  };

  const filter = (key: keyof ReturnType<typeof emptyThirdPartyQuery>, value: string) => setQuery(previous => ({ ...previous, [key]: value, ...(key === 'page' ? {} : { page: '1' }) }));
  const openFilters = () => { setDraftFilters({ q: query.q, status: query.status, country: query.country, department: query.department, city: query.city, relatedCompanyId: query.relatedCompanyId }); setDraftCompanyName(companyOptions.find(option => option.id === query.relatedCompanyId)?.name ?? ''); setFiltersOpen(true); };
  const applyFilters = () => { const changed = Object.entries(draftFilters).some(([key, value]) => query[key as keyof typeof query] !== value); if (changed) setQuery(previous => ({ ...previous, ...draftFilters, page: '1' })); setFiltersOpen(false); };
  const clearDraftFilters = () => setDraftFilters(emptyThirdPartyFilters());
  const clearFilter = (key: ThirdPartyFilterKey) => filter(key, '');
  const activeFilters: { key: ThirdPartyFilterKey; label: string }[] = [
    ...(query.q ? [{ key: 'q' as const, label: `Búsqueda: ${query.q}` }] : []),
    ...(query.status ? [{ key: 'status' as const, label: `Estado: ${query.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}` }] : []),
    ...(query.country ? [{ key: 'country' as const, label: `País: ${query.country}` }] : []),
    ...(query.department ? [{ key: 'department' as const, label: `Departamento: ${query.department}` }] : []),
    ...(query.city ? [{ key: 'city' as const, label: `Ciudad: ${query.city}` }] : []),
    ...(query.relatedCompanyId ? [{ key: 'relatedCompanyId' as const, label: `Empresa: ${companyOptions.find(option => option.id === query.relatedCompanyId)?.name ?? query.relatedCompanyId}` }] : []),
  ];
  const sortHeader = (key: ThirdPartySortKey, label: string) => <DataTableSortHeader active={query.sort === key}
    direction={query.sort === key ? query.direction as 'asc' | 'desc' : 'asc'} onClick={() => setQuery(previous => ({ ...previous,
      sort: key, direction: previous.sort === key && previous.direction === 'asc' ? 'desc' : 'asc', page: '1' }))}>{label}</DataTableSortHeader>;
  const closeModal = () => {
    if (busy) return;
    if (dirtyRef.current && !window.confirm('¿Descartar los cambios y cerrar?')) return;
    setChanged(false); navigate('/third-parties', { state: routeState?.listSnapshot ? { listSnapshot: routeState.listSnapshot, listQuery: routeState.listQuery } : null });
  };

  const canUpdate = auth.has('third-parties:update'); const canCreate = auth.has('third-parties:create');
  const editFields = editableFields.filter(key => key !== 'documentType');

  if (mode === 'list') return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <PageHeader title="Terceros" />
    <AppliedFilters filters={activeFilters} onRemove={key => clearFilter(key as ThirdPartyFilterKey)} onClear={() => setQuery(previous => ({ ...previous, ...emptyThirdPartyFilters(), page: '1' }))} />
    {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}{notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {loading && mobile && <ListFeedback kind="loading" title="Cargando terceros…">Estamos consultando los registros.</ListFeedback>}
    {error && <Button disabled={busy} onClick={() => void load()}>Recargar datos</Button>}
    <DataTable loading={loading} mobileSortAction={<MobileSortControl fields={[
      { key: 'businessName', label: 'Razón social' }, { key: 'documentNumber', label: 'NIT' }, { key: 'status', label: 'Estado' },
      { key: 'country', label: 'País' }, { key: 'department', label: 'Departamento' }, { key: 'city', label: 'Ciudad' },
    ]} sortBy={query.sort} direction={query.direction as 'asc' | 'desc'} onChange={(sort, direction) => setQuery(previous => ({ ...previous, sort, direction, page: '1' }))} />} toolbar={<>
        {canCreate && <DataTableAction label="Crear tercero" primary onClick={() => navigate('/third-parties/new', { state: { listSnapshot: list, listQuery: query } })}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 7V3H2v18h20V7H12zm-2 12H4v-2h6v2zm0-4H4v-2h6v2zm0-4H4V9h6v2zm10 8h-8V9h8v10zm-5-8h2v2h-2zm0 4h2v2h-2zM19 1v2h2v2h-2v2h-2V5h-2V3h2V1h2z" /></SvgIcon></DataTableAction>}
      <DataTableAction label="Filtro" onClick={openFilters}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 5h18l-7.5 8.2V19l-3 1.7v-7.5L3 5z" /></SvgIcon></DataTableAction>
    </>} pagination={list && <DataPagination page={Number(query.page)} pageSize={list.pageSize} total={list.total} disabled={loading} label="Páginas de terceros"
      onPageChange={value => filter('page', String(value))} onPageSizeChange={value => filter('pageSize', String(value))} onRefresh={() => void load()} refreshLabel="Actualizar terceros" refreshDisabled={busy} />}>
      {list && !loading && !list.total && <ListFeedback kind="empty" title="No hay terceros que coincidan con la consulta.">Ajusta la búsqueda o limpia los filtros.</ListFeedback>}
      {!mobile && (list || loading) && <DataTableSurface loading={loading}>
        <Table size="medium" aria-label="Terceros" sx={{ width: '100%', tableLayout: 'fixed', '& .MuiTableCell-root': { overflowWrap: 'anywhere', minWidth: 0 } }}><TableHead><TableRow>
          <TableCell sortDirection={query.sort === 'businessName' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('businessName', 'Razón social')}</TableCell><TableCell>Empresa</TableCell>
          <TableCell sortDirection={query.sort === 'documentNumber' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('documentNumber', 'NIT')}</TableCell>
          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Correo</TableCell>
          <TableCell sortDirection={query.sort === 'status' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('status', 'Estado')}</TableCell>
          <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }} sortDirection={query.sort === 'country' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('country', 'País')}</TableCell>
          <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }} sortDirection={query.sort === 'department' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('department', 'Departamento')}</TableCell>
          <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }} sortDirection={query.sort === 'city' ? query.direction as 'asc' | 'desc' : false}>{sortHeader('city', 'Ciudad')}</TableCell><TableCell>Acciones</TableCell>
        </TableRow></TableHead><TableBody>{loading ? <TableLoadingState columns={9} rows={5} label="Cargando terceros" responsiveLayouts={[
          { columns: 6, rowSx: { display: { xs: 'none', md: 'table-row', xl: 'none' } } },
          { columns: 9, rowSx: { display: { xs: 'none', xl: 'table-row' } } },
        ]} /> : list?.items.map(item => {
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
            <TableCell>{item.thirdParty.businessName}</TableCell><TableCell sx={{ overflowWrap: 'anywhere' }}>{item.relatedCompanies?.map(company => company.name).join(', ') || '—'}</TableCell><TableCell>{item.thirdParty.documentNumber}</TableCell><TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, overflowWrap: 'anywhere' }}>{item.thirdParty.email}</TableCell>
            <TableCell><StatusChip label={displayedStatus === 'ACTIVE' ? 'Activo' : 'Inactivo'} tone={displayedStatus === 'ACTIVE' ? 'success' : 'danger'} /></TableCell>
            <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>{item.thirdParty.country || '—'}</TableCell><TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>{item.thirdParty.department || '—'}</TableCell><TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>{item.thirdParty.city || '—'}</TableCell>
            <TableCell><Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'flex-start', alignItems: 'center' }}>
              <DataTableAction label="Consultar tercero" onClick={() => navigate(`/third-parties/${item.thirdParty.id}`, { state: { listSnapshot: list, listQuery: query } })}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 5c-5 0-9.27 3.11-11 7 1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></SvgIcon></DataTableAction>
              {canUpdate && <DataTableAction label="Editar tercero" onClick={() => navigate(`/third-parties/${item.thirdParty.id}/edit`, { state: { listSnapshot: list, listQuery: query } })}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75-11.06 11.06Zm17.71-10.04a1 1 0 0 0 0-1.41l-2.51-2.51a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 2-1.66Z" /></SvgIcon></DataTableAction>}
              {canToggleStatus && (global || Boolean(companyScope && relation)) && <DataTableAction label={displayedStatus === 'ACTIVE' ? 'Desactivar tercero' : 'Activar tercero'} onClick={changeStatus}><SvgIcon fontSize="small" aria-hidden="true"><path d={displayedStatus === 'ACTIVE' ? 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 11H7v-2h10v2Z' : 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5v4h4v2h-4v4h-2v-4H7v-2h4V7h2Z'} /></SvgIcon></DataTableAction>}
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
          <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>{item.thirdParty.businessName}</Typography><Typography>Empresa: {item.relatedCompanies?.map(company => company.name).join(', ') || '—'}</Typography><Typography>NIT {item.thirdParty.documentNumber}</Typography>
          <Typography sx={{ overflowWrap: 'anywhere' }}>{item.thirdParty.email}</Typography><Typography color="text.secondary">{[item.thirdParty.country, item.thirdParty.department, item.thirdParty.city].filter(Boolean).join(' · ') || 'Ubicación sin informar'}</Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}><StatusChip label={displayedStatus === 'ACTIVE' ? 'Activo' : 'Inactivo'} tone={displayedStatus === 'ACTIVE' ? 'success' : 'danger'} /></Stack>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Button component={Link} to={`/third-parties/${item.thirdParty.id}`} state={{ listSnapshot: list, listQuery: query }}>Consultar</Button>
            {canUpdate && <Button component={Link} to={`/third-parties/${item.thirdParty.id}/edit`} state={{ listSnapshot: list, listQuery: query }}>Editar</Button>}
            {canToggleStatus && (global || Boolean(companyScope && relation)) && <Button color={displayedStatus === 'ACTIVE' ? 'warning' : 'primary'} onClick={changeStatus}>{displayedStatus === 'ACTIVE' ? 'Desactivar' : 'Activar'}</Button>}
          </Stack>
        </Stack></CardContent></Card>;
      })}</Stack>}
    </DataTable>
    <ListFilterDialog open={filtersOpen} onClose={() => setFiltersOpen(false)} onApply={applyFilters} title="Filtros de terceros" leadingAction={<Button onClick={clearDraftFilters}>Limpiar filtros</Button>}>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography color="text.secondary">Combina los filtros y aplícalos al listado de terceros.</Typography>
        {global && companies && <CompanySelectionField value={draftCompanyName} placeholder="Todas las empresas" onClick={() => { setCompanyPickerForFilters(true); setCompanyPickerOpen(true); }} />}
        <TextField autoFocus label="Buscar" placeholder="NIT, razón social o nombre comercial" value={draftFilters.q} onChange={event => setDraftFilters(previous => ({ ...previous, q: event.target.value }))} slotProps={{ htmlInput: { 'aria-label': 'Buscar por nombre o documento' } }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <TextField select label="Estado" value={draftFilters.status} onChange={event => setDraftFilters(previous => ({ ...previous, status: event.target.value }))}><MenuItem value="">Todos</MenuItem><MenuItem value="ACTIVE">Activo</MenuItem><MenuItem value="INACTIVE">Inactivo</MenuItem></TextField>
          <TextField label="País" value={draftFilters.country} onChange={event => setDraftFilters(previous => ({ ...previous, country: event.target.value }))} />
          <TextField label="Departamento" value={draftFilters.department} onChange={event => setDraftFilters(previous => ({ ...previous, department: event.target.value }))} />
          <TextField label="Ciudad" value={draftFilters.city} onChange={event => setDraftFilters(previous => ({ ...previous, city: event.target.value }))} />
        </Box>
      </Stack>
    </ListFilterDialog>
    {companies && <CompanyPickerDialog open={companyPickerOpen} api={companies} scope={auth.scope} onChoose={(company: CompanyRecord) => { const name = company.company.businessName ?? company.company.tradeName ?? company.company.id; if (companyPickerForFilters) { setDraftFilters(previous => ({ ...previous, relatedCompanyId: company.company.id })); setDraftCompanyName(name); setCompanyPickerForFilters(false); } else { setCreateCompanyId(company.company.id); setCreateCompanyName(name); } setCompanyPickerOpen(false); }} onClose={() => { setCompanyPickerForFilters(false); setCompanyPickerOpen(false); }} />}
    <Dialog open={confirmation !== null} onClose={() => setConfirmation(null)}>
      <DialogTitle>{confirmation?.kind === 'relationship' ? confirmation.status === 'ACTIVE' ? 'Activar relación' : 'Desactivar relación' : confirmation?.status === 'ACTIVE' ? 'Activar tercero' : 'Desactivar tercero'}</DialogTitle>
      <DialogContent><Typography>{confirmation?.kind === 'relationship' ? 'La operación solo cambia la relación con esta empresa. Las membresías y relaciones con otras empresas no se modifican.' : 'El tercero conservará sus datos y su historial. Al desactivarlo dejará de ser elegible para nuevas operaciones.'}</Typography></DialogContent>
      <DialogActions><Button onClick={() => setConfirmation(null)}>Cancelar</Button><Button variant="contained" color={confirmation?.status === 'INACTIVE' ? 'warning' : 'primary'} onClick={confirmChange} disabled={busy}>Confirmar</Button></DialogActions>
    </Dialog>
  </Stack>;

  if (mode === 'create' || mode === 'edit') return <>
    <ThirdPartyPage api={api} context={context} authorization={authorization} mode="list" />
    <FormDialog open onClose={closeModal} busy={busy} maxWidth="md" title={mode === 'create' ? 'Crear tercero' : 'Editar tercero'} actions={<>
      {error && mode === 'edit' && <Button disabled={busy} onClick={() => { if (!dirtyRef.current || window.confirm('¿Descartar los cambios y recargar?')) void load(); }}>Recargar datos</Button>}
      <Button onClick={closeModal} disabled={busy}>Cancelar</Button>
      <Button type="submit" form="third-party-editor-form" variant="contained" disabled={busy || requiresReload || !form.documentNumber.trim() || !form.businessName.trim() || !form.email.trim() || mode === 'create' && global && Boolean(auth.snapshot?.roles.includes('APP_ADMIN')) && !createCompanyId}>{busy ? 'Guardando…' : mode === 'create' ? 'Crear tercero' : 'Guardar cambios'}</Button>
    </>}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {mode === 'edit' && loading && <Alert severity="info" role="status" sx={{ mb: 2 }}>Cargando tercero…</Alert>}
        {(mode === 'create' || record) && <Stack id="third-party-editor-form" component="form" noValidate onSubmit={event => { event.preventDefault(); save(); }} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, alignItems: 'start', pt: 1 }}>
          {mode === 'create' && global && auth.snapshot?.roles.includes('APP_ADMIN') && <Box sx={{ gridColumn: { md: '1 / -1' } }}><CompanySelectionField label="Empresa asociada" value={createCompanyName} placeholder="Seleccionar empresa" disabled={!companies || busy} onClick={() => setCompanyPickerOpen(true)} /></Box>}
          <TextField label="Tipo de documento" value="NIT" disabled fullWidth />
          {editFields.map(key => <TextField key={key} required={['documentNumber', 'businessName', 'email'].includes(key)} label={labels[key]} type={key === 'email' ? 'email' : 'text'} value={form[key]} error={fieldErrors.includes(key)} helperText={fieldErrors.includes(key) ? 'Revisa este campo.' : undefined} onChange={event => { const value = event.target.value; setForm(previous => ({ ...previous, [key]: value })); setFieldErrors(previous => previous.filter(field => field !== key)); setChanged(true); }} fullWidth slotProps={{ htmlInput: { maxLength: key === 'documentNumber' ? 20 : key === 'verificationDigit' ? 1 : key === 'phone' ? 32 : ['country', 'department', 'city'].includes(key) ? 128 : key === 'email' ? 254 : 256 } }} />)}
          {mode === 'edit' && record && <Stack spacing={0.5} sx={{ gridColumn: { md: '1 / -1' } }}><Typography variant="caption" color="text.secondary">Versión {record.version}.</Typography><RecordMetadata createdAt={record.thirdParty.createdAt} updatedAt={record.thirdParty.updatedAt} formatDate={date} /></Stack>}
        </Stack>}
    </FormDialog>
    {companies && <CompanyPickerDialog open={companyPickerOpen} api={companies} scope={auth.scope} onChoose={(company: CompanyRecord) => { const name = company.company.businessName ?? company.company.tradeName ?? company.company.id; if (companyPickerForFilters) { setDraftFilters(previous => ({ ...previous, relatedCompanyId: company.company.id })); setDraftCompanyName(name); setCompanyPickerForFilters(false); } else { setCreateCompanyId(company.company.id); setCreateCompanyName(name); } setCompanyPickerOpen(false); }} onClose={() => { setCompanyPickerForFilters(false); setCompanyPickerOpen(false); }} />}
  </>;

  return <>
    <ThirdPartyPage api={api} context={context} authorization={authorization} mode="list" />
    <FormDialog open onClose={closeModal} maxWidth="md" title={record?.thirdParty.businessName ?? 'Detalle del tercero'} actions={<Button onClick={closeModal} disabled={busy}>Cerrar</Button>}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
    {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}{notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {loading && <ListFeedback kind="loading" title="Cargando tercero…">Estamos consultando el detalle.</ListFeedback>}
    {record && <>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2 } }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          {editableFields.map(key => <Box key={key}><Typography variant="caption" color="text.secondary">{labels[key]}</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{record.thirdParty[key] || 'Sin información'}</Typography></Box>)}
          <Box><Typography variant="caption" color="text.secondary">Estado</Typography><Box sx={{ mt: .5 }}><StatusChip label={record.thirdParty.status === 'ACTIVE' ? 'Activo' : 'Inactivo'} tone={record.thirdParty.status === 'ACTIVE' ? 'success' : 'danger'} /></Box></Box>
          <RecordMetadata createdAt={record.thirdParty.createdAt} updatedAt={record.thirdParty.updatedAt} formatDate={date} />
      </Box></Paper>
    </>}
    <Dialog open={confirmation !== null} onClose={() => setConfirmation(null)}>
      <DialogTitle>{confirmation?.kind === 'relationship' ? confirmation.status === 'ACTIVE' ? 'Activar relación' : 'Desactivar relación' : confirmation?.status === 'ACTIVE' ? 'Activar tercero' : 'Desactivar tercero'}</DialogTitle>
      <DialogContent><Typography>{confirmation?.kind === 'relationship' ? 'La operación solo cambia la relación con esta empresa. Las membresías y relaciones con otras empresas no se modifican.' : 'El tercero conservará sus datos y su historial. Al desactivarlo dejará de ser elegible para nuevas operaciones.'}</Typography></DialogContent>
      <DialogActions><Button onClick={() => setConfirmation(null)}>Cancelar</Button><Button variant="contained" color={confirmation?.status === 'INACTIVE' ? 'warning' : 'primary'} onClick={confirmChange} disabled={busy}>Confirmar</Button></DialogActions>
    </Dialog>
        </Stack>
    </FormDialog>
  </>;
}
