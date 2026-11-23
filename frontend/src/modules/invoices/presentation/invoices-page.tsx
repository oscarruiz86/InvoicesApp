import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useStore } from 'zustand';
import { Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Link, MenuItem, Paper,
  Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { DataPagination } from '@/shared/components/data-pagination';
import { DataTable, DataTableAction, DataTableSortHeader, DataTableSurface } from '@/shared/components/data-table';
import { PageHeader } from '@/shared/components/page-header';
import { AppliedFilters } from '@/shared/components/applied-filters';
import { ListFilterDialog } from '@/shared/components/list-filter-dialog';
import { MobileSortControl } from '@/shared/components/mobile-sort-control';
import { RecordMetadata } from '@/shared/components/record-metadata';
import { FormDialog } from '@/shared/components/form-dialog';
import { TableLoadingState } from '@/shared/components/table-loading-state';
import { SuccessNotice } from '@/shared/components/success-notice';
import type { AssignmentApi } from '@/modules/fleet/application/fleet-api';
import type { InvoiceApi, InvoiceDetailsDto, InvoiceDto, InvoiceFields, InvoicePage, InvoiceQuery, InvoiceUpdateFields } from '../application/invoice-api';
import type { QrDecoderLoader } from '../application/qr-decoder';
import { InvoiceQrCapture } from './invoice-qr-capture';
import { ApplicationError } from '@/shared/application/application-error';
import { RequestError } from '@/shared/application/request-error';

interface FormValues { assignmentId: string; vehicleId: string; invoiceDate: string; invoiceTime: string; invoiceNumber: string; issuerNit: string; buyerDocument: string;
  amount: string; vatAmount: string; otherTaxesAmount: string; totalAmount: string; image: File | undefined }
const emptyForm: FormValues = { assignmentId: '', vehicleId: '', invoiceDate: '', invoiceTime: '', invoiceNumber: '', issuerNit: '', buyerDocument: '', amount: '', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '' , image: undefined };
function failure(error: unknown) {
  if (error instanceof RequestError) return ({ INVOICE_DUPLICATE: 'Ya existe una factura con el mismo NIT y número.', IDEMPOTENCY_CONFLICT: 'La solicitud repetida contiene datos distintos.',
    INVOICE_VERSION_CONFLICT: 'La factura cambió. Actualiza los datos e inténtalo de nuevo.', ASSIGNMENT_NOT_ELIGIBLE: 'La asignación ya no está activa o disponible.',
    EDIT_POLICY_UNAVAILABLE: 'No se pudo confirmar una vigencia activa para editar esta factura. Verifica la configuración de la ventana de edición e inténtalo de nuevo.', EDIT_WINDOW_CLOSED: 'Terminó la ventana de edición.',
    IMAGE_REQUIRED: 'Adjunta una imagen para registrar la factura manualmente.',
    IMAGE_TOO_LARGE: 'La imagen supera el máximo de 5 MiB.', IMAGE_TYPE_UNSUPPORTED: 'Selecciona una imagen JPEG o PNG.', IMAGE_INVALID: 'El archivo no es una imagen válida.' } as Record<string, string>)[error.businessCode]
    ?? 'No se pudo completar la operación. Inténtalo de nuevo.';
  return error instanceof ApplicationError && error.code === 'FORBIDDEN' ? 'No tienes permiso para consultar esta factura.' : 'No se pudo completar la operación.';
}
const money = (value: string) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2 }).format(Number(value));
function safeSourceUrl(value?: string): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null; }
  catch { return null; }
}
function formatCurrencyInput(value: string): string {
  const cleaned = value.replace(/[^\d,]/g, ''), comma = cleaned.indexOf(',');
  const integer = (comma < 0 ? cleaned : cleaned.slice(0, comma)).slice(0, 14);
  const fraction = comma < 0 ? '' : cleaned.slice(comma + 1).replace(/,/g, '').slice(0, 2);
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped}${comma < 0 ? '' : `,${fraction}`}`;
}
function localizeCurrency(value: string): string { return formatCurrencyInput(value.replace('.', ',')); }
function canonicalCurrency(value: string): string {
  if (!value.trim()) return '';
  const [whole = '', fraction] = value.replace(/\./g, '').replace(',', '.').split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
  return fraction === undefined || fraction === '' ? normalizedWhole : `${normalizedWhole}.${fraction}`;
}

export function InvoicesPage({ api, assignments, context, authorization, loadQrDecoder }: { readonly api: InvoiceApi; readonly assignments: AssignmentApi;
  readonly loadQrDecoder: QrDecoderLoader;
  readonly context: ContextStore; readonly authorization: AuthorizationStore }) {
  const current = useStore(context), auth = useStore(authorization);
  const [query, setQuery] = useState<InvoiceQuery>({ page: 1, pageSize: 20, sort: 'invoiceDate', direction: 'desc' });
  const [draft, setDraft] = useState({ q: '', vehicleId: '', vehicleLabel: '', driverId: '', driverLabel: '', dateFrom: '', dateTo: '' });
  const [filterDraft, setFilterDraft] = useState(draft), [filtersOpen, setFiltersOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [data, setData] = useState<{ generation: number; page: Awaited<ReturnType<InvoiceApi['list']>> } | null>(null);
  const [error, setError] = useState<{ generation: number; text: string } | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ generation: number; value: FormValues; mode: 'create' | 'edit'; invoice?: InvoiceDto } | null>(null);
  const [options, setOptions] = useState<Awaited<ReturnType<AssignmentApi['listAssignments']>>['items']>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [detail, setDetail] = useState<{ generation: number; value: InvoiceDetailsDto } | null>(null);
  const [detailImage, setDetailImage] = useState<string | null>(null);
  const [imageOpen, setImageOpen] = useState(false), [detailImageLoading, setDetailImageLoading] = useState(false), [detailImageError, setDetailImageError] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const intent = useRef(0), contextGeneration = useRef(current.generation), mounted = useRef(true), idempotency = useRef<string | null>(null), submitting = useRef(false);
  const page = data?.generation === current.generation ? data.page : null;
  const safeForm = form?.generation === current.generation ? form : null;
  const creating = safeForm?.mode === 'create';
  const safeDetail = detail?.generation === current.generation ? detail.value : null;
  const message = error?.generation === current.generation ? error.text : null;
  const has = (permission: Parameters<typeof auth.has>[0]) => auth.has(permission);
  const canEditInvoice = (invoice: InvoicePage['items'][number]) => Boolean(has('invoices:update') && invoice.editability.available);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => context.register({ dirty: () => Boolean(safeForm || filtersOpen || qrOpen), clear: () => {
    setData(null); setForm(null); setDetail(null); setOptions([]); setError(null); setNotice(null); setDetailImage(null); idempotency.current = null; setQrOpen(false);
  } }), [context, filtersOpen, qrOpen, safeForm]);
  useEffect(() => {
    if (contextGeneration.current === current.generation) return;
    contextGeneration.current = current.generation; ++intent.current;
    setData(null); setForm(null); setDetail(null); setOptions([]); setError(null); setNotice(null); setDetailImage(null); setQrOpen(false);
    const clean = { q: '', vehicleId: '', vehicleLabel: '', driverId: '', driverLabel: '', dateFrom: '', dateTo: '' }; setDraft(clean); setFilterDraft(clean);
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
    if (!creating && !qrOpen && !filtersOpen) { setOptions([]); return; }
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch { return; }
    const controller = new AbortController(); setOptionsLoading(true);
    void assignments.listAssignments(capture.scope, { page: 1, pageSize: 100, sort: 'startedAt', direction: 'desc', ...(creating || qrOpen ? { status: 'ACTIVE' as const } : {}) }, AbortSignal.any([capture.signal, controller.signal]))
      .then(result => { if (capture.isCurrent() && !controller.signal.aborted) setOptions(result.items); })
      .catch(cause => { if (capture.isCurrent() && !controller.signal.aborted) setError({ generation: current.generation, text: failure(cause) }); })
      .finally(() => { capture.release(); if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [assignments, context, current.generation, creating, filtersOpen, qrOpen, safeForm?.generation]);
  useEffect(() => {
    if (!safeForm?.value.image) { setPreview(null); return; }
    const url = URL.createObjectURL(safeForm.value.image); setPreview(url); return () => URL.revokeObjectURL(url);
  }, [safeForm?.value.image]);
  useEffect(() => {
    let active = true, capture: ReturnType<ContextStore['capture']> | undefined;
    if (!safeDetail?.invoice.imageUrl) { setDetailImage(null); setDetailImageLoading(false); setDetailImageError(false); return; }
    try { capture = context.capture(); } catch { setDetailImage(null); return; }
    const controller = new AbortController();
    setDetailImageLoading(true); setDetailImageError(false);
    void api.image(capture.scope, safeDetail.invoice.id, AbortSignal.any([capture.signal, controller.signal]))
      .then(blob => { if (active && !controller.signal.aborted && capture?.isCurrent()) setDetailImage(URL.createObjectURL(blob)); })
      .catch(() => { if (active && capture?.isCurrent()) { setDetailImage(null); setDetailImageError(true); } })
      .finally(() => { if (active && !controller.signal.aborted) setDetailImageLoading(false); });
    return () => { active = false; controller.abort(); capture?.release(); };
  }, [api, context, safeDetail?.invoice.id, safeDetail?.invoice.imageUrl]);
  useEffect(() => () => { if (detailImage) URL.revokeObjectURL(detailImage); }, [detailImage]);

  function openFilters() { setFilterDraft(draft); setFiltersOpen(true); }
  function applyFilters() {
    const clean = { ...filterDraft, q: filterDraft.q.trim(), vehicleId: filterDraft.vehicleId.trim(), driverId: filterDraft.driverId.trim() };
    setDraft(clean); setQuery(value => ({ ...value, page: 1, q: clean.q || undefined, vehicleId: clean.vehicleId || undefined,
      driverId: clean.driverId || undefined, dateFrom: clean.dateFrom || undefined, dateTo: clean.dateTo || undefined })); setFiltersOpen(false);
  }
  function clearFilters() { const clean = { q: '', vehicleId: '', vehicleLabel: '', driverId: '', driverLabel: '', dateFrom: '', dateTo: '' }; setFilterDraft(clean); setDraft(clean); setQuery(value => ({ ...value, q: undefined, vehicleId: undefined, driverId: undefined, dateFrom: undefined, dateTo: undefined, page: 1 })); setFiltersOpen(false); }
  function createDraft() { if (!has('invoices:create')) return; setError(null); setForm({ generation: current.generation, value: { ...emptyForm }, mode: 'create' }); idempotency.current = null; }
  function openQrCapture() { if (!has('invoices:create')) return; setForm(null); setQrOpen(true); }
  function editDraft(value: InvoiceDto) {
    setForm({ generation: current.generation, mode: 'edit', invoice: value, value: { ...emptyForm, invoiceDate: value.invoiceDate, invoiceTime: value.invoiceTime,
      invoiceNumber: value.invoiceNumber, issuerNit: value.issuerNit, buyerDocument: value.buyerDocument, amount: localizeCurrency(value.amounts.amount),
      vatAmount: localizeCurrency(value.amounts.vatAmount), otherTaxesAmount: localizeCurrency(value.amounts.otherTaxesAmount), totalAmount: localizeCurrency(value.amounts.totalAmount) } });
  }
  function field(name: keyof FormValues, value: string | File | undefined) { setForm(state => state?.generation === current.generation ? { ...state, value: { ...state.value, [name]: value } } : state); }
  function currencyChange(name: 'amount' | 'vatAmount' | 'otherTaxesAmount' | 'totalAmount', event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const input = event.currentTarget, cursor = input.selectionStart ?? input.value.length;
    const visibleCharactersBeforeCursor = (input.value.slice(0, cursor).match(/[\d,]/g) ?? []).length;
    const formatted = formatCurrencyInput(input.value);
    field(name, formatted);
    requestAnimationFrame(() => {
      if (!input.isConnected) return;
      let position = 0, visibleCharacters = 0;
      while (position < formatted.length && visibleCharacters < visibleCharactersBeforeCursor) {
        if (/[\d,]/.test(formatted[position])) visibleCharacters++;
        position++;
      }
      input.setSelectionRange(position, position);
    });
  }
  function submit() {
    if (!safeForm || busy || submitting.current || (safeForm.mode === 'create' && !safeForm.value.image)) return;
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch (cause) { setError({ generation: current.generation, text: failure(cause) }); return; }
    const generation = current.generation, controller = new AbortController(); submitting.current = true; setBusy(true); setError(null); setNotice(null);
    const value = safeForm.value;
    const work = safeForm.mode === 'create'
      ? (() => { idempotency.current ??= crypto.randomUUID(); const fields: InvoiceFields = { assignmentId: value.assignmentId, vehicleId: value.vehicleId,
        invoiceDate: value.invoiceDate, invoiceTime: value.invoiceTime, invoiceNumber: value.invoiceNumber, issuerNit: value.issuerNit,
        buyerDocument: value.buyerDocument, amount: canonicalCurrency(value.amount), vatAmount: canonicalCurrency(value.vatAmount), otherTaxesAmount: canonicalCurrency(value.otherTaxesAmount),
        totalAmount: canonicalCurrency(value.totalAmount), ...(value.image ? { image: value.image } : {}) };
        return api.create(capture.scope, fields, idempotency.current, AbortSignal.any([capture.signal, controller.signal])); })()
      : (() => { const fields: InvoiceUpdateFields = { expectedVersion: safeForm.invoice!.version, invoiceDate: value.invoiceDate, invoiceTime: value.invoiceTime,
        invoiceNumber: value.invoiceNumber, issuerNit: value.issuerNit, buyerDocument: value.buyerDocument, amount: canonicalCurrency(value.amount),
        vatAmount: canonicalCurrency(value.vatAmount), otherTaxesAmount: canonicalCurrency(value.otherTaxesAmount), totalAmount: canonicalCurrency(value.totalAmount), ...(value.image ? { image: value.image } : {}) };
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
  const removeAppliedFilter = (key: string) => {
    if (key === 'q') { setQuery(value => ({ ...value, q: undefined, page: 1 })); setDraft(value => ({ ...value, q: '' })); }
    if (key === 'vehicleId') { setQuery(value => ({ ...value, vehicleId: undefined, page: 1 })); setDraft(value => ({ ...value, vehicleId: '', vehicleLabel: '' })); }
    if (key === 'driverId') { setQuery(value => ({ ...value, driverId: undefined, page: 1 })); setDraft(value => ({ ...value, driverId: '', driverLabel: '' })); }
    if (key === 'dateFrom') { setQuery(value => ({ ...value, dateFrom: undefined, page: 1 })); setDraft(value => ({ ...value, dateFrom: '' })); }
    if (key === 'dateTo') { setQuery(value => ({ ...value, dateTo: undefined, page: 1 })); setDraft(value => ({ ...value, dateTo: '' })); }
  };
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
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>{(['amount', 'vatAmount', 'otherTaxesAmount'] as const).map((key, index) => <TextField key={key} fullWidth label={['Valor de factura', 'IVA', 'Otros impuestos'][index]} slotProps={{ htmlInput: { inputMode: 'decimal' } }} value={safeForm.value[key]} disabled={busy} onChange={event => currencyChange(key, event)} />)}</Stack>
    <TextField fullWidth label="Valor total" slotProps={{ htmlInput: { inputMode: 'decimal' } }} value={safeForm.value.totalAmount} disabled={busy} onChange={event => currencyChange('totalAmount', event)} />
    {safeForm.mode === 'edit' && safeForm.invoice?.origin === 'QR' && (safeForm.invoice.qrMetadata?.cufe || safeSourceUrl(safeForm.invoice.qrMetadata?.sourceUrl)) && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
      {safeForm.invoice.qrMetadata?.cufe && <TextField fullWidth label="CUFE" value={safeForm.invoice.qrMetadata.cufe} slotProps={{ input: { readOnly: true } }} />}
      {safeSourceUrl(safeForm.invoice.qrMetadata?.sourceUrl) && <Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">Link de origen QR</Typography><Link href={safeSourceUrl(safeForm.invoice.qrMetadata?.sourceUrl)!} target="_blank" rel="noopener noreferrer" sx={{ display: 'block' }}>Ir a la DIAN</Link></Box>}
    </Box>}
    <Button component="label" variant="outlined" disabled={busy} aria-required={safeForm.mode === 'create'}>
      {safeForm.mode === 'create' ? 'Adjuntar imagen (obligatoria)' : 'Adjuntar imagen (opcional)'}
      <input hidden type="file" accept="image/jpeg,image/png" aria-label={safeForm.mode === 'create' ? 'Imagen de factura obligatoria' : 'Imagen opcional de factura'} onChange={event => field('image', event.target.files?.[0])} />
    </Button>
    {safeForm.mode === 'create' && !safeForm.value.image && <Typography role="alert" color="error" variant="body2">Adjunta la imagen de la factura para poder registrarla.</Typography>}
    {preview && <Box component="img" src={preview} alt="Vista previa de la imagen adjunta" sx={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 1 }} />}
  </Stack>;

  return <Stack spacing={1.5} sx={{ minWidth: 0 }}>
    <PageHeader title="Facturas" />
    {notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {message && <Alert severity="error" onClose={() => setError(null)}>{message}</Alert>}
    <AppliedFilters filters={[
      ...(query.q ? [{ key: 'q', label: `Búsqueda: ${query.q}` }] : []),
      ...(query.vehicleId ? [{ key: 'vehicleId', label: `Placa: ${draft.vehicleLabel || query.vehicleId}` }] : []),
      ...(query.driverId ? [{ key: 'driverId', label: `Conductor: ${draft.driverLabel || query.driverId}` }] : []),
      ...(query.dateFrom ? [{ key: 'dateFrom', label: `Desde: ${query.dateFrom}` }] : []),
      ...(query.dateTo ? [{ key: 'dateTo', label: `Hasta: ${query.dateTo}` }] : []),
    ]} onRemove={removeAppliedFilter} onClear={clearFilters} />
    {!loading && page?.items.length === 0 && <Alert severity="info">No hay facturas que coincidan con la consulta. Ajusta la búsqueda o limpia los filtros.</Alert>}
    <DataTable toolbar={<>{has('invoices:create') && <DataTableAction label="Registrar factura" primary onClick={createDraft}><SvgIcon fontSize="small" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z" /></SvgIcon></DataTableAction>}<DataTableAction label="Filtrar facturas" onClick={openFilters}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 5h18l-7.5 8.2V19l-3 1.7v-7.5L3 5z" /></SvgIcon></DataTableAction></>} mobileSortAction={<MobileSortControl fields={[
      { key: 'invoiceNumber', label: 'Número de factura' }, { key: 'invoiceDate', label: 'Fecha' }, { key: 'totalAmount', label: 'Valor total' }, { key: 'createdAt', label: 'Fecha de creación' },
    ]} sortBy={query.sort} direction={query.direction} onChange={(sort, direction) => setQuery(value => ({ ...value, sort: sort as InvoiceQuery['sort'], direction, page: 1 }))} />} loading={loading}>
      <DataTableSurface loading={loading} sx={{ display: { xs: 'none', md: 'block' } }}>
        <Table size="small" aria-label="Facturas registradas" sx={{ width: '100%', tableLayout: 'fixed', '& .MuiTableCell-root': { minWidth: 0, overflowWrap: 'anywhere' } }}><TableHead><TableRow>
          {([['invoiceNumber', 'Número'], ['vehiclePlate', 'Vehículo'], ['invoiceDate', 'Fecha'], ['issuerNit', 'Emisor']] as const).map(([key, label]) =>
            <TableCell key={key} sx={{ display: key === 'issuerNit' ? { xs: 'none', xl: 'table-cell' } : key === 'vehiclePlate' ? { xs: 'none', md: 'table-cell' } : undefined }}>{key === 'issuerNit' || key === 'vehiclePlate' ? label : <DataTableSortHeader active={query.sort === key} direction={query.direction} onClick={() => sort(key as InvoiceQuery['sort'])}>{label}</DataTableSortHeader>}</TableCell>)}
          <TableCell>Origen</TableCell><TableCell><DataTableSortHeader active={query.sort === 'totalAmount'} direction={query.direction} onClick={() => sort('totalAmount')}>Total</DataTableSortHeader></TableCell>
          <TableCell>Acciones</TableCell></TableRow></TableHead><TableBody>
          {loading && !page ? <TableLoadingState columns={7} rows={4} /> : page?.items.map(value => <TableRow key={value.id} hover>
            <TableCell>{value.invoiceNumber}</TableCell><TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{value.vehiclePlate ?? value.vehicleId}</TableCell>
            <TableCell>{value.invoiceDate} {value.invoiceTime.slice(0, 5)}</TableCell><TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>{value.issuerNit}</TableCell>
            <TableCell>{value.origin === 'QR' ? 'Lectura QR' : 'Manual'}</TableCell><TableCell>{money(value.amounts.totalAmount)}</TableCell>
            <TableCell><Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><DataTableAction label="Consultar factura" onClick={() => detailFor(value)}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 5c-5 0-9.27 3.11-11 7 1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></SvgIcon></DataTableAction>{canEditInvoice(value) && <DataTableAction label="Editar factura" onClick={() => editDraft(value)}><SvgIcon fontSize="small" aria-hidden="true"><path d="m3 17.25 11.06-11.06 3.75 3.75L6.75 21H3v-3.75ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" /></SvgIcon></DataTableAction>}</Stack></TableCell></TableRow>)}
          {!loading && page?.items.length === 0 && <TableRow><TableCell colSpan={7} /></TableRow>}
        </TableBody></Table>
      </DataTableSurface>
      {page && <Box sx={{ display: { xs: 'none', md: 'block' } }}><DataPagination page={query.page} pageSize={query.pageSize} total={page.total} onPageChange={next => setQuery(value => ({ ...value, page: next }))}
        onPageSizeChange={size => setQuery(value => ({ ...value, page: 1, pageSize: size }))} onRefresh={() => void load()} disabled={loading} /></Box>}
      {page?.items.map(value => <Paper key={`mobile-${value.id}`} variant="outlined" sx={{ display: { xs: 'block', md: 'none' }, p: 1.5 }}>
        <Typography sx={{ fontWeight: 700 }}>{value.invoiceNumber}</Typography><Typography>{value.invoiceDate} · {value.vehiclePlate ?? value.vehicleId}</Typography>
        <Typography>Origen: {value.origin === 'QR' ? 'Lectura QR' : 'Manual'}</Typography><Typography>{money(value.amounts.totalAmount)}</Typography><Button onClick={() => detailFor(value)}>Consultar factura</Button></Paper>)}
      {page && <Box sx={{ display: { xs: 'block', md: 'none' } }}><DataPagination page={query.page} pageSize={query.pageSize} total={page.total} onPageChange={next => setQuery(value => ({ ...value, page: next }))}
        onPageSizeChange={size => setQuery(value => ({ ...value, page: 1, pageSize: size }))} onRefresh={() => void load()} disabled={loading} /></Box>}
    </DataTable>
    <ListFilterDialog open={filtersOpen} onClose={() => setFiltersOpen(false)} onApply={applyFilters} title="Filtrar facturas" leadingAction={<Button onClick={clearFilters}>Limpiar</Button>}>
      <Box sx={{ pt: 1, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
      <TextField fullWidth sx={{ gridColumn: { sm: '1 / -1' } }} label="Número o NIT" value={filterDraft.q} onChange={event => setFilterDraft(value => ({ ...value, q: event.target.value }))} />
      <Autocomplete fullWidth options={[...new Map(options.map(item => [item.vehicleId, item])).values()]} loading={optionsLoading}
        value={options.find(item => item.vehicleId === filterDraft.vehicleId) ?? null} getOptionLabel={item => item.vehiclePlate ?? item.vehicleId}
        isOptionEqualToValue={(option, value) => option.vehicleId === value.vehicleId}
        onChange={(_, value) => setFilterDraft(current => ({ ...current, vehicleId: value?.vehicleId ?? '', vehicleLabel: value?.vehiclePlate ?? '' }))}
        renderInput={params => <TextField {...params} label="Placa" placeholder="Buscar placa" />} />
      <Autocomplete fullWidth options={[...new Map(options.map(item => [item.driver.id, item])).values()]} loading={optionsLoading}
        value={options.find(item => item.driver.id === filterDraft.driverId) ?? null} getOptionLabel={item => item.driver.name}
        isOptionEqualToValue={(option, value) => option.driver.id === value.driver.id}
        onChange={(_, value) => setFilterDraft(current => ({ ...current, driverId: value?.driver.id ?? '', driverLabel: value?.driver.name ?? '' }))}
        renderInput={params => <TextField {...params} label="Conductor" placeholder="Buscar conductor" />} />
      <TextField fullWidth label="Fecha desde" type="date" slotProps={{ inputLabel: { shrink: true } }} value={filterDraft.dateFrom} onChange={event => setFilterDraft(value => ({ ...value, dateFrom: event.target.value }))} />
      <TextField fullWidth label="Fecha hasta" type="date" slotProps={{ inputLabel: { shrink: true } }} value={filterDraft.dateTo} onChange={event => setFilterDraft(value => ({ ...value, dateTo: event.target.value }))} />
      </Box>
    </ListFilterDialog>
    <FormDialog open={Boolean(safeForm)} onClose={() => setForm(null)} busy={busy} maxWidth="md" title={safeForm?.mode === 'create' ? 'Registrar factura manual' : 'Editar factura'} actions={<>
      {safeForm?.mode === 'create' && has('invoices:create') && <Button variant="outlined" disabled={busy} onClick={openQrCapture}>Registrar desde QR</Button>}
      <Button disabled={busy} onClick={() => setForm(null)}>Cancelar</Button>
      <Button variant="contained" disabled={busy || (safeForm?.mode === 'create' && (!safeForm.value.assignmentId || !safeForm.value.image))} onClick={submit}>{busy ? 'Guardando…' : 'Guardar factura'}</Button>
    </>}>
      {!safeForm?.value.assignmentId && safeForm?.mode === 'create' && <Alert severity="info" sx={{ mb: 1 }}>Selecciona una asignación activa propia. La fecha comercial no habilita asignaciones históricas.</Alert>}{formNode}
      {optionsLoading && <CircularProgress size={20} />}{message && <Alert severity="error" sx={{ mt: 1 }}>{message}</Alert>}
    </FormDialog>
    <FormDialog open={Boolean(safeDetail)} onClose={() => { setImageOpen(false); setDetail(null); }} maxWidth="md" title="Detalle de factura" actions={<><Button onClick={() => { setImageOpen(false); setDetail(null); }}>Cerrar</Button>{safeDetail?.editability.available && has('invoices:update') && <Button variant="contained" onClick={() => { editDraft(safeDetail.invoice); setDetail(null); }}>Editar</Button>}</>}>
      <Stack spacing={1.25} sx={{ pt: 1 }}>
      {safeDetail && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
        <Typography>Número: {safeDetail.invoice.invoiceNumber}</Typography><Typography>Fecha y hora: {safeDetail.invoice.invoiceDate} {safeDetail.invoice.invoiceTime}</Typography>
        <Typography>NIT emisor: {safeDetail.invoice.issuerNit}</Typography><Typography>Documento adquiriente: {safeDetail.invoice.buyerDocument}</Typography>
        <Typography>Vehículo: {safeDetail.invoice.vehiclePlate ?? safeDetail.invoice.vehicleId}</Typography><Typography>Origen: {safeDetail.invoice.origin === 'QR' ? 'Lectura QR' : 'Manual'}</Typography>
        <Typography>Valor de factura: {money(safeDetail.invoice.amounts.amount)}</Typography><Typography>IVA: {money(safeDetail.invoice.amounts.vatAmount)}</Typography>
        <Typography>Otros impuestos: {money(safeDetail.invoice.amounts.otherTaxesAmount)}</Typography><Typography>Valor total: {money(safeDetail.invoice.amounts.totalAmount)}</Typography>
        {safeDetail.invoice.qrMetadata?.cufe && <Typography sx={{ overflowWrap: 'anywhere' }}>CUFE: {safeDetail.invoice.qrMetadata.cufe}</Typography>}
        {safeSourceUrl(safeDetail.invoice.qrMetadata?.sourceUrl) && <Box sx={{ minWidth: 0 }}><Typography component="span">URL de origen QR: </Typography><Link href={safeSourceUrl(safeDetail.invoice.qrMetadata?.sourceUrl)!} target="_blank" rel="noopener noreferrer">Ir a la DIAN</Link></Box>}
        {safeDetail.invoice.imageUrl && <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography>Imagen adjunta</Typography><Button size="small" variant="outlined" onClick={() => setImageOpen(true)}>Ver</Button></Stack>}
      </Box>}
      {safeDetail && <>
        <RecordMetadata createdAt={safeDetail.invoice.createdAt} updatedAt={safeDetail.invoice.updatedAt} formatDate={value => new Date(value).toLocaleString('es-CO')} />
        {safeDetail.editability.reason === 'EDIT_POLICY_UNAVAILABLE' && <Alert severity="info">No se pudo confirmar una vigencia activa para editar esta factura. Verifica la configuración de la ventana de edición e inténtalo de nuevo.</Alert>}
        {safeDetail.editability.reason === 'EDIT_WINDOW_CLOSED' && <Alert severity="info">La ventana de edición de esta factura terminó.</Alert>}
        {safeDetail.editability.reason === 'QR_IMMUTABLE' && <Alert severity="info">Factura capturada desde QR. Sus datos, asignación e imagen son inmutables y el origen no constituye validación fiscal.</Alert>}
      </>}
      </Stack>
    </FormDialog>
    <Dialog open={imageOpen && Boolean(safeDetail?.invoice.imageUrl)} onClose={() => setImageOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>Imagen de la factura</DialogTitle><DialogContent dividers sx={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
        {detailImage && <Box component="img" src={detailImage} alt="Imagen adjunta a la factura" sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />}
        {detailImageLoading && <CircularProgress aria-label="Cargando imagen" />}
        {detailImageError && <Alert severity="error">No se pudo cargar la imagen de la factura.</Alert>}
      </DialogContent><DialogActions><Button onClick={() => setImageOpen(false)}>Cerrar</Button></DialogActions>
    </Dialog>
    {has('invoices:create') && <InvoiceQrCapture open={qrOpen} api={api} loadDecoder={loadQrDecoder} assignments={options} context={context}
      onClose={() => setQrOpen(false)} onSaved={() => { setNotice('Factura registrada desde QR.'); void load(); }} />}
  </Stack>;
}
