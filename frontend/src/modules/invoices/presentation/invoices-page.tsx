import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useStore } from 'zustand';
import { Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Link, MenuItem, Paper,
  Stack, SvgIcon, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography } from '@mui/material';
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
import type { AssignmentApi, AssignmentDto } from '@/modules/fleet/application/fleet-api';
import type { InvoiceApi, InvoiceDetailsDto, InvoiceDto, InvoiceFields, InvoicePage, InvoiceQuery, InvoiceUpdateFields,
  OfflineInvoiceConflictItemDto, OfflineInvoiceResolutionInput, OfflineSubmissionHistoryPageDto } from '../application/invoice-api';
import type { QrDecoderLoader } from '../application/qr-decoder';
import { InvoiceQrCapture } from './invoice-qr-capture';
import { ApplicationError } from '@/shared/application/application-error';
import { RequestError } from '@/shared/application/request-error';
import type { OfflineCredentialPublicJwk, OfflineCredentialVerifier, OfflineInvoiceQueuePort, OfflineInvoiceRecord } from '../application/offline-invoice-ports';
import { synchronizeOfflineInvoices } from '../application/offline-invoice-sync';
import { normalizeInvoiceTime } from '../application/invoice-time';
import { parseInvoiceQr } from '@shared/invoice-qr';

interface FormValues { assignmentId: string; vehicleId: string; invoiceDate: string; invoiceTime: string; invoiceNumber: string; issuerNit: string; buyerDocument: string;
  amount: string; vatAmount: string; otherTaxesAmount: string; totalAmount: string; image: File | undefined }
const emptyForm: FormValues = { assignmentId: '', vehicleId: '', invoiceDate: '', invoiceTime: '', invoiceNumber: '', issuerNit: '', buyerDocument: '', amount: '', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '' , image: undefined };
const offlineRecordStatusLabel: Record<OfflineInvoiceRecord['status'], string> = {
  PENDING: 'Pendiente', SENDING: 'Enviando', RETRYABLE_FAILURE: 'Error temporal', REQUIRES_CORRECTION: 'Requiere corrección', CONFLICT: 'En revisión',
  SYNCHRONIZED: 'Sincronizada', LINKED: 'Vinculada', REJECTED: 'Rechazada',
};
function offlineRecordStatusColor(status: OfflineInvoiceRecord['status']) {
  if (status === 'REQUIRES_CORRECTION' || status === 'CONFLICT') return 'warning';
  if (status === 'RETRYABLE_FAILURE' || status === 'REJECTED') return 'error';
  if (status === 'SYNCHRONIZED' || status === 'LINKED') return 'success';
  if (status === 'SENDING') return 'info';
  return 'default';
}
function failure(error: unknown) {
  if (error instanceof RequestError) {
    if (error.businessCode === 'INVALID_REQUEST' && error.fields.includes('invoiceTime')) return 'La hora de factura debe tener el formato HH:mm:ss.';
    if (error.businessCode === 'INVALID_REQUEST' && error.fields.length) {
      const labels: Record<string, string> = { invoiceDate: 'fecha de factura', invoiceNumber: 'número de factura', issuerNit: 'NIT del emisor',
        buyerDocument: 'documento del adquiriente', amount: 'valor antes de impuestos', vatAmount: 'IVA', otherTaxesAmount: 'otros impuestos', totalAmount: 'total', qrContent: 'contenido del código QR' };
      const fields = error.fields.map(field => labels[field]).filter(Boolean);
      return fields.length ? `Revisa ${fields.join(', ')} antes de guardar.` : 'Revisa los datos de la factura antes de guardar.';
    }
    return ({ INVOICE_DUPLICATE: 'Ya existe una factura con el mismo NIT y número.', IDEMPOTENCY_CONFLICT: 'La solicitud repetida contiene datos distintos.',
    INVOICE_VERSION_CONFLICT: 'La factura cambió. Actualiza los datos e inténtalo de nuevo.', SUBMISSION_VERSION_CONFLICT: 'El envío cambió. Actualiza los conflictos e inténtalo de nuevo.', ASSIGNMENT_NOT_ELIGIBLE: 'La asignación ya no está activa o disponible.',
    EDIT_POLICY_UNAVAILABLE: 'No se pudo confirmar una vigencia activa para editar esta factura. Verifica la configuración de la ventana de edición e inténtalo de nuevo.', EDIT_WINDOW_CLOSED: 'Terminó la ventana de edición.',
    IMAGE_REQUIRED: 'Adjunta una imagen para registrar la factura manualmente.',
    IMAGE_TOO_LARGE: 'La imagen supera el máximo de 5 MiB.', IMAGE_TYPE_UNSUPPORTED: 'Selecciona una imagen JPEG o PNG.', IMAGE_INVALID: 'El archivo no es una imagen válida.' } as Record<string, string>)[error.businessCode]
      ?? 'No se pudo completar la operación. Inténtalo de nuevo.';
  }
  return error instanceof ApplicationError && error.code === 'FORBIDDEN' ? 'No tienes permiso para consultar esta factura.' : 'No se pudo completar la operación.';
}
function historyFailure(error: unknown): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'El historial requiere conexión. Vuelve a intentarlo cuando recuperes la red.';
  if (error instanceof ApplicationError && error.code === 'FORBIDDEN' || error instanceof RequestError && error.businessCode === 'FORBIDDEN')
    return 'No tienes permiso para consultar el historial de este tercero.';
  if (error instanceof ApplicationError && ['NETWORK', 'TIMEOUT'].includes(error.code))
    return 'No se pudo conectar con el servicio de facturas. Verifica la API e inténtalo de nuevo.';
  return 'No se pudo cargar el historial. Verifica la conexión y que el servicio de facturas esté disponible.';
}
function isTransientOfflineFailure(error: unknown): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
    || error instanceof ApplicationError && (error.code === 'NETWORK' || error.code === 'TIMEOUT');
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
function offlineInvoicePreview(record: OfflineInvoiceRecord): Record<string, string> | null {
  if (record.origin === 'QR') {
    try {
      const parsed = parseInvoiceQr(record.payload.qrContent ?? '');
      return { invoiceDate: parsed.invoiceDate, invoiceTime: parsed.invoiceTime, invoiceNumber: parsed.invoiceNumber, issuerNit: parsed.issuerNit,
        buyerDocument: parsed.buyerDocument, amount: parsed.amount, vatAmount: parsed.vatAmount, otherTaxesAmount: parsed.otherTaxesAmount,
        totalAmount: parsed.totalAmount, ...(parsed.metadata.cufe ? { cufe: parsed.metadata.cufe } : {}) };
    } catch { return null; }
  }
  return record.payload;
}
function canonicalCurrency(value: string): string {
  if (!value.trim()) return '';
  const [whole = '', fraction] = value.replace(/\./g, '').replace(',', '.').split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
  return fraction === undefined || fraction === '' ? normalizedWhole : `${normalizedWhole}.${fraction}`;
}

export function InvoicesPage({ api, assignments, context, authorization, loadQrDecoder, offlineCredentialPublicJwks, offlineQueue, verifyCredential }: { readonly api: InvoiceApi; readonly assignments: AssignmentApi;
  readonly loadQrDecoder: QrDecoderLoader;
  readonly context: ContextStore; readonly authorization: AuthorizationStore; readonly offlineCredentialPublicJwks?: readonly OfflineCredentialPublicJwk[];
  readonly offlineQueue: OfflineInvoiceQueuePort; readonly verifyCredential: OfflineCredentialVerifier }) {
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
  const [offlineRecords, setOfflineRecords] = useState<OfflineInvoiceRecord[]>([]);
  const [queuePageNumber, setQueuePageNumber] = useState(1), [queuePageSize, setQueuePageSize] = useState(10);
  const [driverTab, setDriverTab] = useState<'registered' | 'pending' | 'history'>('registered');
  const [pendingDetail, setPendingDetail] = useState<OfflineInvoiceRecord | null>(null);
  const [historyData, setHistoryData] = useState<OfflineSubmissionHistoryPageDto | null>(null), [historyLoading, setHistoryLoading] = useState(false);
  const [historyPageNumber, setHistoryPageNumber] = useState(1), [historyPageSize, setHistoryPageSize] = useState(10), [historyError, setHistoryError] = useState<string | null>(null);
  const [adminHistoryOpen, setAdminHistoryOpen] = useState(false);
  const [conflicts, setConflicts] = useState<OfflineInvoiceConflictItemDto[]>([]), [conflictsLoading, setConflictsLoading] = useState(false);
  const [conflictsTotal, setConflictsTotal] = useState(0), [conflictPageNumber, setConflictPageNumber] = useState(1);
  const [conflictAssignments, setConflictAssignments] = useState<Record<string, AssignmentDto>>({}), [conflictsDialogOpen, setConflictsDialogOpen] = useState(false);
  const [retryingRecordId, setRetryingRecordId] = useState<string | null>(null);
  const [resolutionTarget, setResolutionTarget] = useState<OfflineInvoiceConflictItemDto | null>(null);
  const [resolutionReason, setResolutionReason] = useState(''), [candidateId, setCandidateId] = useState('');
  const [conflictImage, setConflictImage] = useState<string | null>(null), [conflictImageOpen, setConflictImageOpen] = useState(false);
  const [correctingRecordId, setCorrectingRecordId] = useState<string | null>(null);
  const [offlineCredentialStatus, setOfflineCredentialStatus] = useState<'unknown' | 'ready' | 'unavailable'>('unknown');
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
  const isDriver = Boolean(auth.snapshot?.roles.includes('DRIVER'));
  const canCaptureOffline = isDriver && has('invoices:create');
  const canReadOfflineHistory = isDriver && has('invoices:read');
  const canReadAdminHistory = Boolean(auth.snapshot?.roles.includes('THIRD_PARTY_ADMIN') && has('invoices:read')
    && current.activeContext?.kind === 'ORGANIZATION' && current.activeContext.organizationType === 'THIRD_PARTY');
  const showHistoryPanel = canReadOfflineHistory && driverTab === 'history' || canReadAdminHistory && adminHistoryOpen;
  const canEditInvoice = (invoice: InvoicePage['items'][number]) => Boolean(has('invoices:update') && invoice.editability.available);
  const canReviewConflicts = Boolean(auth.snapshot?.roles.includes('THIRD_PARTY_ADMIN') && has('invoices:read') && has('invoices:update')
    && current.activeContext?.kind === 'ORGANIZATION' && current.activeContext.organizationType === 'THIRD_PARTY');
  const pendingOfflineRecords = offlineRecords.filter(record => !['SYNCHRONIZED', 'LINKED', 'REJECTED'].includes(record.status));
  const visibleOfflineRecords = pendingOfflineRecords.slice((queuePageNumber - 1) * queuePageSize, queuePageNumber * queuePageSize);
  const historyStatusLabel: Record<OfflineSubmissionHistoryPageDto['items'][number]['status'], string> = {
    PENDING: 'Pendiente de envío', CONFLICT: 'En revisión', REQUIRES_CORRECTION: 'Requiere corrección',
    SYNCHRONIZED: 'Sincronizada', LINKED: 'Vinculada', REJECTED: 'Rechazada',
  };
  const syncCauseLabel = { BUSINESS_DUPLICATE: 'Factura duplicada', CUFE_DUPLICATE: 'CUFE duplicado', ASSIGNMENT_CLOSED: 'Asignación cerrada' } as const;
  const resolutionActionLabel = { LINK_DUPLICATE: 'Vinculada con factura existente', APPROVE_CLOSED_ASSIGNMENT: 'Excepción aprobada', REJECT: 'Rechazada por administrador' } as const;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const subject = current.activeContext?.authorization.subject;
    const thirdPartyId = current.activeContext?.kind === 'ORGANIZATION' && current.activeContext.organizationType === 'THIRD_PARTY'
      ? current.activeContext.organizationId : null;
    if (!subject || !thirdPartyId || !isDriver) { setOfflineRecords([]); return; }
    let active = true;
    const refresh = () => { void offlineQueue.list(subject, thirdPartyId).then(records => { if (active) setOfflineRecords(records); }).catch(() => { if (active) setOfflineRecords([]); }); };
    const unsubscribe = offlineQueue.subscribe(refresh); refresh();
    return () => { active = false; unsubscribe(); };
  }, [current.activeContext, current.generation, isDriver, offlineQueue]);
  useEffect(() => context.register({ dirty: () => Boolean(safeForm || filtersOpen || qrOpen), clear: () => {
    setData(null); setForm(null); setDetail(null); setHistoryData(null); setOfflineRecords([]); setPendingDetail(null); setDriverTab('registered'); setAdminHistoryOpen(false); setOptions([]); setError(null); setNotice(null); setDetailImage(null); idempotency.current = null; setQrOpen(false);
  } }), [context, filtersOpen, qrOpen, safeForm]);
  useEffect(() => {
    if (contextGeneration.current === current.generation) return;
    contextGeneration.current = current.generation; ++intent.current;
    setData(null); setForm(null); setDetail(null); setHistoryData(null); setOfflineRecords([]); setPendingDetail(null); setDriverTab('registered'); setAdminHistoryOpen(false); setOptions([]); setError(null); setNotice(null); setDetailImage(null); setQrOpen(false); setConflictsDialogOpen(false);
    setHistoryPageNumber(1); setQueuePageNumber(1);
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
  const loadHistory = useCallback(async (signal?: AbortSignal) => {
    const canOpenHistory = canReadOfflineHistory && driverTab === 'history' || canReadAdminHistory && adminHistoryOpen;
    if (!canOpenHistory || context.getState().status !== 'ready') return;
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch { return; }
    setHistoryLoading(true); setHistoryError(null);
    try {
      const result = await api.listOfflineSubmissionHistory(capture.scope, historyPageNumber, historyPageSize,
        signal ? AbortSignal.any([capture.signal, signal]) : capture.signal);
      if (capture.isCurrent() && !signal?.aborted) setHistoryData(result);
    } catch (cause) { if (capture.isCurrent() && !signal?.aborted) setHistoryError(historyFailure(cause)); }
    finally { capture.release(); if (!signal?.aborted) setHistoryLoading(false); }
  }, [api, adminHistoryOpen, canReadAdminHistory, canReadOfflineHistory, context, driverTab, historyPageNumber, historyPageSize]);
  useEffect(() => {
    if (!(canReadOfflineHistory && driverTab === 'history' || canReadAdminHistory && adminHistoryOpen)) return;
    const controller = new AbortController(); void loadHistory(controller.signal); return () => controller.abort();
  }, [adminHistoryOpen, canReadAdminHistory, canReadOfflineHistory, current.generation, driverTab, loadHistory]);
  useEffect(() => {
    if (!canCaptureOffline || typeof window === 'undefined') return;
    const synchronize = () => {
      if (!window.navigator.onLine || !current.activeContext?.authorization.subject) return;
      let capture: ReturnType<ContextStore['capture']>;
      try { capture = context.capture(); } catch { return; }
      const controller = new AbortController();
      void synchronizeOfflineInvoices({ api, queue: offlineQueue, scope: capture.scope, subject: current.activeContext.authorization.subject,
        thirdPartyId: capture.scope.thirdPartyId ?? '', signal: AbortSignal.any([capture.signal, controller.signal]) })
        .then(async () => {
          const records = await offlineQueue.list(current.activeContext!.authorization.subject, capture.scope.thirdPartyId ?? '');
          if (capture.isCurrent()) setOfflineRecords(records);
        }).finally(() => capture.release());
    };
    window.addEventListener('online', synchronize);
    document.addEventListener('visibilitychange', synchronize);
    synchronize();
    return () => { window.removeEventListener('online', synchronize); document.removeEventListener('visibilitychange', synchronize); };
  }, [api, canCaptureOffline, context, current.activeContext, current.generation, offlineQueue]);
  useEffect(() => {
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch { return; }
    const controller = new AbortController(); setOptionsLoading(true);
    void assignments.listAssignments(capture.scope, { page: 1, pageSize: 100, sort: 'startedAt', direction: 'desc', ...(filtersOpen && !creating && !qrOpen ? {} : { status: 'ACTIVE' as const }) }, AbortSignal.any([capture.signal, controller.signal]))
      .then(result => { if (capture.isCurrent() && !controller.signal.aborted) setOptions(result.items); })
      .catch(cause => { if (capture.isCurrent() && !controller.signal.aborted) setError({ generation: current.generation, text: failure(cause) }); })
      .finally(() => { capture.release(); if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [assignments, context, current.generation, creating, filtersOpen, qrOpen, safeForm?.generation]);
  useEffect(() => {
    const subject = current.activeContext?.authorization.subject;
    const thirdPartyId = current.activeContext?.kind === 'ORGANIZATION' && current.activeContext.organizationType === 'THIRD_PARTY' ? current.activeContext.organizationId : null;
    if (!canCaptureOffline || !subject || !thirdPartyId || !offlineCredentialPublicJwks?.length) { setOfflineCredentialStatus('unavailable'); return; }
    const activeAssignments = options.filter(value => value.status === 'ACTIVE' && value.thirdPartyId === thirdPartyId);
    if (!activeAssignments.length || typeof navigator === 'undefined' || !navigator.onLine) {
      void offlineQueue.getCredential(subject, thirdPartyId).then(async record => {
        const valid = record && await verifyCredential(record, offlineCredentialPublicJwks);
        setOfflineCredentialStatus(valid ? 'ready' : 'unavailable');
      }).catch(() => setOfflineCredentialStatus('unavailable'));
      return;
    }
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch { setOfflineCredentialStatus('unavailable'); return; }
    const controller = new AbortController();
    void api.issueOfflineCredential(capture.scope, activeAssignments.map(value => ({ assignmentId: value.id, vehicleId: value.vehicleId })),
      AbortSignal.any([capture.signal, controller.signal])).then(async result => {
      if (controller.signal.aborted || !capture.isCurrent() || result.subject !== subject || result.thirdPartyId !== thirdPartyId) return;
      const record = { id: `${subject}:${thirdPartyId}`, subject, thirdPartyId, credential: result.credential, expiresAt: result.expiresAt,
        assignmentIds: result.assignmentIds, assignments: activeAssignments.filter(value => result.assignmentIds.includes(value.id)).map(value => ({ ...value, status: 'ACTIVE' as const, endedAt: null })), updatedAt: new Date().toISOString() };
      if (!await verifyCredential(record, offlineCredentialPublicJwks)) throw new Error('INVALID_OFFLINE_CREDENTIAL');
      await (await loadQrDecoder()).preload?.();
      await offlineQueue.saveCredential(record);
      if (!controller.signal.aborted) setOfflineCredentialStatus('ready');
    }).catch(() => { if (!controller.signal.aborted) setOfflineCredentialStatus('unavailable'); })
      .finally(() => capture.release());
    return () => { controller.abort(); capture.release(); };
  }, [api, canCaptureOffline, context, current.activeContext, current.generation, loadQrDecoder, offlineCredentialPublicJwks, offlineQueue, options, verifyCredential]);
  const loadConflicts = useCallback(async (signal?: AbortSignal, requestedPage = conflictPageNumber) => {
    if (!canReviewConflicts || !navigator.onLine) { setConflicts([]); setConflictsTotal(0); setConflictAssignments({}); return; }
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch { return; }
    setConflictsLoading(true);
    try {
      const requestSignal = signal ? AbortSignal.any([capture.signal, signal]) : capture.signal;
      const result = await api.listOfflineConflicts(capture.scope, requestedPage, 20, requestSignal);
      const assignmentIds = [...new Set(result.items.map(item => item.submission.assignmentId))];
      const resolved = await Promise.all(assignmentIds.map(async idValue => {
        try { return [idValue, await assignments.getAssignment(capture.scope, idValue, requestSignal)] as const; }
        catch { return [idValue, null] as const; }
      }));
      const assignmentDetails: Record<string, AssignmentDto> = {};
      resolved.forEach(([idValue, assignment]) => { if (assignment) assignmentDetails[idValue] = assignment; });
      if (capture.isCurrent() && !signal?.aborted) { setConflicts([...result.items]); setConflictsTotal(result.total); setConflictAssignments(assignmentDetails); }
    } catch { if (capture.isCurrent() && !signal?.aborted) { setConflicts([]); setConflictsTotal(0); setConflictAssignments({}); } }
    finally { capture.release(); if (!signal?.aborted) setConflictsLoading(false); }
  }, [api, assignments, canReviewConflicts, conflictPageNumber, context]);
  useEffect(() => {
    const controller = new AbortController(); void loadConflicts(controller.signal);
    const refresh = () => { if (navigator.onLine) void loadConflicts(); };
    window.addEventListener('online', refresh);
    return () => { controller.abort(); window.removeEventListener('online', refresh); };
  }, [loadConflicts, current.generation]);
  useEffect(() => () => { if (conflictImage) URL.revokeObjectURL(conflictImage); }, [conflictImage]);
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
  useEffect(() => { const lastPage = Math.max(1, Math.ceil(pendingOfflineRecords.length / queuePageSize)); if (queuePageNumber > lastPage) setQueuePageNumber(lastPage); }, [pendingOfflineRecords.length, queuePageNumber, queuePageSize]);
  useEffect(() => { if (driverTab === 'pending' && pendingOfflineRecords.length === 0) setDriverTab('registered'); }, [driverTab, pendingOfflineRecords.length]);
  useEffect(() => { if (conflictsTotal === 0) setConflictsDialogOpen(false); }, [conflictsTotal]);

  function openFilters() { setFilterDraft(draft); setFiltersOpen(true); }
  function applyFilters() {
    const clean = { ...filterDraft, q: filterDraft.q.trim(), vehicleId: filterDraft.vehicleId.trim(), driverId: filterDraft.driverId.trim() };
    setDraft(clean); setQuery(value => ({ ...value, page: 1, q: clean.q || undefined, vehicleId: clean.vehicleId || undefined,
      driverId: clean.driverId || undefined, dateFrom: clean.dateFrom || undefined, dateTo: clean.dateTo || undefined })); setFiltersOpen(false);
  }
  function clearFilters() { const clean = { q: '', vehicleId: '', vehicleLabel: '', driverId: '', driverLabel: '', dateFrom: '', dateTo: '' }; setFilterDraft(clean); setDraft(clean); setQuery(value => ({ ...value, q: undefined, vehicleId: undefined, driverId: undefined, dateFrom: undefined, dateTo: undefined, page: 1 })); setFiltersOpen(false); }
  function createDraft() { if (!has('invoices:create')) return; setError(null); setForm({ generation: current.generation, value: { ...emptyForm }, mode: 'create' }); idempotency.current = null; }
  function openQrCapture() { if (!has('invoices:create')) return; setCorrectingRecordId(null); setForm(null); setQrOpen(true); }
  function correctOfflineRecord(record: OfflineInvoiceRecord) {
    setCorrectingRecordId(record.id); setError(null); idempotency.current = null;
    if (record.origin === 'QR') { setForm(null); setQrOpen(true); return; }
    setForm({ generation: current.generation, mode: 'create', value: { ...emptyForm, assignmentId: record.assignmentId, vehicleId: record.vehicleId,
      invoiceDate: record.payload.invoiceDate ?? '', invoiceTime: record.payload.invoiceTime ?? '', invoiceNumber: record.payload.invoiceNumber ?? '',
      issuerNit: record.payload.issuerNit ?? '', buyerDocument: record.payload.buyerDocument ?? '', amount: localizeCurrency(record.payload.amount ?? ''),
      vatAmount: localizeCurrency(record.payload.vatAmount ?? '0'), otherTaxesAmount: localizeCurrency(record.payload.otherTaxesAmount ?? '0'),
      totalAmount: localizeCurrency(record.payload.totalAmount ?? ''), image: record.image ? new File([record.image], `invoice-${record.id}.${record.image.type === 'image/png' ? 'png' : 'jpg'}`, { type: record.image.type }) : undefined } });
  }
  function editDraft(value: InvoiceDto) {
    setForm({ generation: current.generation, mode: 'edit', invoice: value, value: { ...emptyForm, invoiceDate: value.invoiceDate, invoiceTime: value.invoiceTime,
      invoiceNumber: value.invoiceNumber, issuerNit: value.issuerNit, buyerDocument: value.buyerDocument, amount: localizeCurrency(value.amounts.amount),
      vatAmount: localizeCurrency(value.amounts.vatAmount), otherTaxesAmount: localizeCurrency(value.amounts.otherTaxesAmount), totalAmount: localizeCurrency(value.amounts.totalAmount) } });
  }
  function field(name: keyof FormValues, value: string | File | undefined) {
    if (safeForm?.mode === 'create' && safeForm.value[name] !== value) idempotency.current = null;
    setForm(state => state?.generation === current.generation ? { ...state, value: { ...state.value, [name]: value } } : state);
  }
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
    const value = safeForm.value, invoiceTime = normalizeInvoiceTime(safeForm.value.invoiceTime);
    if (safeForm.mode === 'create' && typeof navigator !== 'undefined' && !navigator.onLine) {
      const subject = current.activeContext?.authorization.subject, thirdPartyId = capture.scope.thirdPartyId;
      if (!subject || !thirdPartyId || !value.assignmentId || !value.image) {
        setError({ generation, text: 'Necesitas una sesión y asignación cargadas, y una imagen, para guardar sin conexión.' });
        capture.release(); submitting.current = false; setBusy(false); return;
      }
      idempotency.current ??= crypto.randomUUID();
      void (async () => {
        const ticket = await offlineQueue.getCredential(subject, thirdPartyId);
        const verified = ticket && offlineCredentialPublicJwks?.length ? await verifyCredential(ticket, offlineCredentialPublicJwks) : null;
        if (!verified || !verified.assignmentIds.includes(value.assignmentId)) throw new Error('OFFLINE_CREDENTIAL_REQUIRED');
        return offlineQueue.save({ subject, thirdPartyId, origin: 'MANUAL', assignmentId: value.assignmentId, vehicleId: value.vehicleId,
          idempotencyKey: idempotency.current!,
          payload: { invoiceDate: value.invoiceDate, invoiceTime, invoiceNumber: value.invoiceNumber, issuerNit: value.issuerNit,
            buyerDocument: value.buyerDocument, amount: canonicalCurrency(value.amount), vatAmount: canonicalCurrency(value.vatAmount),
            otherTaxesAmount: canonicalCurrency(value.otherTaxesAmount), totalAmount: canonicalCurrency(value.totalAmount) }, image: value.image });
      })()
        .then(async () => { if (correctingRecordId) { await offlineQueue.remove(correctingRecordId); setCorrectingRecordId(null); }
          if (capture.isCurrent()) { setForm(null); setNotice(correctingRecordId ? 'Corrección guardada con una identidad nueva. Pendiente de sincronización.'
            : 'Factura guardada en este dispositivo. Pendiente de sincronización.'); idempotency.current = null; } })
        .catch(() => { if (capture.isCurrent()) setError({ generation, text: 'La credencial offline venció o no cubre esta asignación. Conéctate para renovar el acceso.' }); })
        .finally(() => { capture.release(); submitting.current = false; if (capture.isCurrent()) setBusy(false); });
      return;
    }
    const work = safeForm.mode === 'create'
      ? (() => { idempotency.current ??= crypto.randomUUID(); const fields: InvoiceFields = { assignmentId: value.assignmentId, vehicleId: value.vehicleId,
        invoiceDate: value.invoiceDate, invoiceTime, invoiceNumber: value.invoiceNumber, issuerNit: value.issuerNit,
        buyerDocument: value.buyerDocument, amount: canonicalCurrency(value.amount), vatAmount: canonicalCurrency(value.vatAmount), otherTaxesAmount: canonicalCurrency(value.otherTaxesAmount),
        totalAmount: canonicalCurrency(value.totalAmount), ...(value.image ? { image: value.image } : {}) };
        return api.create(capture.scope, fields, idempotency.current, AbortSignal.any([capture.signal, controller.signal])); })()
      : (() => { const fields: InvoiceUpdateFields = { expectedVersion: safeForm.invoice!.version, invoiceDate: value.invoiceDate, invoiceTime,
        invoiceNumber: value.invoiceNumber, issuerNit: value.issuerNit, buyerDocument: value.buyerDocument, amount: canonicalCurrency(value.amount),
        vatAmount: canonicalCurrency(value.vatAmount), otherTaxesAmount: canonicalCurrency(value.otherTaxesAmount), totalAmount: canonicalCurrency(value.totalAmount), ...(value.image ? { image: value.image } : {}) };
        return api.update(capture.scope, safeForm.invoice!.id, fields, AbortSignal.any([capture.signal, controller.signal])); })();
    void work.then(saved => {
      if (!capture.isCurrent() || controller.signal.aborted) return;
      setForm(null); setNotice(safeForm.mode === 'create' ? 'Factura registrada.' : 'Factura actualizada.');
      if (correctingRecordId) { void offlineQueue.remove(correctingRecordId); setCorrectingRecordId(null); }
      idempotency.current = null; detailFor(saved); void load();
    }).catch(async cause => {
      if (!capture.isCurrent() || controller.signal.aborted) return;
      if (safeForm.mode === 'create' && isTransientOfflineFailure(cause)) {
        const subject = current.activeContext?.authorization.subject, thirdPartyId = capture.scope.thirdPartyId;
        try {
          const ticket = subject && thirdPartyId ? await offlineQueue.getCredential(subject, thirdPartyId) : null;
          const verified = ticket && offlineCredentialPublicJwks?.length ? await verifyCredential(ticket, offlineCredentialPublicJwks) : null;
          if (!subject || !thirdPartyId || !verified || !verified.assignmentIds.includes(value.assignmentId) || !value.image) throw new Error('OFFLINE_CREDENTIAL_REQUIRED');
          await offlineQueue.save({ subject, thirdPartyId, origin: 'MANUAL', assignmentId: value.assignmentId, vehicleId: value.vehicleId,
            idempotencyKey: idempotency.current ?? crypto.randomUUID(), payload: { invoiceDate: value.invoiceDate, invoiceTime,
              invoiceNumber: value.invoiceNumber, issuerNit: value.issuerNit, buyerDocument: value.buyerDocument, amount: canonicalCurrency(value.amount),
              vatAmount: canonicalCurrency(value.vatAmount), otherTaxesAmount: canonicalCurrency(value.otherTaxesAmount), totalAmount: canonicalCurrency(value.totalAmount) }, image: value.image });
          if (correctingRecordId) { await offlineQueue.remove(correctingRecordId); setCorrectingRecordId(null); }
          setForm(null); setNotice('La conexión falló. La factura quedó guardada en este dispositivo con la misma identidad para evitar duplicados.'); idempotency.current = null;
        } catch { setError({ generation, text: 'La conexión falló y no hay una credencial offline válida para conservar esta factura. Mantén el formulario abierto y vuelve a intentarlo al recuperar conexión.' }); }
      } else setError({ generation, text: failure(cause) });
    })
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

  async function openConflictImage(item: OfflineInvoiceConflictItemDto) {
    if (!item.imageAvailable) return;
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch { setError({ generation: current.generation, text: 'No se pudo validar el contexto actual.' }); return; }
    try {
      const blob = await api.offlineConflictImage(capture.scope, item.submission.id, capture.signal);
      if (capture.isCurrent()) { if (conflictImage) URL.revokeObjectURL(conflictImage); setConflictImage(URL.createObjectURL(blob)); setConflictImageOpen(true); }
    } catch { if (capture.isCurrent()) setError({ generation: current.generation, text: 'No se pudo cargar la imagen temporal del conflicto.' }); }
    finally { capture.release(); }
  }

  async function retryOfflineRecord(record: OfflineInvoiceRecord) {
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch { return; }
    setRetryingRecordId(record.id);
    try {
      await synchronizeOfflineInvoices({ api, queue: offlineQueue, scope: capture.scope, subject: record.subject, thirdPartyId: record.thirdPartyId, signal: capture.signal });
      if (capture.isCurrent()) setOfflineRecords(await offlineQueue.list(record.subject, record.thirdPartyId));
    } finally { capture.release(); setRetryingRecordId(null); }
  }

  function runPendingDetailAction() {
    if (!pendingDetail) return;
    const record = pendingDetail;
    setPendingDetail(null);
    if (record.status === 'REQUIRES_CORRECTION') correctOfflineRecord(record);
    else if (record.status === 'CONFLICT' || record.status === 'PENDING' || record.status === 'RETRYABLE_FAILURE') void retryOfflineRecord(record);
  }

  async function resolveConflict(action: OfflineInvoiceResolutionInput['action']) {
    const item = resolutionTarget;
    if (!item || !resolutionReason.trim() || busy) return;
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch { setError({ generation: current.generation, text: 'No se pudo validar el contexto actual.' }); return; }
    setBusy(true); setError(null);
    const input: OfflineInvoiceResolutionInput = action === 'LINK_DUPLICATE'
      ? { action, expectedVersion: item.submission.version, reason: resolutionReason.trim(), resultInvoiceId: candidateId }
      : { action, expectedVersion: item.submission.version, reason: resolutionReason.trim() };
    try {
      await api.resolveOfflineConflict(capture.scope, item.submission.id, input, capture.signal);
      if (capture.isCurrent()) { setResolutionTarget(null); setResolutionReason(''); setCandidateId(''); setNotice('Decisión registrada con auditoría.'); }
      await loadConflicts(capture.signal);
    } catch (cause) {
      if (capture.isCurrent()) {
        const staleConflict = cause instanceof RequestError && ['INVOICE_VERSION_CONFLICT', 'SUBMISSION_VERSION_CONFLICT'].includes(cause.businessCode);
        if (staleConflict) { setResolutionTarget(null); setResolutionReason(''); setCandidateId(''); }
        setError({ generation: current.generation, text: staleConflict
          ? 'El conflicto cambió mientras lo revisabas. Actualiza la bandeja y vuelve a abrirlo.' : failure(cause) });
      }
    }
    finally { capture.release(); setBusy(false); }
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
  const pendingPreview = pendingDetail ? offlineInvoicePreview(pendingDetail) : null;
  const pendingAssignment = pendingDetail ? options.find(item => item.id === pendingDetail.assignmentId) : undefined;
  const pendingFields = (pendingPreview ? [
    ['Número de factura', pendingPreview.invoiceNumber ?? ''], ['Fecha de factura', pendingPreview.invoiceDate ?? ''], ['Hora de factura', pendingPreview.invoiceTime ?? ''],
    ['NIT del emisor', pendingPreview.issuerNit ?? ''], ['Documento del adquiriente', pendingPreview.buyerDocument ?? ''],
    ['Valor antes de impuestos', pendingPreview.amount ?? ''], ['IVA', pendingPreview.vatAmount ?? ''], ['Otros impuestos', pendingPreview.otherTaxesAmount ?? ''],
    ['Total', pendingPreview.totalAmount ?? ''], ...(pendingPreview.cufe ? [['CUFE', pendingPreview.cufe] as [string, string]] : []),
  ] as [string, string][] : []).filter(([, value]) => Boolean(value));

  return <Stack spacing={1.5} sx={{ minWidth: 0 }}>
    <PageHeader title="Facturas" />
    {isDriver && offlineCredentialStatus === 'ready' && <Chip size="small" color="success" label="Captura offline lista" sx={{ alignSelf: 'flex-start' }} />}
    {canCaptureOffline && driverTab === 'registered' && offlineCredentialStatus === 'unavailable' && <Alert severity="info">Para capturar sin conexión, abre Facturas con conexión y espera a que se prepare el acceso offline.</Alert>}
    {isDriver && <Tabs value={driverTab} onChange={(_, value: 'registered' | 'pending' | 'history') => setDriverTab(value)} aria-label="Secciones de facturas del conductor"
      variant="scrollable" scrollButtons="auto">
      <Tab value="registered" label="Registradas" />
      {pendingOfflineRecords.length > 0 && <Tab value="pending" label={`Pendientes (${pendingOfflineRecords.length})`} />}
      {canReadOfflineHistory && <Tab value="history" label="Historial" />}
    </Tabs>}
    {canCaptureOffline && driverTab === 'pending' && pendingOfflineRecords.length > 0 && <Paper component="section" variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1}><Typography component="h2" variant="h6">Pendientes de sincronización ({pendingOfflineRecords.length})</Typography>
        <DataTableSurface sx={{ display: { xs: 'none', md: 'block' } }}><Table size="small" aria-label="Facturas pendientes de sincronización" sx={{
          width: '100%', tableLayout: 'fixed', '& .MuiTableCell-root': { minWidth: 0, overflowWrap: 'anywhere' },
          '& th:last-of-type, & td:last-of-type': { width: 180 },
        }}><TableHead><TableRow>
          <TableCell>Factura</TableCell><TableCell>Estado</TableCell><TableCell>Detalle</TableCell><TableCell>Acciones</TableCell>
        </TableRow></TableHead><TableBody>{visibleOfflineRecords.map(record => <TableRow key={record.id} hover>
          <TableCell>{record.origin === 'QR' ? 'Factura QR' : `Factura ${record.payload.invoiceNumber ?? ''}`}</TableCell>
          <TableCell><Chip size="small" color={offlineRecordStatusColor(record.status)} label={offlineRecordStatusLabel[record.status]} /></TableCell>
          <TableCell>{record.message ?? (record.status === 'CONFLICT' ? 'El administrador tercero debe revisar esta factura.' : 'Aún no está confirmada en el servidor.')}</TableCell>
          <TableCell><Stack direction="row" spacing={0.5}><Button size="small" onClick={() => setPendingDetail(record)}>Ver detalle</Button>{record.status === 'REQUIRES_CORRECTION' ? <Button size="small" onClick={() => correctOfflineRecord(record)}>Corregir</Button>
            : record.status === 'CONFLICT' ? <Button size="small" disabled={!navigator.onLine || retryingRecordId === record.id}
              onClick={() => void retryOfflineRecord(record)}>{retryingRecordId === record.id ? 'Consultando…' : 'Actualizar estado'}</Button>
              : ['PENDING', 'RETRYABLE_FAILURE'].includes(record.status) ? <Button size="small" disabled={!navigator.onLine || retryingRecordId === record.id}
              onClick={() => void retryOfflineRecord(record)}>{retryingRecordId === record.id ? 'Reintentando…' : 'Reintentar'}</Button> : null}</Stack></TableCell>
        </TableRow>)}</TableBody></Table></DataTableSurface>
        <Stack spacing={1} sx={{ display: { xs: 'flex', md: 'none' } }}>{visibleOfflineRecords.map(record => <Paper key={`mobile-pending-${record.id}`} variant="outlined" sx={{ p: 1.25 }}>
          <Stack spacing={0.75}><Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontWeight: 700 }}>{record.origin === 'QR' ? 'Factura QR' : `Factura ${record.payload.invoiceNumber ?? ''}`}</Typography>
            <Chip size="small" color={offlineRecordStatusColor(record.status)} label={offlineRecordStatusLabel[record.status]} />
          </Stack><Typography variant="body2">{record.message ?? (record.status === 'CONFLICT' ? 'El administrador tercero debe revisar esta factura.' : 'Aún no está confirmada en el servidor.')}</Typography>
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}><Button size="small" onClick={() => setPendingDetail(record)}>Ver detalle</Button>
            {record.status === 'REQUIRES_CORRECTION' ? <Button size="small" onClick={() => correctOfflineRecord(record)}>Corregir</Button>
              : ['PENDING', 'RETRYABLE_FAILURE'].includes(record.status) ? <Button size="small" disabled={!navigator.onLine || retryingRecordId === record.id} onClick={() => void retryOfflineRecord(record)}>{retryingRecordId === record.id ? 'Reintentando…' : 'Reintentar'}</Button>
                : record.status === 'CONFLICT' ? <Button size="small" disabled={!navigator.onLine || retryingRecordId === record.id} onClick={() => void retryOfflineRecord(record)}>{retryingRecordId === record.id ? 'Consultando…' : 'Actualizar estado'}</Button> : null}</Stack>
          </Stack></Paper>)}</Stack>
        <DataPagination page={queuePageNumber} pageSize={queuePageSize} total={pendingOfflineRecords.length} label="Páginas de facturas por sincronizar"
          onPageChange={setQueuePageNumber} onPageSizeChange={value => { setQueuePageSize(value); setQueuePageNumber(1); }} />
      </Stack>
    </Paper>}
    {canCaptureOffline && driverTab === 'history' && offlineRecords.some(record => record.status === 'REJECTED' && !record.serverSubmissionId) && <Paper component="section" variant="outlined" sx={{ p: 1.5 }}>
      <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>Rechazos locales · no recibidos por el servidor</Typography>
      {offlineRecords.filter(record => record.status === 'REJECTED' && !record.serverSubmissionId).map(record => <Alert key={record.id} severity="error" sx={{ mt: 1 }}>
        {record.origin === 'QR' ? 'Factura QR' : `Factura ${record.payload.invoiceNumber ?? ''}`} · {record.message ?? 'No fue posible enviar este registro.'}
      </Alert>)}
    </Paper>}
    {showHistoryPanel && <Paper component="section" variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1.25}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Typography component="h2" variant="h6">Historial de sincronización</Typography>
        {canReadAdminHistory && <Button onClick={() => { setAdminHistoryOpen(false); setHistoryData(null); setHistoryPageNumber(1); }}>Volver a facturas</Button>}
      </Stack>
      {historyError && <Alert severity="warning" action={<Button size="small" onClick={() => void loadHistory()} disabled={historyLoading || !navigator.onLine}>Reintentar</Button>}>{historyError}</Alert>}
      {historyLoading && !historyData && <CircularProgress size={22} aria-label="Cargando historial de sincronización" />}
      {!historyLoading && !historyError && historyData?.total === 0 && <Typography color="text.secondary">Todavía no hay envíos recibidos por el servidor.</Typography>}
      {historyData && historyData.items.length > 0 && <>
        <Box sx={{ overflowX: 'auto', display: { xs: 'none', md: 'block' } }}><Table size="small" aria-label="Historial de sincronización de facturas" sx={{ minWidth: canReadAdminHistory ? 1040 : 760 }}>
          <TableHead><TableRow><TableCell>Factura</TableCell>{canReadAdminHistory && <><TableCell>Conductor</TableCell><TableCell>Vehículo</TableCell></>}<TableCell>Fecha de captura</TableCell><TableCell>Estado</TableCell><TableCell>Resultado o resolución</TableCell><TableCell sx={{ minWidth: 120, whiteSpace: 'nowrap', textAlign: 'right' }}>Total</TableCell></TableRow></TableHead>
          <TableBody>{historyData.items.map(item => <TableRow key={item.id} hover>
            <TableCell>{item.invoiceNumber ?? (item.origin === 'QR' ? 'Factura QR' : 'Factura manual')}<Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {item.invoiceDate ? `Fecha factura ${item.invoiceDate}` : 'Fecha factura no disponible'} · {item.issuerNit ? `NIT ${item.issuerNit}` : 'NIT no disponible'}</Typography></TableCell>
            {canReadAdminHistory && <><TableCell>{item.driverName || 'No disponible'}</TableCell><TableCell>{item.vehiclePlate || 'Sin placa'}</TableCell></>}
            <TableCell>{new Date(item.createdAt).toLocaleString('es-CO')}</TableCell>
            <TableCell><Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}><Chip size="small" label={historyStatusLabel[item.status]} color={item.status === 'REJECTED' ? 'error' : item.status === 'CONFLICT' || item.status === 'REQUIRES_CORRECTION' ? 'warning' : item.status === 'SYNCHRONIZED' || item.status === 'LINKED' ? 'success' : 'default'} />
              {item.causes.length > 0 && <Typography variant="caption">{item.causes.map(cause => syncCauseLabel[cause]).join(' · ')}</Typography>}</Stack></TableCell>
            <TableCell>{item.resolution ? <Stack spacing={0.25}><Typography variant="body2">{resolutionActionLabel[item.resolution.action]}</Typography>
              <Typography variant="caption">{new Date(item.resolution.at).toLocaleString('es-CO')} · {item.resolution.reason}</Typography>
              {item.resolution.resultInvoiceNumber && <Typography variant="caption">Factura resultante: {item.resolution.resultInvoiceNumber}{item.resolution.resultInvoiceDate ? ` · ${item.resolution.resultInvoiceDate}` : ''}</Typography>}</Stack>
              : item.resolutionReason ?? (item.status === 'CONFLICT' ? 'Pendiente de decisión del administrador tercero.' : 'Sin resolución registrada.')}</TableCell>
            <TableCell sx={{ minWidth: 120, whiteSpace: 'nowrap', textAlign: 'right' }}>{item.totalAmount ? money(item.totalAmount) : '—'}</TableCell>
          </TableRow>)}</TableBody>
        </Table></Box>
        <Stack spacing={1} sx={{ display: { xs: 'flex', md: 'none' } }}>{historyData.items.map(item => <Paper key={`mobile-${item.id}`} variant="outlined" sx={{ p: 1.25 }}>
          <Stack spacing={0.5}><Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontWeight: 700 }}>{item.invoiceNumber ?? (item.origin === 'QR' ? 'Factura QR' : 'Factura manual')}</Typography>
            <Chip size="small" label={historyStatusLabel[item.status]} color={item.status === 'REJECTED' ? 'error' : item.status === 'CONFLICT' || item.status === 'REQUIRES_CORRECTION' ? 'warning' : item.status === 'SYNCHRONIZED' || item.status === 'LINKED' ? 'success' : 'default'} />
          </Stack><Typography variant="body2">{new Date(item.createdAt).toLocaleString('es-CO')}</Typography>
          {canReadAdminHistory && <Typography variant="body2" color="text.secondary">Conductor: {item.driverName || 'No disponible'} · Vehículo: {item.vehiclePlate || 'Sin placa'}</Typography>}
          <Typography variant="body2" sx={{ whiteSpace: 'nowrap', textAlign: 'right', fontWeight: 600 }}>{item.totalAmount ? money(item.totalAmount) : 'Total no disponible'}</Typography>
          {item.causes.length > 0 && <Typography variant="caption">{item.causes.map(cause => syncCauseLabel[cause]).join(' · ')}</Typography>}
          {item.resolution && <Alert severity={item.status === 'REJECTED' ? 'error' : 'info'} sx={{ mt: 0.5 }}>{resolutionActionLabel[item.resolution.action]} · {new Date(item.resolution.at).toLocaleString('es-CO')} · {item.resolution.reason}
            {item.resolution.resultInvoiceNumber ? ` · Factura resultante ${item.resolution.resultInvoiceNumber}` : ''}</Alert>}
          {!item.resolution && item.status === 'CONFLICT' && <Typography variant="body2">Pendiente de decisión del administrador tercero.</Typography>}
          {!item.resolution && item.resolutionReason && <Typography variant="body2">{item.resolutionReason}</Typography>}
          {item.issuerNit && <Typography variant="caption">NIT {item.issuerNit}</Typography>}</Stack>
        </Paper>)}</Stack>
        <DataPagination page={historyPageNumber} pageSize={historyPageSize} total={historyData.total} label="Páginas del historial de sincronización"
          onPageChange={setHistoryPageNumber} onPageSizeChange={value => { setHistoryPageSize(value); setHistoryPageNumber(1); }} disabled={historyLoading} />
      </>}
      </Stack>
    </Paper>}
    {canReviewConflicts && conflictsTotal > 0 && <Paper component="section" variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography component="h2" variant="h6">Facturas por revisar</Typography><Chip size="small" color="warning" label={conflictsTotal} /></Stack>
        <Button variant="contained" onClick={() => setConflictsDialogOpen(true)}>Abrir bandeja de revisión</Button>
      </Stack>
    </Paper>}
    <Dialog open={conflictsDialogOpen && canReviewConflicts && conflictsTotal > 0} onClose={() => setConflictsDialogOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>Facturas por revisar ({conflictsTotal})</DialogTitle><DialogContent dividers><Stack spacing={1.5} sx={{ pt: 1 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Typography variant="body2" color="text.secondary">Revisión exclusiva de conflictos para este tercero.</Typography>
        <Button variant="outlined" onClick={() => void loadConflicts()} disabled={conflictsLoading}>{conflictsLoading ? 'Actualizando…' : 'Actualizar bandeja'}</Button>
      </Stack>
      {conflictsLoading && conflicts.length === 0 && <CircularProgress size={22} aria-label="Cargando conflictos" />}
      {!conflictsLoading && conflicts.length === 0 && <Typography color="text.secondary">No hay conflictos pendientes para este tercero.</Typography>}
      {conflicts.map(item => <Paper variant="outlined" key={item.submission.id} sx={{ p: 1.5 }}><Stack spacing={1}>
        <Typography sx={{ fontWeight: 700 }}>{item.submission.origin === 'QR' ? 'Factura QR' : `Factura ${item.reviewFields.invoiceNumber ?? ''}`} · versión {item.submission.version}</Typography>
        {(() => { const assignment = conflictAssignments[item.submission.assignmentId]; return <Typography variant="body2">
          {assignment ? `Conductor: ${assignment.driver.name} · Vehículo: ${assignment.vehiclePlate || 'sin placa'} · Asignación: ${new Date(assignment.startedAt).toLocaleDateString('es-CO')}–${assignment.endedAt ? new Date(assignment.endedAt).toLocaleDateString('es-CO') : 'activa'}`
            : 'No fue posible consultar los datos del conductor y vehículo de esta asignación.'}
        </Typography>; })()}
        <Typography variant="body2">Causas: {item.submission.causes.map(cause => ({ BUSINESS_DUPLICATE: 'Factura duplicada', CUFE_DUPLICATE: 'CUFE duplicado', ASSIGNMENT_CLOSED: 'Asignación cerrada' }[cause])).join(' · ')}</Typography>
        <Typography variant="body2">NIT {item.reviewFields.issuerNit ?? '—'} · Fecha {item.reviewFields.invoiceDate ?? '—'} {item.reviewFields.invoiceTime ?? ''} · Total {item.reviewFields.totalAmount ?? '—'}</Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {item.imageAvailable && <Button onClick={() => { setConflictsDialogOpen(false); void openConflictImage(item); }}>Revisar imagen</Button>}
          {item.candidates.map(candidate => <Button key={candidate.id} onClick={() => { setConflictsDialogOpen(false); setResolutionTarget(item); setCandidateId(candidate.id); setResolutionReason(''); }}>
            Vincular con {candidate.invoiceNumber} · {candidate.invoiceDate}
          </Button>)}
          {item.submission.causes.length === 1 && item.submission.causes[0] === 'ASSIGNMENT_CLOSED' && item.imageAvailable
            && <Button color="success" onClick={() => { setConflictsDialogOpen(false); setResolutionTarget(item); setCandidateId(''); setResolutionReason(''); }}>Aprobar asignación cerrada</Button>}
          <Button color="error" onClick={() => { setConflictsDialogOpen(false); setResolutionTarget(item); setCandidateId(''); setResolutionReason(''); }}>Rechazar</Button>
        </Stack>
      </Stack></Paper>)}
      {conflictsTotal > 0 && <DataPagination page={conflictPageNumber} pageSize={20} total={conflictsTotal}
        onPageChange={next => setConflictPageNumber(next)} onPageSizeChange={() => {}} onRefresh={() => void loadConflicts()} disabled={conflictsLoading} />}
      </Stack></DialogContent><DialogActions><Button onClick={() => setConflictsDialogOpen(false)}>Cerrar</Button></DialogActions>
    </Dialog>
    {notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {message && <Alert severity="error" onClose={() => setError(null)}>{message}</Alert>}
    {(!isDriver || driverTab === 'registered') && !adminHistoryOpen && <Box sx={{ minWidth: 0 }}>
    <AppliedFilters filters={[
      ...(query.q ? [{ key: 'q', label: `Búsqueda: ${query.q}` }] : []),
      ...(query.vehicleId ? [{ key: 'vehicleId', label: `Placa: ${draft.vehicleLabel || query.vehicleId}` }] : []),
      ...(query.driverId ? [{ key: 'driverId', label: `Conductor: ${draft.driverLabel || query.driverId}` }] : []),
      ...(query.dateFrom ? [{ key: 'dateFrom', label: `Desde: ${query.dateFrom}` }] : []),
      ...(query.dateTo ? [{ key: 'dateTo', label: `Hasta: ${query.dateTo}` }] : []),
    ]} onRemove={removeAppliedFilter} onClear={clearFilters} />
    {!loading && page?.items.length === 0 && <Alert severity="info">No hay facturas que coincidan con la consulta. Ajusta la búsqueda o limpia los filtros.</Alert>}
    <DataTable toolbar={<>{canCaptureOffline && <DataTableAction label="Capturar factura" primary onClick={createDraft}><SvgIcon fontSize="small" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z" /></SvgIcon></DataTableAction>}
      {has('invoices:create') && !isDriver && <DataTableAction label="Registrar factura" primary onClick={createDraft}><SvgIcon fontSize="small" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z" /></SvgIcon></DataTableAction>}
      {canReadAdminHistory && <DataTableAction label="Consultar historial" onClick={() => { setAdminHistoryOpen(true); setHistoryError(null); }}><SvgIcon fontSize="small" aria-hidden="true"><path d="M13 3a9 9 0 1 0 8.94 10h-2.02A7 7 0 1 1 13 6c1.93 0 3.68.79 4.94 2.06L15 11h7V4l-2.65 2.65A8.96 8.96 0 0 0 13 3Zm-1 5v5l4.25 2.52 1.03-1.72L14 12V8h-2Z" /></SvgIcon></DataTableAction>}
      {!adminHistoryOpen && <DataTableAction label="Filtrar facturas" onClick={openFilters}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 5h18l-7.5 8.2V19l-3 1.7v-7.5L3 5z" /></SvgIcon></DataTableAction>}</>} mobileSortAction={<MobileSortControl fields={[
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
            <TableCell><Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}><Typography variant="body2">{value.origin === 'QR' ? 'Lectura QR' : 'Manual'}</Typography>
              {value.captureChannel === 'OFFLINE' && <Chip size="small" color="info" label="Offline" />}</Stack></TableCell><TableCell>{money(value.amounts.totalAmount)}</TableCell>
            <TableCell><Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><DataTableAction label="Consultar factura" onClick={() => detailFor(value)}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 5c-5 0-9.27 3.11-11 7 1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></SvgIcon></DataTableAction>{canEditInvoice(value) && <DataTableAction label="Editar factura" onClick={() => editDraft(value)}><SvgIcon fontSize="small" aria-hidden="true"><path d="m3 17.25 11.06-11.06 3.75 3.75L6.75 21H3v-3.75ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" /></SvgIcon></DataTableAction>}</Stack></TableCell></TableRow>)}
          {!loading && page?.items.length === 0 && <TableRow><TableCell colSpan={7} /></TableRow>}
        </TableBody></Table>
      </DataTableSurface>
      {page && <Box sx={{ display: { xs: 'none', md: 'block' } }}><DataPagination page={query.page} pageSize={query.pageSize} total={page.total} onPageChange={next => setQuery(value => ({ ...value, page: next }))}
        onPageSizeChange={size => setQuery(value => ({ ...value, page: 1, pageSize: size }))} onRefresh={() => void load()} disabled={loading} /></Box>}
      {page?.items.map(value => <Paper key={`mobile-${value.id}`} variant="outlined" sx={{ display: { xs: 'block', md: 'none' }, p: 1.5 }}>
        <Typography sx={{ fontWeight: 700 }}>{value.invoiceNumber}</Typography><Typography>{value.invoiceDate} · {value.vehiclePlate ?? value.vehicleId}</Typography>
        <Typography>Origen: {value.origin === 'QR' ? 'Lectura QR' : 'Manual'}</Typography>{value.captureChannel === 'OFFLINE' && <Chip size="small" color="info" label="Offline" sx={{ mt: 0.5 }} />}
        <Typography>{money(value.amounts.totalAmount)}</Typography><Button onClick={() => detailFor(value)}>Consultar factura</Button></Paper>)}
      {page && <Box sx={{ display: { xs: 'block', md: 'none' } }}><DataPagination page={query.page} pageSize={query.pageSize} total={page.total} onPageChange={next => setQuery(value => ({ ...value, page: next }))}
        onPageSizeChange={size => setQuery(value => ({ ...value, page: 1, pageSize: size }))} onRefresh={() => void load()} disabled={loading} /></Box>}
    </DataTable>
    </Box>}
    <Dialog open={Boolean(pendingDetail)} onClose={() => setPendingDetail(null)} fullWidth maxWidth="sm" aria-labelledby="pending-invoice-detail-title">
      <DialogTitle id="pending-invoice-detail-title">Detalle del registro pendiente</DialogTitle>
      <DialogContent dividers><Stack spacing={1.25} sx={{ pt: 0.5 }}>
        {pendingDetail && <>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 700 }}>{pendingDetail.origin === 'QR' ? 'Factura capturada desde QR' : `Factura ${pendingPreview?.invoiceNumber ?? ''}`}</Typography>
            <Chip size="small" label={{ PENDING: 'Pendiente', SENDING: 'Enviando', RETRYABLE_FAILURE: 'Error temporal', REQUIRES_CORRECTION: 'Requiere corrección', CONFLICT: 'En revisión', SYNCHRONIZED: 'Sincronizada', LINKED: 'Vinculada', REJECTED: 'Rechazada' }[pendingDetail.status]}
              color={pendingDetail.status === 'REQUIRES_CORRECTION' || pendingDetail.status === 'CONFLICT' ? 'warning' : pendingDetail.status === 'RETRYABLE_FAILURE' || pendingDetail.status === 'REJECTED' ? 'error' : 'default'} />
          </Stack>
          <Typography variant="body2">Capturada: {new Date(pendingDetail.createdAt).toLocaleString('es-CO')}</Typography>
          <Typography variant="body2">Vehículo: {pendingAssignment?.vehiclePlate || 'Vehículo de la asignación guardada'}{pendingAssignment?.driver.name ? ` · Conductor: ${pendingAssignment.driver.name}` : ''}</Typography>
          {pendingFields.length > 0 ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
            {pendingFields.map(([label, value]) => <Box key={label} sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography sx={{ overflowWrap: 'anywhere' }}>{['Valor antes de impuestos', 'IVA', 'Otros impuestos', 'Total'].includes(label) ? money(value) : value}</Typography></Box>)}
          </Box> : <Alert severity="warning">No fue posible extraer una vista previa. El contenido original se conserva para validación del servidor.</Alert>}
          {pendingDetail.image && <Typography variant="body2">Imagen de factura guardada en este dispositivo.</Typography>}
          {pendingDetail.message && <Alert severity={pendingDetail.status === 'RETRYABLE_FAILURE' || pendingDetail.status === 'REQUIRES_CORRECTION' ? 'warning' : 'info'}>{pendingDetail.message}</Alert>}
        </>}
      </Stack></DialogContent>
      <DialogActions>
        <Button onClick={() => setPendingDetail(null)}>Cerrar</Button>
        {pendingDetail?.status === 'REQUIRES_CORRECTION' && <Button variant="contained" onClick={runPendingDetailAction}>Corregir</Button>}
        {pendingDetail && ['PENDING', 'RETRYABLE_FAILURE', 'CONFLICT'].includes(pendingDetail.status) && <Button variant="contained" disabled={!navigator.onLine || retryingRecordId === pendingDetail.id} onClick={runPendingDetailAction}>
          {pendingDetail.status === 'CONFLICT' ? 'Actualizar estado' : 'Reintentar'}</Button>}
      </DialogActions>
    </Dialog>
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
    <FormDialog open={Boolean(safeForm)} onClose={() => { setForm(null); setCorrectingRecordId(null); }} busy={busy} maxWidth="md" title={safeForm?.mode === 'create' ? 'Registrar factura manual' : 'Editar factura'} actions={<>
      {safeForm?.mode === 'create' && has('invoices:create') && <Button variant="outlined" disabled={busy} onClick={openQrCapture}>Registrar desde QR</Button>}
      <Button disabled={busy} onClick={() => { setForm(null); setCorrectingRecordId(null); }}>Cancelar</Button>
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
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><Typography>Canal de captura:</Typography>
          <Chip size="small" color={safeDetail.invoice.captureChannel === 'OFFLINE' ? 'info' : 'default'}
            label={safeDetail.invoice.captureChannel === 'OFFLINE' ? 'Offline' : 'En línea'} /></Stack>
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
    <Dialog open={conflictImageOpen} onClose={() => setConflictImageOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>Imagen del registro en conflicto</DialogTitle><DialogContent dividers sx={{ display: 'grid', placeItems: 'center', minHeight: 220 }}>
        {conflictImage && <Box component="img" src={conflictImage} alt="Imagen temporal enviada por el conductor" sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />}
      </DialogContent><DialogActions><Button onClick={() => setConflictImageOpen(false)}>Cerrar</Button></DialogActions>
    </Dialog>
    <FormDialog open={Boolean(resolutionTarget)} onClose={() => { if (!busy) setResolutionTarget(null); }} busy={busy} maxWidth="sm" title="Resolver conflicto"
      actions={<><Button disabled={busy} onClick={() => setResolutionTarget(null)}>Cancelar</Button>
        <Button variant="contained" color="error" disabled={busy || !resolutionReason.trim()} onClick={() => void resolveConflict('REJECT')}>Rechazar registro</Button>
        {resolutionTarget?.submission.causes.length === 1 && resolutionTarget.submission.causes[0] === 'ASSIGNMENT_CLOSED' && resolutionTarget.imageAvailable
          && <Button variant="contained" color="success" disabled={busy || !resolutionReason.trim()} onClick={() => void resolveConflict('APPROVE_CLOSED_ASSIGNMENT')}>Aprobar excepción</Button>}
        {resolutionTarget?.candidates.some(item => item.id === candidateId) && <Button variant="contained" disabled={busy || !resolutionReason.trim()} onClick={() => void resolveConflict('LINK_DUPLICATE')}>Vincular factura</Button>}
      </>}>
      <Stack spacing={1.5} sx={{ pt: 1 }}><Typography>La decisión quedará asociada a tu usuario y al motivo indicado.</Typography>
        <TextField fullWidth multiline minRows={3} label="Motivo de la decisión" value={resolutionReason} disabled={busy}
          onChange={event => setResolutionReason(event.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
      </Stack>
    </FormDialog>
    {has('invoices:create') && <InvoiceQrCapture open={qrOpen} api={api} loadDecoder={loadQrDecoder} assignments={options} context={context} offlineCredentialPublicJwks={offlineCredentialPublicJwks}
      offlineQueue={offlineQueue} verifyCredential={verifyCredential}
      initialAssignment={correctingRecordId ? offlineRecords.find(record => record.id === correctingRecordId && record.origin === 'QR') : undefined}
      onClose={() => { setQrOpen(false); setCorrectingRecordId(null); }} onSaved={() => { if (correctingRecordId) { void offlineQueue.remove(correctingRecordId); setCorrectingRecordId(null); }
        setNotice(typeof navigator !== 'undefined' && !navigator.onLine
          ? 'Lectura QR guardada en este dispositivo con una identidad nueva. Pendiente de sincronización.' : 'Factura registrada desde QR.'); if (navigator.onLine) void load(); }} />}
  </Stack>;
}
