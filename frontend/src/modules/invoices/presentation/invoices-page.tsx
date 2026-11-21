import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { DataPagination } from '@/shared/components/data-pagination';
import { DataTable, DataTableSortHeader, DataTableSurface } from '@/shared/components/data-table';
import { TableLoadingState } from '@/shared/components/table-loading-state';
import { SuccessNotice } from '@/shared/components/success-notice';
import type { AssignmentApi } from '@/modules/fleet/application/fleet-api';
import type { InvoiceApi, InvoiceDetailsDto, InvoiceDto, InvoiceFields, InvoiceQuery, InvoiceUpdateFields } from '../application/invoice-api';
import { ApplicationError } from '@/shared/application/application-error';
import { RequestError } from '@/shared/application/request-error';

interface FormValues { assignmentId: string; vehicleId: string; invoiceDate: string; invoiceTime: string; invoiceNumber: string; issuerNit: string; buyerDocument: string;
  amount: string; vatAmount: string; otherTaxesAmount: string; totalAmount: string; image: File | undefined }
const emptyForm: FormValues = { assignmentId: '', vehicleId: '', invoiceDate: '', invoiceTime: '', invoiceNumber: '', issuerNit: '', buyerDocument: '', amount: '', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '' , image: undefined };
function failure(error: unknown) {
  if (error instanceof RequestError) return ({ INVOICE_DUPLICATE: 'Ya existe una factura con el mismo NIT y número.', IDEMPOTENCY_CONFLICT: 'La solicitud repetida contiene datos distintos.',
    INVOICE_VERSION_CONFLICT: 'La factura cambió. Actualiza los datos e inténtalo de nuevo.', ASSIGNMENT_NOT_ELIGIBLE: 'La asignación ya no está activa o disponible.',
    EDIT_POLICY_UNAVAILABLE: 'La edición no está disponible porque falta la política de Configuration.', EDIT_WINDOW_CLOSED: 'Terminó la ventana de edición.',
    IMAGE_TOO_LARGE: 'La imagen supera el máximo de 5 MiB.', IMAGE_TYPE_UNSUPPORTED: 'Selecciona una imagen JPEG o PNG.', IMAGE_INVALID: 'El archivo no es una imagen válida.' } as Record<string, string>)[error.businessCode]
    ?? 'No se pudo completar la operación. Inténtalo de nuevo.';
  return error instanceof ApplicationError && error.code === 'FORBIDDEN' ? 'No tienes permiso para consultar esta factura.' : 'No se pudo completar la operación.';
}
const money = (value: string) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2 }).format(Number(value));

export function InvoicesPage({ api, assignments, context, authorization }: { readonly api: InvoiceApi; readonly assignments: AssignmentApi;
  readonly context: ContextStore; readonly authorization: AuthorizationStore }) {
  const current = useStore(context), auth = useStore(authorization);
  const [query, setQuery] = useState<InvoiceQuery>({ page: 1, pageSize: 20, sort: 'invoiceDate', direction: 'desc' });
  const [draft, setDraft] = useState({ q: '', vehicleId: '', dateFrom: '', dateTo: '' });
  const [filterDraft, setFilterDraft] = useState(draft), [filtersOpen, setFiltersOpen] = useState(false);
  const [data, setData] = useState<{ generation: number; page: Awaited<ReturnType<InvoiceApi['list']>> } | null>(null);
  const [error, setError] = useState<{ generation: number; text: string } | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ generation: number; value: FormValues; mode: 'create' | 'edit'; invoice?: InvoiceDto } | null>(null);
  const [options, setOptions] = useState<Awaited<ReturnType<AssignmentApi['listAssignments']>>['items']>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [detail, setDetail] = useState<{ generation: number; value: InvoiceDetailsDto } | null>(null);
  const [detailImage, setDetailImage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const intent = useRef(0), contextGeneration = useRef(current.generation), mounted = useRef(true), idempotency = useRef<string | null>(null), submitting = useRef(false);
  const page = data?.generation === current.generation ? data.page : null;
  const safeForm = form?.generation === current.generation ? form : null;
  const safeDetail = detail?.generation === current.generation ? detail.value : null;
  const message = error?.generation === current.generation ? error.text : null;
  const has = (permission: Parameters<typeof auth.has>[0]) => auth.has(permission);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => context.register({ dirty: () => Boolean(safeForm || filtersOpen), clear: () => {
    setData(null); setForm(null); setDetail(null); setOptions([]); setError(null); setNotice(null); setDetailImage(null); idempotency.current = null;
  } }), [context, filtersOpen, safeForm]);
  useEffect(() => {
    if (contextGeneration.current === current.generation) return;
    contextGeneration.current = current.generation; ++intent.current;
    setData(null); setForm(null); setDetail(null); setOptions([]); setError(null); setNotice(null); setDetailImage(null);
    const clean = { q: '', vehicleId: '', dateFrom: '', dateTo: '' }; setDraft(clean); setFilterDraft(clean);
    setQuery({ page: 1, pageSize: 20, sort: 'invoiceDate', direction: 'desc' });
  }, [current.generation]);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (context.getState().status !== 'ready') return;
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch { return; }
    const request = ++intent.current, generation = current.generation;
    setLoading(true); setError(null);
    try {
      const result = await api.list(capture.scope, query, signal ? AbortSignal.any([capture.signal, signal]) : capture.signal);
      if (mounted.current && request === intent.current && capture.isCurrent() && !signal?.aborted) setData({ generation, page: result });
    } catch (cause) { if (mounted.current && request === intent.current && capture.isCurrent() && !signal?.aborted) setError({ generation, text: failure(cause) }); }
    finally { capture.release(); if (mounted.current && request === intent.current) setLoading(false); }
  }, [api, context, query, current.generation]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, current.generation]);
  useEffect(() => {
    if (!safeForm || safeForm.mode !== 'create') { setOptions([]); return; }
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch { return; }
    const controller = new AbortController(); setOptionsLoading(true);
    void assignments.listAssignments(capture.scope, { page: 1, pageSize: 100, sort: 'startedAt', direction: 'desc', status: 'ACTIVE' }, AbortSignal.any([capture.signal, controller.signal]))
      .then(result => { if (capture.isCurrent() && !controller.signal.aborted) setOptions(result.items); })
      .catch(cause => { if (capture.isCurrent() && !controller.signal.aborted) setError({ generation: current.generation, text: failure(cause) }); })
      .finally(() => { capture.release(); if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [assignments, context, current.generation, safeForm?.generation, safeForm?.mode]);
  useEffect(() => {
    if (!safeForm?.value.image) { setPreview(null); return; }
    const url = URL.createObjectURL(safeForm.value.image); setPreview(url); return () => URL.revokeObjectURL(url);
  }, [safeForm?.value.image]);
  useEffect(() => {
    let active = true, capture: ReturnType<ContextStore['capture']> | undefined;
    if (!safeDetail?.invoice.imageUrl) { setDetailImage(null); return; }
    try { capture = context.capture(); } catch { setDetailImage(null); return; }
    const controller = new AbortController();
    void api.image(capture.scope, safeDetail.invoice.id, AbortSignal.any([capture.signal, controller.signal]))
      .then(blob => { if (active && !controller.signal.aborted && capture?.isCurrent()) setDetailImage(URL.createObjectURL(blob)); })
      .catch(() => { if (active && capture?.isCurrent()) setDetailImage(null); });
    return () => { active = false; controller.abort(); capture?.release(); };
  }, [api, context, safeDetail?.invoice.id, safeDetail?.invoice.imageUrl]);
  useEffect(() => () => { if (detailImage) URL.revokeObjectURL(detailImage); }, [detailImage]);

  function openFilters() { setFilterDraft(draft); setFiltersOpen(true); }
  function applyFilters() {
    const clean = { q: filterDraft.q.trim(), vehicleId: filterDraft.vehicleId.trim(), dateFrom: filterDraft.dateFrom, dateTo: filterDraft.dateTo };
    setDraft(clean); setQuery(value => ({ ...value, page: 1, q: clean.q || undefined, vehicleId: clean.vehicleId || undefined,
      dateFrom: clean.dateFrom || undefined, dateTo: clean.dateTo || undefined })); setFiltersOpen(false);
  }
  function clearFilters() { const clean = { q: '', vehicleId: '', dateFrom: '', dateTo: '' }; setFilterDraft(clean); setDraft(clean); setQuery(value => ({ ...value, ...clean, page: 1 })); setFiltersOpen(false); }
  function createDraft() { if (!has('invoices:create')) return; setError(null); setForm({ generation: current.generation, value: { ...emptyForm }, mode: 'create' }); idempotency.current = null; }
  function editDraft(value: InvoiceDto) {
    setForm({ generation: current.generation, mode: 'edit', invoice: value, value: { ...emptyForm, invoiceDate: value.invoiceDate, invoiceTime: value.invoiceTime,
      invoiceNumber: value.invoiceNumber, issuerNit: value.issuerNit, buyerDocument: value.buyerDocument, amount: value.amounts.amount,
      vatAmount: value.amounts.vatAmount, otherTaxesAmount: value.amounts.otherTaxesAmount, totalAmount: value.amounts.totalAmount } });
  }
  function field(name: keyof FormValues, value: string | File | undefined) { setForm(state => state?.generation === current.generation ? { ...state, value: { ...state.value, [name]: value } } : state); }
  function submit() {
    if (!safeForm || busy || submitting.current) return;
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch (cause) { setError({ generation: current.generation, text: failure(cause) }); return; }
    const generation = current.generation, controller = new AbortController(); submitting.current = true; setBusy(true); setError(null); setNotice(null);
    const value = safeForm.value;
    const work = safeForm.mode === 'create'
      ? (() => { idempotency.current ??= crypto.randomUUID(); const fields: InvoiceFields = { assignmentId: value.assignmentId, vehicleId: value.vehicleId,
        invoiceDate: value.invoiceDate, invoiceTime: value.invoiceTime, invoiceNumber: value.invoiceNumber, issuerNit: value.issuerNit,
        buyerDocument: value.buyerDocument, amount: value.amount, vatAmount: value.vatAmount, otherTaxesAmount: value.otherTaxesAmount,
        totalAmount: value.totalAmount, ...(value.image ? { image: value.image } : {}) };
        return api.create(capture.scope, fields, idempotency.current, AbortSignal.any([capture.signal, controller.signal])); })()
      : (() => { const fields: InvoiceUpdateFields = { expectedVersion: safeForm.invoice!.version, invoiceDate: value.invoiceDate, invoiceTime: value.invoiceTime,
        invoiceNumber: value.invoiceNumber, issuerNit: value.issuerNit, buyerDocument: value.buyerDocument, amount: value.amount,
        vatAmount: value.vatAmount, otherTaxesAmount: value.otherTaxesAmount, totalAmount: value.totalAmount, ...(value.image ? { image: value.image } : {}) };
        return api.update(capture.scope, safeForm.invoice!.id, fields, AbortSignal.any([capture.signal, controller.signal])); })();
    void work.then(saved => {
      if (!capture.isCurrent() || controller.signal.aborted) return;
      setForm(null); setNotice(safeForm.mode === 'create' ? 'Factura registrada.' : 'Factura actualizada.'); setDetail({ generation, value: { invoice: saved, editability: { available: false, reason: 'EDIT_POLICY_UNAVAILABLE' } } });
      idempotency.current = null; void load();
    }).catch(cause => { if (capture.isCurrent() && !controller.signal.aborted) setError({ generation, text: failure(cause) }); })
      .finally(() => { capture.release(); submitting.current = false; if (capture.isCurrent()) setBusy(false); });
  }
  function detailFor(value: InvoiceDto) {
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch (cause) { setError({ generation: current.generation, text: failure(cause) }); return; }
    const generation = current.generation, controller = new AbortController();
    void api.detail(capture.scope, value.id, AbortSignal.any([capture.signal, controller.signal])).then(result => {
      if (capture.isCurrent() && !controller.signal.aborted) setDetail({ generation, value: result });
    }).catch(cause => { if (capture.isCurrent() && !controller.signal.aborted) setError({ generation, text: failure(cause) }); })
      .finally(() => capture.release());
  }

  const sort = (key: InvoiceQuery['sort']) => setQuery(value => ({ ...value, page: 1, sort: key, direction: value.sort === key && value.direction === 'asc' ? 'desc' : 'asc' }));
  const formNode = safeForm && <Stack spacing={2} sx={{ pt: 1 }}>
    {safeForm.mode === 'create' && <TextField select label="Vehículo y asignación" value={safeForm.value.assignmentId} disabled={busy || optionsLoading}
      onChange={event => { const assignment = options.find(item => item.id === event.target.value); field('assignmentId', event.target.value); field('vehicleId', assignment?.vehicleId ?? ''); }}>
      {options.map(item => <MenuItem key={item.id} value={item.id}>{item.vehiclePlate ?? item.vehicleId} · {item.driver.name}</MenuItem>)}
    </TextField>}
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}><TextField fullWidth label="Fecha de factura" type="date" slotProps={{ inputLabel: { shrink: true } }} value={safeForm.value.invoiceDate} disabled={busy} onChange={event => field('invoiceDate', event.target.value)} />
      <TextField fullWidth label="Hora de factura" type="time" slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 1 } }} value={safeForm.value.invoiceTime} disabled={busy} onChange={event => field('invoiceTime', event.target.value.length === 5 ? `${event.target.value}:00` : event.target.value)} /></Stack>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}><TextField fullWidth label="Número de factura" value={safeForm.value.invoiceNumber} disabled={busy} onChange={event => field('invoiceNumber', event.target.value)} />
      <TextField fullWidth label="NIT del emisor" value={safeForm.value.issuerNit} disabled={busy} onChange={event => field('issuerNit', event.target.value)} /></Stack>
    <TextField fullWidth label="Documento del adquiriente" value={safeForm.value.buyerDocument} disabled={busy} onChange={event => field('buyerDocument', event.target.value)} />
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>{(['amount', 'vatAmount', 'otherTaxesAmount'] as const).map((key, index) => <TextField key={key} fullWidth label={['Valor de factura', 'IVA', 'Otros impuestos'][index]} slotProps={{ htmlInput: { inputMode: 'decimal' } }} value={safeForm.value[key]} disabled={busy} onChange={event => field(key, event.target.value)} />)}</Stack>
    <TextField fullWidth label="Valor total" slotProps={{ htmlInput: { inputMode: 'decimal' } }} value={safeForm.value.totalAmount} disabled={busy} onChange={event => field('totalAmount', event.target.value)} />
    <Button component="label" variant="outlined" disabled={busy}>Adjuntar imagen (opcional)<input hidden type="file" accept="image/jpeg,image/png" onChange={event => field('image', event.target.files?.[0])} /></Button>
    {preview && <Box component="img" src={preview} alt="Vista previa de la imagen adjunta" sx={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 1 }} />}
  </Stack>;

  return <Stack spacing={1.5} sx={{ minWidth: 0 }}>
    <Typography component="h1" variant="h4">Facturas</Typography>
    {notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {message && <Alert severity="error" onClose={() => setError(null)}>{message}</Alert>}
    <DataTable toolbar={<><Button variant="outlined" onClick={openFilters}>Filtros</Button>{has('invoices:create') && <Button variant="contained" onClick={createDraft}>Registrar factura</Button>}</>} loading={loading}>
      {(draft.q || draft.vehicleId || draft.dateFrom || draft.dateTo) && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {draft.q && <Chip label={`Búsqueda: ${draft.q}`} onDelete={() => { setDraft(value => ({ ...value, q: '' })); setQuery(value => ({ ...value, q: undefined, page: 1 })); }} />}
        {draft.dateFrom && <Chip label={`Desde ${draft.dateFrom}`} onDelete={() => { setDraft(value => ({ ...value, dateFrom: '' })); setQuery(value => ({ ...value, dateFrom: undefined, page: 1 })); }} />}
        {draft.dateTo && <Chip label={`Hasta ${draft.dateTo}`} onDelete={() => { setDraft(value => ({ ...value, dateTo: '' })); setQuery(value => ({ ...value, dateTo: undefined, page: 1 })); }} />}
        <Button onClick={clearFilters}>Limpiar filtros</Button>
      </Stack>}
      <DataTableSurface loading={loading} sx={{ display: { xs: 'none', md: 'block' } }}>
        <Table size="small" aria-label="Facturas registradas" sx={{ minWidth: 780 }}><TableHead><TableRow>
          {([['invoiceNumber', 'Número'], ['invoiceDate', 'Fecha'], ['issuerNit', 'Emisor'], ['vehiclePlate', 'Vehículo'], ['totalAmount', 'Total']] as const).map(([key, label]) =>
            <TableCell key={key}>{key === 'issuerNit' || key === 'vehiclePlate' ? label : <DataTableSortHeader active={query.sort === key} direction={query.direction} onClick={() => sort(key as InvoiceQuery['sort'])}>{label}</DataTableSortHeader>}</TableCell>)}
          <TableCell>Acciones</TableCell></TableRow></TableHead><TableBody>
          {loading && !page ? <TableLoadingState columns={6} rows={4} /> : page?.items.map(value => <TableRow key={value.id} hover>
            <TableCell>{value.invoiceNumber}</TableCell><TableCell>{value.invoiceDate} {value.invoiceTime.slice(0, 5)}</TableCell><TableCell>{value.issuerNit}</TableCell>
            <TableCell>{value.vehiclePlate ?? value.vehicleId}</TableCell><TableCell>{money(value.amounts.totalAmount)}</TableCell>
            <TableCell><Button onClick={() => detailFor(value)}>Ver</Button></TableCell></TableRow>)}
          {!loading && page?.items.length === 0 && <TableRow><TableCell colSpan={6} align="center">No hay facturas que coincidan con estos filtros.</TableCell></TableRow>}
        </TableBody></Table>
      </DataTableSurface>
      {page && <DataPagination page={query.page} pageSize={query.pageSize} total={page.total} onPageChange={next => setQuery(value => ({ ...value, page: next }))}
        onPageSizeChange={size => setQuery(value => ({ ...value, page: 1, pageSize: size }))} onRefresh={() => void load()} disabled={loading} />}
      {page?.items.map(value => <Paper key={`mobile-${value.id}`} variant="outlined" sx={{ display: { xs: 'block', md: 'none' }, p: 1.5 }}>
        <Typography sx={{ fontWeight: 700 }}>{value.invoiceNumber}</Typography><Typography>{value.invoiceDate} · {value.vehiclePlate ?? value.vehicleId}</Typography>
        <Typography>{money(value.amounts.totalAmount)}</Typography><Button onClick={() => detailFor(value)}>Ver factura</Button></Paper>)}
      {page?.items.length === 0 && <Typography sx={{ display: { xs: 'block', md: 'none' }, textAlign: 'center', py: 2 }}>No hay facturas que coincidan con estos filtros.</Typography>}
    </DataTable>
    <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Filtrar facturas</DialogTitle><DialogContent><Stack spacing={1.5} sx={{ pt: 1 }}>
      <TextField label="Número o NIT" value={filterDraft.q} onChange={event => setFilterDraft(value => ({ ...value, q: event.target.value }))} />
      <TextField label="ID del vehículo" value={filterDraft.vehicleId} onChange={event => setFilterDraft(value => ({ ...value, vehicleId: event.target.value }))} />
      <TextField label="Fecha desde" type="date" slotProps={{ inputLabel: { shrink: true } }} value={filterDraft.dateFrom} onChange={event => setFilterDraft(value => ({ ...value, dateFrom: event.target.value }))} />
      <TextField label="Fecha hasta" type="date" slotProps={{ inputLabel: { shrink: true } }} value={filterDraft.dateTo} onChange={event => setFilterDraft(value => ({ ...value, dateTo: event.target.value }))} />
    </Stack></DialogContent><DialogActions><Button onClick={clearFilters}>Limpiar</Button><Button onClick={() => setFiltersOpen(false)}>Cancelar</Button><Button variant="contained" onClick={applyFilters}>Aplicar</Button></DialogActions></Dialog>
    <Dialog open={Boolean(safeForm)} onClose={() => !busy && setForm(null)} fullWidth maxWidth="md" aria-labelledby="invoice-form-title"><DialogTitle id="invoice-form-title">{safeForm?.mode === 'create' ? 'Registrar factura manual' : 'Editar factura'}</DialogTitle><DialogContent>
      {!safeForm?.value.assignmentId && safeForm?.mode === 'create' && <Alert severity="info" sx={{ mb: 1 }}>Selecciona una asignación activa propia. La fecha comercial no habilita asignaciones históricas.</Alert>}{formNode}
      {optionsLoading && <CircularProgress size={20} />}{message && <Alert severity="error" sx={{ mt: 1 }}>{message}</Alert>}
    </DialogContent><DialogActions><Button disabled={busy} onClick={() => setForm(null)}>Cancelar</Button><Button variant="contained" disabled={busy || (safeForm?.mode === 'create' && !safeForm.value.assignmentId)} onClick={submit}>{busy ? 'Guardando…' : 'Guardar factura'}</Button></DialogActions></Dialog>
    <Dialog open={Boolean(safeDetail)} onClose={() => setDetail(null)} fullWidth maxWidth="md"><DialogTitle>Detalle de factura</DialogTitle><DialogContent><Stack spacing={1.25} sx={{ pt: 1 }}>
      {safeDetail && <><Typography>Número: {safeDetail.invoice.invoiceNumber}</Typography><Typography>Fecha y hora: {safeDetail.invoice.invoiceDate} {safeDetail.invoice.invoiceTime}</Typography>
        <Typography>NIT emisor: {safeDetail.invoice.issuerNit}</Typography><Typography>Documento adquiriente: {safeDetail.invoice.buyerDocument}</Typography>
        <Typography>Vehículo: {safeDetail.invoice.vehiclePlate ?? safeDetail.invoice.vehicleId}</Typography><Typography>Total: {money(safeDetail.invoice.amounts.totalAmount)}</Typography>
        {safeDetail.invoice.imageUrl && detailImage && <Box component="img" src={detailImage} alt="Imagen adjunta a la factura" sx={{ maxWidth: '100%', maxHeight: 360, objectFit: 'contain' }} />}
        {safeDetail.editability.reason === 'EDIT_POLICY_UNAVAILABLE' && <Alert severity="info">La edición no está disponible hasta que Configuration entregue una política temporal válida. Puedes seguir consultando la factura.</Alert>}
        {safeDetail.editability.reason === 'EDIT_WINDOW_CLOSED' && <Alert severity="info">La ventana de edición de esta factura terminó.</Alert>}
        {safeDetail.editability.reason === 'QR_IMMUTABLE' && <Alert severity="info">Factura capturada desde QR. Sus datos, asignación e imagen son inmutables y el origen no constituye validación fiscal.</Alert>}
      </>}
    </Stack></DialogContent><DialogActions><Button onClick={() => setDetail(null)}>Cerrar</Button>{safeDetail?.editability.available && has('invoices:update') && <Button variant="contained" onClick={() => { editDraft(safeDetail.invoice); setDetail(null); }}>Editar</Button>}</DialogActions></Dialog>
  </Stack>;
}
