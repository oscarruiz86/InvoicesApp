import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useStore } from 'zustand';
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
  const [dialogMode, setDialogMode] = useState<'history'|'edit'|null>(null);
  const request = useRef<AbortController|null>(null); const pending = useRef(false);
  const load = useCallback(async () => { request.current?.abort(); const controller = new AbortController(); request.current = controller; setStatus('loading'); setError('');
    try { const result = await api.list(controller.signal); if (!controller.signal.aborted) { setItems(result); setStatus('ready'); } }
    catch { if (!controller.signal.aborted) { setError('No se pudo consultar el catálogo. Verifica la inicialización y vuelve a cargar.'); setStatus('error'); } }
    finally { if (request.current === controller) request.current = null; }
  }, [api]);
  useEffect(() => { if (global && canRead) void load(); else { request.current?.abort(); setItems([]); setEvents([]); setSelected(null); } return () => request.current?.abort(); }, [global, canRead, authorization, load]);
  async function showHistory(item: Parameter) { const controller = new AbortController(); request.current?.abort(); request.current = controller; setSelected(item); setEvents([]);
    setDialogMode('history'); try { const result = await api.history(item.key, controller.signal); if (!controller.signal.aborted) setEvents(result); } catch { if (!controller.signal.aborted) setError('No se pudo cargar el historial.'); } }
  async function save() { if (!selected || pending.current) return; const n = Number(value); if (!Number.isSafeInteger(n) || n < selected.minimum || n > selected.maximum) { setError(`Ingresa un entero entre ${selected.minimum} y ${selected.maximum} segundos.`); return; }
    pending.current = true; setSaving(true); setError(''); try { await api.update(selected.key, selected.version, n); setSelected(null); setDialogMode(null); setNotice('Parámetro actualizado.'); await load(); }
    catch (e) { setError(e instanceof Error && e.message.includes('VERSION_CONFLICT') ? 'El parámetro cambió. Tu borrador se conserva; recarga el valor vigente antes de guardarlo.' : 'No se pudo guardar el parámetro.'); }
    finally { pending.current = false; setSaving(false); }
  }
  return <Stack spacing={2} sx={{ maxWidth: 1100, minWidth: 0 }}><Typography component="h1" variant="h4">Parámetros funcionales</Typography>
    {!global && <Alert severity="warning">Esta administración solo está disponible en contexto GLOBAL.</Alert>}
    {global && !canRead && <Alert severity="warning">Se requiere permiso parameters:read.</Alert>}
    {error && <Alert severity="error">{error}</Alert>}{notice && <Alert severity="success">{notice}</Alert>}
    {status === 'loading' && <CircularProgress aria-label="Cargando parámetros" />}{status === 'error' && <Button onClick={() => void load()}>Recargar</Button>}
    {status === 'ready' && items.length === 0 && <Alert severity="info">El catálogo aún no está inicializado. Ejecuta parameters:init antes de usar la edición de facturas.</Alert>}
    {status === 'ready' && items.length > 0 && <Table size="small" aria-label="Parámetros funcionales"><TableHead><TableRow><TableCell>Parámetro</TableCell><TableCell>Valor</TableCell><TableCell>Ámbito</TableCell><TableCell>Versión</TableCell><TableCell>Acciones</TableCell></TableRow></TableHead><TableBody>{items.map(item => <TableRow key={item.key}><TableCell><Typography sx={{ fontWeight: 700 }}>{item.name}</Typography><Typography variant="caption">{item.key}</Typography><Typography variant="body2">{item.description}</Typography></TableCell><TableCell>{item.value.toLocaleString()} segundos</TableCell><TableCell>Global</TableCell><TableCell>{item.version}</TableCell><TableCell><Stack direction={{ xs: 'column', sm: 'row' }}><Button onClick={() => void showHistory(item)}>Historial</Button><Button disabled={!canUpdate} onClick={() => { setSelected(item); setValue(String(item.value)); setEvents([]); setDialogMode('edit'); }}>Editar valor</Button></Stack></TableCell></TableRow>)}</TableBody></Table>}
    {selected && dialogMode && <Dialog open onClose={() => !saving && setSelected(null)} fullWidth maxWidth="sm"><DialogTitle>{dialogMode === 'history' ? `Historial: ${selected.name}` : `Editar: ${selected.name}`}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {dialogMode === 'edit' && <><Typography>Valor actual: {selected.value} segundos · versión {selected.version}</Typography><TextField label="Nuevo valor (segundos)" type="number" value={value} slotProps={{ htmlInput: { min: selected.minimum, max: selected.maximum, step: 1 } }} onChange={e => setValue(e.target.value)} disabled={saving} /><Typography>{Number(value) ? `${(Number(value) / 3600).toFixed(2)} horas` : ''}</Typography><Alert severity="warning">El cambio se aplica también a facturas existentes. Se comprobará su fecha original al editarlas.</Alert></>}
      {events.map(event => <Typography key={event.eventId}>{new Date(event.at).toLocaleString()} · {event.previousValue} → {event.value} segundos · {event.actor} · versión {event.version}</Typography>)}
    </Stack></DialogContent><DialogActions><Button disabled={saving} onClick={() => { setSelected(null); setEvents([]); setDialogMode(null); }}>Cerrar</Button>{dialogMode === 'edit' && canUpdate && <Button variant="contained" disabled={saving || Number(value) === selected.value} onClick={() => void save()}>{saving ? 'Guardando…' : 'Confirmar cambio'}</Button>}</DialogActions></Dialog>}
  </Stack>;
}
