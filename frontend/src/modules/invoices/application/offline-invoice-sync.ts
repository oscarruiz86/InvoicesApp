import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { InvoiceApi, OfflineSubmissionState } from './invoice-api';
import { RequestError } from '@/shared/application/request-error';
import { ApplicationError } from '@/shared/application/application-error';
import type { OfflineInvoiceQueuePort, OfflineInvoiceRecord, OfflineInvoiceStatus } from './offline-invoice-ports';
import { normalizeInvoiceTime } from './invoice-time';

function imageFile(record: OfflineInvoiceRecord): File | undefined {
  if (!record.image) return undefined;
  return new File([record.image], `invoice-${record.id}.${record.image.type === 'image/png' ? 'png' : 'jpg'}`, { type: record.image.type });
}
function localStatus(status: OfflineSubmissionState): OfflineInvoiceStatus { return status === 'PENDING' ? 'RETRYABLE_FAILURE' : status; }
function minimized(record: OfflineInvoiceRecord, status: OfflineInvoiceStatus, message?: string, serverSubmissionId?: string, resultInvoiceId?: string | null): OfflineInvoiceRecord {
  // A correction must keep the original draft and image so the driver can edit it.
  const minimizedResult = ['SYNCHRONIZED', 'LINKED', 'REJECTED', 'CONFLICT'].includes(status);
  return { ...record, status, ...(message ? { message } : {}), ...(serverSubmissionId ? { serverSubmissionId } : {}),
    ...(resultInvoiceId !== undefined ? { resultInvoiceId } : {}), ...(minimizedResult ? { image: undefined,
      payload: record.origin === 'MANUAL' ? { invoiceNumber: record.payload.invoiceNumber ?? '' } : {} } : {}) };
}

function correctionMessage(error: unknown, origin: OfflineInvoiceRecord['origin']): string {
  const code = error instanceof RequestError ? error.businessCode : error instanceof ApplicationError ? error.code : '';
  if (code === 'FORBIDDEN') return 'Se perdió la autorización para registrar facturas. El servidor rechazó este envío.';
  if (code === 'QR_INVALID' || code === 'QR_INCOMPLETE' || code === 'QR_UNSUPPORTED')
    return 'No se pudo validar el código QR. Vuelve a escanearlo o presenta la factura con captura manual.';
  if (code === 'IMAGE_REQUIRED') return 'Adjunta una imagen de la factura y vuelve a presentarla.';
  if (code === 'IMAGE_TOO_LARGE') return 'La imagen supera 5 MiB. Adjunta una imagen más pequeña y vuelve a presentarla.';
  if (code === 'IMAGE_TYPE_UNSUPPORTED' || code === 'IMAGE_INVALID' || code === 'IMAGE_DIMENSIONS_INVALID')
    return 'La imagen no es válida. Adjunta una imagen JPEG o PNG legible y vuelve a presentarla.';
  if (error instanceof RequestError && error.fields.length) {
    const labels: Record<string, string> = { invoiceDate: 'la fecha de factura', invoiceTime: 'la hora de factura (HH:mm:ss)',
      invoiceNumber: 'el número de factura', issuerNit: 'el NIT del emisor', buyerDocument: 'el documento del adquiriente',
      amount: 'el valor antes de impuestos', vatAmount: 'el IVA', otherTaxesAmount: 'otros impuestos', totalAmount: 'el total',
      assignmentId: 'el vehículo y la asignación', vehicleId: 'el vehículo y la asignación', qrContent: 'el contenido del código QR' };
    const fields = [...new Set(error.fields.map(field => labels[field]).filter(Boolean))];
    if (fields.length) return `Corrige ${fields.join(', ')} y presenta una factura nueva.`;
  }
  return origin === 'QR'
    ? 'No fue posible validar el código QR. Escanéalo de nuevo o usa la captura manual para corregir los datos.'
    : 'Revisa fecha, hora, número, NIT, documento, valores e imagen de la factura; luego presenta un registro nuevo.';
}

export async function synchronizeOfflineInvoices(input: { readonly api: InvoiceApi; readonly scope: PermissionScope;
  readonly queue: OfflineInvoiceQueuePort; readonly subject: string; readonly thirdPartyId: string; readonly signal: AbortSignal }) {
  if (running) return running;
  running = synchronize(input).finally(() => { running = undefined; });
  return running;
}

let running: Promise<void> | undefined;
async function synchronize(input: { readonly api: InvoiceApi; readonly scope: PermissionScope;
  readonly queue: OfflineInvoiceQueuePort; readonly subject: string; readonly thirdPartyId: string; readonly signal: AbortSignal }): Promise<void> {
  if (input.scope.kind !== 'organization' || input.scope.thirdPartyId !== input.thirdPartyId || !navigator.onLine) return;
  const records = await input.queue.recoverInterrupted(input.subject, input.thirdPartyId);
  for (const record of records) {
    if (input.signal.aborted || !navigator.onLine) break;
    if (record.subject !== input.subject || record.thirdPartyId !== input.thirdPartyId) continue;
    if (record.status === 'CONFLICT' && record.serverSubmissionId) {
      try {
        const result = await input.api.offlineSubmission(input.scope, record.serverSubmissionId, input.signal);
        if (['SYNCHRONIZED', 'LINKED', 'REJECTED'].includes(result.status)) await input.queue.remove(record.id);
        else await input.queue.update(minimized(record, localStatus(result.status), result.resolutionReason ?? undefined, result.id, result.resultInvoiceId));
      } catch { /* Keep the conflict until the server can report the administrator's decision. */ }
      continue;
    }
    if (!['PENDING', 'RETRYABLE_FAILURE'].includes(record.status)) continue;
    await input.queue.update({ ...record, status: 'SENDING', message: undefined });
    try {
      const payload = record.origin === 'MANUAL' && record.payload.invoiceTime
        ? { ...record.payload, invoiceTime: normalizeInvoiceTime(record.payload.invoiceTime) } : record.payload;
      const result = await input.api.submitOffline(input.scope, { origin: record.origin, assignmentId: record.assignmentId, vehicleId: record.vehicleId,
        payload, ...(imageFile(record) ? { image: imageFile(record) } : {}) }, record.idempotencyKey, input.signal);
      if (['SYNCHRONIZED', 'LINKED', 'REJECTED'].includes(result.status)) await input.queue.remove(record.id);
      else await input.queue.update(minimized(record, localStatus(result.status), result.resolutionReason ?? undefined, result.id, result.resultInvoiceId));
    } catch (error) {
      const code = error instanceof RequestError ? error.businessCode : error instanceof ApplicationError ? error.code : '';
      if (['FORBIDDEN', 'IMAGE_INVALID', 'IMAGE_TOO_LARGE', 'IMAGE_TYPE_UNSUPPORTED', 'IMAGE_DIMENSIONS_INVALID', 'IMAGE_REQUIRED', 'INVALID_REQUEST',
        'QR_INVALID', 'QR_INCOMPLETE', 'QR_UNSUPPORTED'].includes(code)) {
        const status: OfflineInvoiceStatus = code === 'FORBIDDEN' ? 'REJECTED' : 'REQUIRES_CORRECTION';
        await input.queue.update(minimized(record, status, correctionMessage(error, record.origin)));
        continue;
      }
      await input.queue.update({ ...record, status: 'RETRYABLE_FAILURE', message: 'No fue posible confirmar el resultado; se conserva la misma identidad para reintentar.' });
      break;
    }
  }
}
