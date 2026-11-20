import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import { authorizationAvailable } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { AssignmentApi, AssignmentDto, AssignmentListQuery, DriverApi, DriverDto, FleetPage, VehicleApi, VehicleDto } from '../application/fleet-api';
import { ApplicationError } from '@/shared/application/application-error';
import { RequestError } from '@/shared/application/request-error';
import { errorMessage } from '@/shared/components/error-messages';
import { DataPagination } from '@/shared/components/data-pagination';
import { DataTable, DataTableAction, DataTableSortHeader, DataTableSurface } from '@/shared/components/data-table';
import { SuccessNotice } from '@/shared/components/success-notice';
import { TableLoadingState } from '@/shared/components/table-loading-state';

type CreateOptions = { readonly generation: number; readonly drivers: readonly DriverDto[]; readonly vehicles: readonly VehicleDto[]; driverId: string; vehicleId: string };
function failure(error: unknown): string {
  if (error instanceof RequestError) {
    if (error.businessCode === 'ACTIVE_ASSIGNMENT_CONFLICT') return 'Este par de conductor y vehículo ya tiene una asignación activa.';
    if (error.businessCode === 'ASSIGNMENT_VERSION_CONFLICT') return 'La asignación cambió. Actualiza la lista y vuelve a consultar.';
    if (error.businessCode === 'DRIVER_NOT_ELIGIBLE') return 'El conductor ya no está habilitado para recibir asignaciones.';
    if (error.businessCode === 'VEHICLE_NOT_ELIGIBLE') return 'El vehículo ya no está activo para recibir asignaciones.';
    if (error.businessCode.includes('UNAVAILABLE') || error.businessCode === 'ASSIGNMENT_AUDIT_UNAVAILABLE') return 'No se pudo confirmar la asignación. Inténtalo de nuevo más tarde.';
  }
  return errorMessage(error instanceof ApplicationError ? error.code : 'UNEXPECTED');
}
export function AssignmentsPage({ api, drivers, vehicles, context, authorization }: {
  readonly api: AssignmentApi; readonly drivers: DriverApi; readonly vehicles: VehicleApi;
  readonly context: ContextStore; readonly authorization: AuthorizationStore;
}) {
  const current = useStore(context), auth = useStore(authorization);
  const [query, setQuery] = useState<AssignmentListQuery>({ page: 1, pageSize: 20, sort: 'startedAt', direction: 'desc', status: 'ACTIVE' });
  const [data, setData] = useState<{ generation: number; page: FleetPage<AssignmentDto> } | null>(null);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ generation: number; text: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ generation: number; record: AssignmentDto } | null>(null);
  const [finalize, setFinalize] = useState<{ generation: number; record: AssignmentDto } | null>(null);
  const [create, setCreate] = useState<CreateOptions | null>(null);
  const [duplicatePair, setDuplicatePair] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [driverSearchLoading, setDriverSearchLoading] = useState(false);
  const [vehicleSearchLoading, setVehicleSearchLoading] = useState(false);
  const [draftQuery, setDraftQuery] = useState('');
  const [draftStatus, setDraftStatus] = useState<AssignmentListQuery['status'] | 'ALL'>('ACTIVE');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const intent = useRef(0), mounted = useRef(true), dirty = useRef(false), controllers = useRef(new Set<AbortController>());
  const contextGeneration = useRef(current.generation);
  dirty.current = Boolean(create || finalize || busy);
  const has = (permission: Parameters<typeof auth.has>[0]) => authorizationAvailable(auth) && auth.has(permission);
  const page = data?.generation === current.generation ? data.page : null;
  const safeDetail = detail?.generation === current.generation ? detail.record : null;
  const safeFinalize = finalize?.generation === current.generation ? finalize.record : null;
  const safeCreate = create?.generation === current.generation ? create : null;
  const message = error?.generation === current.generation ? error.text : null;
  const clearStatusFilter = () => setQuery(value => ({ ...value, page: 1, status: undefined }));
  const clearSearchFilter = () => { setDraftQuery(''); setQuery(value => ({ ...value, page: 1, q: undefined })); };
  const canCheckDuplicate = has('assignments:read');
  const duplicateCheckIntent = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const activeControllers = controllers.current;
    return () => { mounted.current = false; activeControllers.forEach(controller => controller.abort()); };
  }, []);
  useEffect(() => context.register({ dirty: () => dirty.current, clear: () => {
    controllers.current.forEach(controller => controller.abort()); setData(null); setDetail(null); setFinalize(null); setCreate(null); setError(null); setNotice(null); setBusy(false);
  } }), [context]);
  useEffect(() => {
    if (contextGeneration.current === current.generation) return;
    contextGeneration.current = current.generation;
    setData(null); setDetail(null); setFinalize(null); setCreate(null); setError(null); setNotice(null); setQuery({ page: 1, pageSize: 20, sort: 'startedAt', direction: 'desc', status: 'ACTIVE' });
  }, [current.generation]);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (context.getState().status !== 'ready' || !authorizationAvailable(authorization.getState())) return;
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch { return; }
    if (capture.scope.kind !== 'organization' || capture.scope.companyId !== null || !capture.scope.thirdPartyId) { capture.release(); return; }
    const generation = context.getState().generation, requestId = ++intent.current;
    setLoading(true); setError(null);
    try {
      const result = await api.listAssignments(capture.scope, query, signal ? AbortSignal.any([capture.signal, signal]) : capture.signal);
      if (mounted.current && requestId === intent.current && capture.isCurrent() && !signal?.aborted) setData({ generation, page: result });
    } catch (failure) {
      if (mounted.current && requestId === intent.current && capture.isCurrent() && !signal?.aborted) setError({ generation, text: failureText(failure) });
    } finally { capture.release(); if (mounted.current && requestId === intent.current) setLoading(false); }
  }, [api, authorization, context, query]);
  function failureText(cause: unknown) { return failure(cause); }
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, current.generation, current.status, auth.status]);
  useEffect(() => {
    const requestId = ++duplicateCheckIntent.current;
    const driverId = safeCreate?.driverId, vehicleId = safeCreate?.vehicleId;
    if (!safeCreate || !driverId || !vehicleId || !canCheckDuplicate) {
      setDuplicatePair(false); setCheckingDuplicate(false);
      return;
    }
    const controller = new AbortController();
    let capture: ReturnType<ContextStore['capture']> | undefined;
    try { capture = context.capture(); }
    catch (cause) { setError({ generation: current.generation, text: failure(cause) }); setCheckingDuplicate(false); return; }
    setDuplicatePair(false); setCheckingDuplicate(true);
    void api.listAssignments(capture.scope, { page: 1, pageSize: 1, sort: 'startedAt', direction: 'desc', status: 'ACTIVE', driverId, vehicleId },
      AbortSignal.any([capture.signal, controller.signal]))
      .then(result => { if (requestId === duplicateCheckIntent.current && capture?.isCurrent() && !controller.signal.aborted) setDuplicatePair(result.total > 0); })
      .catch(cause => { if (requestId === duplicateCheckIntent.current && capture?.isCurrent() && !controller.signal.aborted) setError({ generation: current.generation, text: failure(cause) }); })
      .finally(() => { capture?.release(); if (requestId === duplicateCheckIntent.current) setCheckingDuplicate(false); });
    return () => controller.abort();
  }, [api, canCheckDuplicate, context, current.generation, safeCreate?.driverId, safeCreate?.generation, safeCreate?.vehicleId]);
  useEffect(() => {
    if (!safeCreate || safeCreate.driverId) { setDriverSearchLoading(false); return; }
    const text = driverSearch.trim();
    if (text.length < 2) {
      setCreate(value => value?.generation === safeCreate.generation && value.drivers.length ? { ...value, drivers: [] } : value);
      setDriverSearchLoading(false); return;
    }
    const controller = new AbortController();
    setDriverSearchLoading(true);
    setCreate(value => value?.generation === safeCreate.generation && value.drivers.length ? { ...value, drivers: [] } : value);
    const timer = window.setTimeout(() => {
      let capture: ReturnType<ContextStore['capture']>;
      try { capture = context.capture(); }
      catch (cause) { setError({ generation: current.generation, text: failure(cause) }); setDriverSearchLoading(false); return; }
      void drivers.listDrivers(capture.scope, { page: 1, pageSize: 20, sort: 'createdAt', direction: 'desc', status: 'ACTIVE', q: text },
        AbortSignal.any([capture.signal, controller.signal]))
        .then(result => { if (!controller.signal.aborted && capture.isCurrent()) setCreate(value => value?.generation === safeCreate.generation
          ? { ...value, drivers: result.items.filter(item => item.driver.status === 'ACTIVE' && item.identity) } : value); })
        .catch(cause => { if (!controller.signal.aborted && capture.isCurrent()) setError({ generation: current.generation, text: failure(cause) }); })
        .finally(() => { capture.release(); if (!controller.signal.aborted) setDriverSearchLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [context, current.generation, driverSearch, drivers, safeCreate?.driverId, safeCreate?.generation]);
  useEffect(() => {
    if (!safeCreate || safeCreate.vehicleId) { setVehicleSearchLoading(false); return; }
    const text = vehicleSearch.trim();
    if (text.length < 2) {
      setCreate(value => value?.generation === safeCreate.generation && value.vehicles.length ? { ...value, vehicles: [] } : value);
      setVehicleSearchLoading(false); return;
    }
    const controller = new AbortController();
    setVehicleSearchLoading(true);
    setCreate(value => value?.generation === safeCreate.generation && value.vehicles.length ? { ...value, vehicles: [] } : value);
    const timer = window.setTimeout(() => {
      let capture: ReturnType<ContextStore['capture']>;
      try { capture = context.capture(); }
      catch (cause) { setError({ generation: current.generation, text: failure(cause) }); setVehicleSearchLoading(false); return; }
      void vehicles.listVehicles(capture.scope, { page: 1, pageSize: 20, sort: 'plate', direction: 'asc', status: 'ACTIVE', q: text },
        AbortSignal.any([capture.signal, controller.signal]))
        .then(result => { if (!controller.signal.aborted && capture.isCurrent()) setCreate(value => value?.generation === safeCreate.generation
          ? { ...value, vehicles: result.items.filter(item => item.status === 'ACTIVE') } : value); })
        .catch(cause => { if (!controller.signal.aborted && capture.isCurrent()) setError({ generation: current.generation, text: failure(cause) }); })
        .finally(() => { capture.release(); if (!controller.signal.aborted) setVehicleSearchLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [context, current.generation, vehicleSearch, vehicles, safeCreate?.vehicleId, safeCreate?.generation]);

  async function withContext<T>(work: (scope: NonNullable<ReturnType<ContextStore['capture']>>['scope'], signal: AbortSignal) => Promise<T>, done: (result: T, generation: number) => void) {
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch (cause) { setError({ generation: context.getState().generation, text: failure(cause) }); return; }
    const generation = context.getState().generation, controller = new AbortController(); controllers.current.add(controller);
    setBusy(true); setError(null); setNotice(null);
    try {
      const value = await work(capture.scope, AbortSignal.any([capture.signal, controller.signal]));
      if (mounted.current && capture.isCurrent() && !controller.signal.aborted) done(value, generation);
    } catch (cause) {
      if (mounted.current && capture.isCurrent() && !controller.signal.aborted) setError({ generation, text: failure(cause) });
    } finally {
      capture.release(); controllers.current.delete(controller);
      if (mounted.current && capture.isCurrent()) setBusy(false);
    }
  }

  async function openCreate() {
    if (!has('vehicles:assign')) return;
    setDuplicatePair(false);
    setDriverSearch(''); setVehicleSearch(''); setError(null);
    setCreate({ generation: context.getState().generation, drivers: [], vehicles: [], driverId: '', vehicleId: '' });
  }
  function createAssignment() {
    if (!safeCreate?.driverId || !safeCreate.vehicleId || checkingDuplicate || duplicatePair || !has('vehicles:assign')) return;
    const input = { driverId: safeCreate.driverId, vehicleId: safeCreate.vehicleId };
    setDuplicatePair(false);
    void withContext(async (scope, signal) => {
      if (has('assignments:read')) {
        const existing = await api.listAssignments(scope, { page: 1, pageSize: 1, sort: 'startedAt', direction: 'desc',
          status: 'ACTIVE', driverId: input.driverId, vehicleId: input.vehicleId }, signal);
        if (existing.total > 0) return { duplicate: true };
      }
      try { await api.createAssignment(scope, input, signal); }
      catch (cause) {
        if (cause instanceof RequestError && cause.businessCode === 'ACTIVE_ASSIGNMENT_CONFLICT') return { duplicate: true };
        throw cause;
      }
      return { duplicate: false };
    }, result => {
      if (result.duplicate) { setDuplicatePair(true); return; }
      setCreate(null); setNotice('Asignación creada.'); setQuery(value => ({ ...value, page: 1, status: 'ACTIVE' })); void load();
    });
  }
  function closeAssignment(record: AssignmentDto) {
    if (!has('vehicles:unassign') || record.status !== 'ACTIVE') return;
    void withContext((scope, signal) => api.closeAssignment(scope, record.id, record.version, signal), () => {
      setNotice('Asignación finalizada. Las demás relaciones del conductor y del vehículo se conservan.'); setFinalize(null); void load();
    });
  }
  function openDetail(record: AssignmentDto) {
    void withContext((scope, signal) => api.getAssignment(scope, record.id, signal), (fresh, generation) => setDetail({ generation, record: fresh }));
  }
  function openFinalize(record: AssignmentDto) {
    if (!has('vehicles:unassign')) return;
    void withContext((scope, signal) => api.getAssignment(scope, record.id, signal), (fresh, generation) => setFinalize({ generation, record: fresh }));
  }
  const openFilters = () => { setDraftQuery(query.q ?? ''); setDraftStatus(query.status ?? 'ALL'); setFiltersOpen(true); };
  const applyFilters = () => {
    setQuery(value => ({ ...value, page: 1, status: draftStatus === 'ALL' ? undefined : draftStatus, q: draftQuery.trim() || undefined }));
    setFiltersOpen(false);
  };
  const clearFilters = () => { setDraftQuery(''); setDraftStatus('ALL'); setQuery(value => ({ ...value, page: 1, status: undefined, q: undefined })); };
  const sortHeader = (key: AssignmentListQuery['sort'], label: string) => <DataTableSortHeader active={query.sort === key}
    direction={query.sort === key ? query.direction : 'asc'} onClick={() => setQuery(value => ({ ...value, page: 1,
      sort: key, direction: value.sort === key && value.direction === 'asc' ? 'desc' : 'asc' }))}>{label}</DataTableSortHeader>;
  const items = page?.items ?? [];
  const showTable = Boolean(loading || (page && page.total > 0));
  const actions = (item: AssignmentDto) => <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
    <Button size="small" sx={{ width: '100%', maxWidth: 180 }} onClick={() => openDetail(item)}>Ver detalle</Button>
    {item.status === 'ACTIVE' && has('vehicles:unassign') && <Button size="small" sx={{ width: '100%', maxWidth: 180 }} color="warning" disabled={busy} onClick={() => openFinalize(item)}>Finalizar asignación</Button>}
  </Stack>;
  const assignmentCard = (item: AssignmentDto) => <Paper variant="outlined" key={item.id} sx={{ p: 2, minWidth: 0 }}><Stack spacing={1}>
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>{item.driver.name}</Typography>
      <Chip size="small" color={item.status === 'ACTIVE' ? 'success' : 'default'} label={item.status === 'ACTIVE' ? 'Activa' : 'Finalizada'} />
    </Stack>
    <Typography>Placa: {item.vehiclePlate || 'No disponible'}</Typography>
    <Typography color="text.secondary">Inicio: {new Date(item.startedAt).toLocaleString()}</Typography>
    {item.endedAt && <Typography color="text.secondary">Cierre: {new Date(item.endedAt).toLocaleString()}</Typography>}
    {actions(item)}
  </Stack></Paper>;

  return <Stack spacing={2} sx={{ width: '100%', minWidth: 0, maxWidth: 1100, mx: 'auto' }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between' }}>
      <Box><Typography component="h1" variant="h4">Asignaciones</Typography></Box>
    </Stack>
    {notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {message && <Alert severity="error" onClose={() => setError(null)}>{message}</Alert>}
    {(query.q || query.status) && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {query.q && <Chip label={`Búsqueda: ${query.q}`} onDelete={clearSearchFilter} />}
      {query.status && <Chip label={`Estado: ${query.status === 'ACTIVE' ? 'Activas' : 'Finalizadas'}`} onDelete={clearStatusFilter} />}
    </Stack>}
    <DataTable loading={loading}
      toolbar={<>
        <DataTableAction label="Filtrar asignaciones" onClick={openFilters} disabled={busy}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 5h18l-7.5 8.2V19l-3 1.7v-7.5L3 5z" /></SvgIcon></DataTableAction>
        {has('vehicles:assign') && <DataTableAction label="Nueva asignación" primary onClick={() => void openCreate()} disabled={busy || loading}><SvgIcon fontSize="small" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z" /></SvgIcon></DataTableAction>}
      </>}
      pagination={page && page.total > 0 && <DataPagination page={page.page} pageSize={page.pageSize} total={page.total} disabled={loading || busy}
        label="Páginas de asignaciones" onPageChange={value => setQuery(query => ({ ...query, page: value }))}
        onPageSizeChange={value => setQuery(query => ({ ...query, page: 1, pageSize: value }))}
        onRefresh={() => void load()} refreshLabel="Actualizar asignaciones" refreshDisabled={busy} />}>
      {(loading || (!page && !message)) && <Alert severity="info" role="status">{loading ? 'Cargando asignaciones…' : 'Preparando asignaciones…'}</Alert>}
      {!loading && page?.total === 0 && <Alert severity="info">No hay asignaciones para este filtro.</Alert>}
      {showTable && <DataTableSurface loading={loading} sx={{ display: { xs: 'none', md: 'block' } }}>
        <Table size="small" aria-label="Asignaciones" sx={{ width: '100%', tableLayout: 'fixed', minWidth: { md: 0, lg: 900 } }}>
          <TableHead><TableRow>
            <TableCell sx={{ width: { xs: '32%', lg: '21%' } }} sortDirection={query.sort === 'driverName' ? query.direction : false}>{sortHeader('driverName', 'Conductor')}</TableCell>
            <TableCell sx={{ width: { xs: '22%', lg: '16%' } }}>Placa</TableCell>
            <TableCell sx={{ width: { xs: '22%', lg: '14%' } }} sortDirection={query.sort === 'status' ? query.direction : false}>{sortHeader('status', 'Estado')}</TableCell>
            <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, width: '11%' }} sortDirection={query.sort === 'startedAt' ? query.direction : false}>{sortHeader('startedAt', 'Inicio')}</TableCell>
            <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, width: '11%' }}>Cierre</TableCell><TableCell sx={{ width: { xs: '24%', lg: '27%' } }}>Acciones</TableCell>
          </TableRow></TableHead>
          <TableBody>{loading ? <TableLoadingState columns={6} rows={5} label="Cargando asignaciones" /> : items.map(item => <TableRow key={item.id} hover>
            <TableCell sx={{ overflowWrap: 'anywhere' }}>{item.driver.name}</TableCell>
            <TableCell>{item.vehiclePlate || 'No disponible'}</TableCell>
            <TableCell><Chip size="small" color={item.status === 'ACTIVE' ? 'success' : 'default'} label={item.status === 'ACTIVE' ? 'Activa' : 'Finalizada'} /></TableCell>
            <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{new Date(item.startedAt).toLocaleString()}</TableCell><TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{item.endedAt ? new Date(item.endedAt).toLocaleString() : '—'}</TableCell>
            <TableCell>{actions(item)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </DataTableSurface>}
      {!loading && items.length > 0 && <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>{items.map(assignmentCard)}</Stack>}
    </DataTable>

    <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Filtros de asignaciones</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography>Filtra las asignaciones por estado o busca por conductor o vehículo.</Typography>
        <TextField select fullWidth label="Estado" value={draftStatus} onChange={event => setDraftStatus(event.target.value as AssignmentListQuery['status'] | 'ALL')}>
          <MenuItem value="ALL">Todos los estados</MenuItem><MenuItem value="ACTIVE">Activas</MenuItem><MenuItem value="CLOSED">Finalizadas</MenuItem>
        </TextField>
        <TextField fullWidth label="Buscar conductor o vehículo" value={draftQuery} onChange={event => setDraftQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') applyFilters(); }} slotProps={{ htmlInput: { maxLength: 100 } }} />
      </Stack></DialogContent><DialogActions>
        <Button onClick={clearFilters}>Limpiar filtros</Button><Button onClick={() => setFiltersOpen(false)}>Cancelar</Button>
        <Button variant="contained" onClick={applyFilters}>Aplicar filtros</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={Boolean(safeCreate)} onClose={() => !busy && setCreate(null)} fullWidth maxWidth="sm">
      <DialogTitle>Nueva asignación</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1}}>
        {duplicatePair && <Alert severity="warning">Este conductor ya está relacionado con este vehículo. Selecciona otro par.</Alert>}
        {checkingDuplicate && <Alert severity="info" role="status">Verificando que el par no tenga una asignación activa…</Alert>}
        {safeCreate && <Autocomplete
          options={safeCreate.drivers}
          value={safeCreate.drivers.find(item => item.driver.id === safeCreate.driverId) ?? null}
          getOptionLabel={item => item.identity?.name ?? ''}
          filterOptions={options => options}
          loading={driverSearchLoading}
          loadingText="Buscando conductores…"
          noOptionsText={driverSearch.trim().length < 2 ? 'Escribe al menos 2 caracteres para buscar' : 'No hay conductores activos coincidentes'}
          isOptionEqualToValue={(option, value) => option.driver.id === value.driver.id}
          onChange={(_event, item) => { setDuplicatePair(false); setCreate(value => value ? { ...value, driverId: item?.driver.id ?? '' } : value); setDriverSearch(item?.identity?.name ?? ''); }}
          inputValue={driverSearch}
          onInputChange={(_event, input, reason) => { setDriverSearch(input); if (reason === 'input') { setDuplicatePair(false); setCreate(value => value ? { ...value, driverId: '' } : value); } }}
          disabled={busy}
          renderInput={params => <TextField {...params} label="Conductor" placeholder="Buscar conductor" />}
        />}
        {safeCreate && <Autocomplete
          options={safeCreate.vehicles}
          value={safeCreate.vehicles.find(item => item.id === safeCreate.vehicleId) ?? null}
          getOptionLabel={item => `${item.plate} · ${item.internalNumber}`}
          filterOptions={options => options}
          loading={vehicleSearchLoading}
          loadingText="Buscando vehículos…"
          noOptionsText={vehicleSearch.trim().length < 2 ? 'Escribe al menos 2 caracteres para buscar' : 'No hay vehículos activos coincidentes'}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          onChange={(_event, item) => { setDuplicatePair(false); setCreate(value => value ? { ...value, vehicleId: item?.id ?? '' } : value); setVehicleSearch(item ? `${item.plate} · ${item.internalNumber}` : ''); }}
          inputValue={vehicleSearch}
          onInputChange={(_event, input, reason) => { setVehicleSearch(input); if (reason === 'input') { setDuplicatePair(false); setCreate(value => value ? { ...value, vehicleId: '' } : value); } }}
          disabled={busy}
          renderInput={params => <TextField {...params} label="Vehículo" placeholder="Buscar por placa o número interno" />}
        />}
      </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={() => setCreate(null)}>Cancelar</Button><Button variant="contained" disabled={busy || checkingDuplicate || duplicatePair || !safeCreate?.driverId || !safeCreate.vehicleId} onClick={createAssignment}>Asignar</Button></DialogActions>
    </Dialog>

    <Dialog open={Boolean(safeDetail)} onClose={() => !busy && setDetail(null)} fullWidth maxWidth="sm">
      <DialogTitle>Detalle de asignación</DialogTitle><DialogContent><Stack spacing={1} sx={{ pt: 1, overflowWrap: 'anywhere' }}>
        <Typography>Conductor: {safeDetail?.driver.name}</Typography><Typography>Placa: {safeDetail?.vehiclePlate || 'No disponible'}</Typography>
        <Typography>Estado: {safeDetail?.status === 'ACTIVE' ? 'Activa' : 'Finalizada'}</Typography><Typography>Inicio: {safeDetail && new Date(safeDetail.startedAt).toLocaleString()}</Typography>
        {safeDetail?.endedAt && <Typography>Cierre: {new Date(safeDetail.endedAt).toLocaleString()}</Typography>}<Typography>Versión: {safeDetail?.version}</Typography>
      </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={() => setDetail(null)}>Cancelar</Button>
      </DialogActions>
    </Dialog>
    <Dialog open={Boolean(safeFinalize)} onClose={() => !busy && setFinalize(null)} fullWidth maxWidth="sm">
      <DialogTitle>Finalizar asignación</DialogTitle><DialogContent><Stack spacing={1.5} sx={{ pt: 1, overflowWrap: 'anywhere' }}>
        <Typography>Conductor: {safeFinalize?.driver.name}</Typography>
        <Typography>Placa del vehículo: {safeFinalize?.vehiclePlate || 'No disponible'}</Typography>
        <Typography>Inicio: {safeFinalize && new Date(safeFinalize.startedAt).toLocaleString()}</Typography>
        {safeFinalize?.status === 'ACTIVE'
          ? <Alert severity="warning">Esta acción termina solo esta relación y conserva su historial. Las demás asignaciones del conductor y del vehículo no cambian.</Alert>
          : <Alert severity="info">Esta asignación ya fue finalizada.</Alert>}
      </Stack></DialogContent><DialogActions>
        <Button disabled={busy} onClick={() => setFinalize(null)}>Cancelar</Button>
        {safeFinalize?.status === 'ACTIVE' && has('vehicles:unassign') && <Button color="warning" variant="contained" disabled={busy} onClick={() => closeAssignment(safeFinalize)}>Finalizar asignación</Button>}
      </DialogActions>
    </Dialog>
    {busy && <Box role="status" aria-live="polite" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}><CircularProgress size={1} />Procesando asignación</Box>}
  </Stack>;
}
