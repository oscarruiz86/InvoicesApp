import { z } from 'zod';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { errorResponse } from '@/shared/presentation/http/errors';
import { InvoiceUseCaseError, type CreateInvoiceCommand, type createInvoices } from '../application/invoices';
import { InvoiceImageError } from '../application/invoice-image-error';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const selected = z.object({ scope: z.literal('organization'), thirdPartyId: id }).strict();
export const invoiceTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/);
const listQuery = selected.extend({ q: z.string().trim().min(1).max(100).optional(), vehicleId: id.optional(), driverId: id.optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['invoiceDate', 'invoiceNumber', 'totalAmount', 'createdAt']).default('invoiceDate'), direction: z.enum(['asc', 'desc']).default('desc') });
const createPayload = z.object({ assignmentId: id, vehicleId: id, invoiceDate: z.string(), invoiceTime: invoiceTimeSchema, invoiceNumber: z.string(),
  issuerNit: z.string(), buyerDocument: z.string(), amount: z.string(), vatAmount: z.string(), otherTaxesAmount: z.string(), totalAmount: z.string() }).strict();
const editPayload = createPayload.omit({ assignmentId: true, vehicleId: true }).partial().extend({ expectedVersion: z.number().int().safe().min(1) }).strict();
export type InvoiceOperation = 'list' | 'detail' | 'create' | 'edit' | 'image' | 'qr-preview' | 'qr-create';
type InvoiceUseCases = ReturnType<typeof createInvoices>;

function message(error: InvoiceUseCaseError, operation: InvoiceOperation) {
  if (error.code === 'CONFIGURATION_ERROR') return Response.json({ error: { code: error.code, message: 'El servicio de facturas no está configurado correctamente.' } },
    { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const status = ['INVALID_REQUEST', 'IMAGE_REQUIRED'].includes(error.code) ? 400 : error.code === 'FORBIDDEN' ? 403 : error.code === 'RESOURCE_NOT_FOUND' ? 404
    : ['INVOICE_DUPLICATE', 'IDEMPOTENCY_CONFLICT', 'INVOICE_VERSION_CONFLICT', 'ASSIGNMENT_NOT_ELIGIBLE'].includes(error.code) ? 409
    : ['EDIT_WINDOW_CLOSED', 'QR_IMMUTABLE'].includes(error.code) ? 403 : ['QR_INVALID', 'QR_INCOMPLETE', 'QR_UNSUPPORTED'].includes(error.code) ? 400 : 503;
  const body = error.code === 'IMAGE_REQUIRED' ? 'Adjunta una imagen para registrar la factura manualmente.' : status === 400
    ? operation === 'qr-preview' || operation === 'qr-create' ? 'Revisa los datos del código QR.' : 'Revisa los datos de la factura.'
    : status === 403 ? 'No tienes permiso para esta operación o la factura no admite cambios.'
    : status === 404 ? 'No se encontró la factura.' : status === 409 ? 'La factura cambió o existe un conflicto de duplicidad.'
      : 'El servicio de facturas no está disponible.';
  return Response.json({ error: { code: error.code, message: body } }, { status, headers: { 'Cache-Control': 'no-store' } });
}
const validationFieldLabels: Record<string, string> = { assignmentId: 'asignación', vehicleId: 'vehículo', invoiceDate: 'fecha de factura', invoiceTime: 'hora de factura',
  invoiceNumber: 'número de factura', issuerNit: 'NIT del emisor', buyerDocument: 'documento del adquiriente', amount: 'valor antes de impuestos',
  vatAmount: 'IVA', otherTaxesAmount: 'otros impuestos', totalAmount: 'total', qrContent: 'contenido del código QR' };
export function invoiceValidationFailure(error: z.ZodError, operation: InvoiceOperation | 'general'): Response {
  const fields = [...new Set(error.issues.flatMap(issue => issue.path.filter((part): part is string => typeof part === 'string')
    .filter(field => Object.hasOwn(validationFieldLabels, field))))];
  const message = fields.includes('invoiceTime') ? 'La hora de factura debe tener el formato HH:mm:ss.'
    : fields.includes('qrContent') || operation === 'qr-create' || operation === 'qr-preview' ? 'Revisa el contenido del código QR.'
      : fields.length ? `Revisa el campo ${validationFieldLabels[fields[0]!]}.`
        : operation === 'create' || operation === 'edit' ? 'Revisa los datos de la factura.'
          : 'Revisa los datos enviados.';
  return Response.json({ error: { code: 'INVALID_REQUEST', message, ...(fields.length ? { fields } : {}) } },
    { status: 400, headers: { 'Cache-Control': 'no-store' } });
}
function failure(error: unknown, operation: InvoiceOperation) {
  if (error instanceof z.ZodError) return invoiceValidationFailure(error, operation);
  if (error instanceof SyntaxError) return message(new InvoiceUseCaseError('INVALID_REQUEST'), operation);
  if (error instanceof InvoiceImageError) {
    const status = error.code === 'IMAGE_TOO_LARGE' ? 413 : error.code === 'IMAGE_TYPE_UNSUPPORTED' ? 415 : 400;
    return Response.json({ error: { code: error.code, message: status === 413 ? 'La imagen supera el límite permitido.'
      : status === 415 ? 'Solo se aceptan imágenes JPEG o PNG.' : 'No se pudo validar la imagen.' } }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
  if (error instanceof InvoiceUseCaseError) return message(error, operation);
  return errorResponse(error);
}

export async function parseInvoiceMultipart(request: Request, service: InvoiceUseCases): Promise<{ payload: unknown; image?: Awaited<ReturnType<InvoiceUseCases['normalizeImage']>> }> {
  const lengthHeader = request.headers.get('content-length');
  const length = lengthHeader === null ? 0 : Number(lengthHeader);
  if (length > 6 * 1024 * 1024) throw new InvoiceImageError('IMAGE_TOO_LARGE');
  if (!Number.isSafeInteger(length) || length < 0) throw new InvoiceUseCaseError('INVALID_REQUEST');
  const reader = request.body?.getReader();
  if (!reader) throw new InvoiceUseCaseError('INVALID_REQUEST');
  const chunks: Uint8Array[] = []; let consumed = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      consumed += next.value.byteLength;
      if (consumed > 6 * 1024 * 1024) { void reader.cancel().catch(() => undefined); throw new InvoiceImageError('IMAGE_TOO_LARGE'); }
      chunks.push(next.value);
    }
  } catch (error) {
    if (error instanceof InvoiceImageError || error instanceof InvoiceUseCaseError) throw error;
    throw new InvoiceUseCaseError('INVALID_REQUEST');
  }
  const contentType = request.headers.get('content-type');
  if (!contentType?.toLowerCase().startsWith('multipart/form-data;')) throw new InvoiceUseCaseError('INVALID_REQUEST');
  const body = new Uint8Array(consumed); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  const form = await new Response(body.buffer, { headers: { 'content-type': contentType } }).formData();
  for (const key of form.keys()) if (!['payload', 'image'].includes(key)) throw new InvoiceUseCaseError('INVALID_REQUEST');
  const payloads = form.getAll('payload'), images = form.getAll('image');
  if (payloads.length !== 1 || typeof payloads[0] !== 'string' || images.length > 1) throw new InvoiceUseCaseError('INVALID_REQUEST');
  const payload = JSON.parse(payloads[0]);
  const file = images[0];
  if (file === undefined) return { payload };
  if (!(file instanceof File)) throw new InvoiceUseCaseError('INVALID_REQUEST');
  const normalized = await service.normalizeImage({ data: new Uint8Array(await file.arrayBuffer()), claimedType: file.type });
  return { payload, image: normalized };
}

function invoiceView(invoice: Record<string, unknown>) {
  const { ownerSubject: _ownerSubject, imageId, ...safe } = invoice;
  return { ...safe, imageUrl: imageId ? `/api/invoices/${String(invoice.id)}/image` : null };
}

export async function invoiceResponse(service: InvoiceUseCases, operation: InvoiceOperation, actor: AuthenticatedActor,
  request: Request, idValue?: string): Promise<Response> {
  try {
    const url = new URL(request.url);
    const raw: Record<string, string> = {};
    for (const [key, value] of url.searchParams) { if (Object.hasOwn(raw, key)) throw new InvoiceUseCaseError('INVALID_REQUEST'); raw[key] = value; }
    let result: unknown;
    if (operation === 'list') {
      const { scope: _scope, ...input } = listQuery.parse(raw);
      if (input.dateFrom && input.dateTo && input.dateFrom > input.dateTo) throw new InvoiceUseCaseError('INVALID_REQUEST');
      const page = await service.list(actor, input);
      result = { ...page, items: page.items.map(item => ({ ...invoiceView(item.invoice as unknown as Record<string, unknown>), editability: item.editability })) };
    } else if (operation === 'qr-preview') {
      const { thirdPartyId } = selected.parse(raw);
      const body = z.object({ qrContent: z.string().min(1).max(16 * 1024) }).strict().parse(await request.json());
      result = await service.previewQr(actor, { thirdPartyId, qrContent: body.qrContent });
    } else if (operation === 'qr-create') {
      const { thirdPartyId } = selected.parse(raw);
      const { payload, image } = await parseInvoiceMultipart(request, service);
      const body = z.object({ assignmentId: id, vehicleId: id, qrContent: z.string().min(1).max(16 * 1024) }).strict().parse(payload);
      result = invoiceView(await service.createQr(actor, { ...body, ...(image ? { image } : {}), thirdPartyId,
        idempotencyKey: request.headers.get('Idempotency-Key') ?? '' }) as unknown as Record<string, unknown>);
    } else {
      const { thirdPartyId } = selected.parse(raw);
      if (operation === 'create') {
        const { payload, image } = await parseInvoiceMultipart(request, service);
        const body = createPayload.parse(payload) as CreateInvoiceCommand;
        result = invoiceView(await service.create(actor, { ...body, ...(image ? { image } : {}), thirdPartyId,
          idempotencyKey: request.headers.get('Idempotency-Key') ?? '' }) as unknown as Record<string, unknown>);
      } else if (operation === 'edit') {
        const invoiceId = id.parse(idValue);
        const { payload, image } = await parseInvoiceMultipart(request, service);
        const body = editPayload.parse(payload);
        const { expectedVersion, ...changes } = body;
        result = invoiceView(await service.edit(actor, { id: invoiceId, thirdPartyId, expectedVersion,
          changes: { ...changes, ...(image ? { image } : {}) } }) as unknown as Record<string, unknown>);
      } else if (operation === 'detail') {
        const invoiceId = id.parse(idValue);
        const detail = await service.detail(actor, { id: invoiceId, thirdPartyId });
        result = { invoice: invoiceView(detail.invoice as unknown as Record<string, unknown>), editability: detail.editability };
      }
      else {
        const invoiceId = id.parse(idValue);
        const image = await service.image(actor, { id: invoiceId, thirdPartyId });
        if (!image) throw new InvoiceUseCaseError('RESOURCE_NOT_FOUND');
        const bytes = new Uint8Array(image.data.byteLength); bytes.set(image.data);
        return new Response(bytes, { status: 200, headers: { 'Content-Type': image.contentType, 'Content-Length': String(image.size),
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' } });
      }
    }
    return Response.json(result, { status: operation === 'create' || operation === 'qr-create' ? 201 : 200, headers: { 'Cache-Control': 'no-store',
      ...(operation === 'create' && result && typeof result === 'object' && 'id' in result ? { Location: `/api/invoices/${String(result.id)}?scope=organization&thirdPartyId=${raw.thirdPartyId}` } : {}) } });
  } catch (error) { return failure(error, operation); }
}
