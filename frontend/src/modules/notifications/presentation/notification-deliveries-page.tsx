import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { ApplicationError } from '@/shared/application/application-error';
import { errorMessage } from '@/shared/components/error-messages';
import { DataPagination } from '@/shared/components/data-pagination';
import { DataTable, DataTableAction, DataTableSurface } from '@/shared/components/data-table';
import { TableLoadingState } from '@/shared/components/table-loading-state';
import type { NotificationDeliveryDto, NotificationDeliveryReadPort, NotificationDeliveryStatus } from '../application/delivery-api';

const statusLabels: Record<NotificationDeliveryStatus, string> = { pending: 'Pendiente', sent: 'Enviada', failed: 'Fallida' };
const statusColors: Record<NotificationDeliveryStatus, 'warning' | 'success' | 'error'> = { pending: 'warning', sent: 'success', failed: 'error' };
const typeLabels = { INVITATION_CREATED: 'Invitación creada', INVITATION_RESENT: 'Invitación reenviada' } as const;
function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function NotificationDeliveriesPage({ api }: { readonly api: NotificationDeliveryReadPort }) {
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(20); const [status, setStatus] = useState<NotificationDeliveryStatus | ''>('');
  const [result, setResult] = useState<{ items: readonly NotificationDeliveryDto[]; page: number; pageSize: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<NotificationDeliveryDto | null>(null); const [detailLoading, setDetailLoading] = useState(false); const [detailError, setDetailError] = useState<string | null>(null);
  const generation = useRef(0); const detailController = useRef<AbortController | undefined>(undefined); const mounted = useRef(false);

  const load = useCallback(async () => {
    const current = ++generation.current; const controller = new AbortController(); setLoading(true); setError(null);
    try {
      const response = await api.list({ page, pageSize, ...(status ? { status } : {}) }, controller.signal);
      if (mounted.current && current === generation.current && !controller.signal.aborted) setResult(response);
    } catch (failure) {
      if (mounted.current && current === generation.current && !controller.signal.aborted) setError(errorMessage(failure instanceof ApplicationError ? failure.code : 'UNEXPECTED'));
    } finally { if (mounted.current && current === generation.current) setLoading(false); }
  }, [api, page, pageSize, status]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; detailController.current?.abort(); }; }, []);
  useEffect(() => { void load(); }, [load]);
  const openDetail = async (id: string) => {
    detailController.current?.abort(); const controller = new AbortController(); detailController.current = controller;
    setDetail(null); setDetailError(null); setDetailLoading(true); setDetailOpen(true);
    try { const value = await api.get(id, controller.signal); if (mounted.current && !controller.signal.aborted) setDetail(value); }
    catch (failure) { if (mounted.current && !controller.signal.aborted) setDetailError(errorMessage(failure instanceof ApplicationError ? failure.code : 'UNEXPECTED')); }
    finally { if (mounted.current && !controller.signal.aborted) setDetailLoading(false); }
  };

  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <Typography component="h1" variant="h4">Entregas de notificaciones</Typography>
    {error && <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void load()}>Reintentar</Button>}>{error}</Alert>}
    <DataTable loading={loading} toolbar={<>
      <TextField select size="small" label="Estado" value={status} onChange={event => { setStatus(event.target.value as NotificationDeliveryStatus | ''); setPage(1); }} sx={{ minWidth: 160 }}>
        <MenuItem value="">Todos</MenuItem><MenuItem value="pending">Pendiente</MenuItem><MenuItem value="sent">Enviada</MenuItem><MenuItem value="failed">Fallida</MenuItem>
      </TextField>
      <DataTableAction label="Actualizar entregas" onClick={() => void load()}><SvgIcon fontSize="small" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.93 9h-2.02A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z" /></SvgIcon></DataTableAction>
    </>} pagination={result && result.total > 0 ? <DataPagination page={result.page} pageSize={result.pageSize} total={result.total} label="Paginación de entregas" onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} onRefresh={() => void load()} refreshLabel="Actualizar entregas" compact /> : null}>
      {!loading && result?.total === 0 && <Alert severity="info">No hay entregas para los filtros seleccionados.</Alert>}
      {(result || loading) && <DataTableSurface loading={loading}><Table size="medium" aria-label="Entregas de notificaciones"><TableHead><TableRow>
        <TableCell>Tipo</TableCell><TableCell>Canal</TableCell><TableCell>Fecha</TableCell><TableCell>Estado</TableCell><TableCell>Intentos</TableCell><TableCell>Próximo intento</TableCell><TableCell>Destinatario</TableCell><TableCell>Resultado</TableCell><TableCell>Acciones</TableCell>
      </TableRow></TableHead><TableBody>{loading ? <TableLoadingState columns={9} label="Cargando entregas" /> : result?.items.map(item => <TableRow key={item.id} hover>
        <TableCell>{typeLabels[item.type]}</TableCell><TableCell>Correo</TableCell><TableCell>{formatDate(item.createdAt)}</TableCell>
        <TableCell><Chip size="small" label={statusLabels[item.status]} color={statusColors[item.status]} /></TableCell><TableCell>{item.attempts}</TableCell><TableCell>{formatDate(item.nextAttemptAt)}</TableCell>
        <TableCell>{item.recipientMasked}</TableCell><TableCell>{item.resultCode ?? '—'}</TableCell><TableCell><Button size="small" onClick={() => void openDetail(item.id)}>Ver detalle</Button></TableCell>
      </TableRow>)}</TableBody></Table></DataTableSurface>}
    </DataTable>
    <Dialog open={detailOpen} onClose={() => { detailController.current?.abort(); setDetailOpen(false); }} fullWidth maxWidth="sm">
      <DialogTitle>Detalle de entrega</DialogTitle><DialogContent><Stack spacing={1.5} sx={{ pt: 1 }}>
        {detailLoading && <Alert severity="info" role="status">Cargando detalle…</Alert>}
        {detailError && <Alert severity="error">{detailError}</Alert>}
        {detail && <><Typography><strong>Tipo:</strong> {typeLabels[detail.type]}</Typography><Typography><strong>Canal:</strong> Correo</Typography><Typography><strong>Fecha:</strong> {formatDate(detail.createdAt)}</Typography><Typography><strong>Estado:</strong> <Chip size="small" label={statusLabels[detail.status]} color={statusColors[detail.status]} /></Typography><Typography><strong>Intentos:</strong> {detail.attempts}</Typography><Typography><strong>Próximo intento:</strong> {formatDate(detail.nextAttemptAt)}</Typography><Typography><strong>Destinatario:</strong> {detail.recipientMasked}</Typography><Typography><strong>Resultado:</strong> {detail.resultCode ?? 'Sin resultado reportado'}</Typography></>}
      </Stack></DialogContent><DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => { detailController.current?.abort(); setDetailOpen(false); }}>Cerrar</Button></DialogActions>
    </Dialog>
  </Stack>;
}
