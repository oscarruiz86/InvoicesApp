import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { AssignmentApi } from '@/modules/fleet/application/fleet-api';
import type { InvoiceApi, InvoiceQrPreview } from '../application/invoice-api';
import type { QrCameraSession, QrDecoderLoader } from '../application/qr-decoder';
import { RequestError } from '@/shared/application/request-error';
import { InvoiceQrError, parseInvoiceQr } from '@shared/invoice-qr';

type Assignment = Awaited<ReturnType<AssignmentApi['listAssignments']>>['items'][number];
function message(error: unknown): string {
  if (error instanceof InvoiceQrError) return ({ QR_INCOMPLETE: 'El QR no incluye todos los campos obligatorios. Escanea otro código; no puedes completar campos manualmente. ',
    QR_INVALID: 'El QR tiene datos inválidos. Comprueba la factura y vuelve a intentarlo.', QR_UNSUPPORTED: 'Este formato QR no está soportado. Puedes intentar otra lectura o registrar la factura manualmente.' } as const)[error.code];
  if (error instanceof RequestError) return ({ QR_INCOMPLETE: 'El QR no incluye todos los campos obligatorios. Escanea otro código; no puedes completar campos manualmente. ',
    QR_INVALID: 'El QR tiene datos inválidos. Comprueba la factura y vuelve a intentarlo.', QR_UNSUPPORTED: 'Este formato QR no está soportado. Puedes intentar otra lectura o registrar la factura manualmente.',
    INVOICE_DUPLICATE: 'Ya existe una factura con ese NIT y número.', IDEMPOTENCY_CONFLICT: 'La solicitud cambió durante el reintento. Revisa el contexto antes de continuar.',
    ASSIGNMENT_NOT_ELIGIBLE: 'La asignación dejó de estar disponible. Actualiza la lista y vuelve a seleccionar.', IMAGE_TOO_LARGE: 'El adjunto supera el máximo de 5 MiB.',
    IMAGE_TYPE_UNSUPPORTED: 'El adjunto debe ser JPEG o PNG.', IMAGE_INVALID: 'El adjunto no es una imagen válida.' } as Record<string, string>)[error.businessCode]
    ?? 'No se pudo completar la operación. Inténtalo de nuevo.';
  if (error instanceof Error && error.message === 'QR_IMAGE_UNSUPPORTED') return 'Selecciona una imagen JPEG o PNG de hasta 5 MiB.';
  if (error instanceof Error && error.message === 'QR_IMAGE_TOO_LARGE') return 'La imagen supera el límite de 20 megapíxeles.';
  if (error instanceof Error && error.message === 'QR_IMAGE_INVALID') return 'El archivo seleccionado no es una imagen válida.';
  if (error instanceof Error && error.message === 'QR_NOT_FOUND') return 'No encontramos un QR legible en la imagen. Prueba otra imagen.';
  if (error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name)) return 'El navegador no concedió acceso a la cámara. Revisa el permiso y usa HTTPS o selecciona una imagen.';
  if (error instanceof DOMException && error.name === 'NotFoundError') return 'Este dispositivo no tiene una cámara disponible. Selecciona una imagen local.';
  if (error instanceof DOMException && error.name === 'NotReadableError') return 'La cámara está ocupada por otra aplicación. Libérala o selecciona una imagen.';
  return 'No se pudo leer el QR. Comprueba la cámara o selecciona una imagen local.';
}

export function InvoiceQrCapture({ open, api, loadDecoder, assignments, context, onClose, onSaved }: {
  readonly open: boolean; readonly api: InvoiceApi; readonly loadDecoder: QrDecoderLoader; readonly assignments: readonly Assignment[];
  readonly context: ContextStore; readonly onClose: () => void; readonly onSaved: () => void;
}) {
  useStore(context);
  const video = useRef<HTMLVideoElement>(null), session = useRef<QrCameraSession | null>(null), operation = useRef<AbortController | null>(null);
  const decoderPromise = useRef<ReturnType<QrDecoderLoader> | null>(null);
  const serial = useRef(0), idempotency = useRef<string | null>(null), decoded = useRef(false);
  const [cameraRequested, setCameraRequested] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [preview, setPreview] = useState<InvoiceQrPreview | null>(null);
  const [qrContent, setQrContent] = useState(''), [assignmentId, setAssignmentId] = useState(''), [vehicleId, setVehicleId] = useState('');
  const [attachment, setAttachment] = useState<File | undefined>();
  const decoder = useCallback(() => decoderPromise.current ??= loadDecoder(), [loadDecoder]);

  const closeCamera = useCallback(() => { session.current?.destroy(); session.current = null; setCameraRequested(false); }, []);
  const reset = useCallback(() => {
    ++serial.current; operation.current?.abort(); operation.current = null; closeCamera(); idempotency.current = null; decoded.current = false;
    setBusy(false); setError(null); setPreview(null); setQrContent(''); setAssignmentId(''); setVehicleId(''); setAttachment(undefined);
  }, [closeCamera]);
  useEffect(() => { if (!open) reset(); return () => { operation.current?.abort(); closeCamera(); }; }, [open, reset, closeCamera]);

  const reviewContent = useCallback(async (content: string) => {
    ++serial.current; const request = serial.current; operation.current?.abort();
    setError(null); setPreview(null); setQrContent(''); setBusy(true);
    try {
      const { canonicalContent: _canonicalContent, ...result } = parseInvoiceQr(content);
      if (request === serial.current) { setQrContent(content); setPreview(result); idempotency.current = null; }
    } catch (cause) {
      if (request === serial.current) setError(message(cause));
    } finally {
      if (request === serial.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !cameraRequested || !video.current) return;
    const element = video.current, controller = new AbortController(); operation.current?.abort(); operation.current = controller;
    let active = true;
    setError(null); setBusy(true); decoded.current = false;
    void decoder().then(adapter => adapter.openCamera(element, content => {
      if (!active || controller.signal.aborted || decoded.current) return;
      decoded.current = true; session.current?.stop(); setCameraRequested(false); setBusy(false); void reviewContent(content);
    }, cause => { if (active && !controller.signal.aborted) { setError(message(cause)); setCameraRequested(false); setBusy(false); } }))
      .then(value => { if (!active || controller.signal.aborted) value.destroy(); else session.current = value; })
      .catch(cause => { if (active && !controller.signal.aborted) { setError(message(cause)); setCameraRequested(false); setBusy(false); } });
    return () => { active = false; controller.abort(); session.current?.destroy(); session.current = null; };
  }, [cameraRequested, decoder, open, reviewContent]);

  async function chooseImage(file?: File) {
    if (!file) return;
    closeCamera();
    const controller = new AbortController(); operation.current?.abort(); operation.current = controller;
    const request = ++serial.current; setBusy(true); setError(null); setPreview(null); setQrContent('');
    try {
      const content = await (await decoder()).decodeImage(file, controller.signal);
      if (request === serial.current && !controller.signal.aborted) await reviewContent(content);
    } catch (cause) { if (request === serial.current && !controller.signal.aborted) setError(message(cause)); }
    finally { if (request === serial.current) setBusy(false); }
  }

  async function save() {
    if (!preview || !assignmentId || !vehicleId || busy) return;
    let capture: ReturnType<ContextStore['capture']>;
    try { capture = context.capture(); } catch { setError('El contexto ya no está disponible. Vuelve a seleccionarlo.'); return; }
    const controller = new AbortController(); operation.current?.abort(); operation.current = controller;
    const request = ++serial.current; setBusy(true); setError(null); idempotency.current ??= crypto.randomUUID();
    try {
      await api.createQr(capture.scope, { qrContent, assignmentId, vehicleId, ...(attachment ? { image: attachment } : {}) }, idempotency.current,
        AbortSignal.any([capture.signal, controller.signal]));
      if (request === serial.current && capture.isCurrent() && !controller.signal.aborted) { onSaved(); onClose(); reset(); }
    } catch (cause) { if (request === serial.current && capture.isCurrent() && !controller.signal.aborted) setError(message(cause)); }
    finally { capture.release(); if (request === serial.current) setBusy(false); }
  }

  const selected = assignments.find(item => item.id === assignmentId);
  const cameraUnavailableText = typeof window !== 'undefined' && window.isSecureContext ? 'Si la cámara no está disponible, selecciona una imagen.'
    : 'La cámara requiere HTTPS (o localhost en desarrollo). Puedes seleccionar una imagen local.';
  const money = (value: string) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2 }).format(Number(value));
  const field = (label: string, value: string) => <TextField key={label} label={label} value={value} fullWidth slotProps={{ input: { readOnly: true } }} />;

  return <Dialog open={open} onClose={() => { reset(); onClose(); }} fullWidth maxWidth="md" aria-labelledby="invoice-qr-title">
    <DialogTitle id="invoice-qr-title">Registrar factura desde QR</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Alert severity="info">Revisa los datos antes de confirmar. El QR no acredita autenticidad fiscal. No navegaremos a las URL que pueda contener.</Alert>
        {error && <Alert severity="error" role="alert">{error}</Alert>}
        {!preview && <>
          <Typography>{cameraUnavailableText} La lectura solo acepta imágenes JPEG o PNG de hasta 5 MiB y 20 megapíxeles.</Typography>
          {cameraRequested && <Box sx={{ bgcolor: 'common.black', borderRadius: 1, overflow: 'hidden', maxHeight: 360 }}>
            <Box component="video" ref={video} autoPlay playsInline muted aria-label="Vista de la cámara para leer el QR" sx={{ width: '100%', maxHeight: 360, objectFit: 'contain' }} />
          </Box>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            {!cameraRequested && <Button variant="contained" onClick={() => setCameraRequested(true)} disabled={busy}>Abrir cámara</Button>}
            {cameraRequested && <Button variant="outlined" onClick={closeCamera}>Detener cámara</Button>}
            <Button component="label" variant="outlined" disabled={busy}>Leer imagen local<input hidden type="file" accept="image/jpeg,image/png" aria-label="Imagen con código QR" onChange={event => { void chooseImage(event.target.files?.[0]); event.currentTarget.value = ''; }} /></Button>
          </Stack>
          {busy && <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><CircularProgress size={20} /><Typography>Procesando lectura…</Typography></Stack>}
        </>}
        {preview && <>
          <Typography variant="h6">Revisa los datos leídos</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>{field('Número de factura', preview.invoiceNumber)}{field('NIT del emisor', preview.issuerNit)}</Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>{field('Documento del adquiriente', preview.buyerDocument)}{field('Fecha', preview.invoiceDate)}{field('Hora', preview.invoiceTime)}</Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>{field('Valor de factura', money(preview.amount))}{field('IVA', money(preview.vatAmount))}{field('Otros impuestos', money(preview.otherTaxesAmount))}</Stack>
          {field('Total', money(preview.totalAmount))}
          {preview.metadata.cufe && field('CUFE', preview.metadata.cufe)}
          {preview.metadata.sourceUrl && field('URL incluida en el QR (no se abre)', preview.metadata.sourceUrl)}
          <TextField select required label="Vehículo y asignación propia" value={assignmentId} disabled={busy || assignments.length === 0}
            onChange={event => { const assignment = assignments.find(item => item.id === event.target.value); setAssignmentId(event.target.value); setVehicleId(assignment?.vehicleId ?? ''); }}>
            {assignments.map(item => <MenuItem key={item.id} value={item.id}>{item.vehiclePlate ?? item.vehicleId} · {item.driver.name}</MenuItem>)}
          </TextField>
          {selected && <Typography variant="body2">Asignación seleccionada: {selected.status.toLowerCase()} desde {selected.startedAt.slice(0, 10)}.</Typography>}
          <Button component="label" variant="outlined" disabled={busy}>Adjuntar imagen aparte (opcional)<input hidden type="file" accept="image/jpeg,image/png" aria-label="Adjunto opcional de la factura" onChange={event => setAttachment(event.target.files?.[0])} /></Button>
          {attachment && <Typography variant="body2">Adjunto seleccionado: {attachment.name}. La imagen leída no se adjuntó.</Typography>}
          <Button variant="text" disabled={busy} onClick={() => { reset(); }}>Descartar lectura y escanear otra</Button>
        </>}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 2 }}>
      <Button onClick={() => { reset(); onClose(); }}>Cancelar</Button>
      {preview && <Button variant="contained" onClick={() => void save()} disabled={busy || !assignmentId}>{busy ? 'Registrando…' : 'Confirmar registro'}</Button>}
    </DialogActions>
  </Dialog>;
}
