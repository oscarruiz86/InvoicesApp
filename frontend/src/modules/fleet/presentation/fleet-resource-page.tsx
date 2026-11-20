import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Link, useParams } from 'react-router';
import { Alert, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { ApplicationError } from '@/shared/application/application-error';
import { RequestError } from '@/shared/application/request-error';
import { errorMessage } from '@/shared/components/error-messages';
import { DataPagination } from '@/shared/components/data-pagination';
import { DataTable, DataTableAction, DataTableSortHeader, DataTableSurface } from '@/shared/components/data-table';
import { TableLoadingState } from '@/shared/components/table-loading-state';
import { SuccessNotice } from '@/shared/components/success-notice';
import type { InvitationApi, OrganizationTarget } from '@/modules/user-invitations/application/invitation-api';
import type { DriverApi, DriverDto, DriverListQuery, FleetPage, FleetStatus, VehicleApi, VehicleDto, VehicleListQuery } from '../application/fleet-api';

type FleetSort = DriverListQuery['sort'] | VehicleListQuery['sort'];
type DriverSortKey = 'name' | 'identification' | 'status';
type EditVehicle = { readonly id: string; readonly version: number; readonly plate: string };
type StatusRecord = { readonly id: string; readonly version: number; readonly label: string; readonly status: FleetStatus };
type FleetResourcePageProps = {
  readonly resource: 'drivers'; readonly api: DriverApi; readonly context: ContextStore; readonly authorization: AuthorizationStore; readonly invitationApi?: InvitationApi;
} | {
  readonly resource: 'vehicles'; readonly api: VehicleApi; readonly context: ContextStore; readonly authorization: AuthorizationStore; readonly invitationApi?: InvitationApi;
};

function failureMessage(failure: unknown, noun: string): string {
  if (failure instanceof RequestError && failure.businessCode === 'CONFLICT') return `${noun} cambió desde que se cargó. Vuelve a consultar el registro antes de intentarlo otra vez.`;
  return errorMessage(failure instanceof ApplicationError ? failure.code : 'UNEXPECTED');
}

function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString('es-CO');
}

function driverIdentification(driver: DriverDto): string {
  const type = driver.identity?.documentType?.trim();
  const number = driver.identity?.documentNumber?.trim();
  return type && number ? `${type} · ${number}` : [type, number].filter(Boolean).join(' ') || '—';
}

export function FleetResourcePage(props: FleetResourcePageProps) {
  const { resource, context, authorization } = props;
  const driverApi = props.resource === 'drivers' ? props.api : null;
  const vehicleApi = props.resource === 'vehicles' ? props.api : null;
  const auth = useStore(authorization);
  const contextState = useStore(context);
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const routeParams = useParams();
  const invitationApi = props.resource === 'drivers' ? props.invitationApi ?? null : null;
  const driverId = resource === 'drivers' ? routeParams.id : undefined;
  const title = resource === 'drivers' ? driverId ? 'Detalle del conductor' : 'Conductores' : 'Vehículos';
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<FleetSort>(resource === 'drivers' ? 'createdAt' : 'plate');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [driverSort, setDriverSort] = useState<DriverSortKey>('name');
  const [driverDirection, setDriverDirection] = useState<'asc' | 'desc'>('asc');
  const [driverStatus, setDriverStatus] = useState<FleetStatus | ''>('');
  const [driverSearch, setDriverSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftDriverStatus, setDraftDriverStatus] = useState<FleetStatus | ''>('');
  const [draftDriverSearch, setDraftDriverSearch] = useState('');
  const [result, setResult] = useState<FleetPage<DriverDto> | FleetPage<VehicleDto> | null>(null);
  const [driverDetail, setDriverDetail] = useState<DriverDto | null>(null);
  const [viewDriver, setViewDriver] = useState<DriverDto | null>(null);
  const [associationOpen, setAssociationOpen] = useState(false);
  const [associationEmail, setAssociationEmail] = useState('');
  const [associationBusy, setAssociationBusy] = useState(false);
  const [associationError, setAssociationError] = useState<string | null>(null);
  const [dataGeneration, setDataGeneration] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorGeneration, setErrorGeneration] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditVehicle | null>(null);
  const [statusRecord, setStatusRecord] = useState<StatusRecord | null>(null);
  const [plate, setPlate] = useState('');
  const generation = useRef(0);
  const mounted = useRef(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    const current = ++generation.current;
    const contextGeneration = context.getState().generation;
    let capture: ReturnType<ContextStore['capture']> | undefined;
    setLoading(true);
    setError(null);
    setResult(null);
    setDriverDetail(null);
    setViewDriver(null);
    setDataGeneration(null);
    try {
      if (context.getState().status !== 'ready') return;
      if (driverId && !/^[a-f0-9]{24}$/.test(driverId)) throw new ApplicationError('NOT_FOUND');
      capture = context.capture();
      if (resource === 'drivers' && driverId) {
        const detail = await driverApi!.getDriver(capture.scope, driverId, capture.signal);
        if (mounted.current && capture.isCurrent() && current === generation.current) {
          setDriverDetail(detail);
          setDataGeneration(contextGeneration);
        }
      } else if (resource === 'drivers') {
        const query: DriverListQuery = { page, pageSize: driverSearch.trim() ? 100 : pageSize, sort: sort === 'status' ? 'status' : 'createdAt', direction, ...(driverStatus ? { status: driverStatus } : {}) };
        const response = await driverApi!.listDrivers(capture.scope, query, capture.signal);
        if (mounted.current && capture.isCurrent() && current === generation.current) {
          setResult(response);
          setDataGeneration(contextGeneration);
        }
      } else {
        const query: VehicleListQuery = { page, pageSize, sort: sort === 'createdAt' ? 'plate' : sort, direction };
        const response = await vehicleApi!.listVehicles(capture.scope, query, capture.signal);
        if (mounted.current && capture.isCurrent() && current === generation.current) {
          setResult(response);
          setDataGeneration(contextGeneration);
        }
      }
    } catch (failure) {
      if (mounted.current && current === generation.current && contextGeneration === context.getState().generation && (!capture || capture.isCurrent())) {
        setError(failureMessage(failure, resource === 'drivers' ? 'El conductor' : 'El vehículo'));
        setErrorGeneration(contextGeneration);
      }
    } finally {
      capture?.release();
      if (mounted.current && current === generation.current) setLoading(false);
    }
  }, [context, driverApi, vehicleApi, resource, driverId, page, pageSize, sort, direction, driverStatus, driverSearch]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    setResult(null);
    setDriverDetail(null);
    setDataGeneration(null);
    setStatusRecord(null);
    setEdit(null);
    setNotice(null);
    setDriverStatus('');
    setDriverSearch('');
    setDraftDriverSearch('');
  }, [contextState.generation]);
  useEffect(() => { void load(); }, [load, contextState.generation, contextState.status]);

  const changeSort = (key: FleetSort) => {
    setSort(key);
    setDirection(previous => sort === key && previous === 'asc' ? 'desc' : 'asc');
    setPage(1);
  };
  const changeDriverSort = (key: DriverSortKey) => {
    if (driverSort === key) setDriverDirection(value => value === 'asc' ? 'desc' : 'asc');
    else { setDriverSort(key); setDriverDirection('asc'); }
  };
  const openVehicleEdit = (vehicle: VehicleDto) => {
    setError(null);
    setEdit({ id: vehicle.id, version: vehicle.version, plate: vehicle.plate });
    setPlate(vehicle.plate);
  };
  const runMutation = async (operation: (scope: ReturnType<ContextStore['capture']>['scope'], signal: AbortSignal) => Promise<unknown>, success: string) => {
    if (busyRef.current || context.getState().status !== 'ready') return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const contextGeneration = context.getState().generation;
    let capture: ReturnType<ContextStore['capture']> | undefined;
    try {
      capture = context.capture();
      await operation(capture.scope, capture.signal);
      if (mounted.current && capture.isCurrent()) {
        setNotice(success);
        setEdit(null);
        setStatusRecord(null);
        await load();
      }
    } catch (failure) {
      if (mounted.current && (!capture || capture.isCurrent())) {
        setError(failureMessage(failure, resource === 'drivers' ? 'El conductor' : 'El vehículo'));
        setErrorGeneration(contextGeneration);
      }
    } finally {
      capture?.release();
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const saveVehicle = () => {
    if (!edit || !vehicleApi) return;
    if (!plate.trim()) { setError('La placa es obligatoria.'); setErrorGeneration(contextState.generation); return; }
    const selected = edit;
    void runMutation((scope, signal) => vehicleApi.updateVehicle(scope, selected.id, selected.version, { plate: plate.trim().toUpperCase() }, signal), 'Vehículo actualizado correctamente.');
  };
  const confirmStatus = () => {
    if (!statusRecord || contextState.status !== 'ready') return;
    const selected = statusRecord;
    const next: FleetStatus = selected.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const operation = resource === 'drivers' && driverApi
      ? async (scope: Parameters<DriverApi['setDriverStatus']>[0], signal: AbortSignal) => {
        // Re-read the row immediately before mutating it so a stale list does not
        // make a legitimate reactivation fail with a version conflict.
        const latest = await driverApi.getDriver(scope, selected.id, signal);
        if (latest.driver.status !== selected.status) throw new RequestError('CONFLICT');
        return driverApi.setDriverStatus(scope, selected.id, latest.driver.version, next, signal);
      }
      : vehicleApi
        ? (scope: Parameters<VehicleApi['setVehicleStatus']>[0], signal: AbortSignal) => vehicleApi.setVehicleStatus(scope, selected.id, selected.version, next, signal)
        : null;
    if (operation) void runMutation(operation, `${resource === 'drivers' ? 'Conductor' : 'Vehículo'} ${next === 'ACTIVE' ? 'activado' : 'desactivado'} correctamente.`);
  };
  const openDriverAssociation = () => {
    setAssociationEmail('');
    setAssociationError(null);
    setAssociationOpen(true);
  };
  const createDriverAssociation = async () => {
    const email = associationEmail.trim();
    if (!invitationApi || !canInviteDriver || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAssociationError('Ingresa un correo válido para enviar la invitación.');
      return;
    }
    if (associationBusy) return;
    setAssociationBusy(true);
    setAssociationError(null);
    let capture: ReturnType<ContextStore['capture']> | undefined;
    try {
      capture = context.capture();
      if (capture.scope.kind !== 'organization' || capture.scope.companyId !== null || !capture.scope.thirdPartyId) throw new ApplicationError('FORBIDDEN');
      const target: OrganizationTarget = { organizationId: capture.scope.thirdPartyId, organizationType: 'THIRD_PARTY', companyId: null };
      await invitationApi.create(capture.scope, target, email, ['DRIVER'], capture.signal);
      if (mounted.current && capture.isCurrent()) {
        setAssociationOpen(false);
        setAssociationEmail('');
        setNotice('Invitación de conductor creada correctamente.');
      }
    } catch (failure) {
      if (mounted.current && (!capture || capture.isCurrent())) {
        setAssociationError(failure instanceof RequestError && failure.businessCode === 'INVITATION_EXISTS'
          ? 'Ya existe una invitación pendiente para este correo.'
          : failureMessage(failure, 'La invitación'));
      }
    } finally {
      capture?.release();
      if (mounted.current) setAssociationBusy(false);
    }
  };
  const canEditVehicle = resource === 'vehicles' && auth.has('vehicles:update');
  const canChangeStatus = contextState.status === 'ready' && (resource === 'drivers' ? auth.has('drivers:deactivate') : auth.has('vehicles:deactivate'));
  const dataIsCurrent = contextState.status === 'ready' && dataGeneration === contextState.generation;
  const currentResult = dataIsCurrent ? result : null;
  const currentDriver = dataIsCurrent ? driverDetail : null;
  const currentError = errorGeneration === contextState.generation ? error : null;
  const items = currentResult?.items ?? [];
  const sortedDriverItems = (() => {
    if (resource !== 'drivers') return [] as DriverDto[];
    const values = [...(items as readonly DriverDto[])];
    const valueFor = (driver: DriverDto): string => {
      if (driverSort === 'identification') return driverIdentification(driver);
      if (driverSort === 'status') return driver.driver.status === 'ACTIVE' ? 'Activo' : 'Inactivo';
      return driver.identity?.name ?? '';
    };
    values.sort((left, right) => valueFor(left).localeCompare(valueFor(right), 'es-CO', { sensitivity: 'base', numeric: true }) * (driverDirection === 'asc' ? 1 : -1));
    return values;
  })();
  const canInviteDriver = resource === 'drivers' && Boolean(invitationApi) && contextState.activeContext?.kind === 'ORGANIZATION' && contextState.activeContext.organizationType === 'THIRD_PARTY';
  const activeDriverFilters = resource === 'drivers' ? [
    ...(driverStatus ? [{ key: 'status', label: `Estado: ${driverStatus === 'ACTIVE' ? 'Activo' : 'Inactivo'}` }] : []),
    ...(driverSearch ? [{ key: 'search', label: `Buscar: ${driverSearch}` }] : []),
  ] : [];
  const normalizedDriverSearch = driverSearch.trim().toLocaleLowerCase('es-CO');
  const visibleDriverItems = resource === 'drivers'
    ? sortedDriverItems.filter(driver => {
      if (!normalizedDriverSearch) return true;
      const values = [driver.identity?.name, driver.identity?.email, driver.identity?.documentType, driver.identity?.documentNumber, driverIdentification(driver)];
      return values.some(value => value?.toLocaleLowerCase('es-CO').includes(normalizedDriverSearch));
    })
    : [];

  if (resource === 'drivers' && driverId) {
    return <Stack spacing={2} sx={{ minWidth: 0, maxWidth: 900 }}>
      <Typography variant="h4" component="h1">{title}</Typography>
      <Button component={Link} to="/drivers" sx={{ alignSelf: 'flex-start' }}>Volver a conductores</Button>
      {notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
      {currentError && !statusRecord && <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void load()}>Reintentar</Button>}>{currentError}</Alert>}
      {loading && <Stack direction="row" spacing={1.5} role="status" aria-label="Cargando detalle del conductor" sx={{ alignItems: 'center' }}><CircularProgress size={22} /><Typography>Cargando detalle del conductor…</Typography></Stack>}
      {currentDriver && <>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
          <Stack spacing={2.5}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
              <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                <Typography variant="h5" component="h2" sx={{ overflowWrap: 'anywhere' }}>{currentDriver.identity?.name ?? 'Perfil no disponible'}</Typography>
                <Typography color="text.secondary">Identidad canónica · solo lectura</Typography>
              </Stack>
              <Chip label={currentDriver.driver.status === 'ACTIVE' ? 'Activo' : 'Inactivo'} color={currentDriver.driver.status === 'ACTIVE' ? 'success' : 'default'} />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Stack spacing={0.5} sx={{ flex: '1 1 220px', minWidth: 0 }}><Typography variant="overline">Nombre</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{currentDriver.identity?.name ?? 'Perfil no disponible'}</Typography></Stack>
              <Stack spacing={0.5} sx={{ flex: '1 1 220px', minWidth: 0 }}><Typography variant="overline">Identificación</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{driverIdentification(currentDriver)}</Typography></Stack>
              <Stack spacing={0.5} sx={{ flex: '1 1 220px', minWidth: 0 }}><Typography variant="overline">Correo</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{currentDriver.identity?.email ?? '—'}</Typography></Stack>
              <Stack spacing={0.5} sx={{ flex: '1 1 220px', minWidth: 0 }}><Typography variant="overline">Creado</Typography><Typography>{displayDate(currentDriver.driver.createdAt)}</Typography></Stack>
              <Stack spacing={0.5} sx={{ flex: '1 1 220px', minWidth: 0 }}><Typography variant="overline">Última actualización</Typography><Typography>{displayDate(currentDriver.driver.updatedAt)}</Typography></Stack>
            </Stack>
          </Stack>
        </Paper>
        {canChangeStatus && <Button variant="contained" color={currentDriver.driver.status === 'ACTIVE' ? 'warning' : 'primary'} disabled={busy} onClick={() => setStatusRecord({ id: currentDriver.driver.id, version: currentDriver.driver.version, label: currentDriver.identity?.name ?? 'Conductor', status: currentDriver.driver.status })} sx={{ alignSelf: 'flex-start' }}>{currentDriver.driver.status === 'ACTIVE' ? 'Desactivar conductor' : 'Activar conductor'}</Button>}
      </>}
      <Dialog open={Boolean(statusRecord)} onClose={() => !busy && setStatusRecord(null)} fullWidth maxWidth="xs"><DialogTitle>{statusRecord?.status === 'ACTIVE' ? 'Desactivar conductor' : 'Activar conductor'}</DialogTitle><DialogContent><Typography>{statusRecord?.status === 'ACTIVE' ? 'El registro dejará de estar disponible para la operación.' : 'El registro volverá a estar disponible para la operación.'} {statusRecord?.label}</Typography>{currentError && <Alert severity="error" sx={{ mt: 2 }}>{currentError}</Alert>}</DialogContent><DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => setStatusRecord(null)} disabled={busy}>Cancelar</Button><Button color={statusRecord?.status === 'ACTIVE' ? 'error' : 'primary'} variant="contained" onClick={confirmStatus} disabled={busy}>{busy ? 'Guardando…' : 'Confirmar'}</Button></DialogActions></Dialog>
    </Stack>;
  }

  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <Typography variant="h4" component="h1">{title}</Typography>
    {notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {currentError && !statusRecord && !edit && <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void load()}>Reintentar</Button>}>{currentError}</Alert>}
    {activeDriverFilters.length > 0 && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>{activeDriverFilters.map(filter => <Chip key={filter.key} label={filter.label} onDelete={() => { if (filter.key === 'status') setDriverStatus(''); else setDriverSearch(''); setPage(1); }} />)}</Stack>}
    <DataTable loading={loading} toolbar={<>
      {resource === 'drivers' && !loading && currentResult && currentResult.total > 0 && <DataTableAction label="Filtrar conductores" onClick={() => { setDraftDriverStatus(driverStatus); setDraftDriverSearch(driverSearch); setFiltersOpen(true); }}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 5h18l-7.5 8.2V19l-3 1.7v-7.5L3 5z" /></SvgIcon></DataTableAction>}
      {canInviteDriver && <DataTableAction label="Crear conductor" primary onClick={openDriverAssociation}><SvgIcon fontSize="small" aria-hidden="true"><path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4ZM7 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.67 0-8 1.34-8 4v2h12v-2c0-2.66-5.33-4-8-4ZM7 14c-.34 0-.73.02-1.15.06C3.63 14.36 0 15.54 0 18v2h5v-2c0-1.72.91-3.02 2.4-3.94L7 14Zm14-6V5h-2v3h-3v2h3v3h2v-3h3V8h-3Z" /></SvgIcon></DataTableAction>}
    </>} pagination={currentResult && currentResult.total > 0 && !normalizedDriverSearch ? <DataPagination page={currentResult.page} pageSize={currentResult.pageSize} total={currentResult.total} label={`Paginación de ${title.toLowerCase()}`} onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} onRefresh={() => void load()} refreshLabel={`Actualizar ${title.toLowerCase()}`} refreshDisabled={busy} /> : null}>
      {!loading && currentResult?.total === 0 && <Alert severity="info">No hay {title.toLowerCase()} para mostrar.</Alert>}
      {!loading && resource === 'drivers' && currentResult && currentResult.total > 0 && normalizedDriverSearch && visibleDriverItems.length === 0 && <Alert severity="info">No hay conductores que coincidan con la búsqueda.</Alert>}
      {(currentResult || loading) && <>
      {!mobile && <DataTableSurface loading={loading}><Table size="medium" aria-label={title}><TableHead><TableRow>
        {resource === 'drivers' ? <><TableCell><DataTableSortHeader active={driverSort === 'name'} direction={driverSort === 'name' ? driverDirection : 'asc'} onClick={() => changeDriverSort('name')}>Nombre</DataTableSortHeader></TableCell><TableCell><DataTableSortHeader active={driverSort === 'identification'} direction={driverSort === 'identification' ? driverDirection : 'asc'} onClick={() => changeDriverSort('identification')}>Identificación</DataTableSortHeader></TableCell><TableCell>Correo electrónico</TableCell></> : <><TableCell><DataTableSortHeader active={sort === 'plate'} direction={sort === 'plate' ? direction : 'asc'} onClick={() => changeSort('plate')}>Placa</DataTableSortHeader></TableCell><TableCell>Conductor vigente</TableCell></>}
        <TableCell><DataTableSortHeader active={resource === 'drivers' ? driverSort === 'status' : sort === 'status'} direction={resource === 'drivers' ? driverSort === 'status' ? driverDirection : 'asc' : sort === 'status' ? direction : 'asc'} onClick={() => resource === 'drivers' ? changeDriverSort('status') : changeSort('status')}>Estado</DataTableSortHeader></TableCell><TableCell>Acciones</TableCell>
      </TableRow></TableHead><TableBody>{loading ? <TableLoadingState columns={resource === 'drivers' ? 5 : 4} label={`Cargando ${title.toLowerCase()}`} /> : (resource === 'drivers' ? visibleDriverItems : items).map(item => {
        const driver = resource === 'drivers' ? item as DriverDto : null;
        const vehicle = resource === 'vehicles' ? item as VehicleDto : null;
        const id = driver ? driver.driver.id : vehicle!.id;
        const status = driver ? driver.driver.status : vehicle!.status;
        const version = driver ? driver.driver.version : vehicle!.version;
        const label = driver ? driver.identity?.name ?? 'Conductor' : vehicle!.plate;
        return <TableRow key={id} hover>
          {driver ? <><TableCell><Typography component="span" sx={{ overflowWrap: 'anywhere' }}>{driver.identity?.name ?? 'Perfil no disponible'}</Typography></TableCell><TableCell>{driverIdentification(driver)}</TableCell><TableCell sx={{ overflowWrap: 'anywhere' }}>{driver.identity?.email ?? '—'}</TableCell></> : <><TableCell>{vehicle!.plate}</TableCell><TableCell>{vehicle!.currentDriver?.name ?? 'Sin conductor asignado'}</TableCell></>}
          <TableCell><Chip size="small" label={status === 'ACTIVE' ? 'Activo' : 'Inactivo'} color={status === 'ACTIVE' ? 'success' : 'default'} /></TableCell>
          <TableCell><Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {driver && <Button variant="outlined" size="small" onClick={() => setViewDriver(driver)}>Ver</Button>}
            {canEditVehicle && vehicle && <Button size="small" onClick={() => openVehicleEdit(vehicle)}>Editar</Button>}
            {canChangeStatus && <Button variant="outlined" size="small" color={status === 'ACTIVE' ? 'warning' : 'primary'} disabled={busy} onClick={() => setStatusRecord({ id, version, label, status })}>{status === 'ACTIVE' ? 'Desactivar' : 'Activar'}</Button>}
          </Stack></TableCell>
        </TableRow>;
      })}</TableBody></Table></DataTableSurface>}
      {resource === 'drivers' && mobile && !loading && visibleDriverItems.length > 0 && <Stack spacing={1.5}>{visibleDriverItems.map(driver => {
        const status = driver.driver.status;
        return <Paper variant="outlined" key={driver.driver.id} sx={{ p: 2, minWidth: 0 }}><Stack spacing={1}>
          <Typography variant="h6" component="h2" sx={{ overflowWrap: 'anywhere' }}>{driver.identity?.name ?? 'Perfil no disponible'}</Typography>
          <Typography>Identificación: {driverIdentification(driver)}</Typography>
          <Typography sx={{ overflowWrap: 'anywhere' }}>Correo electrónico: {driver.identity?.email ?? '—'}</Typography>
          <Chip size="small" label={status === 'ACTIVE' ? 'Activo' : 'Inactivo'} color={status === 'ACTIVE' ? 'success' : 'default'} sx={{ alignSelf: 'flex-start' }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap sx={{ width: '100%', flexWrap: 'wrap' }}>
            <Button variant="outlined" size="small" onClick={() => setViewDriver(driver)} sx={{ width: { xs: '100%', sm: 'auto' } }}>Ver</Button>
            {canChangeStatus && <Button variant="outlined" size="small" color={status === 'ACTIVE' ? 'warning' : 'primary'} disabled={busy} onClick={() => setStatusRecord({ id: driver.driver.id, version: driver.driver.version, label: driver.identity?.name ?? 'Conductor', status })} sx={{ width: { xs: '100%', sm: 'auto' } }}>{status === 'ACTIVE' ? 'Desactivar' : 'Activar'}</Button>}
          </Stack>
        </Stack></Paper>;
      })}</Stack>}
      </>}
    </DataTable>
    {resource === 'drivers' && <Dialog open={Boolean(viewDriver)} onClose={() => setViewDriver(null)} fullWidth maxWidth="sm">
      <DialogTitle>Detalle del conductor</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
          <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>{viewDriver?.identity?.name ?? 'Perfil no disponible'}</Typography>
          {viewDriver && <Chip size="small" label={viewDriver.driver.status === 'ACTIVE' ? 'Activo' : 'Inactivo'} color={viewDriver.driver.status === 'ACTIVE' ? 'success' : 'default'} />}
        </Stack>
        <Stack spacing={1.5}>
          <Typography><strong>Identificación:</strong> {viewDriver ? driverIdentification(viewDriver) : '—'}</Typography>
          <Typography sx={{ overflowWrap: 'anywhere' }}><strong>Correo:</strong> {viewDriver?.identity?.email ?? '—'}</Typography>
          {viewDriver && <Typography><strong>Creado:</strong> {displayDate(viewDriver.driver.createdAt)}</Typography>}
          {viewDriver && <Typography><strong>Última actualización:</strong> {displayDate(viewDriver.driver.updatedAt)}</Typography>}
        </Stack>
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setViewDriver(null)}>Cerrar</Button></DialogActions>
    </Dialog>}
    {resource === 'drivers' && <Dialog open={associationOpen} onClose={() => !associationBusy && setAssociationOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Crear asociación de conductor</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography>Envía una invitación para asociar una persona como conductor a este tercero.</Typography>
        <TextField label="Correo del usuario" type="email" value={associationEmail} onChange={event => setAssociationEmail(event.target.value)} autoFocus fullWidth helperText="La persona recibirá la invitación para completar la asociación." />
        <TextField label="Rol" value="Conductor" fullWidth disabled />
        {associationError && <Alert severity="error">{associationError}</Alert>}
      </Stack></DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => setAssociationOpen(false)} disabled={associationBusy}>Cancelar</Button>
        <Button variant="contained" onClick={() => void createDriverAssociation()} disabled={associationBusy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(associationEmail.trim())}>{associationBusy ? 'Enviando…' : 'Enviar invitación'}</Button>
      </DialogActions>
    </Dialog>}
    {resource === 'drivers' && <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle>Filtros de conductores</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography color="text.secondary">Busca por nombre, correo electrónico o número de documento.</Typography>
        <TextField label="Nombre, correo o documento" value={draftDriverSearch} onChange={event => setDraftDriverSearch(event.target.value)} fullWidth autoFocus />
        <TextField select label="Estado" value={draftDriverStatus} onChange={event => setDraftDriverStatus(event.target.value as FleetStatus | '')}>
          <MenuItem value="">Todos</MenuItem><MenuItem value="ACTIVE">Activo</MenuItem><MenuItem value="INACTIVE">Inactivo</MenuItem>
        </TextField>
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => { setDraftDriverStatus(''); setDraftDriverSearch(''); }}>Limpiar filtros</Button><Button onClick={() => setFiltersOpen(false)}>Cancelar</Button><Button variant="contained" onClick={() => { setDriverStatus(draftDriverStatus); setDriverSearch(draftDriverSearch.trim()); setPage(1); setFiltersOpen(false); }}>Aplicar filtros</Button></DialogActions>
    </Dialog>}
    <Dialog open={Boolean(edit)} onClose={() => !busy && setEdit(null)} fullWidth maxWidth="sm"><DialogTitle>Editar vehículo</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {currentError && <Alert severity="error">{currentError}</Alert>}
      <TextField label="Placa" value={plate} onChange={event => setPlate(event.target.value.toUpperCase())} required fullWidth />
    </Stack></DialogContent><DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => setEdit(null)} disabled={busy}>Cancelar</Button><Button variant="contained" onClick={saveVehicle} disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button></DialogActions></Dialog>
    <Dialog open={Boolean(statusRecord)} onClose={() => !busy && setStatusRecord(null)} fullWidth maxWidth="xs"><DialogTitle>{statusRecord?.status === 'ACTIVE' ? `Desactivar ${resource === 'drivers' ? 'conductor' : 'vehículo'}` : `Activar ${resource === 'drivers' ? 'conductor' : 'vehículo'}`}</DialogTitle><DialogContent><Typography>{statusRecord?.status === 'ACTIVE' ? 'El registro dejará de estar disponible para la operación.' : 'El registro volverá a estar disponible para la operación.'} {statusRecord?.label}</Typography>{currentError && <Alert severity="error" sx={{ mt: 2 }}>{currentError}</Alert>}</DialogContent><DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => setStatusRecord(null)} disabled={busy}>Cancelar</Button><Button color={statusRecord?.status === 'ACTIVE' ? 'error' : 'primary'} variant="contained" onClick={confirmStatus} disabled={busy}>{busy ? 'Guardando…' : 'Confirmar'}</Button></DialogActions></Dialog>
  </Stack>;
}
