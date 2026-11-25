import { z } from 'zod';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { errorResponse } from '@/shared/presentation/http/errors';
import { InvoiceImageError } from '@/modules/invoices/application/invoice-image-error';
import type { createInvoices } from '@/modules/invoices/application/invoices';
import { invoiceTimeSchema, invoiceValidationFailure, parseInvoiceMultipart, type InvoiceOperation } from '@/modules/invoices/presentation/invoices';
import { OfflineSubmissionError, type createOfflineInvoiceSubmissions } from '../application/submissions';
import type { InvoiceSubmission } from '../domain/submission';

type InvoiceService = ReturnType<typeof createInvoices>;
type Service = ReturnType<typeof createOfflineInvoiceSubmissions>;
const id = z.string().regex(/^[a-f0-9]{24}$/);
const selected = z.object({ scope: z.literal('organization'), thirdPartyId: id }).strict();
const manual = z.object({ origin: z.literal('MANUAL'), assignmentId: id, vehicleId: id, invoiceDate: z.string(), invoiceTime: invoiceTimeSchema, invoiceNumber: z.string(),
  issuerNit: z.string(), buyerDocument: z.string(), amount: z.string(), vatAmount: z.string(), otherTaxesAmount: z.string(), totalAmount: z.string() }).strict();
const qr = z.object({ origin: z.literal('QR'), assignmentId: id, vehicleId: id, qrContent: z.string().min(1).max(16 * 1024) }).strict();
const pageQuery = z.object({ scope: z.literal('organization'), thirdPartyId: id, page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20) }).strict();
const resolution = z.discriminatedUnion('action', [
  z.object({ action: z.literal('LINK_DUPLICATE'), expectedVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(500), resultInvoiceId: id }).strict(),
  z.object({ action: z.literal('APPROVE_CLOSED_ASSIGNMENT'), expectedVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(500) }).strict(),
  z.object({ action: z.literal('REJECT'), expectedVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(500) }).strict(),
]);
function view(record: InvoiceSubmission) {
  return { id: record.id, thirdPartyId: record.thirdPartyId, origin: record.origin, assignmentId: record.assignmentId, vehicleId: record.vehicleId,
    causes: record.causes, candidateInvoiceIds: record.candidateInvoiceIds, status: record.status, version: record.version, createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null, resultInvoiceId: record.resultInvoiceId, resolutionReason: record.resolutionReason };
}
function fail(error: unknown, operation: InvoiceOperation | 'general' = 'general'): Response {
  if (error instanceof z.ZodError) return invoiceValidationFailure(error, operation);
  if (error instanceof InvoiceImageError) {
    const status = error.code === 'IMAGE_TOO_LARGE' ? 413 : error.code === 'IMAGE_TYPE_UNSUPPORTED' ? 415 : 400;
    return Response.json({ error: { code: error.code, message: status === 413 ? 'La imagen supera el límite permitido.' : 'No se pudo validar la imagen.' } }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) error = new OfflineSubmissionError('INVALID_REQUEST');
  if (error instanceof OfflineSubmissionError) {
    const status = error.code === 'INVALID_REQUEST' ? 400 : error.code === 'FORBIDDEN' ? 403 : error.code === 'SUBMISSION_NOT_FOUND' ? 404
      : error.code === 'IDEMPOTENCY_CONFLICT' || error.code === 'SUBMISSION_VERSION_CONFLICT' ? 409 : 503;
    return Response.json({ error: { code: error.code, message: status === 403 ? 'No tienes permiso para registrar esta factura.' : status === 409 ? 'La identidad del envío cambió o el registro tuvo otra actualización.' : 'No fue posible procesar el envío.' } },
      { status, headers: { 'Cache-Control': 'no-store' } });
  }
  return errorResponse(error);
}

export async function submissionResponse(service: Service, invoiceService: InvoiceService, actor: AuthenticatedActor, request: Request, idValue?: string): Promise<Response> {
  let validationOperation: InvoiceOperation = 'create';
  try {
    const url = new URL(request.url);
    const params: Record<string, string> = {};
    for (const [key, value] of url.searchParams) { if (Object.hasOwn(params, key)) throw new OfflineSubmissionError('INVALID_REQUEST'); params[key] = value; }
    if (request.method === 'GET') {
      if (idValue) {
        const { thirdPartyId } = selected.parse(params);
        const submissionId = id.parse(idValue);
        const record = await service.own(actor, { id: submissionId, thirdPartyId });
        if (!record) throw new OfflineSubmissionError('SUBMISSION_NOT_FOUND');
        return Response.json(view(record), { headers: { 'Cache-Control': 'no-store' } });
      }
      const input = pageQuery.parse(params);
      const history = await service.ownHistory(actor, { thirdPartyId: input.thirdPartyId, page: input.page, pageSize: input.pageSize });
      return Response.json(history, { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
    }
    if (request.method !== 'POST') return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers: { Allow: 'GET, POST', 'Cache-Control': 'no-store' } });
    const { thirdPartyId } = selected.parse(params);
    const idempotencyKey = request.headers.get('Idempotency-Key') ?? '';
    if (!idempotencyKey || idempotencyKey.length > 128) throw new OfflineSubmissionError('INVALID_REQUEST');
    const parsed = await parseInvoiceMultipart(request, invoiceService);
    let body: z.infer<typeof manual> | z.infer<typeof qr>;
    if (parsed.payload && typeof parsed.payload === 'object' && 'origin' in parsed.payload && parsed.payload.origin === 'MANUAL') body = manual.parse(parsed.payload);
    else if (parsed.payload && typeof parsed.payload === 'object' && 'origin' in parsed.payload && parsed.payload.origin === 'QR') {
      validationOperation = 'qr-create'; body = qr.parse(parsed.payload);
    } else throw new OfflineSubmissionError('INVALID_REQUEST');
    if (body.origin === 'MANUAL' && !parsed.image) throw new InvoiceImageError('IMAGE_INVALID');
    const { origin, assignmentId, vehicleId, ...payload } = body;
    const result = await service.submit(actor, { thirdPartyId, origin, assignmentId, vehicleId, payload,
      ...(parsed.image ? { image: parsed.image } : {}), idempotencyKey });
    return Response.json(view(result), { status: 201, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
  } catch (error) { return fail(error, validationOperation); }
}

export async function adminConflictListResponse(service: Service, actor: AuthenticatedActor, request: Request): Promise<Response> {
  try {
    const params: Record<string, string> = {};
    for (const [key, value] of new URL(request.url).searchParams) { if (Object.hasOwn(params, key)) throw new OfflineSubmissionError('INVALID_REQUEST'); params[key] = value; }
    const input = pageQuery.parse(params);
    const result = await service.adminConflicts(actor, input);
    return Response.json({ items: result.items.map(({ record, reviewFields, candidates }) => ({ submission: view(record), reviewFields,
      candidates, imageAvailable: Boolean(record.imageReference) })), total: result.total, page: result.page, pageSize: result.pageSize },
    { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
  } catch (error) { return fail(error); }
}

export async function adminSubmissionImageResponse(service: Service, actor: AuthenticatedActor, request: Request, idValue: string): Promise<Response> {
  try {
    const submissionId = id.parse(idValue), params: Record<string, string> = {};
    for (const [key, value] of new URL(request.url).searchParams) { if (Object.hasOwn(params, key)) throw new OfflineSubmissionError('INVALID_REQUEST'); params[key] = value; }
    const { thirdPartyId } = selected.parse(params);
    const image = await service.adminImage(actor, { id: submissionId, thirdPartyId });
    return new Response(new Uint8Array(image.data), { headers: { 'Content-Type': image.contentType, 'Content-Length': String(image.size),
      'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return fail(error); }
}

export async function adminSubmissionResolutionResponse(service: Service, actor: AuthenticatedActor, request: Request, idValue: string): Promise<Response> {
  try {
    const submissionId = id.parse(idValue), params: Record<string, string> = {};
    for (const [key, value] of new URL(request.url).searchParams) { if (Object.hasOwn(params, key)) throw new OfflineSubmissionError('INVALID_REQUEST'); params[key] = value; }
    const { thirdPartyId } = selected.parse(params);
    const body = resolution.parse(await request.json());
    const result = await service.resolveConflict(actor, { id: submissionId, thirdPartyId, ...body });
    return Response.json(view(result), { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
  } catch (error) { return fail(error); }
}
