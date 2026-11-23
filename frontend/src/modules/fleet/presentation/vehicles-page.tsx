import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { authorizationAvailable, type AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { RequestError } from '@/shared/application/request-error';
import { ApplicationError } from '@/shared/application/application-error';
import { errorMessage } from '@/shared/components/error-messages';
import { DataPagination } from '@/shared/components/data-pagination';
import { DataTable, DataTableAction, DataTableSortHeader, DataTableSurface } from '@/shared/components/data-table';
import { PageHeader } from '@/shared/components/page-header';
import { TableLoadingState } from '@/shared/components/table-loading-state';
import { SuccessNotice } from '@/shared/components/success-notice';
import { AppliedFilters } from '@/shared/components/applied-filters';
import { ListFilterDialog } from '@/shared/components/list-filter-dialog';
import { MobileSortControl } from '@/shared/components/mobile-sort-control';
import { StatusChip } from '@/shared/components/status-chip';
import { FormDialog } from '@/shared/components/form-dialog';
import { RecordMetadata } from '@/shared/components/record-metadata';
import { ListFeedback } from '@/shared/components/list-feedback';
import type { FleetPage, VehicleApi, VehicleDto, VehicleFields, VehicleListQuery } from '../application/fleet-api';
import { validVehicleFields, vehicleFieldErrors } from '../domain/vehicle';
const blank: VehicleFields = { plate: '', internalNumber: '', propertyCardNumber: '' };
const labels: Record<keyof VehicleFields, string> = { plate: 'Placa', internalNumber: 'Número interno', propertyCardNumber: 'Número de tarjeta de propiedad' };
const columnLabels: Record<keyof VehicleFields, string> = { plate: 'Placa', internalNumber: 'Número interno', propertyCardNumber: 'Tarjeta de propiedad' };
function failure(error: unknown): string {
  if (error instanceof RequestError) {
    if (error.businessCode === 'VEHICLE_VERSION_CONFLICT') return 'El vehículo cambió. Cierra el formulario y vuelve a consultar el registro antes de guardar.';
    if (error.businessCode === 'VEHICLE_IDENTIFIER_CONFLICT') return 'La placa, el número interno o la tarjeta de propiedad ya está registrado. Revisa los identificadores.';
    if (error.businessCode === 'VEHICLE_HAS_OPEN_ASSIGNMENT') return 'No se puede desactivar un vehículo con una asignación abierta.';
    if (error.businessCode === 'ASSIGNMENT_PROVIDER_UNAVAILABLE') return 'No se puede desactivar el vehículo hasta que el servicio de asignaciones esté disponible.';
  }
  return error instanceof ApplicationError && error.code === 'UNAVAILABLE'
    ? 'El servicio no está disponible. No se confirmó ningún cambio. La consulta de asignaciones y la desactivación requieren el proveedor de asignaciones.'
    : errorMessage(error instanceof ApplicationError ? error.code : 'UNEXPECTED');
}
const assignment = (vehicle: VehicleDto) => vehicle.assignmentState === 'UNAVAILABLE' ? 'Asignación no disponible'
  : vehicle.currentDrivers.length ? vehicle.currentDrivers.map(driver => driver.name).join(', ') : 'Sin conductor asignado';
type FormState = { generation: number; record: VehicleDto | null; fields: VehicleFields; touched: Partial<Record<keyof VehicleFields, boolean>> };
export function VehiclesPage({ api, context, authorization }: { api: VehicleApi; context: ContextStore; authorization: AuthorizationStore }) {
  const current = useStore(context), auth = useStore(authorization);
  const mobile = useMediaQuery(useTheme().breakpoints.down('md'));
  const [query, setQuery] = useState<VehicleListQuery>({ page: 1, pageSize: 20, sort: 'plate', direction: 'asc' });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftSearch, setDraftSearch] = useState('');
  const [draftStatus, setDraftStatus] = useState<VehicleListQuery['status'] | ''>('');
  const [data, setData] = useState<{ generation: number; page: FleetPage<VehicleDto> } | null>(null);
  const [error, setError] = useState<{ generation: number; text: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [detail, setDetail] = useState<{ generation: number; record: VehicleDto } | null>(null);
  const [status, setStatus] = useState<{ generation: number; record: VehicleDto } | null>(null);
  const loadIntent = useRef(0), mounted = useRef(true), dirty = useRef(false);
  const actionControllers = useRef(new Set<AbortController>());
  dirty.current = Boolean(form || status || busy);
  useEffect(() => { mounted.current = true; const controllers = actionControllers.current; return () => { mounted.current = false; controllers.forEach(c => c.abort()); }; }, []);
  useEffect(() => context.register({ dirty: () => dirty.current, clear: () => {
    actionControllers.current.forEach(c => c.abort()); setData(null); setForm(null); setDetail(null); setStatus(null); setError(null); setNotice(null); setBusy(false);
  } }), [context]);
  useEffect(() => { setData(null); setForm(null); setDetail(null); setStatus(null); setError(null); setNotice(null); setDraftSearch(''); setDraftStatus(''); setQuery({ page: 1, pageSize: 20, sort: 'plate', direction: 'asc' }); }, [current.generation]);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (context.getState().status !== 'ready' || !authorizationAvailable(authorization.getState())) return;
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch { return; }
    if (!capture || capture.scope.kind !== 'organization' || capture.scope.companyId !== null || !capture.scope.thirdPartyId) { capture?.release(); return; }
    const intent = ++loadIntent.current, generation = context.getState().generation;
    setLoading(true); setError(null);
    try {
      const result = await api.listVehicles(capture.scope, query, signal ? AbortSignal.any([signal, capture.signal]) : capture.signal);
      if (mounted.current && intent === loadIntent.current && capture.isCurrent() && !signal?.aborted) setData({ generation, page: result });
    } catch (error) {
      if (mounted.current && intent === loadIntent.current && capture.isCurrent() && !signal?.aborted) setError({ generation, text: failure(error) });
    } finally { capture.release(); if (mounted.current && intent === loadIntent.current) setLoading(false); }
  }, [api, context, authorization, query]);
  const authorizationReady = auth.status === 'ready' && Boolean(auth.snapshot);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, current.generation, current.status, authorizationReady]);
  const has = (permission: Parameters<typeof auth.has>[0]) => authorizationAvailable(auth) && auth.has(permission);
  const safeForm = form?.generation === current.generation ? form : null;
  const safeDetail = detail?.generation === current.generation ? detail.record : null;
  const safeStatus = status?.generation === current.generation ? status.record : null;
  const page = data?.generation === current.generation ? data.page : null;
  const message = error?.generation === current.generation ? error.text : null;
  async function action(work: (capture: NonNullable<ReturnType<ContextStore['capture']>>, signal: AbortSignal) => Promise<VehicleDto>, success: (record: VehicleDto, generation: number) => void) {
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch { return; }
    const generation = context.getState().generation;
    const controller = new AbortController(); actionControllers.current.add(controller);
    setBusy(true); setError(null); setNotice(null);
    try {
      const record = await work(capture, AbortSignal.any([capture.signal, controller.signal]));
      if (mounted.current && capture.isCurrent() && !controller.signal.aborted) success(record, generation);
    } catch (error) {
      if (mounted.current && capture.isCurrent() && !controller.signal.aborted) setError({ generation, text: failure(error) });
    } finally { capture.release(); actionControllers.current.delete(controller); if (mounted.current && capture.isCurrent()) setBusy(false); }
  }
  function open(record: VehicleDto, edit: boolean) {
    void action((capture, signal) => api.getVehicle(capture.scope, record.id, signal), (fresh, generation) => {
      if (edit) setForm({ generation, record: fresh, fields: { plate: fresh.plate, internalNumber: fresh.internalNumber, propertyCardNumber: fresh.propertyCardNumber }, touched: {} });
      else setDetail({ generation, record: fresh });
    });
  }
  function saved() { setForm(null); setStatus(null); setNotice('Vehículo guardado.'); void load(); }
  function save() {
    if (!safeForm) return;
    const errors = vehicleFieldErrors(safeForm.fields);
    if (Object.keys(errors).length) {
      setForm({ ...safeForm, touched: { plate: true, internalNumber: true, propertyCardNumber: true } });
      return;
    }
    const selected = safeForm;
    void action((capture, signal) => selected.record
      ? api.updateVehicle(capture.scope, selected.record.id, selected.record.version, selected.fields, signal)
      : api.createVehicle(capture.scope, selected.fields, signal), saved);
  }
  const sort = (key: VehicleListQuery['sort']) => setQuery(q => ({ ...q, page: 1, sort: key, direction: q.sort === key && q.direction === 'asc' ? 'desc' : 'asc' }));
  function actions(record: VehicleDto) { const canEdit = has('vehicles:update'); const assignmentUnavailable = record.status === 'ACTIVE' && record.assignmentState === 'UNAVAILABLE'; return <Stack direction="column" spacing={1} useFlexGap sx={{ minWidth: 0, alignItems: 'stretch' }}>
    <Button variant="outlined" size="small" disabled={busy} onClick={() => open(record, false)}>Consultar</Button>
    {canEdit && <Button size="small" disabled={busy} onClick={() => open(record, true)}>Editar</Button>}
    {has('vehicles:deactivate') && <Button size="small" color={record.status === 'ACTIVE' ? 'warning' : 'primary'} disabled={busy} title={assignmentUnavailable ? 'Se verificará la disponibilidad de asignaciones al confirmar.' : undefined} onClick={() => { setError(null); setStatus({ generation: current.generation, record }); }}>{record.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}</Button>}
  </Stack>; }
  function tableActions(record: VehicleDto) { return <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'flex-start', minWidth: 0 }}>
    <DataTableAction label="Consultar vehículo" onClick={() => open(record, false)} disabled={busy}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 5c-5 0-9.27 3.11-11 7 1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></SvgIcon></DataTableAction>
    {has('vehicles:update') && <DataTableAction label="Editar vehículo" onClick={() => open(record, true)} disabled={busy}><SvgIcon fontSize="small" aria-hidden="true"><path d="m3 17.25 11.06-11.06 3.75 3.75L6.75 21H3v-3.75ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" /></SvgIcon></DataTableAction>}
    {has('vehicles:deactivate') && <DataTableAction label={record.status === 'ACTIVE' ? 'Desactivar vehículo' : 'Activar vehículo'} onClick={() => { setError(null); setStatus({ generation: current.generation, record }); }} disabled={busy}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 11H7v-2h10v2Z" /></SvgIcon></DataTableAction>}
  </Stack>; }
  const openFilters = () => { setDraftSearch(query.q ?? ''); setDraftStatus(query.status ?? ''); setFiltersOpen(true); };
  const applyFilters = () => { const nextSearch = draftSearch.trim(); setQuery(value => ({ ...value, page: 1, q: nextSearch || undefined, status: draftStatus || undefined })); setFiltersOpen(false); };
  const clearFilters = () => { setDraftSearch(''); setDraftStatus(''); setQuery(value => ({ ...value, page: 1, q: undefined, status: undefined })); setFiltersOpen(false); };
  const clearSearch = () => setQuery(value => ({ ...value, page: 1, q: undefined }));
  const clearStatus = () => setQuery(value => ({ ...value, page: 1, status: undefined }));
  const activeFilters = [
    query.q ? { key: 'q', label: `Búsqueda: ${query.q}`, clear: clearSearch } : null,
    query.status ? { key: 'status', label: `Estado: ${query.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}`, clear: clearStatus } : null,
  ].filter((value): value is { key: string; label: string; clear: () => void } => Boolean(value));
  if (current.status !== 'ready' || !authorizationAvailable(auth)) return null;
  if (auth.scope.kind !== 'organization' || auth.scope.companyId !== null || !auth.scope.thirdPartyId) return <Alert severity="info">Selecciona un tercero para consultar vehículos.</Alert>;
  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <PageHeader title="Vehículos" tabIndex={-1} />
    <AppliedFilters filters={activeFilters} onRemove={key => activeFilters.find(filter => filter.key === key)?.clear()} onClear={clearFilters} />
    {message && !safeForm && !safeStatus && <ListFeedback kind="error" title={message} action={<Button color="inherit" size="small" onClick={() => { setError(null); void load(); }}>Reintentar</Button>} />}
    {notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {loading && <Box sx={{ display: { xs: 'block', lg: 'none' } }}><ListFeedback kind="loading" title="Cargando vehículos…">Estamos consultando los registros.</ListFeedback></Box>}
    {!loading && page?.total === 0 && <ListFeedback kind="empty" title="No hay empresas que coincidan con la consulta.">Ajusta la búsqueda o limpia los filtros.</ListFeedback>}
    <DataTable loading={loading} mobileSortAction={<MobileSortControl fields={[
      { key: 'plate', label: 'Placa' }, { key: 'internalNumber', label: 'Número interno' },
      { key: 'propertyCardNumber', label: 'Tarjeta de propiedad' }, { key: 'status', label: 'Estado' }, { key: 'createdAt', label: 'Fecha de creación' },
    ]} sortBy={query.sort} direction={query.direction} onChange={(sort, direction) => setQuery(value => ({ ...value, page: 1, sort: sort as VehicleListQuery['sort'], direction }))} />} toolbar={!loading ? <>
      {has('vehicles:create') && <DataTableAction label="Crear vehículo" primary onClick={() => { setError(null); setForm({ generation: current.generation, record: null, fields: blank, touched: {} }); }} disabled={busy}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 11h2l1.5-4A2.5 2.5 0 0 1 8.85 5h6.3a2.5 2.5 0 0 1 2.35 2L19 11h1a2 2 0 0 1 2 2v5h-2v2h-2v-2H6v2H4v-2H2v-5a2 2 0 0 1 2-2h-1Zm4-1h10l-.7-2.2a.5.5 0 0 0-.5-.3H8.7a.5.5 0 0 0-.5.3L7 10Zm-3 3a1 1 0 1 0 0 2 1 1 0 0 0-2 0Zm16 0a1 1 0 1 0 0-2 1 1 0 0 0-2 0Zm-1-10h2v3h3v2h-3v3h-2V8h-3V6h3V3Z" /></SvgIcon></DataTableAction>}
      <DataTableAction label="Filtrar vehículos" onClick={openFilters} disabled={busy}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 5h18l-7.5 8.2V19l-3 1.7v-7.5L3 5z" /></SvgIcon></DataTableAction>
    </> : undefined} pagination={page ? <DataPagination page={query.page} pageSize={query.pageSize} total={page.total} onPageChange={value => setQuery(q => ({ ...q, page: value }))} onPageSizeChange={value => setQuery(q => ({ ...q, page: 1, pageSize: value }))} onRefresh={() => void load()} refreshLabel="Actualizar vehículos" refreshDisabled={busy} /> : null}>
      {mobile ? <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' }, minWidth: 0 }}>{!loading && page?.items.map(record => <Paper variant="outlined" key={record.id} sx={{ p: 2, minWidth: 0, overflowWrap: 'anywhere' }}><Stack spacing={1}>
        <Typography variant="h6">{record.plate}</Typography><Typography>Número interno: {record.internalNumber}</Typography><Typography>Tarjeta de propiedad: {record.propertyCardNumber}</Typography>
        <Typography>{assignment(record)}</Typography><StatusChip label={record.status === 'ACTIVE' ? 'Activo' : 'Inactivo'} tone={record.status === 'ACTIVE' ? 'success' : 'danger'} />{actions(record)}
      </Stack></Paper>)}</Stack> : <DataTableSurface loading={loading} sx={{ display: { xs: 'none', md: 'block' } }}><Table size="small" aria-label="Vehículos" sx={{ width: '100%', tableLayout: 'fixed', minWidth: 0, '& .MuiTableCell-root': { minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' } }}><TableHead><TableRow>
        <TableCell sx={{ width: '12%' }}><DataTableSortHeader active={query.sort === 'plate'} direction={query.direction} onClick={() => sort('plate')}>{columnLabels.plate}</DataTableSortHeader></TableCell>
        <TableCell sx={{ width: '16%' }}><DataTableSortHeader active={query.sort === 'internalNumber'} direction={query.direction} onClick={() => sort('internalNumber')}>{columnLabels.internalNumber}</DataTableSortHeader></TableCell>
        <TableCell sx={{ width: '19%' }}><DataTableSortHeader active={query.sort === 'propertyCardNumber'} direction={query.direction} onClick={() => sort('propertyCardNumber')}>{columnLabels.propertyCardNumber}</DataTableSortHeader></TableCell>
        <TableCell sx={{ width: '19%', display: { xs: 'none', lg: 'table-cell' } }}>Conductor</TableCell><TableCell sx={{ width: '12%' }}><DataTableSortHeader active={query.sort === 'status'} direction={query.direction} onClick={() => sort('status')}>Estado</DataTableSortHeader></TableCell><TableCell sx={{ width: '22%' }}>Acciones</TableCell>
      </TableRow></TableHead><TableBody>{loading ? <TableLoadingState columns={6} rows={5} label="Cargando vehículos" /> : page?.items.map(record => <TableRow key={record.id} hover sx={{ '&:hover': { backgroundColor: 'action.hover' } }}>
        <TableCell>{record.plate}</TableCell><TableCell sx={{ overflowWrap: 'anywhere' }}>{record.internalNumber}</TableCell><TableCell sx={{ overflowWrap: 'anywhere' }}>{record.propertyCardNumber}</TableCell>
        <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{assignment(record)}</TableCell><TableCell><StatusChip label={record.status === 'ACTIVE' ? 'Activo' : 'Inactivo'} tone={record.status === 'ACTIVE' ? 'success' : 'danger'} /></TableCell><TableCell sx={{ verticalAlign: 'middle' }}>{tableActions(record)}</TableCell>
      </TableRow>)}</TableBody></Table></DataTableSurface>}
    </DataTable>
    <ListFilterDialog open={filtersOpen} onClose={() => setFiltersOpen(false)} onApply={applyFilters} title="Filtros de vehículos" leadingAction={<Button onClick={clearFilters}>Limpiar filtros</Button>}>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography color="text.secondary">Busca por placa, número interno o tarjeta de propiedad.</Typography>
        <TextField fullWidth autoFocus label="Buscar" placeholder="Placa, número interno o tarjeta" value={draftSearch} onChange={event => setDraftSearch(event.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
          <TextField fullWidth select label="Estado" value={draftStatus} onChange={event => setDraftStatus(event.target.value as VehicleListQuery['status'] | '')}>
            <MenuItem value="">Todos</MenuItem><MenuItem value="ACTIVE">Activo</MenuItem><MenuItem value="INACTIVE">Inactivo</MenuItem>
          </TextField>
        </Box>
      </Stack>
    </ListFilterDialog>
    <FormDialog open={Boolean(safeForm)} onClose={() => setForm(null)} busy={busy} maxWidth="sm" title={safeForm?.record ? 'Editar vehículo' : 'Crear vehículo'} actions={<><Button onClick={() => setForm(null)} disabled={busy}>Cancelar</Button><Button type="submit" form="vehicle-form" variant="contained" disabled={busy || !safeForm || !validVehicleFields(safeForm.fields) || !has(safeForm.record ? 'vehicles:update' : 'vehicles:create')}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button></>}>
      <Stack component="form" id="vehicle-form" spacing={2} sx={{ pt: 1 }} onSubmit={e => { e.preventDefault(); save(); }}>
        {message && <Alert severity="error">{message}</Alert>}
        {(Object.keys(labels) as (keyof VehicleFields)[]).map((key, index) => {
          const fieldError = safeForm ? vehicleFieldErrors(safeForm.fields)[key] : undefined;
          const helper = key === 'plate' ? '3 letras y 2 o 3 números (ejemplo: ABC123).' : `Letras, números y guion. Máximo ${key === 'internalNumber' ? 40 : 64} caracteres.`;
          return <TextField key={key} label={labels[key]} value={safeForm?.fields[key] ?? ''} required fullWidth autoFocus={index === 0} error={Boolean(safeForm?.touched[key] && fieldError)}
            onChange={e => setForm(f => f ? { ...f, fields: { ...f.fields, [key]: key === 'plate' ? e.target.value.toUpperCase() : e.target.value }, touched: { ...f.touched, [key]: true } } : null)}
            helperText={safeForm?.touched[key] && fieldError ? fieldError : helper} />;
        })}
        {safeForm?.record && <RecordMetadata createdAt={safeForm.record.createdAt} updatedAt={safeForm.record.updatedAt} formatDate={value => new Date(value).toLocaleString('es-CO')} />}
      </Stack>
    </FormDialog>
    <Dialog open={Boolean(safeDetail)} onClose={() => setDetail(null)} fullWidth maxWidth="sm"><DialogTitle>Detalle del vehículo</DialogTitle><DialogContent><Stack spacing={1} sx={{ overflowWrap: 'anywhere' }}>
      {(Object.keys(labels) as (keyof VehicleFields)[]).map(key => <Typography key={key}>{labels[key]}: {safeDetail?.[key]}</Typography>)}
      <Typography>Estado: {safeDetail?.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}</Typography><Typography>{safeDetail && assignment(safeDetail)}</Typography><Typography>Versión: {safeDetail?.version}</Typography>
      {safeDetail && <RecordMetadata createdAt={safeDetail.createdAt} updatedAt={safeDetail.updatedAt} formatDate={value => new Date(value).toLocaleString('es-CO')} />}
    </Stack></DialogContent><DialogActions><Button onClick={() => setDetail(null)}>Cerrar</Button></DialogActions></Dialog>
    <Dialog open={Boolean(safeStatus)} onClose={() => !busy && setStatus(null)} fullWidth maxWidth="xs"><DialogTitle>{safeStatus?.status === 'ACTIVE' ? 'Desactivar vehículo' : 'Activar vehículo'}</DialogTitle><DialogContent><Typography>Confirma el cambio de estado de {safeStatus?.plate}.</Typography>{message && <Alert severity="error" onClose={() => setError(null)} sx={{ mt: 2 }}>{message}</Alert>}</DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setStatus(null)}>Cancelar</Button><Button variant="contained" color={safeStatus?.status === 'ACTIVE' ? 'error' : 'primary'} disabled={busy || !has('vehicles:deactivate')} onClick={() => { if (safeStatus) void action((capture, signal) => api.setVehicleStatus(capture.scope, safeStatus.id, safeStatus.version, safeStatus.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE', signal), saved); }}>Confirmar</Button></DialogActions>
    </Dialog>
  </Stack>;
}
