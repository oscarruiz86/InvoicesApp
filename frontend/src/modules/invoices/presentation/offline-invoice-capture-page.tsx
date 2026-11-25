import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper,
  Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography } from '@mui/material';
import { DataPagination } from '@/shared/components/data-pagination';
import { DataTable, DataTableSurface } from '@/shared/components/data-table';
import { normalizeInvoiceTime } from '../application/invoice-time';
import type { OfflineCredentialClaims, OfflineCredentialPublicJwk, OfflineCredentialRecord, OfflineCredentialVerifier, OfflineInvoiceQueuePort, OfflineInvoiceRecord } from '../application/offline-invoice-ports';
import type { QrCameraSession, QrDecoder } from '../application/qr-decoder';
import { parseInvoiceQr } from '@shared/invoice-qr';

type Assignment = OfflineCredentialRecord['assignments'][number];
const labels: Record<OfflineInvoiceRecord['status'], string> = {
  PENDING: 'Pendiente de envío', SENDING: 'Enviando', RETRYABLE_FAILURE: 'Error temporal; se reintentará', REQUIRES_CORRECTION: 'Requiere corrección',
  CONFLICT: 'En conflicto; lo revisa el administrador tercero', SYNCHRONIZED: 'Sincronizada', LINKED: 'Vinculada a una factura existente', REJECTED: 'Rechazada',
};
const tagLabels: Record<OfflineInvoiceRecord['status'], string> = {
  PENDING: 'Pendiente', SENDING: 'Enviando', RETRYABLE_FAILURE: 'Error temporal', REQUIRES_CORRECTION: 'Requiere corrección', CONFLICT: 'En conflicto',
  SYNCHRONIZED: 'Sincronizada', LINKED: 'Vinculada', REJECTED: 'Rechazada',
};
function tagColor(status: OfflineInvoiceRecord['status']) {
  if (status === 'CONFLICT' || status === 'REQUIRES_CORRECTION') return 'warning';
  if (status === 'RETRYABLE_FAILURE' || status === 'REJECTED') return 'error';
  if (status === 'SYNCHRONIZED' || status === 'LINKED') return 'success';
  if (status === 'SENDING') return 'info';
  return 'default';
}
const initial = { assignmentId: '', invoiceDate: '', invoiceTime: '', invoiceNumber: '', issuerNit: '', buyerDocument: '', amount: '', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '' };
type InvoicePreview = Pick<ReturnType<typeof parseInvoiceQr>, 'invoiceDate' | 'invoiceTime' | 'invoiceNumber' | 'issuerNit' | 'buyerDocument' | 'amount' | 'vatAmount' | 'otherTaxesAmount' | 'totalAmount'>;

function recordPreview(record: OfflineInvoiceRecord): Partial<InvoicePreview> | null {
  if (record.origin === 'QR') {
    try { return parseInvoiceQr(record.payload.qrContent ?? ''); }
    catch { return null; }
  }
  return { invoiceDate: record.payload.invoiceDate, invoiceTime: record.payload.invoiceTime, invoiceNumber: record.payload.invoiceNumber,
    issuerNit: record.payload.issuerNit, buyerDocument: record.payload.buyerDocument, amount: record.payload.amount,
    vatAmount: record.payload.vatAmount, otherTaxesAmount: record.payload.otherTaxesAmount, totalAmount: record.payload.totalAmount };
}

function readOnlyField(label: string, value: string | undefined) {
  return <TextField fullWidth size="small" label={label} value={value || '—'} slotProps={{ input: { readOnly: true } }} />;
}

function formatMoney(value?: string) {
  if (!value) return '—';
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(amount) : value;
}

function formatAmountInput(value: string): string {
  const cleaned = value.replace(/[^\d,]/g, ''), comma = cleaned.indexOf(',');
  const integer = (comma < 0 ? cleaned : cleaned.slice(0, comma)).slice(0, 14);
  const fraction = comma < 0 ? '' : cleaned.slice(comma + 1).replace(/,/g, '').slice(0, 2);
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${comma < 0 ? '' : `,${fraction}`}`;
}

function canonicalAmount(value: string): string {
  if (value.includes(',')) return value.replace(/\./g, '').replace(',', '.');
  if (/^\d{1,14}\.\d{1,2}$/.test(value)) return value;
  return value.replace(/\./g, '');
}

function displayAmount(value: string): string {
  if (/^\d{1,14}\.\d{1,2}$/.test(value)) {
    const [integer, fraction] = value.split('.');
    return formatAmountInput(`${integer},${fraction}`);
  }
  return formatAmountInput(value);
}

export function OfflineInvoiceCapturePage({ ticket, claims, publicJwks, loadDecoder, offlineQueue, verifyCredential }: { readonly ticket: OfflineCredentialRecord; readonly claims: OfflineCredentialClaims;
  readonly publicJwks: readonly OfflineCredentialPublicJwk[]; readonly loadDecoder: () => Promise<QrDecoder>;
  readonly offlineQueue: OfflineInvoiceQueuePort; readonly verifyCredential: OfflineCredentialVerifier }) {
  const [mode, setMode] = useState<'MANUAL' | 'QR'>('MANUAL');
  const [section, setSection] = useState<'capture' | 'pending'>('capture');
  const [form, setForm] = useState(initial), [image, setImage] = useState<File | undefined>();
  const [qrContent, setQrContent] = useState(''), [qrPreview, setQrPreview] = useState<InvoicePreview | null>(null), [qrNotice, setQrNotice] = useState<string | null>(null);
  const [camera, setCamera] = useState(false), [saving, setSaving] = useState(false), [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null), [records, setRecords] = useState<OfflineInvoiceRecord[]>([]);
  const [recordsPage, setRecordsPage] = useState(1), [recordsPageSize, setRecordsPageSize] = useState(10);
  const [selectedRecord, setSelectedRecord] = useState<OfflineInvoiceRecord | null>(null);
  const [correctingRecordId, setCorrectingRecordId] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null), cameraSession = useRef<QrCameraSession | null>(null);
  const assignment: Assignment | undefined = ticket.assignments.find(value => value.id === form.assignmentId);
  const pendingRecords = records.filter(record => !['SYNCHRONIZED', 'LINKED', 'REJECTED'].includes(record.status));
  const localRejectedRecords = records.filter(record => record.status === 'REJECTED' && !record.serverSubmissionId);
  const visibleRecords = pendingRecords.slice((recordsPage - 1) * recordsPageSize, recordsPage * recordsPageSize);

  useEffect(() => { const lastPage = Math.max(1, Math.ceil(pendingRecords.length / recordsPageSize)); if (recordsPage > lastPage) setRecordsPage(lastPage); }, [pendingRecords.length, recordsPage, recordsPageSize]);
  useEffect(() => { if (pendingRecords.length === 0) setSection('capture'); }, [pendingRecords.length]);

  useEffect(() => {
    let active = true;
    const refresh = () => { void offlineQueue.list(ticket.subject, ticket.thirdPartyId).then(value => { if (active) setRecords(value); }).catch(() => { if (active) setRecords([]); }); };
    const unsubscribe = offlineQueue.subscribe(refresh); refresh();
    return () => { active = false; unsubscribe(); cameraSession.current?.destroy(); cameraSession.current = null; };
  }, [offlineQueue, ticket.subject, ticket.thirdPartyId]);

  useEffect(() => {
    if (!camera || !video.current) return;
    const element = video.current, controller = new AbortController();
    void loadDecoder().then(adapter => adapter.openCamera(element, content => {
      if (controller.signal.aborted) return;
      setQrContent(content); inspectQr(content); setCamera(false); cameraSession.current?.stop();
    }, () => { if (!controller.signal.aborted) { setError('No se pudo leer el QR con la cámara. Prueba con una imagen.'); setCamera(false); } }))
      .then(session => { if (controller.signal.aborted) session.destroy(); else cameraSession.current = session; })
      .catch(() => { if (!controller.signal.aborted) { setError('La cámara no está disponible sin conexión. Puedes seleccionar una imagen JPEG o PNG.'); setCamera(false); } });
    return () => { controller.abort(); cameraSession.current?.destroy(); cameraSession.current = null; };
  }, [camera, loadDecoder]);

  function inspectQr(content: string) {
    try {
      const { canonicalContent: _canonicalContent, metadata: _metadata, invoiceAtUtc: _invoiceAtUtc, ...preview } = parseInvoiceQr(content);
      void _canonicalContent; void _metadata; void _invoiceAtUtc;
      setQrPreview(preview); setQrNotice('Datos extraídos localmente como vista previa. El servidor volverá a validar el QR al sincronizar.');
    } catch {
      setQrPreview(null); setQrNotice('El contenido se conservará sin validar localmente; el servidor lo revisará al sincronizar.');
    }
  }
  async function decodeImage(file?: File) {
    if (!file) return;
    setError(null);
    try {
      if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error();
      const content = await (await loadDecoder()).decodeImage(file, new AbortController().signal);
      setQrContent(content); inspectQr(content);
    } catch { setError('No se pudo leer el QR. Selecciona una imagen JPEG o PNG válida.'); }
  }
  async function save() {
    if (saving || !assignment || !claims.assignmentIds.includes(assignment.id)) return;
    setError(null); setNotice(null);
    if (mode === 'MANUAL') {
      if (!form.invoiceDate || !form.invoiceTime || !form.invoiceNumber.trim() || !/^\d{1,20}$/.test(form.issuerNit) || !form.buyerDocument.trim()
        || !form.amount || !form.totalAmount || !image || image.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png'].includes(image.type)) {
        setError('Completa los datos obligatorios y adjunta una imagen JPEG o PNG de hasta 5 MiB.'); return;
      }
    } else if (!qrContent.trim()) { setError('Escanea o selecciona una imagen con un código QR.'); return; }
    setSaving(true);
    try {
      const verified = await verifyCredential(ticket, publicJwks);
      if (!verified || !verified.assignmentIds.includes(assignment.id)) throw new Error('OFFLINE_CREDENTIAL_EXPIRED');
      const payload: Record<string, string> = mode === 'QR' ? { qrContent } : {
        invoiceDate: form.invoiceDate, invoiceTime: normalizeInvoiceTime(form.invoiceTime), invoiceNumber: form.invoiceNumber.trim(), issuerNit: form.issuerNit,
        buyerDocument: form.buyerDocument.trim(), amount: canonicalAmount(form.amount), vatAmount: canonicalAmount(form.vatAmount || '0'),
        otherTaxesAmount: canonicalAmount(form.otherTaxesAmount || '0'), totalAmount: canonicalAmount(form.totalAmount),
      };
      await offlineQueue.save({ subject: ticket.subject, thirdPartyId: ticket.thirdPartyId, origin: mode,
        assignmentId: assignment.id, vehicleId: assignment.vehicleId, payload, ...(mode === 'MANUAL' && image ? { image } : mode === 'QR' && image ? { image } : {}) });
      if (correctingRecordId) { await offlineQueue.remove(correctingRecordId); setCorrectingRecordId(null); }
      setForm(initial); setImage(undefined); setQrContent(''); setQrPreview(null); setQrNotice(null); setNotice('Guardado localmente. Aún no está registrado en el servidor.');
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'QuotaExceededError') setError('No hay espacio suficiente en el dispositivo. Libera espacio y vuelve a guardar; este registro no se sincronizó.');
      else if (cause instanceof Error && cause.message === 'OFFLINE_STORAGE_UNAVAILABLE') setError('El almacenamiento local no está disponible. No se guardó el registro; conéctate antes de volver a intentarlo.');
      else setError('La credencial venció o no pudo validarse. Conéctate e inicia sesión para renovar el acceso.');
    }
    finally { setSaving(false); }
  }
  const textField = (key: keyof typeof initial, label: string, type = 'text') => <TextField required fullWidth label={label} type={type} value={form[key]}
    slotProps={type === 'date' || type === 'time' ? { inputLabel: { shrink: true } } : undefined}
    onChange={event => setForm(value => ({ ...value, [key]: event.target.value }))} />;
  const amountField = (key: 'amount' | 'vatAmount' | 'otherTaxesAmount' | 'totalAmount', label: string) => <TextField required fullWidth label={label}
    type="text" slotProps={{ htmlInput: { inputMode: 'decimal' } }} value={displayAmount(form[key])}
    onChange={event => setForm(value => ({ ...value, [key]: formatAmountInput(event.target.value) }))} />;

  return <Container maxWidth="md" sx={{ py: 3 }}>
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">Captura offline de facturas</Typography>
      <Alert severity="warning">Sin conexión: los registros se guardan solo en este dispositivo. El servidor los validará y registrará cuando recuperes conexión.</Alert>
      <Alert severity="info">Acceso offline válido hasta {new Date(ticket.expiresAt).toLocaleString('es-CO')}. Solo permite capturar con las asignaciones incluidas.</Alert>
      {error && <Alert severity="error" role="alert">{error}</Alert>}{notice && <Alert severity="success" role="status">{notice}</Alert>}
      <Tabs value={section} onChange={(_, value: 'capture' | 'pending') => {
        setSection(value);
        if (value === 'pending') { setCamera(false); cameraSession.current?.destroy(); cameraSession.current = null; }
      }} aria-label="Secciones de captura offline">
        <Tab value="capture" label="Captura" />
        {pendingRecords.length > 0 && <Tab value="pending" label={`Pendientes (${pendingRecords.length})`} />}
      </Tabs>
      {section === 'capture' && <>
      <Tabs value={mode} onChange={(_, value: 'MANUAL' | 'QR') => { setMode(value); setError(null); }} aria-label="Tipo de captura">
        <Tab value="MANUAL" label="Manual" /><Tab value="QR" label="Código QR" />
      </Tabs>
      <TextField select required label="Vehículo y asignación" value={form.assignmentId} onChange={event => setForm(value => ({ ...value, assignmentId: event.target.value }))}>
        {ticket.assignments.map(value => <MenuItem key={value.id} value={value.id}>{value.vehiclePlate || 'Vehículo sin placa'} · {value.driver.name}</MenuItem>)}
      </TextField>
      {mode === 'MANUAL' ? <>
        {textField('invoiceDate', 'Fecha de factura', 'date')}{textField('invoiceTime', 'Hora de factura', 'time')}{textField('invoiceNumber', 'Número de factura')}
        {textField('issuerNit', 'NIT del emisor')}{textField('buyerDocument', 'Documento del adquiriente')}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>{amountField('amount', 'Valor antes de impuestos')}{amountField('vatAmount', 'IVA')}</Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>{amountField('otherTaxesAmount', 'Otros impuestos')}{amountField('totalAmount', 'Total')}</Stack>
        <Button component="label" variant="outlined">Adjuntar imagen de factura<input hidden type="file" accept="image/jpeg,image/png" onChange={event => setImage(event.target.files?.[0])} /></Button>
        {image && <Typography variant="body2">Imagen seleccionada: {image.name}</Typography>}
      </> : <>
        <Typography>Lee el QR con la cámara o selecciona una imagen. La captura no confirma autenticidad fiscal.</Typography>
        {camera && <Box sx={{ bgcolor: 'common.black', borderRadius: 1, overflow: 'hidden' }}><Box component="video" ref={video} autoPlay playsInline muted aria-label="Cámara para escanear factura" sx={{ width: '100%', maxHeight: 360, objectFit: 'contain' }} /></Box>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button variant="outlined" onClick={() => { setError(null); setCamera(true); }}>Abrir cámara</Button>
          <Button component="label" variant="outlined">Leer imagen QR<input hidden type="file" accept="image/jpeg,image/png" onChange={event => { void decodeImage(event.target.files?.[0]); event.currentTarget.value = ''; }} /></Button>
          <Button component="label" variant="outlined">Adjuntar imagen de factura (opcional)<input hidden type="file" accept="image/jpeg,image/png" onChange={event => setImage(event.target.files?.[0])} /></Button>
        </Stack>
        {qrNotice && <Alert severity="info">{qrNotice}</Alert>}
        {qrPreview && <Paper component="section" variant="outlined" aria-label="Datos extraídos del código QR" sx={{ p: 1.5 }}>
          <Stack spacing={1}><Typography variant="subtitle2">Datos del formulario extraídos del QR</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
              {readOnlyField('Número de factura', qrPreview.invoiceNumber)}{readOnlyField('Fecha de factura', qrPreview.invoiceDate)}
              {readOnlyField('Hora', qrPreview.invoiceTime)}{readOnlyField('NIT del emisor', qrPreview.issuerNit)}
              {readOnlyField('Documento del adquiriente', qrPreview.buyerDocument)}{readOnlyField('Valor antes de impuestos', formatMoney(qrPreview.amount))}
              {readOnlyField('IVA', formatMoney(qrPreview.vatAmount))}{readOnlyField('Otros impuestos', formatMoney(qrPreview.otherTaxesAmount))}
              {readOnlyField('Total', formatMoney(qrPreview.totalAmount))}
            </Box>
          </Stack>
        </Paper>}
        {image && <Typography variant="body2">Imagen adjunta: {image.name}</Typography>}
      </>}
      <Button variant="contained" disabled={saving || !assignment} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar en este dispositivo'}</Button>
      </>}
      {section === 'pending' && <Stack spacing={1.5}>
      <Typography variant="h6">Pendientes de sincronización ({pendingRecords.length})</Typography>
      <DataTable>
        <DataTableSurface sx={{ display: { xs: 'none', md: 'block' } }}><Table size="small" aria-label="Facturas pendientes de sincronización" sx={{
          width: '100%', tableLayout: 'fixed', '& .MuiTableCell-root': { minWidth: 0, overflowWrap: 'anywhere' },
          '& th:last-of-type, & td:last-of-type': { width: 110 },
        }}>
          <TableHead><TableRow><TableCell>Factura</TableCell><TableCell>Asignación</TableCell><TableCell>Capturada</TableCell><TableCell>Estado</TableCell><TableCell>Datos</TableCell></TableRow></TableHead>
          <TableBody>{visibleRecords.map(record => {
            const summary = recordPreview(record), recordAssignment = ticket.assignments.find(value => value.id === record.assignmentId);
            return <TableRow key={record.id} hover>
              <TableCell>{summary?.invoiceNumber ?? (record.origin === 'QR' ? 'Factura QR' : 'Factura manual')}</TableCell>
              <TableCell>{recordAssignment ? recordAssignment.vehiclePlate || 'Vehículo sin placa' : 'Asignación guardada'}</TableCell>
              <TableCell>{new Date(record.createdAt).toLocaleString('es-CO')}</TableCell>
              <TableCell><Chip size="small" color={tagColor(record.status)} label={tagLabels[record.status]} /></TableCell>
              <TableCell><Button size="small" onClick={() => setSelectedRecord(record)}>Ver datos</Button></TableCell>
            </TableRow>;
          })}</TableBody>
        </Table></DataTableSurface>
        <Stack spacing={1} sx={{ display: { xs: 'flex', md: 'none' } }} aria-label="Facturas pendientes de sincronización">
          {visibleRecords.map(record => {
            const summary = recordPreview(record), recordAssignment = ticket.assignments.find(value => value.id === record.assignmentId);
            return <Paper key={`mobile-${record.id}`} variant="outlined" sx={{ p: 1.25 }}>
              <Stack spacing={0.75}><Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center', minWidth: 0 }}>
                <Typography sx={{ minWidth: 0, fontWeight: 700, overflowWrap: 'anywhere' }}>{summary?.invoiceNumber ?? (record.origin === 'QR' ? 'Factura QR' : 'Factura manual')}</Typography>
                <Chip size="small" color={tagColor(record.status)} label={tagLabels[record.status]} />
              </Stack>
              <Typography variant="body2">{recordAssignment ? recordAssignment.vehiclePlate || 'Vehículo sin placa' : 'Asignación guardada'} · {new Date(record.createdAt).toLocaleString('es-CO')}</Typography>
              <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => setSelectedRecord(record)}>Ver datos</Button></Stack>
            </Paper>;
          })}
        </Stack>
        <DataPagination page={recordsPage} pageSize={recordsPageSize} total={pendingRecords.length} label="Páginas de facturas pendientes"
          onPageChange={setRecordsPage} onPageSizeChange={value => { setRecordsPageSize(value); setRecordsPage(1); }} />
      </DataTable>
      </Stack>}
      {localRejectedRecords.length > 0 && <Paper variant="outlined" sx={{ p: 1.5 }}><Stack spacing={1}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Rechazos locales · solo este dispositivo</Typography>
        {localRejectedRecords.map(record => <Alert key={record.id} severity="error">{record.origin === 'QR' ? 'Factura QR' : `Factura ${record.payload.invoiceNumber ?? ''}`} · {record.message ?? 'Rechazada localmente; no fue recibida por el servidor.'}</Alert>)}
      </Stack></Paper>}
      <Dialog open={Boolean(selectedRecord)} onClose={() => setSelectedRecord(null)} fullWidth maxWidth="md">
        <DialogTitle>Datos de la captura offline</DialogTitle><DialogContent dividers><Stack spacing={1.25} sx={{ pt: 1 }}>
          {selectedRecord && (() => {
            const summary = recordPreview(selectedRecord);
            return <>
              <Typography variant="body2" color="text.secondary">{labels[selectedRecord.status]} · {new Date(selectedRecord.createdAt).toLocaleString('es-CO')}</Typography>
              {summary ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
                {readOnlyField('Número de factura', summary.invoiceNumber)}{readOnlyField('Fecha', summary.invoiceDate)}{readOnlyField('Hora', summary.invoiceTime)}
                {readOnlyField('NIT del emisor', summary.issuerNit)}{readOnlyField('Documento del adquiriente', summary.buyerDocument)}
                {readOnlyField('Valor antes de impuestos', formatMoney(summary.amount))}{readOnlyField('IVA', formatMoney(summary.vatAmount))}
                {readOnlyField('Otros impuestos', formatMoney(summary.otherTaxesAmount))}{readOnlyField('Total', formatMoney(summary.totalAmount))}
              </Box> : <Alert severity="warning">No fue posible extraer una vista previa; el servidor validará el contenido QR original al sincronizar.</Alert>}
              {selectedRecord.message && <Alert severity={selectedRecord.status === 'REQUIRES_CORRECTION' ? 'warning' : selectedRecord.status === 'REJECTED' ? 'error' : 'info'}>{selectedRecord.message}</Alert>}
              {selectedRecord.image && <Typography variant="caption" color="text.secondary">Imagen adjunta guardada en este dispositivo</Typography>}
              {selectedRecord.status === 'REQUIRES_CORRECTION' && <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => {
                setCorrectingRecordId(selectedRecord.id); setMode(selectedRecord.origin); setForm({ ...initial, assignmentId: selectedRecord.assignmentId,
                  invoiceDate: selectedRecord.payload.invoiceDate ?? '', invoiceTime: selectedRecord.payload.invoiceTime ?? '', invoiceNumber: selectedRecord.payload.invoiceNumber ?? '',
                  issuerNit: selectedRecord.payload.issuerNit ?? '', buyerDocument: selectedRecord.payload.buyerDocument ?? '', amount: selectedRecord.payload.amount ?? '',
                  vatAmount: selectedRecord.payload.vatAmount ?? '0', otherTaxesAmount: selectedRecord.payload.otherTaxesAmount ?? '0', totalAmount: selectedRecord.payload.totalAmount ?? '' });
                setImage(selectedRecord.image ? new File([selectedRecord.image], `invoice-${selectedRecord.id}.${selectedRecord.image.type === 'image/png' ? 'png' : 'jpg'}`, { type: selectedRecord.image.type }) : undefined);
                setQrContent(selectedRecord.payload.qrContent ?? ''); inspectQr(selectedRecord.payload.qrContent ?? ''); setNotice(null); setError(null); setSelectedRecord(null);
              }}>Corregir con una nueva identidad</Button>}
            </>;
          })()}
        </Stack></DialogContent><DialogActions><Button onClick={() => setSelectedRecord(null)}>Cerrar</Button></DialogActions>
      </Dialog>
    </Stack>
  </Container>;
}
