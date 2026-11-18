import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { ApplicationError } from '@/shared/application/application-error';
import { errorMessage } from '@/shared/components/error-messages';
import { DataPagination } from '@/shared/components/data-pagination';
import { DataTable, DataTableAction, DataTableSortHeader, DataTableSurface } from '@/shared/components/data-table';
import { TableLoadingState } from '@/shared/components/table-loading-state';
import { SuccessNotice } from '@/shared/components/success-notice';
import type { DriverDto, FleetApi, FleetListQuery, FleetPage, FleetStatus, VehicleDto } from '../application/fleet-api';

type Resource = 'drivers' | 'vehicles';
type EditRecord = { readonly id: string; readonly version: number; readonly name: string; readonly identification: string; readonly plate: string };
type StatusRecord = { readonly id: string; readonly version: number; readonly label: string; readonly status: FleetStatus };

export function FleetResourcePage({ resource, api, context, authorization }: { readonly resource: Resource; readonly api: FleetApi; readonly context: ContextStore; readonly authorization: AuthorizationStore }) {
  const auth = useStore(authorization); const title = resource === 'drivers' ? 'Conductores' : 'Vehículos';
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(20); const [sort, setSort] = useState<FleetListQuery['sort']>(resource === 'drivers' ? 'name' : 'plate'); const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [result, setResult] = useState<FleetPage<DriverDto> | FleetPage<VehicleDto> | null>(null); const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [edit, setEdit] = useState<EditRecord | null>(null); const [statusRecord, setStatusRecord] = useState<StatusRecord | null>(null);
  const [name, setName] = useState(''); const [identification, setIdentification] = useState(''); const [plate, setPlate] = useState('');
  const generation = useRef(0); const mounted = useRef(false); const busyRef = useRef(false);

  const load = useCallback(async () => {
    const current = ++generation.current; let capture: ReturnType<ContextStore['capture']> | undefined;
    setLoading(true); setError(null);
    try {
      capture = context.capture(); const query: FleetListQuery = { page, pageSize, sort, direction };
      const response = resource === 'drivers' ? await api.listDrivers(capture.scope, query, capture.signal) : await api.listVehicles(capture.scope, query, capture.signal);
      if (mounted.current && capture.isCurrent() && current === generation.current) setResult(response);
    } catch (failure) {
      if (mounted.current && current === generation.current && (!capture || capture.isCurrent())) setError(errorMessage(failure instanceof ApplicationError ? failure.code : 'UNEXPECTED'));
    } finally { capture?.release(); if (mounted.current && current === generation.current) setLoading(false); }
  }, [api, context, page, pageSize, sort, direction, resource]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { void load(); }, [load]);

  const changeSort = (key: FleetListQuery['sort']) => { setSort(key); setDirection(previous => sort === key && previous === 'asc' ? 'desc' : 'asc'); setPage(1); };
  const openEdit = (item: DriverDto | VehicleDto) => {
    setError(null);
    if (resource === 'drivers') { const driver = item as DriverDto; setEdit({ id: driver.id, version: driver.version, name: driver.name, identification: driver.identification, plate: '' }); setName(driver.name); setIdentification(driver.identification); }
    else { const vehicle = item as VehicleDto; setEdit({ id: vehicle.id, version: vehicle.version, name: '', identification: '', plate: vehicle.plate }); setPlate(vehicle.plate); }
  };
  const runMutation = async (operation: (scope: ReturnType<ContextStore['capture']>['scope'], signal: AbortSignal) => Promise<unknown>, success: string) => {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(null); let capture: ReturnType<ContextStore['capture']> | undefined;
    try { capture = context.capture(); await operation(capture.scope, capture.signal); if (mounted.current && capture.isCurrent()) { setNotice(success); setEdit(null); setStatusRecord(null); await load(); } }
    catch (failure) { if (mounted.current && (!capture || capture.isCurrent())) setError(errorMessage(failure instanceof ApplicationError ? failure.code : 'UNEXPECTED')); }
    finally { capture?.release(); busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  const save = () => {
    if (!edit) return;
    if (resource === 'drivers' && (!name.trim() || !identification.trim())) { setError('Nombre e identificación son obligatorios.'); return; }
    if (resource === 'vehicles' && !plate.trim()) { setError('La placa es obligatoria.'); return; }
    const selected = edit;
    void runMutation((scope, signal) => resource === 'drivers'
      ? api.updateDriver(scope, selected.id, selected.version, { name: name.trim(), identification: identification.trim() }, signal)
      : api.updateVehicle(scope, selected.id, selected.version, { plate: plate.trim() }, signal), `${resource === 'drivers' ? 'Conductor' : 'Vehículo'} actualizado correctamente.`);
  };
  const confirmStatus = () => {
    if (!statusRecord) return;
    const selected = statusRecord; const next: FleetStatus = selected.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    void runMutation((scope, signal) => resource === 'drivers'
      ? api.setDriverStatus(scope, selected.id, selected.version, next, signal)
      : api.setVehicleStatus(scope, selected.id, selected.version, next, signal), `${resource === 'drivers' ? 'Conductor' : 'Vehículo'} ${next === 'ACTIVE' ? 'activado' : 'desactivado'} correctamente.`);
  };
  const canEdit = auth.has(`${resource}:update` as 'drivers:update' | 'vehicles:update'); const canChangeStatus = auth.has(`${resource}:deactivate` as 'drivers:deactivate' | 'vehicles:deactivate');
  const items = result?.items ?? [];

  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <Typography variant="h4" component="h1">{title}</Typography>
    {notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {error && <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void load()}>Reintentar</Button>}>{error}</Alert>}
    <DataTable loading={loading} toolbar={<DataTableAction label={`Actualizar ${title.toLowerCase()}`} onClick={() => void load()} disabled={busy}><SvgIcon fontSize="small" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.93 9h-2.02A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z" /></SvgIcon></DataTableAction>} pagination={result && result.total > 0 ? <DataPagination page={result.page} pageSize={result.pageSize} total={result.total} label={`Paginación de ${title.toLowerCase()}`} onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} onRefresh={() => void load()} refreshLabel={`Actualizar ${title.toLowerCase()}`} refreshDisabled={busy} /> : null}>
      {!loading && result?.total === 0 && <Alert severity="info">No hay {title.toLowerCase()} para mostrar.</Alert>}
      {(result || loading) && <DataTableSurface loading={loading}><Table size="medium" aria-label={title}><TableHead><TableRow>
        {resource === 'drivers' ? <><TableCell>{<DataTableSortHeader active={sort === 'name'} direction={sort === 'name' ? direction : 'asc'} onClick={() => changeSort('name')}>Nombre</DataTableSortHeader>}</TableCell><TableCell>{<DataTableSortHeader active={sort === 'identification'} direction={sort === 'identification' ? direction : 'asc'} onClick={() => changeSort('identification')}>Identificación</DataTableSortHeader>}</TableCell></> : <><TableCell>{<DataTableSortHeader active={sort === 'plate'} direction={sort === 'plate' ? direction : 'asc'} onClick={() => changeSort('plate')}>Placa</DataTableSortHeader>}</TableCell><TableCell>Conductor vigente</TableCell></>}
        <TableCell>{<DataTableSortHeader active={sort === 'status'} direction={sort === 'status' ? direction : 'asc'} onClick={() => changeSort('status')}>Estado</DataTableSortHeader>}</TableCell><TableCell>Acciones</TableCell>
      </TableRow></TableHead><TableBody>{loading ? <TableLoadingState columns={resource === 'drivers' ? 4 : 4} label={`Cargando ${title.toLowerCase()}`} /> : items.map(item => {
        const driver = resource === 'drivers' ? item as DriverDto : null; const vehicle = resource === 'vehicles' ? item as VehicleDto : null; const record = driver ?? vehicle!;
        return <TableRow key={record.id} hover>
          {driver ? <><TableCell>{driver.name}</TableCell><TableCell>{driver.identification}</TableCell></> : <><TableCell>{vehicle!.plate}</TableCell><TableCell>{vehicle!.currentDriver?.name ?? 'Sin conductor asignado'}</TableCell></>}
          <TableCell><Chip size="small" label={record.status === 'ACTIVE' ? 'Activo' : 'Inactivo'} color={record.status === 'ACTIVE' ? 'success' : 'default'} /></TableCell>
          <TableCell><Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {canEdit && <Button size="small" onClick={() => openEdit(record)}>Editar</Button>}
            {canChangeStatus && <Button size="small" color={record.status === 'ACTIVE' ? 'warning' : 'primary'} onClick={() => setStatusRecord({ id: record.id, version: record.version, label: driver?.name ?? vehicle!.plate, status: record.status })}>{record.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}</Button>}
          </Stack></TableCell>
        </TableRow>;
      })}</TableBody></Table></DataTableSurface>}
    </DataTable>
    <Dialog open={Boolean(edit)} onClose={() => !busy && setEdit(null)} fullWidth maxWidth="sm"><DialogTitle>Editar {resource === 'drivers' ? 'conductor' : 'vehículo'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1}}>
      {error && <Alert severity="error">{error}</Alert>}
      {resource === 'drivers' ? <><TextField label="Nombre" value={name} onChange={event => setName(event.target.value)} required fullWidth /><TextField label="Identificación" value={identification} onChange={event => setIdentification(event.target.value)} required fullWidth /></> : <TextField label="Placa" value={plate} onChange={event => setPlate(event.target.value.toUpperCase())} required fullWidth />}
    </Stack></DialogContent><DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => setEdit(null)} disabled={busy}>Cancelar</Button><Button variant="contained" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button></DialogActions></Dialog>
    <Dialog open={Boolean(statusRecord)} onClose={() => !busy && setStatusRecord(null)} fullWidth maxWidth="xs"><DialogTitle>{statusRecord?.status === 'ACTIVE' ? `Desactivar ${resource === 'drivers' ? 'conductor' : 'vehículo'}` : `Activar ${resource === 'drivers' ? 'conductor' : 'vehículo'}`}</DialogTitle><DialogContent><Typography>{statusRecord?.status === 'ACTIVE' ? 'El registro dejará de estar disponible para la operación.' : 'El registro volverá a estar disponible para la operación.'} {statusRecord?.label}</Typography>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => setStatusRecord(null)} disabled={busy}>Cancelar</Button><Button color={statusRecord?.status === 'ACTIVE' ? 'error' : 'primary'} variant="contained" onClick={confirmStatus} disabled={busy}>Confirmar</Button></DialogActions></Dialog>
  </Stack>;
}
