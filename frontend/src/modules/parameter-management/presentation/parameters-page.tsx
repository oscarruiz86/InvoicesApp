import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Paper, Skeleton, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useStore } from 'zustand';
import { DataTable, DataTableAction, DataTableSurface } from '@/shared/components/data-table';
import { DataPagination } from '@/shared/components/data-pagination';
import { SuccessNotice } from '@/shared/components/success-notice';
import { PageHeader } from '@/shared/components/page-header';
import { FormDialog } from '@/shared/components/form-dialog';
import { ListFeedback } from '@/shared/components/list-feedback';
import { TableLoadingState } from '@/shared/components/table-loading-state';
import type { Parameter, ParameterApi, ParameterEvent } from '../application/parameter-api';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';

export function ParametersPage({ api, authorization, context }: { api: ParameterApi; authorization: AuthorizationStore; context: ContextStore }) {
  const ctx = useStore(context);
  const canRead = useStore(authorization, state => state.has('parameters:read'));
  const canUpdate = useStore(authorization, state => state.has('parameters:update'));
  const global = ctx.status === 'ready' && ctx.activeContext?.kind === 'GLOBAL';
  const [items, setItems] = useState<readonly Parameter[]>([]); const [events, setEvents] = useState<readonly ParameterEvent[]>([]);
  const [status, setStatus] = useState<'loading'|'ready'|'error'>('loading'); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<Parameter|null>(null); const [value, setValue] = useState(''); const [saving, setSaving] = useState(false);
  const [dialogMode, setDialogMode] = useState<'detail'|'history'|'edit'|null>(null);
  const request = useRef<AbortController|null>(null); const pending = useRef(false);
  const load = useCallback(async () => { request.current?.abort(); const controller = new AbortController(); request.current = controller; setStatus('loading'); setError('');
    try { const result = await api.list(controller.signal); if (!controller.signal.aborted) { setItems(result); setStatus('ready'); } }
    catch { if (!controller.signal.aborted) { setError('No se pudo consultar el catálogo. Verifica la inicialización y vuelve a cargar.'); setStatus('error'); } }
    finally { if (request.current === controller) request.current = null; }
  }, [api]);
  useEffect(() => { if (global && canRead) void load(); else { request.current?.abort(); pending.current = false; setSaving(false); setItems([]); setEvents([]); setSelected(null); setDialogMode(null); setValue(''); setError(''); } return () => request.current?.abort(); }, [global, canRead, authorization, load]);
  async function showDetail(item: Parameter) { const controller = new AbortController(); request.current?.abort(); request.current = controller; setSelected(item); setError(''); setDialogMode('detail');
    try { const result = await api.detail(item.key, controller.signal); if (!controller.signal.aborted) setSelected(result); }
    catch { if (!controller.signal.aborted) setError('No se pudo cargar el detalle del parámetro.'); } }
  async function showHistory(item: Parameter) { const controller = new AbortController(); request.current?.abort(); request.current = controller; setSelected(item); setError(''); setEvents([]);
    setDialogMode('history'); try { const result = await api.history(item.key, controller.signal); if (!controller.signal.aborted) setEvents(result); } catch { if (!controller.signal.aborted) setError('No se pudo cargar el historial.'); } }
  async function save() { if (!selected || pending.current) return; const n = Number(value); if (!Number.isSafeInteger(n) || n < selected.minimum || n > selected.maximum) { setError(`Ingresa un entero entre ${selected.minimum} y ${selected.maximum} segundos.`); return; }
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    pending.current = true; setSaving(true); setError(''); try { await api.update(selected.key, selected.version, n, controller.signal); if (controller.signal.aborted) return; setSelected(null); setDialogMode(null); setNotice('Parámetro actualizado.'); await load(); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error && e.message.includes('VERSION_CONFLICT') ? 'El parámetro cambió. Tu borrador se conserva; recarga el valor vigente antes de guardarlo.' : 'No se pudo guardar el parámetro.'); }
    finally { if (request.current === controller) request.current = null; pending.current = false; setSaving(false); }
  }
  const actions = (item: Parameter) => {
    const edit = () => { setSelected(item); setValue(String(item.value)); setEvents([]); setError(''); setDialogMode('edit'); };
    return <>
      <Stack direction="row" spacing={0.5} useFlexGap sx={{ display: { xs: 'none', md: 'flex' }, flexWrap: 'wrap', justifyContent: 'flex-start', alignItems: 'center' }}>
        <DataTableAction label="Consultar parámetro" onClick={() => void showDetail(item)}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 5c-5 0-9.27 3.11-11 7 1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></SvgIcon></DataTableAction>
        <DataTableAction label="Ver historial del parámetro" onClick={() => void showHistory(item)}><SvgIcon fontSize="small" aria-hidden="true"><path d="M13 3a9 9 0 0 0-9 9H1l4 4 4-4H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3Zm-1 5v5l4 2.4 1-1.64-3-1.76V8h-2Z" /></SvgIcon></DataTableAction>
        <DataTableAction label="Editar valor del parámetro" disabled={!canUpdate} onClick={edit}><SvgIcon fontSize="small" aria-hidden="true"><path d="m3 17.25 11.06-11.06 3.75 3.75L6.75 21H3v-3.75ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" /></SvgIcon></DataTableAction>
      </Stack>
      <Stack direction="row" spacing={1} useFlexGap sx={{ display: { xs: 'flex', md: 'none' }, flexWrap: 'wrap', mt: 1 }}>
        <Button size="small" variant="outlined" onClick={() => void showDetail(item)}>Consultar</Button>
        <Button size="small" variant="outlined" onClick={() => void showHistory(item)}>Historial</Button>
        <Button size="small" variant="outlined" disabled={!canUpdate} onClick={edit}>Editar</Button>
      </Stack>
    </>;
  };
  return <Stack spacing={2} sx={{ width: '100%', minWidth: 0 }}><PageHeader title="Parámetros funcionales" />
    {!global && <Alert severity="warning">Esta administración solo está disponible en contexto GLOBAL.</Alert>}
    {global && !canRead && <Alert severity="warning">Se requiere permiso parameters:read.</Alert>}
    {error && <Alert severity="error">{error}</Alert>}{notice && <SuccessNotice onClose={() => setNotice('')}>{notice}</SuccessNotice>}
    {status === 'loading' && <DataTable loading><DataTableSurface loading sx={{ display: { xs: 'none', md: 'block' } }}><Table size="small" aria-label="Cargando parámetros funcionales" sx={{ width: '100%', tableLayout: 'fixed' }}><TableHead><TableRow><TableCell>Parámetro</TableCell><TableCell>Valor</TableCell><TableCell sx={{ display: { md: 'none', lg: 'table-cell' } }}>Ámbito</TableCell><TableCell sx={{ display: { md: 'none', lg: 'table-cell' } }}>Versión</TableCell><TableCell>Acciones</TableCell></TableRow></TableHead><TableBody><TableLoadingState columns={5} rows={5} label="Cargando parámetros" responsiveLayouts={[
      { columns: 3, rowSx: { display: { xs: 'none', md: 'table-row', lg: 'none' } } },
      { columns: 5, rowSx: { display: { xs: 'none', lg: 'table-row' } } },
    ]} /></TableBody></Table></DataTableSurface><Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }} role="status" aria-label="Cargando parámetros">{Array.from({ length: 3 }, (_value, index) => <Paper key={index} variant="outlined" sx={{ p: 1.5 }}><Skeleton width="60%" height={26} /><Skeleton width="78%" /><Skeleton width="42%" /></Paper>)}</Stack></DataTable>}
    {status === 'error' && <ListFeedback kind="error" title={error || 'No se pudo consultar el catálogo.'} action={<Button color="inherit" size="small" onClick={() => void load()}>Reintentar</Button>} />}
    {status === 'ready' && items.length === 0 && <Alert severity="info">El catálogo aún no está inicializado. Ejecuta parameters:init antes de usar la edición de facturas.</Alert>}
    {status === 'ready' && items.length > 0 && <DataTable><DataTableSurface sx={{ width: '100%', maxWidth: '100%', display: { xs: 'none', md: 'block' } }}><Table size="small" aria-label="Parámetros funcionales" sx={{ width: '100%', tableLayout: 'fixed', '& .MuiTableCell-root': { minWidth: 0, overflowWrap: 'anywhere' } }}><TableHead><TableRow><TableCell sx={{ width: { md: '44%', lg: '34%' } }}>Parámetro</TableCell><TableCell sx={{ width: { md: '28%', lg: '20%' } }}>Valor</TableCell><TableCell sx={{ display: { md: 'none', lg: 'table-cell' }, width: '12%' }}>Ámbito</TableCell><TableCell sx={{ display: { md: 'none', lg: 'table-cell' }, width: '10%' }}>Versión</TableCell><TableCell sx={{ width: { md: '28%', lg: '24%' } }}>Acciones</TableCell></TableRow></TableHead><TableBody>{items.map(item => <TableRow key={item.key} hover><TableCell><Typography sx={{ fontWeight: 700 }}>{item.name}</Typography><Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{item.key}</Typography><Typography variant="body2">{item.description}</Typography></TableCell><TableCell>{item.value.toLocaleString()} segundos</TableCell><TableCell sx={{ display: { md: 'none', lg: 'table-cell' } }}>Global</TableCell><TableCell sx={{ display: { md: 'none', lg: 'table-cell' } }}>{item.version}</TableCell><TableCell>{actions(item)}</TableCell></TableRow>)}</TableBody></Table></DataTableSurface>
      {items.map(item => <Paper key={`mobile-${item.key}`} variant="outlined" sx={{ display: { xs: 'block', md: 'none' }, p: 1.5, minWidth: 0 }}><Typography sx={{ fontWeight: 700 }}>{item.name}</Typography><Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{item.key}</Typography><Typography>{item.value.toLocaleString()} segundos · versión {item.version}</Typography>{actions(item)}</Paper>)}
      <DataPagination page={1} pageSize={100} pageSizeOptions={[100]} compact total={items.length} label="Páginas de parámetros" onPageChange={() => {}} onPageSizeChange={() => {}} onRefresh={() => void load()} />
    </DataTable>}
    {selected && dialogMode && <FormDialog open title={dialogMode === 'detail' ? `Detalle: ${selected.name}` : dialogMode === 'history' ? `Historial: ${selected.name}` : `Editar: ${selected.name}`} onClose={() => { if (!saving) { setSelected(null); setDialogMode(null); } }} busy={saving} maxWidth="sm" actions={<><Button disabled={saving} onClick={() => { setSelected(null); setEvents([]); setDialogMode(null); }}>Cerrar</Button>{dialogMode === 'edit' && canUpdate && <Button variant="contained" disabled={saving || Number(value) === selected.value} onClick={() => void save()}>{saving ? 'Guardando…' : 'Confirmar cambio'}</Button>}</>}>
      <Stack spacing={2} sx={{ pt: 1 }}>
      {dialogMode === 'detail' && <><Typography>{selected.description}</Typography><Typography>Clave: {selected.key}</Typography><Typography>Valor actual: {selected.value.toLocaleString()} segundos</Typography><Typography>Rango permitido: {selected.minimum.toLocaleString()}–{selected.maximum.toLocaleString()} segundos</Typography><Typography>Ámbito: Global · versión {selected.version}</Typography><Typography>Vigente desde: {new Date(selected.effectiveFrom).toLocaleString()}</Typography><Typography>Actualizado por {selected.updatedBy} el {new Date(selected.updatedAt).toLocaleString()}</Typography></>}
      {dialogMode === 'edit' && <><Typography>Valor actual: {selected.value} segundos · versión {selected.version}</Typography><TextField label="Nuevo valor (segundos)" type="number" value={value} slotProps={{ htmlInput: { min: selected.minimum, max: selected.maximum, step: 1 } }} onChange={e => setValue(e.target.value)} disabled={saving} /><Typography>{Number(value) ? `${(Number(value) / 3600).toFixed(2)} horas` : ''}</Typography><Alert severity="warning">El cambio se aplica también a facturas existentes. Se comprobará su fecha original al editarlas.</Alert></>}
      {events.map(event => <Typography key={event.eventId}>{new Date(event.at).toLocaleString()} · {event.previousValue} → {event.value} segundos · {event.actor} · versión {event.version}</Typography>)}
      </Stack>
    </FormDialog>}
  </Stack>;
}
