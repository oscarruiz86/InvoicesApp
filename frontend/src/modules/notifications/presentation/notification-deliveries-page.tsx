import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Chip, LinearProgress, MenuItem, Paper, Skeleton, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { ApplicationError } from '@/shared/application/application-error';
import { errorMessage } from '@/shared/components/error-messages';
import { DataPagination } from '@/shared/components/data-pagination';
import { DataTable, DataTableAction, DataTableSurface } from '@/shared/components/data-table';
import { PageHeader } from '@/shared/components/page-header';
import { TableLoadingState } from '@/shared/components/table-loading-state';
import { AppliedFilters } from '@/shared/components/applied-filters';
import { ListFilterDialog } from '@/shared/components/list-filter-dialog';
import { ListFeedback } from '@/shared/components/list-feedback';
import { StatusChip } from '@/shared/components/status-chip';
import { FormDialog } from '@/shared/components/form-dialog';
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
  const [draftStatus, setDraftStatus] = useState<NotificationDeliveryStatus | ''>(''); const [filtersOpen, setFiltersOpen] = useState(false);
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
  const openFilters = () => { setDraftStatus(status); setFiltersOpen(true); };
  const applyFilters = () => { setStatus(draftStatus); setPage(1); setFiltersOpen(false); };
  const clearFilters = () => { setStatus(''); setDraftStatus(''); setPage(1); setFiltersOpen(false); };

  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <PageHeader title="Entregas de notificaciones" />
    {error && <ListFeedback kind="error" title={error} action={<Button color="inherit" size="small" onClick={() => void load()}>Reintentar</Button>} />}
    <AppliedFilters filters={status ? [{ key: 'status', label: `Estado: ${statusLabels[status]}` }] : []} onRemove={() => clearFilters()} onClear={clearFilters} />
    <DataTable loading={loading} toolbar={<>
      <DataTableAction label="Filtrar entregas" onClick={openFilters}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 5h18l-7.5 8.2V19l-3 1.7v-7.5L3 5z" /></SvgIcon></DataTableAction>
    </>} pagination={result ? <DataPagination page={result.page} pageSize={result.pageSize} total={result.total} label="Paginación de entregas" onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} onRefresh={() => void load()} refreshLabel="Actualizar entregas" compact /> : null}>
      {!loading && result?.total === 0 && <ListFeedback kind="empty" title="No hay entregas para los filtros seleccionados.">Cambia el estado seleccionado para ampliar la consulta.</ListFeedback>}
      {(result || loading) && <DataTableSurface loading={loading} sx={{ display: { xs: 'none', md: 'block' } }}><Table size="medium" aria-label="Entregas de notificaciones" sx={{ width: '100%', tableLayout: 'fixed', '& .MuiTableCell-root': { minWidth: 0, overflowWrap: 'anywhere' } }}><TableHead><TableRow>
        <TableCell>Tipo</TableCell><TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>Canal</TableCell><TableCell>Fecha</TableCell><TableCell>Estado</TableCell><TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>Intentos</TableCell><TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>Próximo intento</TableCell><TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>Destinatario</TableCell><TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>Resultado</TableCell><TableCell>Acciones</TableCell>
      </TableRow></TableHead><TableBody>{loading ? <TableLoadingState columns={9} label="Cargando entregas" responsiveLayouts={[
        { columns: 4, rowSx: { display: { xs: 'none', md: 'table-row', xl: 'none' } } },
        { columns: 9, rowSx: { display: { xs: 'none', xl: 'table-row' } } },
      ]} /> : result?.items.map(item => <TableRow key={item.id} hover>
        <TableCell>{typeLabels[item.type]}</TableCell><TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>Correo</TableCell><TableCell>{formatDate(item.createdAt)}</TableCell>
        <TableCell><StatusChip label={statusLabels[item.status]} tone={item.status === 'sent' ? 'success' : item.status === 'pending' ? 'warning' : 'danger'} /></TableCell><TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>{item.attempts}</TableCell><TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>{formatDate(item.nextAttemptAt)}</TableCell>
        <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>{item.recipientMasked}</TableCell><TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>{item.resultCode ?? '—'}</TableCell><TableCell><Button size="small" onClick={() => void openDetail(item.id)}>Ver detalle</Button></TableCell>
      </TableRow>)}</TableBody></Table></DataTableSurface>}
      {loading && !result && <Stack spacing={1.5} role="status" aria-label="Cargando entregas" sx={{ display: { xs: 'flex', md: 'none' } }}>{Array.from({ length: 3 }, (_value, index) => <Paper key={index} variant="outlined" sx={{ p: 1.5 }}><Skeleton width="58%" height={26} /><Skeleton width="76%" /><Skeleton width="42%" /></Paper>)}</Stack>}
      {result && result.items.length > 0 && <Stack spacing={1.5} aria-busy={loading} sx={{ display: { xs: 'flex', md: 'none' } }}>
        {loading && <LinearProgress aria-label="Actualizando entregas" sx={{ borderRadius: 1 }} />}
        {result.items.map(item => <Paper key={item.id} variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between', minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>{typeLabels[item.type]}</Typography>
              <StatusChip label={statusLabels[item.status]} tone={item.status === 'sent' ? 'success' : item.status === 'pending' ? 'warning' : 'danger'} />
            </Stack>
            <Typography variant="body2">Fecha: {formatDate(item.createdAt)}</Typography>
            <Typography variant="body2">Canal: Correo · Intentos: {item.attempts}</Typography>
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>Destinatario: {item.recipientMasked}</Typography>
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>Resultado: {item.resultCode ?? '—'}</Typography>
            <Button size="small" fullWidth onClick={() => void openDetail(item.id)}>Ver detalle</Button>
          </Stack>
        </Paper>)}
      </Stack>}
    </DataTable>
    <ListFilterDialog open={filtersOpen} title="Filtros de entregas" onClose={() => setFiltersOpen(false)} onApply={applyFilters} leadingAction={<Button onClick={clearFilters}>Limpiar</Button>}>
      <Stack spacing={2} sx={{ pt: 1 }}><TextField select fullWidth label="Estado" value={draftStatus} onChange={event => setDraftStatus(event.target.value as NotificationDeliveryStatus | '')}>
        <MenuItem value="">Todos</MenuItem><MenuItem value="pending">Pendiente</MenuItem><MenuItem value="sent">Enviada</MenuItem><MenuItem value="failed">Fallida</MenuItem>
      </TextField></Stack>
    </ListFilterDialog>
    <FormDialog open={detailOpen} onClose={() => { detailController.current?.abort(); setDetailOpen(false); }} maxWidth="sm" title="Detalle de entrega" actions={<Button onClick={() => { detailController.current?.abort(); setDetailOpen(false); }}>Cerrar</Button>}>
      <Stack spacing={1.5} sx={{ pt: 1 }}>
        {detailLoading && <Alert severity="info" role="status">Cargando detalle…</Alert>}
        {detailError && <Alert severity="error">{detailError}</Alert>}
        {detail && <><Typography><strong>Tipo:</strong> {typeLabels[detail.type]}</Typography><Typography><strong>Canal:</strong> Correo</Typography><Typography><strong>Fecha:</strong> {formatDate(detail.createdAt)}</Typography><Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography component="span"><strong>Estado:</strong></Typography><Chip size="small" label={statusLabels[detail.status]} color={statusColors[detail.status]} /></Stack><Typography><strong>Intentos:</strong> {detail.attempts}</Typography><Typography><strong>Próximo intento:</strong> {formatDate(detail.nextAttemptAt)}</Typography><Typography><strong>Destinatario:</strong> {detail.recipientMasked}</Typography><Typography><strong>Resultado:</strong> {detail.resultCode ?? 'Sin resultado reportado'}</Typography></>}
      </Stack>
    </FormDialog>
  </Stack>;
}
